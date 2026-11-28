import { Dialog } from "@base-ui/react/dialog";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { compareFile, indexNames, pickOf, type Chunk, type FileDiff, type Names, type Pick } from "@/shared/lib/diff/files";
import { diffSeq, likeness, wordDiff, type Piece } from "@/shared/lib/diff/seq";
import { cn, errorMessage, plural } from "@/shared/lib/utils";
import { readText, TOOLS_DIR, walkFiles } from "@/shared/lib/workspace";
import { Button } from "../button";
import { Rule } from "../heading";
import { IconButton } from "../icon-button";
import { MenuItem, MenuRule } from "../menu";
import { bloomCls } from "../motion";
import { useMorph } from "../use-morph";
import { closeDiff, useDiff, type DiffSession, type Outcome, type SideInfo } from "./store";

/** The Changes view (see ./store.ts): the changed files on the left; on the right each change of the file picked,
 *  the two sides next to each other. Clicking a side uses it. "Use all …" picks a side for everything at once. */
export function DiffView() {
  const session = useDiff(s => s.session);
  return (
    <Dialog.Root open={!!session} onOpenChange={open => { if (!open) closeDiff(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55 transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0" />
        {/* the page's :focus-visible outline isn't in a layer, so only an inline style turns it off for these two */}
        <Dialog.Popup initialFocus={() => document.getElementById("diff-pane")} style={{ outline: "none" }} className={cn(
          "fixed inset-0 z-50 flex flex-col overflow-hidden bg-ink font-talk text-base text-paper outline-hidden sm:inset-4 sm:rounded-lg sm:border sm:border-ink-line sm:shadow-panel lg:inset-8",
          bloomCls)}>
          {session && <Session key={sessionKey(session)} session={session} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const sessionKey = (s: DiffSession) => s.title + s.files.map(f => f.path).join("|");
type Picks = Map<string, Map<string, Pick>>;

function useNames(session: DiffSession) {
  const [extra, setExtra] = useState<Names>(() => new Map());
  useEffect(() => {
    let live = true;
    // names of characters, threads, … from every tool file, so ids show as names even in files not compared here
    walkFiles(TOOLS_DIR)
      .then(ps => Promise.all(ps.filter(p => p.endsWith(".json")).map(p => readText(p).catch(() => null))))
      .then(ts => { if (live) setExtra(indexNames(ts.map(t => { try { return t && JSON.parse(t); } catch { return null; } }))); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return useMemo(() => {
    const docs = session.files.flatMap(f => [f.o, f.a, f.b]).filter(t => typeof t === "string" && t.trimStart().startsWith("{"));
    return indexNames(docs.map(t => { try { return JSON.parse(t!); } catch { return null; } }), new Map(extra));
  }, [session, extra]);
}

function Session({ session }: { session: DiffSession }) {
  const names = useNames(session);
  const all = useMemo(() => session.files.map(f => compareFile(f, names)), [session, names]);
  // files that only differ in how they're written (JSON spacing) have nothing to pick: not listed
  const diffs = useMemo(() => all.filter(d => d.chunks.length > 0), [all]);
  const [picks, setPicks] = useState<Picks>(() => new Map());
  const [current, setCurrent] = useState(() => session.focus ?? session.files[0]?.path ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const file = diffs.find(d => d.path === current) ?? diffs[0];
  const sides = { a: session.a, b: session.b };

  const pickFor = (path: string) => picks.get(path) ?? new Map<string, Pick>();
  const setPick = (path: string, chunk: string, pick: Pick) => setPicks(all => {
    const next = new Map(all);
    next.set(path, new Map(pickFor(path)).set(chunk, pick));
    return next;
  });
  const pickAll = (side: "a" | "b", only?: FileDiff) => setPicks(all => {
    const next = new Map(all);
    for (const d of only ? [only] : diffs) next.set(d.path, new Map(d.chunks.map(c => [c.id, side])));
    return next;
  });

  const stats = (d: FileDiff) => {
    const p = pickFor(d.path);
    const resolved = d.chunks.map(c => pickOf(p, c));
    return { open: resolved.filter(r => r === undefined).length, moved: resolved.filter(r => r !== "b").length };
  };
  const open = diffs.reduce((n, d) => n + stats(d).open, 0);
  /** In a review: changes going back to side a. In a merge: every change. */
  const count = session.merge ? diffs.reduce((n, d) => n + d.chunks.length, 0) : diffs.reduce((n, d) => n + stats(d).moved, 0);

  // a merge settles every file, the ones with nothing to pick too
  const outcomes = (): Outcome[] => (session.merge ? all : diffs).map(d => {
    const p = pickFor(d.path);
    const resolved = d.chunks.map(c => pickOf(p, c) ?? "a");
    const f = session.files.find(x => x.path === d.path)!;
    const text = d.build(p);
    return {
      path: d.path, text, changed: text !== f.b, binary: d.kind === "binary",
      whole: !resolved.length ? "b" : resolved.every(r => r === "a") ? "a" : resolved.every(r => r === "b") ? "b" : "mixed",
    };
  });

  const apply = async () => {
    if (!session.apply || busy) return;
    setBusy(true);
    setErr("");
    try {
      await session.apply.run(session.merge ? outcomes() : outcomes().filter(o => o.changed));
      closeDiff();
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  const canApply = session.apply && !busy && open === 0 && (session.merge || count > 0);
  const applyLabel = !session.apply ? "" : session.merge ? session.apply.verb : count ? `${session.apply.verb} ${plural(count, "change")}` : session.apply.verb;

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-line/60 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-[1_1_20rem]">
          <Dialog.Title className="font-sans text-lg text-paper">{session.title}</Dialog.Title>
          <Rule color={session.merge ? "var(--color-coral)" : session.b.color} short />
          {session.intro && <Dialog.Description className="mt-1.5 text-sm text-bone">{session.intro}</Dialog.Description>}
        </div>
        {diffs.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            <Button size="sm" onClick={() => pickAll("a")}>Use all: {session.a.label}</Button>
            <Button size="sm" onClick={() => pickAll("b")}>Use all: {session.b.label}</Button>
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {open > 0 && <span className="text-sm text-coral">{clashes(open)} left to pick</span>}
          {session.apply && (diffs.length > 0 || session.merge) && <Button size="sm" variant="primary" disabled={!canApply} onClick={apply}>{busy ? "Working…" : applyLabel}</Button>}
          <Dialog.Close render={<IconButton icon={X} label="Close (Esc)" tooltipSide="bottom" />} />
        </span>
        {err && <p className="basis-full text-sm text-coral">{err}</p>}
      </header>

      {!file ? (
        <div className="grid flex-1 place-items-center px-8 text-center">
          <p className="font-sans text-xl font-light text-bone">No changes.</p>
        </div>
      ) : (
        <div className={cn("grid min-h-0 flex-1", diffs.length > 1 ? "grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(200px,280px)_minmax(0,1fr)] md:grid-rows-1" : "grid-cols-1")}>
          {diffs.length > 1 && (
            <nav aria-label="Changed files" className="max-h-44 overflow-y-auto border-b border-ink-line/60 px-4 py-4 md:max-h-none md:border-r md:border-b-0 md:px-6">
              <MenuRule>
                {diffs.map(d => {
                  const s = stats(d);
                  const note = s.open ? <span className="text-coral">{clashes(s.open)} to pick</span>
                    : session.merge ? `${plural(d.chunks.length, "change")}, all picked`
                    : s.moved ? `${s.moved} of ${plural(d.chunks.length, "change")} undone`
                    : `${STATUS[d.status]} · ${plural(d.chunks.length, "change")}`;
                  return <MenuItem key={d.path} size="base" layoutId="diff-file" active={d === file} onClick={() => setCurrent(d.path)}
                    label={d.title} sub={<>{d.place} · {note}</>} title={d.path} />;
                })}
              </MenuRule>
            </nav>
          )}
          <FilePane key={file.path} file={file} sides={sides} picks={pickFor(file.path)}
            onPick={(c, p) => setPick(file.path, c, p)} onPickAll={side => pickAll(side, file)} />
        </div>
      )}
    </>
  );
}

const clashes = (n: number) => `${n} clash${n === 1 ? "" : "es"}`;
const STATUS = { added: "new", deleted: "deleted", changed: "changed" } as const;

function FilePane({ file, sides, picks, onPick, onPickAll }: {
  file: FileDiff; sides: { a: SideInfo; b: SideInfo }; picks: Map<string, Pick>;
  onPick: (chunk: string, pick: Pick) => void; onPickAll: (side: "a" | "b") => void;
}) {
  const multi = file.chunks.length > 1;
  return (
    <section id="diff-pane" tabIndex={-1} style={{ outline: "none" }} className="min-h-0 overflow-y-auto px-4 pb-10 outline-hidden sm:px-6">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1 pt-5 pb-3">
        <div className="min-w-0 flex-[1_1_14rem]">
          <h2 className="font-sans text-xl text-paper">{file.title}</h2>
          <p className="truncate text-sm text-taupe" title={file.path}>
            {file.place} · {file.status === "changed" ? plural(file.chunks.length, "change") : file.status === "added" ? `new on the ${sides.b.label.toLowerCase()} side` : `only on the ${sides.a.label.toLowerCase()} side`}
          </p>
        </div>
        {multi && (
          <span className="flex flex-wrap">
            <Button size="sm" variant="ghost" onClick={() => onPickAll("a")}>This file: {sides.a.label}</Button>
            <Button size="sm" variant="ghost" onClick={() => onPickAll("b")}>This file: {sides.b.label}</Button>
          </span>
        )}
      </div>
      {/* the sides' names, staying at the top while scrolling */}
      <div className="sticky top-0 z-10 -mx-1 mb-3 hidden grid-cols-2 gap-3 bg-ink px-1 py-2 md:grid">
        {(["a", "b"] as const).map(s => <SideName key={s} side={sides[s]} />)}
      </div>
      <div className="space-y-3">
        {file.parts.map((p, i) => "same" in p
          ? <Unchanged key={i} lines={p.same} first={i === 0} last={i === file.parts.length - 1} />
          : <ChunkCard key={p.chunk.id} chunk={p.chunk} sides={sides} binary={file.kind === "binary"} pick={pickOf(picks, p.chunk)} onPick={pick => onPick(p.chunk.id, pick)} />)}
      </div>
    </section>
  );
}

const SideName = ({ side }: { side: SideInfo }) => (
  <span className="flex items-center gap-2 font-sans text-base text-bone">
    <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: side.color }} />
    {side.label}
    {side.hint && <span className="hidden font-talk text-xs text-taupe lg:inline">{side.hint}</span>}
  </span>
);

const CONTEXT = 3;

/** Lines both sides have, around the changes: a few shown, the rest folded away until clicked. */
function Unchanged({ lines, first, last }: { lines: string[]; first: boolean; last: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useMorph(ref, open);
  const head = first ? 0 : CONTEXT, tail = last ? 0 : CONTEXT;
  const fold = !open && lines.length > head + tail + 1;
  const shown = (ls: string[]) => <pre className="whitespace-pre-wrap break-words px-3 font-talk text-sm text-taupe">{ls.join("\n")}</pre>;
  return (
    <div ref={ref} className="overflow-hidden">
      {fold ? (
        <>
          {head > 0 && shown(lines.slice(0, head))}
          <button onClick={() => setOpen(true)}
            className="my-1 flex w-full items-center gap-2 rounded-md px-3 py-1 text-left text-xs text-taupe transition-colors hover:bg-paper/5 hover:text-paper">
            <ChevronsUpDown className="h-3.5 w-3.5" /> {plural(lines.length - head - tail, "unchanged line")}
          </button>
          {tail > 0 && shown(lines.slice(lines.length - tail))}
        </>
      ) : shown(lines)}
    </div>
  );
}

function ChunkCard({ chunk, sides, pick, binary, onPick }: {
  chunk: Chunk; sides: { a: SideInfo; b: SideInfo }; pick: Pick | undefined; binary: boolean; onPick: (p: Pick) => void;
}) {
  const marks = useMemo(() => markLines(chunk.a, chunk.b), [chunk]);
  const [showOld, setShowOld] = useState(false);
  const where = chunk.where ?? (chunk.kind === "file" ? (binary ? "The whole file (an image or other file)" : "The whole file") : `Line ${chunk.line?.b ?? 1}`);
  const tag = chunk.auto === undefined ? null
    : chunk.auto === null ? <span className="text-coral">Changed on both sides: pick one</span>
    : <span>Changed only in {sides[chunk.auto].label.toLowerCase()}</span>;
  return (
    <div className={cn("rounded-lg border bg-ink-2/60", pick === undefined ? "border-coral/70" : "border-ink-line/70")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2 pb-1.5 text-xs text-taupe">
        <span className="min-w-0 flex-1 truncate" title={where}>{where}</span>
        {tag}
        {chunk.o && chunk.o.length > 0 && (
          <button className="underline-offset-4 hover:text-paper hover:underline" onClick={() => setShowOld(v => !v)}>
            {showOld ? "Hide how it was" : "How it was"}
          </button>
        )}
        {chunk.canBoth && (
          <button aria-pressed={pick === "both"} onClick={() => onPick("both")}
            className={cn("rounded-md px-1.5 py-0.5 transition-colors", pick === "both" ? "bg-caramel/20 text-paper" : "hover:bg-paper/8 hover:text-paper")}>
            Keep both
          </button>
        )}
      </div>
      {showOld && chunk.o && (
        <pre className="mx-3 mb-2 whitespace-pre-wrap break-words rounded-md border border-dashed border-ink-line px-3 py-2 font-talk text-sm text-taupe">
          {chunk.o.join("\n") || "(nothing)"}
        </pre>
      )}
      <div className="grid gap-2 px-2 pb-2 md:grid-cols-2">
        {(["a", "b"] as const).map(s => (
          <SideButton key={s} side={sides[s]} chosen={pick === s || pick === "both"} open={pick === undefined} onClick={() => onPick(s)}
            empty={chunk.kind === "file" ? "No file" : chunk.kind === "order" ? "" : "Not there"}>
            {chunk[s].some(l => l.trim()) ? <Lines lines={marks[s]} /> : chunk[s].length ? <span className="text-sm italic text-taupe">{plural(chunk[s].length, "empty line")}</span> : null}
          </SideButton>
        ))}
      </div>
    </div>
  );
}

/** One side of a change: click to use it. `open`: nothing picked yet (a clash), so neither side is dimmed. */
function SideButton({ side, chosen, open, empty, onClick, children }: {
  side: SideInfo; chosen: boolean; open: boolean; empty: string; onClick: () => void; children: ReactNode;
}) {
  return (
    <button onClick={onClick} aria-pressed={chosen} style={{ "--side": side.color } as CSSProperties}
      className={cn("group/side relative min-w-0 rounded-md border px-3 pt-2 pb-2.5 text-left transition-[background-color,border-color,opacity] duration-200",
        chosen ? "border-(--side) bg-[color-mix(in_srgb,var(--side)_9%,transparent)]"
          : open ? "border-ink-line hover:border-(--side)/70"
          : "border-ink-line/70 opacity-55 hover:border-(--side)/60 hover:opacity-90 focus-visible:opacity-90")}>
      <span className="mb-1 flex items-center gap-1.5 font-sans text-xs">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: side.color }} />
        <span className="text-bone md:hidden">{side.label}</span>
        <span className="flex-1" />
        {chosen
          ? <span className="flex items-center gap-1 text-paper"><Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Using this</span>
          : <span className="text-taupe opacity-0 transition-opacity group-hover/side:opacity-100 group-focus-visible/side:opacity-100">Use this</span>}
      </span>
      {children ?? <span className="text-sm italic text-taupe">{empty}</span>}
    </button>
  );
}

type Marked = { pieces: Piece[]; changed: boolean }[];

/** Each side's lines, with what the other side doesn't have marked: words where a line was edited, the whole line
 *  where it's new. */
function markLines(a: string[], b: string[]): { a: Marked; b: Marked } {
  const out = { a: [] as Marked, b: [] as Marked };
  for (const r of diffSeq(a, b)) {
    const la = a.slice(r.a0, r.a1), lb = b.slice(r.b0, r.b1);
    if (r.same) {
      la.forEach(l => { out.a.push({ pieces: [{ text: l, changed: false }], changed: false }); out.b.push({ pieces: [{ text: l, changed: false }], changed: false }); });
      continue;
    }
    const n = Math.max(la.length, lb.length);
    for (let i = 0; i < n; i++) {
      const x = la[i], y = lb[i];
      if (x !== undefined && y !== undefined && likeness(x, y) > 0.35) {
        const w = wordDiff(x, y);
        out.a.push({ pieces: w.a, changed: true });
        out.b.push({ pieces: w.b, changed: true });
        continue;
      }
      if (x !== undefined) out.a.push({ pieces: [{ text: x, changed: true }], changed: true });
      if (y !== undefined) out.b.push({ pieces: [{ text: y, changed: true }], changed: true });
    }
  }
  return out;
}

function Lines({ lines }: { lines: Marked }) {
  return (
    <span className="block whitespace-pre-wrap break-words font-talk text-base text-paper">
      {lines.map((l, i) => (
        <span key={i} className={cn("block min-h-[22px]", !l.changed && "text-bone/70")}>
          {l.pieces.map((p, j) => p.changed
            ? <mark key={j} className="rounded-[3px] bg-[color-mix(in_srgb,var(--side)_30%,transparent)] text-paper">{p.text}</mark>
            : <span key={j}>{p.text}</span>)}
        </span>
      ))}
    </span>
  );
}

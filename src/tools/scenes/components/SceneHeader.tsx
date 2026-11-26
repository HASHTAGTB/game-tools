import { ChevronDown, Plus, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { characterNotes, characterOf, noteCharacterId, useGame } from "@/shared/lib/game";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "@/shared/ui/icon-button";
import { MenuItem, MenuRule } from "@/shared/ui/menu";
import { Popover, PopoverTitle } from "@/shared/ui/popover";
import { Tooltip } from "@/shared/ui/tooltip";
import { readInfo, RENPY_HINT, RENPY_LEVELS, setInfo, STATUS_HINT, STATUSES, type SceneInfo } from "../lib/frontmatter";
import { formatStmt, labelOf, suggestLabel } from "../lib/script";
import { who } from "../lib/scriptView";
import { useSceneUi } from "../lib/ui";
import { useSceneIndex } from "../state";

/** The scene's info above the script: its status and label, and in "Scene info" the Ren'Py level (as Obsidian's
 *  Dashboard reads them), owner, characters and whose point of view. Each field writes the file's frontmatter or script through the
 *  editor, so Ctrl+Z undoes it too. */
export function SceneHeader({ text, fileName }: { text: string; fileName: string }) {
  const info = readInfo(text);
  const script = useSceneUi(s => s.script);
  const manifest = useGame(s => s.manifest);
  const owners = useSceneIndex(s => s.files);

  const write = (key: keyof SceneInfo, value: string | string[]) => {
    const v = useSceneUi.getState().view;
    if (!v) return;
    const c = setInfo(v.state.doc.toString(), key, value);
    if (c) v.dispatch({ changes: c, userEvent: "input.info" });
  };

  // POV and label live in the script
  const label = script && labelOf(script);
  const povLine = script?.parsed.findIndex(p => p?.kind === "stmt" && p.stmt.kind === "pov") ?? -1;
  const pov = povLine >= 0 ? (script!.parsed[povLine] as { stmt: { who: string } }).stmt.who : null;
  const setPov = (id: string) => {
    const v = useSceneUi.getState().view;
    const s = useSceneUi.getState().script;
    if (!v || !s) return;
    const text = formatStmt({ kind: "pov", who: id });
    if (povLine >= 0) {
      const L = v.state.doc.line(povLine + 1);
      v.dispatch({ changes: { from: L.from, to: L.to, insert: L.text.slice(0, L.text.length - L.text.trimStart().length) + text }, userEvent: "input.info" });
    } else {
      const at = s.parsed.findIndex(p => p?.kind === "label");
      if (at < 0) return;
      const L = v.state.doc.line(at + 1);
      v.dispatch({ changes: { from: L.to, insert: "\n    " + text }, userEvent: "input.info" });
    }
  };
  const setLabel = (name: string) => {
    const v = useSceneUi.getState().view;
    const s = useSceneUi.getState().script;
    if (!v || !s || !/^\w+$/.test(name)) return;
    const at = s.parsed.findIndex(p => p?.kind === "label");
    if (at < 0) return;
    const L = v.state.doc.line(at + 1);
    const m = /label\s+(\w+)/.exec(L.text)!;
    const from = L.from + m.index + m[0].length - m[1].length;
    v.dispatch({ changes: { from, to: from + m[1].length, insert: name }, userEvent: "input.info" });
  };

  const ownerList = useMemo(() => [...new Set(Object.values(owners ?? {}).map(f => f.owner).filter(Boolean))].sort(), [owners]);
  const suggested = suggestLabel(fileName);

  const [infoOpen, setInfoOpen] = useState(false);
  const chars = info?.characters ?? [];
  const summary = [info?.owner, chars.length ? `${chars.length} character${chars.length === 1 ? "" : "s"}` : null, pov ? who(manifest, pov).name + "'s POV" : null]
    .filter(Boolean).join(" · ") || "owner, characters, POV";

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-ink-line/60 px-6 py-2">
      <Pick label="Status" value={info?.status ?? ""} options={STATUSES} hints={STATUS_HINT} onPick={v => write("status", v)} />
      <Popover open={infoOpen} onOpenChange={setInfoOpen} align="start" className="w-[26rem] space-y-3"
        trigger={
          <button className={cn("flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 font-talk text-base text-taupe transition-colors hover:bg-ink-2 hover:text-paper", infoOpen && "bg-ink-2 text-paper")}>
            <span className="font-sans text-sm">Scene info</span>
            <span className="truncate text-sm text-bone">{summary}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
          </button>
        }>
        <PopoverTitle>Scene info</PopoverTitle>
        <Pick label="Ren'Py" value={info?.renpy ?? ""} options={RENPY_LEVELS} hints={RENPY_HINT} onPick={v => write("renpy", v)} />
        <Field label="Owner">
          <input list="scene-owners" defaultValue={info?.owner ?? ""} key={info?.owner ?? ""} placeholder="nobody"
            onBlur={e => write("owner", e.target.value.trim())} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="h-7 w-40 rounded-md bg-transparent px-1 font-talk text-base text-paper placeholder:text-taupe hover:bg-ink-2 focus:bg-ink-2 focus:outline-hidden" />
          <datalist id="scene-owners">{ownerList.map(o => <option key={o} value={o} />)}</datalist>
        </Field>
        <Pick label="POV" value={pov ?? ""} options={manifest?.characters.filter(c => c.pov).map(c => c.id) ?? (pov ? [pov] : [])}
          show={id => who(manifest, id).name} color={id => who(manifest, id).color} onPick={setPov}
          empty={label ? "not set" : "needs a label"} disabled={!label} />
        <Characters value={chars} onChange={v => write("characters", v)} />
      </Popover>
      <span className="ml-auto flex items-center gap-1">
        <span className="font-sans text-sm text-taupe">Label</span>
        {label
          ? <LabelInput value={label} onCommit={setLabel} />
          : <span className="font-talk text-sm text-coral">none</span>}
        {label && label !== suggested && (
          <IconButton icon={Wand2} size="sm" label={`Use ${suggested} (from the file name)`} onClick={() => setLabel(suggested)} />
        )}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <span className="flex items-center gap-1.5"><span className="font-sans text-sm text-taupe">{label}</span>{children}</span>;
}

function Pick({ label, value, options, hints, show = v => v, color, onPick, empty = "not set", disabled }: {
  label: string; value: string; options: readonly string[]; hints?: Record<string, string>;
  show?: (v: string) => string; color?: (v: string) => string; onPick: (v: string) => void; empty?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Field label={label}>
      <Popover open={open} onOpenChange={setOpen} align="start" className="w-64 px-3 py-2.5"
        trigger={
          <button disabled={disabled} className={cn("flex h-7 items-center gap-1 rounded-md px-1.5 font-talk text-base transition-colors hover:bg-ink-2 disabled:opacity-50", value ? "text-paper" : "text-taupe", open && "bg-ink-2")}
            style={value && color ? { color: color(value) } : undefined}>
            {value ? show(value) : empty}
            <ChevronDown className="h-3.5 w-3.5 text-taupe" strokeWidth={2.5} />
          </button>
        }>
        <MenuRule className="max-h-80 overflow-y-auto">
          {options.map(o => (
            <MenuItem key={o} size="base" active={o === value} color={color?.(o)} layoutId={`${label}-marker`}
              label={<span style={color ? { color: color(o) } : undefined}>{show(o)}</span>} sub={hints?.[o]}
              onClick={() => { setOpen(false); onPick(o); }} />
          ))}
        </MenuRule>
      </Popover>
    </Field>
  );
}

/** The scene's characters, as links to their notes; × removes one, + adds from the character notes. */
function Characters({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const manifest = useGame(s => s.manifest);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<string[] | null>(null);
  useEffect(() => { if (open && !notes) characterNotes().then(setNotes, () => setNotes([])); }, [open, notes]);
  const colorOf = (note: string) => characterOf(manifest, noteCharacterId(note))?.color ?? "var(--color-taupe)";
  const free = (notes ?? []).filter(n => !value.includes(n));
  return (
    <Field label="Characters">
      <span className="flex flex-wrap items-center gap-1">
        {value.map(n => (
          <span key={n} className="group/chip flex h-7 items-center gap-1 rounded-md border border-ink-line pl-2 pr-0.5 font-talk text-sm text-bone">
            <span className="h-2 w-2 rounded-full" style={{ background: colorOf(n) }} />
            <Tooltip label={n}><span>{n.split(" ")[0]}</span></Tooltip>
            <button onClick={() => onChange(value.filter(x => x !== n))} aria-label={`Remove ${n}`}
              className="grid h-5 w-5 place-items-center rounded text-taupe opacity-0 transition-opacity hover:text-coral group-hover/chip:opacity-100 focus-visible:opacity-100">
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <Popover open={open} onOpenChange={setOpen} align="start" className="w-60 px-3 py-2.5"
          trigger={<IconButton icon={Plus} size="sm" label="Add a character" />}>
          <MenuRule className="max-h-80 overflow-y-auto">
            {notes === null && <li className="py-1 pl-4 text-sm text-taupe">…</li>}
            {notes && !free.length && <li className="py-1 pl-4 text-sm text-taupe">Everyone's in.</li>}
            {free.map(n => (
              <MenuItem key={n} size="base" active={false} label={<span><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: colorOf(n) }} />{n}</span>}
                onClick={() => { setOpen(false); onChange([...value, n]); }} />
            ))}
          </MenuRule>
        </Popover>
      </span>
    </Field>
  );
}

function LabelInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const ok = /^\w+$/.test(v);
  return (
    <input value={v} onChange={e => setV(e.target.value.replace(/\s/g, "_"))} spellCheck={false}
      onBlur={() => (ok ? onCommit(v) : setV(value))} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(value); (e.target as HTMLInputElement).blur(); } }}
      title="The name other scenes jump to"
      className={cn("h-7 rounded-md bg-transparent px-1 font-mono text-sm text-bone hover:bg-ink-2 focus:bg-ink-2 focus:outline-hidden", !ok && "text-coral")}
      style={{ width: `${Math.max(8, v.length + 1)}ch` }} />
  );
}

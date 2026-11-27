import {
  ArrowRight, Braces, CalendarDays, Clock, Eye, Hourglass, Image, MessageSquareText, Music, Smartphone, Smile, Split, StickyNote,
  Text, UserRoundMinus, UserRoundPlus, UserRoundPen, VolumeX, type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createCharacter, type Manifest } from "@/shared/lib/game";
import { cn, errorMessage } from "@/shared/lib/utils";
import { Popover } from "@/shared/ui/popover";
import { insertAt, insertChoice, removeBox, setRaw, setSpeaker } from "../../lib/ops";
import { chatHead, sayText } from "../../lib/script";
import { formatStmt, type Stmt } from "../../lib/statements";
import { EMPTY_STAGE } from "../../lib/stage";
import { closeMenu, focusLine, idAt, markRaw, useSceneUi, type BoxMenu } from "../../lib/ui";
import { useBox } from "./context";
import { defaults } from "./fields";
import { look } from "../../lib/look";
import { useScenes } from "../../state";

/** The box view's one popup: the Add menu at a slot, or who says a line. */
export function BoxMenus() {
  const open = useSceneUi(s => s.menu);
  // while it closes it stays where and what it was
  const last = useRef(open);
  if (open) last.current = open;
  const menu = last.current;
  return (
    <Popover open={!!open} onOpenChange={o => { if (!o) closeMenu(); }} anchor={menu?.anchor} align={menu?.kind === "speaker" ? "start" : "center"}
      className="w-[22rem] p-3 focus-visible:outline-none" finalFocus={false}>
      {menu && (menu.kind === "add" ? <AddMenu menu={menu} /> : <SpeakerMenu menu={menu} />)}
    </Popover>
  );
}

type Item = {
  label: string;
  icon?: LucideIcon;
  /** a speaker's colour dot */
  color?: string;
  /** why it can't be used here (dimmed, not hidden, so nothing moves) */
  off?: string;
  /** more words it's found by */
  keys?: string;
  current?: boolean;
  run: () => void;
};
type Group = { title?: string; layout: "chips" | "tiles" | "list"; items: Item[]; /** only while typing */ search?: boolean };

/** A find field over groups of items: typing filters, the arrow keys move, Enter picks. With `create`, a search that
 *  names nobody exactly also offers to make what was typed. */
function Picker({ groups, placeholder, create }: { groups: Group[]; placeholder: string; create?: (name: string) => Item }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const found = groups.filter(g => !g.search || query).map(g => ({ ...g, items: g.items.filter(it => !query || it.label.toLowerCase().includes(query) || (it.keys ?? "").includes(query)) }))
    .filter(g => g.items.length);
  const exact = groups.some(g => g.items.some(it => it.label.toLowerCase() === query));
  const shown = create && query && !exact ? [...found, { layout: "list" as const, items: [create(q.trim())] }] : found;
  const flat = shown.flatMap(g => g.items).filter(it => !it.off);
  const [active, setActive] = useState(0);
  const at = Math.min(active, flat.length - 1);
  const pick = (it: Item | undefined) => { if (!it || it.off) return; closeMenu(); it.run(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setActive(Math.min(at + 1, flat.length - 1)); }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setActive(Math.max(at - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); pick(flat[at]); }
  };
  return (
    <div onKeyDown={onKey}>
      <input autoFocus value={q} onChange={e => { setQ(e.target.value); setActive(0); }} placeholder={placeholder} aria-label={placeholder}
        className="mb-2.5 w-full border-b-2 border-ink-line bg-transparent px-1 pb-2 font-talk text-base text-paper transition-colors placeholder:text-taupe focus:border-caramel focus:outline-hidden" />
      {!shown.length && <p className="px-1 py-1 font-talk text-sm text-taupe">Nothing called that.</p>}
      <div className="space-y-2.5">
        {shown.map((g, gi) => (
          <div key={gi}>
            {g.title && <p className="mb-1 ml-0.5 font-sans text-xs uppercase tracking-[.12em] text-taupe">{g.title}</p>}
            <div className={cn(g.layout === "chips" && "flex flex-wrap gap-1.5", g.layout === "tiles" && "grid grid-cols-3 gap-1.5", g.layout === "list" && "grid gap-px")}>
              {g.items.map(it => {
                const on = !it.off && flat[at] === it;
                return (
                  <button key={it.label} type="button" disabled={!!it.off} title={it.off} tabIndex={-1}
                    onMouseMove={() => { const i = flat.indexOf(it); if (i >= 0 && i !== at) setActive(i); }}
                    onClick={() => pick(it)}
                    style={it.color ? ({ "--oc": it.color } as CSSProperties) : undefined}
                    className={cn("flex items-center gap-2 rounded-md border font-sans text-paper transition-colors disabled:cursor-default disabled:opacity-35",
                      g.layout === "chips" && "h-8 border-ink-line px-2.5 text-base",
                      g.layout === "tiles" && "flex-col justify-center gap-1 border-transparent bg-ink-2 px-1 pb-1.5 pt-2 text-sm",
                      g.layout === "list" && "h-8 border-transparent px-2 text-base",
                      on && "border-taupe bg-ink")}>
                    {it.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--oc)" }} />}
                    {it.icon && <it.icon className={cn("shrink-0", g.layout === "tiles" ? "h-4.5 w-4.5 text-bone" : "h-4 w-4 text-taupe")} strokeWidth={2} />}
                    <span className="truncate">{it.label}</span>
                    {it.current && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-caramel" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The Picker row that makes a new character from what was typed (core/characters.rpy), then uses them. */
function newCharacter(manifest: Manifest | null, use: (id: string) => void) {
  if (!manifest) return undefined;
  return (name: string): Item => ({
    icon: UserRoundPen, label: `New character "${name}"`,
    run: () => void createCharacter(name).then(use, e => useScenes.getState().setError("Could not add the character: " + errorMessage(e))),
  });
}

// ---------------------------------------------------------------- Add

function AddMenu({ menu }: { menu: Extract<BoxMenu, { kind: "add" }> }) {
  const c = useBox();
  const script = useSceneUi(s => s.script)!;
  const { view, manifest, cast } = c;
  const { place, replace } = menu;
  const stage = c.stages[place.after - 1] ?? EMPTY_STAGE;
  const d = defaults(stage, cast, manifest, script, place.after);

  /** the new lines go in place of the empty box, or at the slot; returns the first new line */
  const put = (lines: string[]) => {
    if (replace) { setRaw(view, replace.from, replace.to, replace.indent, lines.join("\n")); return replace.from; }
    return insertAt(view, place, lines);
  };
  const line = (who: string | null) => () => focusLine(put([sayText(who, "")]), "end");
  /** an empty Ren'Py box (`pass` until something's typed) */
  const raw = () => { const n = put(["pass"]); markRaw(view, n, true); focusLine(n, "end"); };
  const card = (x: Stmt) => () => { const n = put([formatStmt(x)]); useSceneUi.setState({ openCard: idAt(view, n), focus: { line: n, caret: "end" } }); };

  const thread = useMemo(() => {
    const count = new Map<string, number>();
    for (const l of script.lines) { const h = chatHead(l); if (h) count.set(h.thread, (count.get(h.thread) ?? 0) + 1); }
    return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "chat";
  }, [script]);
  const pov = stage.pov ?? cast[0] ?? "satoru";
  const people = cast.map(id => { const w = look(c.manifest, id); return { label: w.name, color: w.legible, keys: id, run: line(id) } as Item; });
  const others = (manifest?.characters ?? []).filter(x => !cast.includes(x.id))
    .map(x => ({ label: x.name, color: look(manifest, x.id).legible, keys: x.id, run: line(x.id) }) as Item);
  const everyone: Group[] = others.length ? [{ title: "Everyone else", layout: "chips", search: true, items: others }] : [];
  const create = newCharacter(manifest, id => line(id)());

  if (menu.chat) {
    return <Picker placeholder="Who writes…" create={create} groups={[
      { layout: "chips", items: people },
      ...everyone,
      { layout: "tiles", items: [
        { icon: Clock, label: "Clock", keys: "time", run: card(d.time) },
        { icon: Braces, label: "Ren'Py", keys: "raw code python renpy script", run: raw },
      ] },
    ]} />;
  }

  const none = "Nobody is on stage here";
  return <Picker placeholder="Type to find…" create={create} groups={[
    { layout: "chips", items: [
      ...people,
      { icon: Text, label: "Narration", keys: "erzähler text", run: line(null) },
      { icon: StickyNote, label: "Note", keys: "comment kommentar", run: () => focusLine(put(["# "]), "end") },
    ] },
    ...everyone,
    { title: "Stage", layout: "tiles", items: [
      { icon: Image, label: "Background", keys: "scene bg ort", run: card(d.scene) },
      { icon: UserRoundPlus, label: "Comes in", keys: "show sprite character", run: card(d.enter) },
      { icon: Smile, label: "Expression", keys: "show face", off: d.expression ? undefined : none, run: card(d.expression) },
      { icon: UserRoundMinus, label: "Leaves", keys: "hide", off: d.hide ? undefined : none, run: card(d.hide) },
      { icon: Music, label: "Music", keys: "play song", run: card(d.play) },
      { icon: VolumeX, label: "Silence", keys: "stop music", off: stage.music ? undefined : "No music is playing here", run: card(d.stop) },
    ] },
    { title: "Story", layout: "tiles", items: [
      { icon: Split, label: "Choice", keys: "menu option", off: menu.level ? undefined : "Choices go in the scene itself, not inside a block",
        run: () => { insertChoice(view, place, c.base, new Set(c.labels)); if (replace) removeBox(view, replace); } },
      { icon: MessageSquareText, label: "Chat", keys: "phone message", run: () => { const n = put([`chat ${thread}:`, `    ${pov} ""`]); focusLine(n + 1, "end"); } },
      { icon: ArrowRight, label: "Continue at", keys: "jump", run: card(d.jump) },
      { icon: Eye, label: "POV", keys: "point of view narrator", run: card(d.pov) },
      { icon: CalendarDays, label: "Date", keys: "day", run: card(d.date) },
      { icon: Clock, label: "Clock", keys: "time", run: card(d.time) },
      { icon: Hourglass, label: "Pause", keys: "wait", run: card(d.pause) },
      { icon: Smartphone, label: "Phone", keys: "handy", run: card(d.phone) },
      { icon: Braces, label: "Ren'Py", keys: "raw code python renpy script", run: raw },
    ] },
  ]} />;
}

// ---------------------------------------------------------------- who says it

function SpeakerMenu({ menu }: { menu: Extract<BoxMenu, { kind: "speaker" }> }) {
  const c = useBox();
  const current = useSceneUi(s => { const p = s.script?.parsed[menu.line - 1]; return p?.kind === "say" ? p.who : null; });
  const set = (id: string | null) => () => { setSpeaker(c.view, menu.line, id); focusLine(menu.line, "end"); };
  const pov = c.stages[menu.line - 1]?.pov;
  const others = (c.manifest?.characters ?? []).filter(x => !c.cast.includes(x.id));
  return <Picker placeholder="Who says it…" create={newCharacter(c.manifest, id => set(id)())} groups={[
    { layout: "list", items: [
      ...(menu.chat ? [] : [{ icon: Text, label: "Narration", keys: pov ? look(c.manifest, pov).name.toLowerCase() : "", current: current === null, run: set(null) }]),
      ...c.cast.map(id => { const w = look(c.manifest, id); return { label: w.name, color: w.legible, keys: id, current: current === id, run: set(id) }; }),
    ] },
    ...(others.length ? [{ title: "Everyone else", layout: "list" as const, search: true, items: others.map(x => ({ label: x.name, color: look(c.manifest, x.id).legible, keys: x.id, current: current === x.id, run: set(x.id) })) }] : []),
  ]} />;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Minus, Plus, Redo2, SquarePlus, Undo2, X } from "lucide-react";
import { cn, uniqueId } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { AnimatePresence, m, pop, spring } from "@/shared/ui/motion";
import { Popover, PopoverTitle } from "@/shared/ui/popover";
import { fieldCls } from "@/shared/ui/field";
import { Switch } from "@/shared/ui/switch";
import { ConflictBar, StatusToasts } from "@/shared/ui/status";
import { visible } from "./lib/colors";
import { runChecks, type Check } from "./lib/checks";
import { allEvents, castOf, deleteEvent, findEvent, isFiltered, orderBetween, threadsOf } from "./lib/model";
import { nav, reveal } from "./lib/nav";
import type { GroupBy } from "./lib/types";
import { chapterIdFor, useTimeline, useTimelinePick } from "./state";
import { Board } from "./components/Board";
import { ChecksButton } from "./components/Checks";
import { FindButton } from "./components/Find";
import { Inspector } from "./components/Inspector";
import { Sidebar } from "./components/Sidebar";
import { UNKNOWN_COLOR } from "@/shared/lib/colors";

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function Timeline() {
  const s = useTimelinePick("loc", "loaded", "doc", "error", "notice", "conflicts", "zoom", "canUndo", "canRedo", "filter", "folded", "selection",
    "edit", "select", "undo", "redo", "setZoom", "setFilter", "toggleFolded", "resolveConflict", "setError", "setNotice");
  const { loc, loaded, doc, error, notice, conflicts, zoom, canUndo, canRedo } = s;

  useEffect(() => useTimeline.getState().init(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useTimeline.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !typing(e.target)) { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && e.key.toLowerCase() === "y" && !typing(e.target)) { e.preventDefault(); st.redo(); return; }
      if (typing(e.target)) { if (e.key === "Escape") (e.target as HTMLElement).blur(); return; }
      if (e.key === "Escape") st.select(null);
      // only events: chapters, threads and characters are deleted from their panel, with a confirm. Not a bare
      // Backspace: too easy to hit right after leaving a text field. Ctrl/Cmd+Backspace for keyboards without Delete.
      if ((e.key === "Delete" || (mod && e.key === "Backspace")) && st.selection?.kind === "event") {
        const id = st.selection.id;
        st.edit(d => deleteEvent(d.chapters, id));
        st.select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** A new chapter after the selected one (or the selected event's), else at the end. */
  const newChapter = () => {
    const sel = s.selection;
    const after = sel?.kind === "chapter" ? sel.id : sel?.kind === "event" ? findEvent(doc.chapters, sel.id)?.chapter.id : undefined;
    const i = after ? doc.chapters.findIndex(c => c.id === after) : doc.chapters.length - 1;
    const order = orderBetween(doc.chapters[i]?.order, doc.chapters[i + 1]?.order);
    const id = chapterIdFor(doc.chapters, "new-chapter");
    s.edit(d => { d.chapters.push({ version: 2, id, name: "New chapter", order, columns: ["", "", ""], events: [] }); });
    s.select({ kind: "chapter", id });
    setTimeout(() => nav.toChapter(id), 50);
  };

  const goToCheck = (c: Check) => {
    if (c.go === "thread-lanes") return s.setFilter({ groupBy: "threads" });
    if (c.target?.kind === "event") return reveal(c.target.id);
    if (c.target?.kind === "chapter") {
      const id = c.target.id;
      if (s.folded.has(id)) s.toggleFolded(id);
      setTimeout(() => nav.toChapter(id), 60);
    }
  };

  const checks = useMemo(() => runChecks(doc.chapters, doc.roster, doc.threads), [doc]);
  /** Worst problem per event, for the marks on cards. */
  const flagged = useMemo(() => {
    const m = new Map<string, Check["level"]>();
    for (const c of checks) if (c.target?.kind === "event" && c.level !== "info" && !m.has(c.target.id)) m.set(c.target.id, c.level);
    return m;
  }, [checks]);
  const events = allEvents(doc.chapters).length;

  return (
    <div className="grid h-screen grid-cols-[240px_minmax(0,1fr)_300px] bg-ink text-paper xl:grid-cols-[280px_minmax(0,1fr)_340px]">
      <Sidebar />

      <main className="relative flex min-h-0 flex-col">
        <StatusToasts className="bottom-6" error={error} notice={notice} setError={s.setError} setNotice={s.setNotice} />

        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-ink-line/60 px-4">
          <IconButton icon={Undo2} label="Undo" kbd="Ctrl+Z" onClick={s.undo} disabled={!canUndo} />
          <IconButton icon={Redo2} label="Redo" kbd="Ctrl+Shift+Z" onClick={s.redo} disabled={!canRedo} />
          <span className="mx-2 h-5 w-px bg-ink-line" />
          <GroupSwitch />
          <span className="mx-2 h-5 w-px bg-ink-line" />
          <IconButton icon={Minus} label="Narrower columns" kbd="Ctrl+scroll" onClick={() => s.setZoom(zoom / 1.25)} />
          <IconButton icon={Plus} label="Wider columns" kbd="Ctrl+scroll" onClick={() => s.setZoom(zoom * 1.25)} />
          <span className="mx-2 h-5 w-px bg-ink-line" />
          <Button size="sm" onClick={newChapter} disabled={!loaded}><SquarePlus className="h-4 w-4" />New chapter</Button>
          <span className="flex-1" />
          {loaded && <FindButton />}
          {loaded && <ChecksButton checks={checks} onGo={goToCheck} />}
          <span className="ml-3 hidden font-talk text-xs text-taupe 2xl:inline">{doc.chapters.length} chapters · {events} events</span>
        </div>
        <AnimatePresence initial={false}>
          {isFiltered(s.filter) && (
            <m.div key="focus" className="shrink-0 overflow-hidden" transition={spring.smooth}
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <FocusBar />
            </m.div>
          )}
        </AnimatePresence>

        <ConflictBar items={conflicts.map(c => ({ key: c.path, label: c.label, deleted: c.theirs === null }))} onResolve={s.resolveConflict} />

        {loaded ? (
          doc.chapters.length ? <Board flagged={flagged} /> : (
            <div className="grid flex-1 place-items-center px-8 text-center">
              <div className="max-w-md space-y-3">
                <p className="font-sans text-xl font-light text-bone">No chapters yet.</p>
                <p className="font-talk text-sm text-taupe">Start with <b>New chapter</b> at the top.</p>
              </div>
            </div>
          )
        ) : (
          <div className="grid flex-1 place-items-center font-sans text-lg font-light text-bone">
            {loc && !loc.ready ? "Pick the story folder at the bottom left." : "Loading…"}
          </div>
        )}
      </main>

      <Inspector />
    </div>
  );
}

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: "chars", label: "Characters" },
  { id: "threads", label: "Threads" },
  { id: "none", label: "One lane" },
];

/** Lanes by character, by thread, or a single one. */
function GroupSwitch() {
  const { filter, setFilter } = useTimelinePick("filter", "setFilter");
  return (
    <div role="radiogroup" aria-label="Lanes" className="flex items-center gap-0.5 rounded-md bg-ink-2 p-0.5">
      <span className="px-1.5 font-sans text-sm text-taupe">Lanes</span>
      {GROUPS.map(g => {
        const on = filter.groupBy === g.id;
        return (
          <button key={g.id} role="radio" aria-checked={on} onClick={() => setFilter({ groupBy: g.id })}
            className={cn("relative h-7 rounded-md px-2 font-sans text-base transition-colors", on ? "text-paper" : "text-taupe hover:text-paper")}>
            {on && <m.span layoutId="lane-group" transition={spring.bouncy} className="absolute inset-0 rounded-md bg-ink-3" />}
            <span className="relative">{g.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Shown while focusing: what's picked, dim or hide the rest, save as a view. */
function FocusBar() {
  const { doc, filter, viewId, setFilter, edit } = useTimelinePick("doc", "filter", "viewId", "setFilter", "edit");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  // while the bar closes, keep showing what was focused instead of an empty bar
  const last = useRef(filter);
  if (isFiltered(filter)) last.current = filter;
  const shown = last.current;
  const cast = castOf(doc.roster, doc.chapters), threads = threadsOf(doc.threads, doc.chapters);
  const chips = [
    ...shown.chars.map(id => ({ key: "chars" as const, id, name: cast.find(c => c.id === id)?.name ?? id, color: cast.find(c => c.id === id)?.color ?? UNKNOWN_COLOR })),
    ...shown.threads.map(id => ({ key: "threads" as const, id, name: threads.find(t => t.id === id)?.name ?? id, color: threads.find(t => t.id === id)?.color ?? UNKNOWN_COLOR })),
  ];
  const view = doc.views.find(v => v.id === viewId);
  const save = () => {
    const n = name.trim();
    if (!n) return;
    const id = uniqueId(n, doc.views.map(v => v.id));
    edit(d => { d.views.push({ id, name: n, ...filter }); });
    setFilter({}, id);
    setName("");
    setOpen(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-line/60 bg-ink-2/50 px-4 py-1.5">
      <span className="font-sans text-base text-taupe">{view ? view.name : "Focus"}</span>
      <div className="flex flex-wrap gap-1">
        <AnimatePresence mode="popLayout" initial={false}>
        {chips.map(c => (
          <m.span key={`${c.key}:${c.id}`} layout {...pop} className="flex items-center gap-1 rounded-full border-2 py-px pl-2 pr-0.5 font-sans text-sm text-paper" style={{ borderColor: visible(c.color) }}>
            {c.name}
            <button aria-label={`Drop ${c.name}`} onClick={() => setFilter({ [c.key]: filter[c.key].filter(x => x !== c.id) }, null)}
              className="grid h-4 w-4 place-items-center rounded-full text-taupe hover:text-paper"><X className="h-3 w-3" /></button>
          </m.span>
        ))}
        </AnimatePresence>
      </div>
      <label className="flex items-center gap-2 font-talk text-sm text-bone">
        <Switch checked={shown.hideOthers} onCheckedChange={v => setFilter({ hideOthers: v })} />
        Hide the rest
      </label>
      <span className="flex-1" />
      {!view && (
        <Popover open={open} onOpenChange={setOpen} align="end" className="w-72" trigger={<Button size="sm"><BookmarkPlus className="h-4 w-4" />Save as view</Button>}>
          <PopoverTitle>Save as view</PopoverTitle>
          <p className="mb-3 text-sm text-bone">Saves this focus for everyone.</p>
          <div className="flex items-center gap-2">
            <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} placeholder="Name"
              className={cn(fieldCls, "flex-1")} />
            <Button size="sm" variant="primary" onClick={save} disabled={!name.trim()}>Save</Button>
          </div>
        </Popover>
      )}
      <Button size="sm" variant="ghost" onClick={() => setFilter({ chars: [], threads: [], hideOthers: false }, null)}>Show everything</Button>
    </div>
  );
}

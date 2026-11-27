import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Minus, Plus, Redo2, SquarePlus, Undo2 } from "lucide-react";
import { TOOLS } from "@/app/tools";
import { isTyping, useHotkeys } from "@/shared/lib/hotkeys";
import { cn, uniqueId } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { IconButton } from "@/shared/ui/icon-button";
import { AnimatePresence, m, spring } from "@/shared/ui/motion";
import { MotionItem, MotionList } from "@/shared/ui/motion-list";
import { Popover, PopoverTitle } from "@/shared/ui/popover";
import { fieldCls } from "@/shared/ui/field";
import { Switch } from "@/shared/ui/switch";
import { HelpButton } from "@/shared/ui/help";
import { BarDivider, EmptyState, NotReady, ToolBar, ToolPage } from "@/shared/ui/tool-page";
import { newChapter, removeEvent } from "./lib/actions";
import { GESTURES } from "./lib/help";
import { visible } from "./lib/colors";
import { runChecks, type Check } from "./lib/checks";
import { allEvents, castOf, isFiltered, threadsOf } from "./lib/model";
import { nav, reveal } from "./lib/nav";
import type { GroupBy } from "./lib/types";
import { useTimeline, useTimelinePick } from "./state";
import { Board } from "./components/Board";
import { ChecksButton } from "./components/Checks";
import { FindButton } from "./components/Find";
import { Inspector } from "./components/Inspector";
import { Sidebar } from "./components/Sidebar";
import { UNKNOWN_COLOR } from "@/shared/lib/colors";
import { useGame } from "@/shared/lib/game";

export default function Timeline() {
  const s = useTimelinePick("loc", "loaded", "doc", "selection", "error", "notice", "conflicts", "zoom", "canUndo", "canRedo", "filter", "folded",
    "undo", "redo", "setZoom", "setFilter", "toggleFolded", "resolveConflict", "setError", "setNotice", "reload", "flush", "revert");
  const { loc, loaded, doc, conflicts, zoom, canUndo, canRedo } = s;

  useEffect(() => useTimeline.getState().init(), []);
  // the game's characters and colours join the roster (castOf); re-read whenever the timeline (re)loads
  const game = useGame(g => g.manifest);
  useEffect(() => { if (loaded) useGame.getState().fresh(); }, [loaded, loc]);

  const st = useTimeline.getState;
  /** Only events: chapters, threads and characters are deleted from their panel, with a confirm. Not a bare
   *  Backspace: too easy to hit right after leaving a text field. Ctrl/Cmd+Backspace for keyboards without Delete. */
  const deleteSelected = () => { const sel = st().selection; if (sel?.kind !== "event") return false; removeEvent(sel.id); };
  useHotkeys({
    // in a field, its own undo
    "mod+z": { run: () => st().undo(), inFields: false },
    "mod+shift+z": { run: () => st().redo(), inFields: false },
    "mod+y": { run: () => st().redo(), inFields: false },
    // leaves the field, else the selection; the key still reaches popups
    escape: { inFields: true, run: e => { if (isTyping(e.target)) (e.target as HTMLElement).blur(); else st().select(null); return false; } },
    delete: deleteSelected,
    "mod+backspace": { run: deleteSelected, inFields: false },
  });

  const goToCheck = (c: Check) => {
    if (c.go === "thread-lanes") return s.setFilter({ groupBy: "threads" });
    if (c.target?.kind === "event") return reveal(c.target.id);
    if (c.target?.kind === "chapter") {
      const id = c.target.id;
      if (s.folded.has(id)) s.toggleFolded(id);
      setTimeout(() => nav.toChapter(id), 60);
    }
  };

  const checks = useMemo(() => runChecks(doc.chapters, castOf(doc.roster, []), doc.threads), [doc, game]);
  /** Worst problem per event, for the marks on cards. */
  const flagged = useMemo(() => {
    const m = new Map<string, Check["level"]>();
    for (const c of checks) if (c.target?.kind === "event" && c.level !== "info" && !m.has(c.target.id)) m.set(c.target.id, c.level);
    return m;
  }, [checks]);
  const events = allEvents(doc.chapters).length;

  return (
    <ToolPage tool={TOOLS.timeline} data={s} sidebar={<Sidebar />} aside={<Inspector />} asideOpen={!!s.selection}
      bar={<>
        <ToolBar>
          <IconButton icon={Undo2} size="sm" tooltipSide="bottom" label="Undo" kbd="Ctrl+Z" onClick={s.undo} disabled={!canUndo} />
          <IconButton icon={Redo2} size="sm" tooltipSide="bottom" label="Redo" kbd="Ctrl+Shift+Z" onClick={s.redo} disabled={!canRedo} />
          <BarDivider />
          <GroupSwitch />
          <BarDivider />
          <IconButton icon={Minus} size="sm" tooltipSide="bottom" label="Narrower columns" kbd="Ctrl+scroll" onClick={() => s.setZoom(zoom / 1.25)} />
          <IconButton icon={Plus} size="sm" tooltipSide="bottom" label="Wider columns" kbd="Ctrl+scroll" onClick={() => s.setZoom(zoom * 1.25)} />
          <BarDivider />
          <Button size="sm" onClick={newChapter} disabled={!loaded}><SquarePlus className="h-4 w-4" />New chapter</Button>
          <span className="flex-1" />
          <span className="mr-2 hidden whitespace-nowrap font-talk text-xs text-taupe @5xl:inline">{doc.chapters.length} chapters · {events} events</span>
          {loaded && <FindButton />}
          {loaded && <ChecksButton checks={checks} onGo={goToCheck} />}
          <BarDivider />
          <HelpButton items={GESTURES} intro={<>
            Chapters run left to right. Inside a chapter, events in the same <b className="font-semibold text-paper">column</b> happen
            at the same time. <b className="font-semibold text-paper">Threads</b> are storylines across chapters. Pick anything to
            edit it on the right. Changes save on their own, except on GitHub: there, use Save to GitHub.
          </>} />
        </ToolBar>
        <AnimatePresence initial={false}>
          {isFiltered(s.filter) && (
            <m.div key="focus" className="shrink-0 overflow-hidden" transition={spring.smooth}
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <FocusBar />
            </m.div>
          )}
        </AnimatePresence>
      </>}
      conflicts={conflicts.map(c => ({ key: c.path, label: c.label, deleted: c.theirs === null }))} onResolve={s.resolveConflict}>
      {!loaded ? <NotReady loc={loc} /> : doc.chapters.length ? <Board flagged={flagged} /> : (
        <EmptyState title="No chapters yet.">Start with <b>New chapter</b> at the top.</EmptyState>
      )}
    </ToolPage>
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
      <span className="hidden px-1.5 font-sans text-sm text-taupe @4xl:inline">Lanes</span>
      {GROUPS.map(g => {
        const on = filter.groupBy === g.id;
        return (
          <button key={g.id} role="radio" aria-checked={on} onClick={() => setFilter({ groupBy: g.id })}
            className={cn("relative h-7 whitespace-nowrap rounded-md px-2 font-sans text-base transition-colors", on ? "text-paper" : "text-taupe hover:text-paper")}>
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
      <div className="relative flex flex-wrap gap-1">
        <MotionList>
        {chips.map(c => (
          <MotionItem as="span" key={`${c.key}:${c.id}`} className="flex">
            <Chip color={visible(c.color)} removeLabel={`Drop ${c.name}`} onRemove={() => setFilter({ [c.key]: filter[c.key].filter(x => x !== c.id) }, null)}>{c.name}</Chip>
          </MotionItem>
        ))}
        </MotionList>
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

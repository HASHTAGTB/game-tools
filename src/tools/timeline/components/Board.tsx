import { spotlight } from "@/shared/ui/flair";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ChevronsLeftRight, ChevronsRightLeft, Plus, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "@/shared/ui/icon-button";
import { visible } from "../lib/colors";
import { BASE_COL_W, CARD_H, columnAt, LANE_PAD, laneDefs, layout, ROW_H, UNSORTED, type Card, type Lane, type Layout } from "../lib/layout";
import { arrowsOf, drawOrder, stubsOf } from "../lib/arrows";
import { allEvents, castOf, findEvent, insertColumn, moveEvent, randomId, removeColumn, swapIn, threadsOf } from "../lib/model";
import type { StoryEvent } from "../lib/types";
import { nav } from "../lib/nav";
import { useGame } from "@/shared/lib/game";
import { useTimeline, useTimelinePick } from "../state";
import { BoardArrows } from "./BoardArrows";
import { BoardCard } from "./BoardCard";
import { at, useLanding, useZoomAnchor } from "./boardMotion";

export const LABEL_W = 132;
const TITLE_H = 46;
const COLS_H = 24;
const HEADER_H = TITLE_H + COLS_H;

/** Flash a card or chapter title once the board has scrolled to it, so the eye finds it. */
function ping(el: Element | null | undefined) {
  if (!el) return;
  el.classList.remove("board-ping");
  void (el as HTMLElement).offsetWidth;   // restart the animation if it's still running
  el.classList.add("board-ping");
  setTimeout(() => el.classList.remove("board-ping"), 1300);
}

type Drag =
  | { kind: "move"; id: string; lane: Lane; startX: number; startY: number; offX: number; offY: number; w: number; h: number; started: boolean }
  | { kind: "resize"; id: string; chapter: string; col: number }
  | { kind: "connect"; id: string };

export function Board({ flagged }: { flagged: Map<string, "error" | "warning" | "info"> }) {
  const { doc, filter, zoom, folded, selection, select, edit, toggleFolded } = useTimelinePick("doc", "filter", "zoom", "folded", "selection", "select", "edit", "toggleFolded");
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverLink, setHoverLink] = useState<string | null>(null);
  /** Empty spot under the pointer, where a double-click would add an event. */
  const [slot, setSlot] = useState<{ key: string; x: number; y: number; w: number; h: number } | null>(null);

  const game = useGame(g => g.manifest);
  const cast = useMemo(() => castOf(doc.roster, doc.chapters), [doc.roster, doc.chapters, game]);
  const threads = useMemo(() => threadsOf(doc.threads, doc.chapters), [doc.threads, doc.chapters]);
  const charColor = useMemo(() => new Map(cast.map(c => [c.id, visible(c.color)])), [cast]);
  const threadColor = useMemo(() => new Map(threads.map(t => [t.id, visible(t.color)])), [threads]);
  const nameOf = useMemo(() => new Map(cast.map(c => [c.id, c.name])), [cast]);
  const lanes = useMemo(() => laneDefs(filter, cast, threads, allEvents(doc.chapters).map(x => x.event)), [filter, cast, threads, doc.chapters]);
  const colW = Math.round(BASE_COL_W * zoom);
  const lay: Layout = useMemo(() => layout(doc.chapters, lanes, filter, colW, folded), [doc.chapters, lanes, filter, colW, folded]);

  const animate = useZoomAnchor(scroller, zoom, colW, LABEL_W);
  const land = useLanding(track, lay);
  /** the event just added here: its card drops in (cards that appear because of a filter or a load don't) */
  const added = useRef<string | null>(null);
  useEffect(() => { added.current = null; });

  useEffect(() => {
    Object.assign(nav, {
      toChapter: (id: string) => {
        const pc = lay.chapters.find(c => c.chapter.id === id);
        if (pc) scroller.current?.scrollTo({ left: Math.max(0, pc.x - 24), behavior: "smooth" });
        ping(scroller.current?.querySelector(`[data-chapter="${CSS.escape(id)}"]`));
      },
      toEvent: (id: string) => {
        const c = lay.primary.get(id);
        const el = scroller.current;
        if (c && el) el.scrollTo({ left: Math.max(0, c.box.x - el.clientWidth / 3), top: Math.max(0, c.box.y - el.clientHeight / 3), behavior: "smooth" });
        // the other cards dim for a moment so this one stands alone (Spotlight, as in the Scenes checks)
        const card = track.current?.querySelector<HTMLElement>(`[data-event="${CSS.escape(id)}"][data-primary]`);
        if (card && track.current) spotlight(card, track.current, "[data-event]");
      },
    });
  }, [lay]);

  // picking an event opens the Inspector, which makes the board narrower: once it's open, keep the card in view
  const pickedEvent = selection?.kind === "event" ? selection.id : null;
  useEffect(() => {
    if (!pickedEvent) return;
    const t = setTimeout(() => {
      const c = lay.primary.get(pickedEvent), el = scroller.current;
      if (!c || !el) return;
      const over = c.box.x + c.box.w + 24 - (el.scrollLeft + el.clientWidth);
      if (over > 0) el.scrollBy({ left: Math.min(over, c.box.x - el.scrollLeft - LABEL_W - 24), behavior: "smooth" });
    }, 320);
    return () => clearTimeout(t);
  }, [pickedEvent]);

  // ---------------------------------------------------------------- pointer handling

  const trackPos = (e: { clientX: number; clientY: number }) => {
    const r = track.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const laneAt = (y: number) => lay.lanes.find(l => y >= l.y && y < l.y + l.h) ?? null;

  const begin = (d: Drag, e: RPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = d;
    setDrag(d);
    setPointer(trackPos(e));
  };

  const onMove = (e: RPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = trackPos(e);
    if (d.kind === "move" && !d.started) {
      if (Math.abs(e.clientX - d.startX) < 4 && Math.abs(e.clientY - d.startY) < 4) return;
      d.started = true;
    }
    setPointer(p);
    if (d.kind === "resize") {
      const t = columnAt(lay, p.x);
      if (!t || t.chapter.id !== d.chapter) return;
      const span = Math.max(1, t.col - d.col + 1);
      edit(doc => {
        const f = findEvent(doc.chapters, d.id);
        if (!f) return;
        if (span > 1) f.event.span = span; else delete f.event.span;
      }, `resize:${d.id}`);
    }
  };

  /** Where a dragged card would land: chapter column under the pointer, lane under it. */
  const dropTarget = (d: Extract<Drag, { kind: "move" }>, p: { x: number; y: number }) => {
    const t = columnAt(lay, p.x - d.offX + Math.min(24, d.w / 2));
    const lane = laneAt(p.y) ?? d.lane;
    return t ? { ...t, lane } : null;
  };

  const onUp = (e: RPointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    setPointer(null);
    if (!d) return;
    if (d.kind === "connect") {
      const to = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-event]")?.dataset.event;
      if (to && to !== d.id) {
        edit(doc => {
          const f = findEvent(doc.chapters, d.id);
          if (!f || f.event.links?.some(l => l.to === to)) return;
          (f.event.links ??= []).push({ to });
        });
      }
      select({ kind: "event", id: d.id });
      return;
    }
    if (d.kind === "resize") return;
    if (!d.started) { select({ kind: "event", id: d.id }); return; }
    const p = trackPos(e);
    land(d.id, p.x - d.offX, p.y - d.offY);
    const t = dropTarget(d, p);
    if (!t) return;
    edit(doc => {
      moveEvent(doc.chapters, d.id, t.chapter.id, t.col);
      if (filter.groupBy === "none" || t.lane.key === d.lane.key) return;
      const f = findEvent(doc.chapters, d.id)!;
      const field = filter.groupBy === "chars" ? "chars" : "threads";
      const to = t.lane.key === UNSORTED ? null : t.lane.id;
      // already on that lane too (a shared event): swapping would just drop this lane's character / thread
      if (to && f.event[field].includes(to)) return;
      f.event[field] = swapIn(f.event[field], d.lane.id, to);
    });
    select({ kind: "event", id: d.id });
  };

  const onTrackDouble = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-event]")) return;
    const p = trackPos(e);
    const t = columnAt(lay, p.x);
    const lane = laneAt(p.y);
    if (!t || !lane) return;
    const id = randomId();
    const ev: StoryEvent = {
      id, title: "", col: t.col,
      // a new event belongs to its lane, and to what is being looked at
      chars: filter.groupBy === "chars" ? (lane.id ? [lane.id] : []) : [...filter.chars],
      threads: filter.groupBy === "threads" ? (lane.id ? [lane.id] : []) : [...filter.threads],
    };
    added.current = id;
    edit(doc => { doc.chapters.find(c => c.id === t.chapter.id)?.events.push(ev); });
    select({ kind: "event", id });
    setSlot(null);
  };

  /** The free spot a double-click at `p` would fill: only where the lane is empty in that column. */
  const slotAt = (p: { x: number; y: number }) => {
    const t = columnAt(lay, p.x), lane = laneAt(p.y);
    if (!t || !lane) return null;
    const col = lay.chapters.find(c => c.chapter.id === t.chapter.id)?.columns[t.col];
    if (!col?.w) return null;
    const x = col.x + 3, w = col.w - 6;
    const near = lay.cards.filter(c => c.lane.key === lane.key && c.chapter.id === t.chapter.id);
    if (near.some(c => c.box.x < x + w && c.box.x + c.box.w > x)) return null;
    // same height as the chapter's other cards in this lane (crowded lanes squash them)
    const top = near.reduce<Card | null>((a, c) => (!a || c.box.y < a.box.y ? c : a), null);
    const h = top?.box.h ?? CARD_H;
    return { key: `${lane.key}:${t.chapter.id}:${t.col}`, x, w, h, y: top ? top.box.y : lane.y + LANE_PAD + (ROW_H - CARD_H) / 2 };
  };
  const onHover = (e: RPointerEvent) => {
    const next = (e.target as HTMLElement).closest("[data-event]") ? null : slotAt(trackPos(e));
    if (next?.key !== slot?.key) setSlot(next);
  };

  // ---------------------------------------------------------------- what to draw

  const selected = selection?.kind === "event" ? selection.id : null;
  const focus = selected ?? hover;
  const colorOf = (c: Card) => {
    if (c.lane.id && filter.groupBy === "chars") return charColor.get(c.lane.id)!;
    if (c.lane.id && filter.groupBy === "threads") return threadColor.get(c.lane.id)!;
    const t = c.event.threads[0], ch = c.event.chars[0];
    return (t && threadColor.get(t)) || (ch && charColor.get(ch)) || "var(--color-bone)";
  };

  const arrows = useMemo(() => arrowsOf(lay), [lay]);
  const stubs = useMemo(() => stubsOf(lay, doc.chapters), [lay, doc.chapters]);
  const { arriveAt, drawAt } = useMemo(() => drawOrder(arrows, selected), [arrows, selected]);

  /** Cards keep their identity when they change lane (regrouping, dragging), so they slide there instead of
   *  popping: an event's n-th copy is always the same element. */
  const copyKeys = useMemo(() => {
    const seen = new Map<string, number>();
    return lay.cards.map(c => { const n = seen.get(c.event.id) ?? 0; seen.set(c.event.id, n + 1); return `${c.event.id}#${n}`; });
  }, [lay]);

  const moving = drag?.kind === "move" && drag.started ? drag : null;
  const target = moving && pointer ? dropTarget(moving, pointer) : null;
  const targetBox = (() => {
    if (!target || !moving) return null;
    const pc = lay.chapters.find(c => c.chapter.id === target.chapter.id)!;
    const ev = findEvent(doc.chapters, moving.id)?.event;
    const cols = pc.columns.slice(target.col, target.col + (ev?.span ?? 1)).filter(c => c.w > 0);
    if (!cols.length) return null;
    return { x: cols[0].x, w: cols.reduce((s, c) => s + c.w, 0), y: target.lane.y, h: target.lane.h };
  })();

  return (
    <div ref={scroller} className={cn("relative min-h-0 flex-1 overflow-auto overscroll-contain", (!animate || drag) && "board-still")}>
      <div className="relative" style={{ width: LABEL_W + lay.width + 120, minHeight: "100%" }}>
        {/* header: chapters and their columns */}
        <div className="sticky top-0 z-20 flex border-b border-ink-line/70 bg-ink" style={{ height: HEADER_H }}>
          <div className="sticky left-0 z-30 shrink-0 bg-ink" style={{ width: LABEL_W }} />
          <div className="relative shrink-0" style={{ width: lay.width }}>
            {lay.chapters.map(pc => {
              const on = selection?.kind === "chapter" && selection.id === pc.chapter.id;
              if (pc.folded) return (
                <button key={pc.chapter.id} onClick={() => folded.has(pc.chapter.id) ? toggleFolded(pc.chapter.id) : select({ kind: "chapter", id: pc.chapter.id })}
                  title={folded.has(pc.chapter.id) ? `${pc.chapter.name}: unfold` : `${pc.chapter.name}: nothing here matches`}
                  className="board-move absolute inset-y-0 border-l border-ink-line/70 text-taupe hover:bg-ink-2 hover:text-paper" style={{ ...at(pc.x), width: pc.w }}>
                  <span className="absolute left-1/2 top-2 origin-top-left translate-x-[7px] rotate-90 whitespace-nowrap font-sans text-sm">{pc.chapter.name}</span>
                </button>
              );
              return (
                <div key={pc.chapter.id} className="board-move group/chapter absolute inset-y-0 border-l border-ink-line/70" style={{ ...at(pc.x), width: pc.w }}>
                  <div className="flex items-start gap-1 overflow-hidden px-2 pt-1.5" style={{ height: TITLE_H }}>
                    <button data-chapter={pc.chapter.id} onClick={() => select({ kind: "chapter", id: pc.chapter.id })} className="min-w-0 flex-1 rounded-md text-left">
                      <span className={cn("block truncate font-sans text-base leading-tight", on ? "text-paper underline decoration-caramel decoration-2 underline-offset-4" : "text-bone hover:text-paper")}>{pc.chapter.name}</span>
                      {pc.chapter.when && <span className="block truncate font-talk text-xs text-taupe">{pc.chapter.when}</span>}
                    </button>
                    <div className="flex opacity-0 transition-opacity group-hover/chapter:opacity-100 [@media(hover:none)]:opacity-100">
                      <IconButton icon={Plus} size="sm" label="Add a column at the end" onClick={() => edit(d => { d.chapters.find(c => c.id === pc.chapter.id)?.columns.push(""); })} />
                      <IconButton icon={ChevronsRightLeft} size="sm" label="Fold chapter (only for you)" onClick={() => toggleFolded(pc.chapter.id)} />
                    </div>
                  </div>
                  {pc.columns.filter(c => c.w > 0).map(col => (
                    <ColumnHead key={col.i} chapterId={pc.chapter.id} col={col.i} label={col.label}
                      empty={!pc.chapter.events.some(e => e.col === col.i)} last={pc.chapter.columns.length === 1}
                      style={{ left: col.x - pc.x, width: col.w, top: TITLE_H, height: COLS_H }} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* lanes */}
        <div className="flex">
          <div className="sticky left-0 z-10 shrink-0 border-r border-ink-line/60 bg-ink" style={{ width: LABEL_W, height: lay.height }}>
            {lay.lanes.map(l => {
              const kind = filter.groupBy === "chars" ? "char" : "thread";
              const on = selection?.kind === kind && selection.id === l.id;
              return (
                <div key={l.key} className="board-move board-enter absolute inset-x-0 border-b border-ink-line/40 px-3 pt-2.5" style={{ ...at(0, l.y), height: l.h }}>
                  {l.id && filter.groupBy !== "none" ? (
                    <button onClick={() => select({ kind, id: l.id! })}
                      className={cn("max-w-full truncate border-b-2 text-left font-sans text-base leading-6", on ? "text-paper" : "text-bone hover:text-paper")}
                      style={{ borderColor: visible(l.color) }}>{l.name}</button>
                  ) : <span className="font-sans text-base leading-6 text-taupe">{l.name}</span>}
                </div>
              );
            })}
          </div>

          <div ref={track} className="relative shrink-0" style={{ width: lay.width, height: lay.height }} onDoubleClick={onTrackDouble}
            onPointerMove={drag ? onMove : onHover} onPointerLeave={() => setSlot(null)}>
            {/* chapter and column rules */}
            {lay.chapters.map(pc => (
              <div key={pc.chapter.id} className={cn("board-move pointer-events-none absolute inset-y-0 border-l border-ink-line/70", pc.folded && "bg-ink-2/60")} style={{ ...at(pc.x), width: pc.w }}>
                {!pc.folded && pc.columns.slice(1).filter(c => c.w > 0).map(c => (
                  <div key={c.i} className="board-move absolute inset-y-0 border-l border-dashed border-ink-line/30" style={at(c.x - pc.x)} />
                ))}
              </div>
            ))}
            {lay.lanes.map(l => <div key={l.key} className="board-move pointer-events-none absolute inset-x-0 border-b border-ink-line/40" style={{ ...at(0, l.y), height: l.h }} />)}
            {slot && !drag && (
              <div key={slot.key} className="board-enter pointer-events-none absolute flex items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border border-dashed border-taupe/50 font-talk text-xs text-taupe transition-[opacity,scale] duration-150"
                style={{ left: slot.x, top: slot.y, width: slot.w, height: slot.h }}>
                <Plus className="h-3.5 w-3.5 shrink-0" />{slot.w > 120 && "Double-click to add"}
              </div>
            )}
            {targetBox && <div className="pointer-events-none absolute rounded-md border-2 border-dashed border-paper/60 bg-paper/5" style={{ left: targetBox.x + 1, top: targetBox.y + 2, width: targetBox.w - 2, height: targetBox.h - 4 }} />}

            <BoardArrows lay={lay} arrows={arrows} stubs={stubs} focus={focus} selected={selected} hoverLink={hoverLink} setHoverLink={setHoverLink}
              drawAt={drawAt} colorOf={colorOf} onSelect={id => select({ kind: "event", id })}
              connecting={drag?.kind === "connect" && pointer ? { from: drag.id, to: pointer } : null} />

            {lay.cards.map((c, ci) => (
              <BoardCard key={copyKeys[ci]} card={c} added={c.event.id === added.current} color={colorOf(c)} groupBy={filter.groupBy} primary={lay.primary.get(c.event.id) === c}
                selected={selected === c.event.id} focused={focus === c.event.id} lifted={moving?.id === c.event.id} problem={flagged.get(c.event.id)}
                arrive={lay.primary.get(c.event.id) === c ? arriveAt.get(c.event.id) : undefined}
                threadColor={threadColor} charColor={charColor} charName={nameOf}
                onDown={(part, e) => {
                  if (part === "resize") return begin({ kind: "resize", id: c.event.id, chapter: c.chapter.id, col: c.event.col }, e);
                  if (part === "connect") return begin({ kind: "connect", id: c.event.id }, e);
                  const r = trackPos(e);
                  begin({ kind: "move", id: c.event.id, lane: lay.lanes.find(l => l.key === c.lane.key)!, startX: e.clientX, startY: e.clientY, offX: r.x - c.box.x, offY: r.y - c.box.y, w: c.box.w, h: c.box.h, started: false }, e);
                }}
                onMove={onMove} onUp={onUp}
                onHover={on => setHover(h => (on ? c.event.id : h === c.event.id ? null : h))} />
            ))}

            {/* the card being dragged */}
            {moving && pointer && (() => {
              const c = lay.cards.find(x => x.event.id === moving.id && x.lane.key === moving.lane.key);
              if (!c) return null;
              return (
                <div className="pointer-events-none absolute z-30 overflow-hidden rounded-md border-[1.5px] border-[color-mix(in_srgb,var(--c)_70%,transparent)] bg-[color-mix(in_srgb,var(--c)_30%,var(--color-ink-3))] shadow-panel"
                  style={{ left: pointer.x - moving.offX, top: pointer.y - moving.offY, width: moving.w, height: moving.h, "--c": colorOf(c), rotate: "-1.5deg" } as React.CSSProperties}>
                  <p className="line-clamp-2 px-1.5 pt-1 font-talk text-xs leading-[15px] text-paper">{c.event.title || "untitled"}</p>
                </div>
              );
            })()}
          </div>
        </div>
        {!lay.cards.length && lay.chapters.length > 0 && (
          <p className="pointer-events-none absolute font-talk text-sm text-taupe" style={{ left: LABEL_W + 16, top: HEADER_H + 20 }}>
            Nothing matches. Double-click a lane to add an event.
          </p>
        )}
      </div>
    </div>
  );
}

/** A column's label in the header: click to rename. Hover: add a column after it, or remove it while it's empty. */
function ColumnHead({ chapterId, col, label, empty, last, style }: { chapterId: string; col: number; label: string; empty: boolean; last: boolean; style: React.CSSProperties }) {
  const edit = useTimeline(s => s.edit);
  const [text, setText] = useState(label);
  useEffect(() => setText(label), [label]);
  const commit = (v: string) => edit(d => { const c = d.chapters.find(x => x.id === chapterId); if (c) c.columns[col] = v; }, `col:${chapterId}:${col}`);
  return (
    <div className="group/col absolute flex items-center border-l border-dashed border-ink-line/30 first-of-type:border-l-0" style={style}>
      <input value={text} onChange={e => { setText(e.target.value); commit(e.target.value); }} onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="·" aria-label="Column label"
        className="h-full min-w-0 flex-1 bg-transparent px-2 font-talk text-xs text-bone placeholder:text-ink-line hover:placeholder:text-taupe focus:text-paper focus:outline-hidden" />
      <div className="flex shrink-0 opacity-0 transition-opacity group-hover/col:opacity-100">
        {empty && !last && (
          <button aria-label="Remove this empty column" title="Remove this empty column" onClick={() => edit(d => { const c = d.chapters.find(x => x.id === chapterId); if (c) removeColumn(c, col); })}
            className="grid h-5 w-5 place-items-center rounded-md text-taupe hover:text-coral"><X className="h-3 w-3" /></button>
        )}
        <button aria-label="Insert a column after this one" title="Insert a column after this one" onClick={() => edit(d => { const c = d.chapters.find(x => x.id === chapterId); if (c) insertColumn(c, col + 1); })}
          className="grid h-5 w-5 place-items-center rounded-md text-taupe hover:text-paper"><ChevronsLeftRight className="h-3 w-3" /></button>
      </div>
    </div>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ChevronsLeftRight, ChevronsRightLeft, Plus, StickyNote, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "@/shared/ui/icon-button";
import { visible } from "../lib/colors";
import { BASE_COL_W, CARD_H, columnAt, LANE_PAD, laneDefs, layout, ROW_H, UNSORTED, type Card, type Lane, type Layout } from "../lib/layout";
import { allEvents, castOf, findEvent, insertColumn, moveEvent, randomId, removeColumn, swapIn, threadsOf } from "../lib/model";
import type { StoryEvent } from "../lib/types";
import { nav, reveal } from "../lib/nav";
import { useTimeline } from "../state";

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
  const { doc, filter, zoom, folded, selection, select, edit, toggleFolded } = useTimeline();
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverLink, setHoverLink] = useState<string | null>(null);
  /** Empty spot under the pointer, where a double-click would add an event. */
  const [slot, setSlot] = useState<{ key: string; x: number; y: number; w: number; h: number } | null>(null);
  /** A card just let go of: it settles from where it was dropped, not from where it started. */
  const landing = useRef<{ id: string; x: number; y: number } | null>(null);
  const [dropTick, setDropTick] = useState(0);

  const cast = useMemo(() => castOf(doc.roster, doc.chapters), [doc.roster, doc.chapters]);
  const threads = useMemo(() => threadsOf(doc.threads, doc.chapters), [doc.threads, doc.chapters]);
  const charColor = useMemo(() => new Map(cast.map(c => [c.id, visible(c.color)])), [cast]);
  const threadColor = useMemo(() => new Map(threads.map(t => [t.id, visible(t.color)])), [threads]);
  const nameOf = useMemo(() => new Map(cast.map(c => [c.id, c.name])), [cast]);
  const lanes = useMemo(() => laneDefs(filter, cast, threads, allEvents(doc.chapters).map(x => x.event)), [filter, cast, threads, doc.chapters]);
  const colW = Math.round(BASE_COL_W * zoom);
  const lay: Layout = useMemo(() => layout(doc.chapters, lanes, filter, colW, folded), [doc.chapters, lanes, filter, colW, folded]);

  // ---------------------------------------------------------------- zoom (ctrl + wheel) keeps the spot under the pointer
  const lastZoom = useRef(zoom);
  const animate = lastZoom.current === zoom;   // no sliding cards while zooming
  const anchor = useRef<{ x: number; px: number; colW: number } | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const st = useTimeline.getState();
      const px = e.clientX - el.getBoundingClientRect().left - LABEL_W;
      anchor.current = { x: el.scrollLeft + px, px, colW: Math.round(BASE_COL_W * st.zoom) };
      st.setZoom(st.zoom * Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  useLayoutEffect(() => {
    lastZoom.current = zoom;
    const a = anchor.current, el = scroller.current;
    if (!a || !el) return;
    anchor.current = null;
    el.scrollLeft = (a.x * colW) / a.colW - a.px;
  }, [zoom, colW]);

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
        ping(track.current?.querySelector(`[data-event="${CSS.escape(id)}"][data-primary]`));
      },
    });
  }, [lay]);

  // the dropped card flies from the pointer into its new place
  useLayoutEffect(() => {
    const l = landing.current, root = track.current;
    landing.current = null;
    if (!l || !root || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let el: HTMLElement | null = null, best = Infinity;
    for (const c of root.querySelectorAll<HTMLElement>(`[data-event="${CSS.escape(l.id)}"]`)) {
      const d = Math.hypot(c.offsetLeft - l.x, c.offsetTop - l.y);
      if (d < best) { best = d; el = c; }
    }
    if (!el) return;
    // jump to the new place without the usual slide, then play the flight from the drop point
    el.style.transition = "none";
    void el.offsetWidth;
    el.style.transition = "";
    el.animate(
      [{ translate: `${l.x - el.offsetLeft}px ${l.y - el.offsetTop}px`, rotate: "-1.5deg", boxShadow: "0 10px 30px rgba(0,0,0,.5)" },
       { translate: "0 0", rotate: "0deg", boxShadow: "0 0 0 rgba(0,0,0,0)" }],
      { duration: 280, easing: "cubic-bezier(.22,.8,.24,1)" },
    );
  }, [lay, dropTick]);

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
    landing.current = { id: d.id, x: p.x - d.offX, y: p.y - d.offY };
    setDropTick(n => n + 1);
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

  const links = useMemo(() => lay.cards.filter(c => lay.primary.get(c.event.id) === c).flatMap(f => (f.event.links ?? []).flatMap(l => {
    const t = lay.primary.get(l.to);
    return t ? [{ key: `${f.event.id}>${l.to}`, from: f, to: t, label: l.label }] : [];
  })), [lay]);

  /** Arrows with one end off the board (folded chapter, hidden by the focus): a short stub that says where it goes. */
  const stubs = useMemo(() => {
    const chapterIndex = new Map(doc.chapters.map((c, i) => [c.id, i]));
    const at = (e: string) => { const f = findEvent(doc.chapters, e); return f && { chapter: f.chapter, p: chapterIndex.get(f.chapter.id)! * 10000 + f.event.col }; };
    const out: { key: string; card: Card; other: string; out: boolean; later: boolean; chapter: string; label?: string }[] = [];
    for (const { event } of allEvents(doc.chapters)) for (const l of event.links ?? []) {
      const from = lay.primary.get(event.id), to = lay.primary.get(l.to);
      if (!from === !to) continue;
      const a = at(event.id), b = at(l.to);
      if (!a || !b) continue;
      if (from) out.push({ key: `${event.id}>${l.to}`, card: from, other: l.to, out: true, later: b.p >= a.p, chapter: b.chapter.name, label: l.label });
      else out.push({ key: `${event.id}>${l.to}`, card: to!, other: event.id, out: false, later: a.p > b.p, chapter: a.chapter.name, label: l.label });
    }
    return out;
  }, [lay, doc.chapters]);
  const STUB = 30;
  /** The stub leaves (or enters) the side facing the hidden end. */
  const stubPath = (s: (typeof stubs)[number]) => {
    const b = s.card.box, y = b.y + b.h / 2;
    const edge = s.later ? b.x + b.w : b.x, far = edge + (s.later ? STUB : -STUB);
    // the head points the way the arrow goes: out of the card, or into it
    const tip = s.out ? far : edge, dir = (s.out ? far - edge : edge - far) > 0 ? 1 : -1;
    return { d: `M${edge},${y} L${far},${y}`, head: `M${tip},${y} l${-7 * dir},-4 v8 z`, far, y };
  };
  /** Forward arrows leave from the right edge into the left one; arrows back in time (a reminder of something
   *  earlier) go from the left edge into the right one, so they don't loop around the card. */
  const linkPath = (f: Card, t: Card) => {
    const back = t.box.x + t.box.w <= f.box.x;
    const x1 = back ? f.box.x : f.box.x + f.box.w, y1 = f.box.y + f.box.h / 2;
    const x2 = back ? t.box.x + t.box.w : t.box.x, y2 = t.box.y + t.box.h / 2;
    const dx = (back ? -1 : 1) * Math.max(36, Math.abs(x2 - x1) / 2);
    const head = back ? `M${x2},${y2} l7,-4 v8 z` : `M${x2},${y2} l-7,-4 v8 z`;
    return { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, head, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
  };

  // the same event on several lanes: a line through its copies while it's in focus
  const siblings = useMemo(() => {
    if (!focus) return [];
    const copies = lay.cards.filter(c => c.event.id === focus).sort((a, b) => a.box.y - b.box.y);
    return copies.slice(1).map((c, i) => ({ x: c.box.x + 12, y0: copies[i].box.y + copies[i].box.h, y1: c.box.y }));
  }, [focus, lay]);

  /** The selected event's arrows, in the order they draw, and when each other end gets its pulse. */
  const { drawAt, arriveAt } = useMemo(() => {
    const drawAt = new Map<string, number>(), arriveAt = new Map<string, number>();
    if (!selected) return { drawAt, arriveAt };
    for (const l of links) {
      if (l.from.event.id !== selected && l.to.event.id !== selected) continue;
      const d = drawAt.size * 90;
      drawAt.set(l.key, d);
      const other = l.from.event.id === selected ? l.to.event.id : l.from.event.id;
      if (!arriveAt.has(other)) arriveAt.set(other, d);
    }
    return { drawAt, arriveAt };
  }, [selected, links]);

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
                  className="board-move absolute inset-y-0 border-l border-ink-line/70 text-taupe hover:bg-ink-2 hover:text-paper" style={{ left: pc.x, width: pc.w }}>
                  <span className="absolute left-1/2 top-2 origin-top-left translate-x-[7px] rotate-90 whitespace-nowrap font-sans text-sm">{pc.chapter.name}</span>
                </button>
              );
              return (
                <div key={pc.chapter.id} className="board-move group/chapter absolute inset-y-0 border-l border-ink-line/70" style={{ left: pc.x, width: pc.w }}>
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
                <div key={l.key} className="board-move board-enter absolute inset-x-0 border-b border-ink-line/40 px-3 pt-2.5" style={{ top: l.y, height: l.h }}>
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
              <div key={pc.chapter.id} className={cn("board-move pointer-events-none absolute inset-y-0 border-l border-ink-line/70", pc.folded && "bg-ink-2/60")} style={{ left: pc.x, width: pc.w }}>
                {!pc.folded && pc.columns.slice(1).filter(c => c.w > 0).map(c => (
                  <div key={c.i} className="board-move absolute inset-y-0 border-l border-dashed border-ink-line/30" style={{ left: c.x - pc.x }} />
                ))}
              </div>
            ))}
            {lay.lanes.map(l => <div key={l.key} className="board-move pointer-events-none absolute inset-x-0 border-b border-ink-line/40" style={{ top: l.y, height: l.h }} />)}
            {slot && !drag && (
              <div key={slot.key} className="board-enter pointer-events-none absolute flex items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border border-dashed border-taupe/50 font-talk text-xs text-taupe transition-[opacity,scale] duration-150"
                style={{ left: slot.x, top: slot.y, width: slot.w, height: slot.h }}>
                <Plus className="h-3.5 w-3.5 shrink-0" />{slot.w > 120 && "Double-click to add"}
              </div>
            )}
            {targetBox && <div className="pointer-events-none absolute rounded-md border-2 border-dashed border-paper/60 bg-paper/5" style={{ left: targetBox.x + 1, top: targetBox.y + 2, width: targetBox.w - 2, height: targetBox.h - 4 }} />}

            {/* arrows */}
            <svg className="pointer-events-none absolute inset-0 overflow-visible" width={lay.width} height={lay.height}>
              {siblings.map((s, i) => <line key={i} x1={s.x} x2={s.x} y1={s.y0} y2={s.y1} stroke="var(--color-paper)" strokeOpacity={0.5} strokeWidth={2} strokeDasharray="2 4" />)}
              {links.map(({ key, from, to }) => {
                const p = linkPath(from, to);
                const on = focus === from.event.id || focus === to.event.id || hoverLink === key;
                const color = colorOf(from);
                const dim = from.dim && to.dim;
                const draw = drawAt.get(key);
                const delay = { "--d": `${draw ?? 0}ms` } as React.CSSProperties;
                return (
                  // keyed by the selection too, so picking another event replays the drawing
                  <g key={draw === undefined ? key : `${key}@${selected}`} opacity={on ? 1 : dim ? 0.12 : 0.5} className="transition-opacity duration-150">
                    <path d={p.d} fill="none" stroke={color} strokeWidth={on ? 2.5 : 1.5}
                      pathLength={draw === undefined ? undefined : 1} className={draw === undefined ? undefined : "link-draw"} style={delay} />
                    <path d={p.head} fill={color} className={draw === undefined ? undefined : "link-head"} style={delay} />
                    <path d={p.d} fill="none" stroke="transparent" strokeWidth={12} className="pointer-events-auto cursor-pointer"
                      onPointerEnter={() => setHoverLink(key)} onPointerLeave={() => setHoverLink(null)}
                      onClick={() => select({ kind: "event", id: from.event.id })} />
                  </g>
                );
              })}
              {stubs.map(st => {
                const p = stubPath(st);
                const on = focus === st.card.event.id || hoverLink === st.key;
                const color = colorOf(st.card);
                return (
                  <g key={`s${st.key}`} opacity={on ? 1 : st.card.dim ? 0.12 : 0.5}>
                    <path d={p.d} fill="none" stroke={color} strokeWidth={on ? 2.5 : 1.5} strokeDasharray="3 3" />
                    <path d={p.head} fill={color} />
                    <path d={p.d} fill="none" stroke="transparent" strokeWidth={12} className="pointer-events-auto cursor-pointer"
                      onPointerEnter={() => setHoverLink(st.key)} onPointerLeave={() => setHoverLink(null)} onClick={() => reveal(st.other)} />
                  </g>
                );
              })}
              {drag?.kind === "connect" && pointer && (() => {
                const f = lay.primary.get(drag.id);
                return f && <path d={`M${f.box.x + f.box.w},${f.box.y + f.box.h / 2} L${pointer.x},${pointer.y}`} stroke="var(--color-paper)" strokeDasharray="4 4" strokeWidth={1.5} fill="none" />;
              })()}
            </svg>
            {links.map(({ key, from, to, label }) => {
              const on = focus === from.event.id || focus === to.event.id || hoverLink === key;
              if (!on || !label) return null;
              const p = linkPath(from, to);
              return (
                <div key={`l${key}`} className="pointer-events-none absolute z-10 max-w-56 -translate-x-1/2 -translate-y-1/2 rounded-md bg-ink-2 px-1.5 py-0.5 text-center font-talk text-xs leading-tight text-paper shadow-lift"
                  style={{ left: p.mx, top: p.my }}>{label}</div>
              );
            })}

            {stubs.map(st => {
              const p = stubPath(st);
              const on = focus === st.card.event.id || hoverLink === st.key;
              if (st.card.dim && !on) return null;
              return (
                <div key={`sl${st.key}`} title={`${st.out ? "Leads to" : "Comes from"} an event in "${st.chapter}" that isn't shown. Click the arrow to go there.`}
                  className={cn("pointer-events-none absolute z-10 max-w-40 -translate-y-1/2 truncate rounded-md px-1 font-talk text-xs leading-tight",
                    st.later ? "" : "-translate-x-full", on ? "bg-ink-2 text-paper" : "text-taupe")}
                  style={{ left: p.far + (st.later ? 2 : -2), top: p.y }}>
                  {st.chapter}{on && st.label && <span className="text-taupe"> · {st.label}</span>}
                </div>
              );
            })}

            {/* cards */}
            {lay.cards.map((c, ci) => {
              const { event, box } = c;
              const color = colorOf(c);
              const on = selected === event.id;
              const lifted = moving?.id === event.id;
              const problem = flagged.get(event.id);
              const primary = lay.primary.get(event.id) === c;
              const arrive = primary ? arriveAt.get(event.id) : undefined;
              // what the lane doesn't already say
              const others = filter.groupBy === "chars" ? event.chars.filter(x => x !== c.lane.id) : event.chars;
              const dots = filter.groupBy === "threads" ? event.threads.filter(x => x !== c.lane.id) : event.threads;
              // squashed cards (crowded lane) drop the chips first, then title lines
              const chips = (others.length > 0 || dots.length > 0) && box.h >= 44;
              const lines = Math.max(1, Math.floor((box.h - 6 - (chips ? 14 : 0)) / 15));
              return (
                <div key={copyKeys[ci]} data-event={event.id} data-primary={primary || undefined}
                  onPointerDown={e => {
                    const r = trackPos(e);
                    begin({ kind: "move", id: event.id, lane: lay.lanes.find(l => l.key === c.lane.key)!, startX: e.clientX, startY: e.clientY, offX: r.x - box.x, offY: r.y - box.y, w: box.w, h: box.h, started: false }, e);
                  }}
                  onPointerMove={onMove} onPointerUp={onUp}
                  onPointerEnter={() => setHover(event.id)} onPointerLeave={() => setHover(h => (h === event.id ? null : h))}
                  title={[event.title || "(untitled)", event.note].filter(Boolean).join("\n\n")}
                  className={cn("board-move board-enter group/card absolute cursor-grab overflow-hidden rounded-md border-[1.5px] text-left active:cursor-grabbing",
                    "border-[color-mix(in_srgb,var(--c)_50%,transparent)]",
                    on ? "z-10 bg-[color-mix(in_srgb,var(--c)_34%,var(--color-ink-2))] shadow-lift ring-2 ring-paper"
                      : cn("bg-[color-mix(in_srgb,var(--c)_20%,var(--color-ink-2))] hover:z-10 hover:border-[color-mix(in_srgb,var(--c)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--c)_27%,var(--color-ink-2))]",
                        focus === event.id && "z-10 ring-1 ring-paper/60"),
                    c.dim && !on && "opacity-25", lifted && "opacity-30", arrive !== undefined && "link-arrive")}
                  style={{
                    left: box.x, top: box.y, width: box.w, height: box.h,
                    "--c": color, "--d": `${arrive ?? 0}ms`,
                  } as React.CSSProperties}>
                  <p className={cn("overflow-hidden px-1.5 font-talk text-xs leading-[15px] text-paper", box.h < 30 ? "pt-0.5" : "pt-1", event.note && "pr-5")}
                    style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines }}>
                    {event.title || <span className="italic text-taupe">untitled</span>}
                  </p>
                  {chips && (
                    <div className="absolute inset-x-1.5 bottom-1 flex items-center gap-1 overflow-hidden whitespace-nowrap">
                      {dots.map(t => <span key={t} className="h-1.5 w-3 shrink-0 rounded-full" style={{ background: threadColor.get(t) }} />)}
                      {others.map(x => <span key={x} className="font-sans text-xs leading-none" style={{ color: charColor.get(x) }}>{nameOf.get(x) ?? x}</span>)}
                    </div>
                  )}
                  {event.note && <StickyNote className={cn("absolute right-1 h-3 w-3 text-taupe", box.h < 30 ? "top-0.5" : "top-1")} />}
                  {problem && <span className={cn("absolute bottom-1 right-1 h-2 w-2 rotate-45", problem === "error" ? "bg-coral" : "bg-butter")} title="See Checks" />}
                  <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
                    onPointerDown={e => begin({ kind: "resize", id: event.id, chapter: c.chapter.id, col: event.col }, e)}
                    onPointerMove={onMove} onPointerUp={onUp} />
                  <div title="Drag onto another event to draw an arrow"
                    className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-paper bg-ink opacity-0 transition-opacity group-hover/card:opacity-100"
                    onPointerDown={e => begin({ kind: "connect", id: event.id }, e)}
                    onPointerMove={onMove} onPointerUp={onUp} />
                </div>
              );
            })}

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

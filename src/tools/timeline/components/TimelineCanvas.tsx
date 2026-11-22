import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Cake, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { dateOf, formatDuration, formatSpan, PRECISIONS } from "../lib/duration";
import { addConnection, findEvent, newEvent, shiftWhen } from "../lib/edit";
import { visible } from "../lib/colors";
import { layout, laneChars, ARC_ROW_H, type Layout, type PlacedEvent } from "../lib/layout";
import { buildScale, type Scale } from "../lib/scale";
import { ticks as makeTicks } from "../lib/ticks";
import { DEFAULT_LENGTH, type When } from "../lib/types";
import { useTimeline } from "../state";
import { statusColor } from "./scenes";

export const LABEL_W = 132;
const AXIS_H = 34;

type Drag =
  | { kind: "event"; id: string; lane: string; startX: number; startY: number; base: When; started: boolean; span: { start: number; end: number } }
  | { kind: "resize"; id: string; startX: number; started: boolean; span: { start: number; end: number } }
  | { kind: "arc"; id: string; startX: number; base: When; started: boolean; spanStart: number }
  | { kind: "connect"; id: string; x: number; y: number };

/** Exposed so the page can scroll to things (an arc picked in the sidebar). */
export type CanvasApi = { scrollToHours: (h: number) => void };

export function TimelineCanvas({ apiRef, flagged }: { apiRef: React.RefObject<CanvasApi | null>; flagged: Map<string, "error" | "warning" | "info"> }) {
  const s = useTimeline();
  const { doc, res, pxPerHour, hidden, collapsed, selection } = s;
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [hoverLink, setHoverLink] = useState<string | null>(null);
  /** The scale stays as it was while dragging, so cards don't jump under the pointer as the covered time changes. */
  const frozen = useRef<Scale | null>(null);

  const chars = useMemo(() => laneChars(doc.roster, doc.arcs), [doc.roster, doc.arcs]);
  // only events stretch the scale (an arc spanning years shouldn't make those years wide); empty arcs get a marker
  const liveScale = useMemo(() => buildScale([
    ...res.events.values(),
    ...doc.arcs.filter(a => !a.events.length).flatMap(a => { const sp = res.arcs.get(a.id); return sp ? [{ start: sp.start, end: sp.start + 12 }] : []; }),
  ], pxPerHour), [res, doc.arcs, pxPerHour]);
  const scale = drag && drag.kind !== "connect" && frozen.current ? frozen.current : liveScale;
  const lay: Layout = useMemo(() => layout(doc.arcs, chars, res, scale, hidden, collapsed), [doc.arcs, chars, res, scale, hidden, collapsed]);
  const axis = useMemo(() => makeTicks(scale, res), [scale, res]);
  const headerH = lay.arcBandH + AXIS_H;
  const colorOf = useMemo(() => new Map(chars.map(c => [c.id, visible(c.color)])), [chars]);
  const scenes = useTimeline(st => st.scenes);

  // birthdays, drawn only where the timeline knows days
  const birthdays = useMemo(() => {
    const out: { char: string; x: number; label: string }[] = [];
    const spans = [...res.events.values()];
    const daySegs = scale.segments.filter(sg => sg.dense && spans.some(sp => sp.start < sg.h1 && sp.end > sg.h0 && PRECISIONS.indexOf(sp.precision) >= 2));
    if (!daySegs.length) return out;
    const y0 = dateOf(daySegs[0].h0).getUTCFullYear(), y1 = dateOf(daySegs[daySegs.length - 1].h1).getUTCFullYear();
    for (const c of chars) {
      const m = c.birthday?.match(/^(?:(\d{4})-)?(\d{2})-(\d{2})$/);
      if (!m) continue;
      for (let y = y0; y <= y1; y++) {
        const h = (Date.UTC(y, +m[2] - 1, +m[3]) - Date.UTC(2000, 0, 1)) / 3.6e6;
        if (!daySegs.some(sg => h >= sg.h0 && h <= sg.h1)) continue;
        out.push({ char: c.id, x: scale.x(h), label: m[1] ? `${c.name} turns ${y - +m[1]}` : `${c.name}'s birthday` });
      }
    }
    return out;
  }, [chars, res, scale]);

  // the selected fact: who learns it, who acts on it
  const fact = selection?.kind === "fact" ? selection.id : null;
  const factRole = (e: { learns?: { fact: string }[]; needs?: string[] }) =>
    !fact ? null : e.learns?.some(l => l.fact === fact) ? "learns" : e.needs?.includes(fact) ? "needs" : "none";
  const sceneStatus = useMemo(() => new Map(scenes.map(sc => [sc.path, sc.status])), [scenes]);

  // ---------------------------------------------------------------- zoom (ctrl + wheel), keeping the time under the pointer
  const anchor = useRef<{ hours: number; px: number } | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const px = e.clientX - el.getBoundingClientRect().left - LABEL_W;
      const st = useTimeline.getState();
      anchor.current = { hours: liveScaleRef.current.hours(el.scrollLeft + px), px };
      st.setZoom(st.pxPerHour * Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const liveScaleRef = useRef(liveScale);
  liveScaleRef.current = liveScale;
  useLayoutEffect(() => {
    const a = anchor.current, el = scroller.current;
    if (!a || !el) return;
    anchor.current = null;
    el.scrollLeft = liveScale.x(a.hours) - a.px;
  }, [liveScale]);

  useEffect(() => {
    apiRef.current = {
      scrollToHours: h => scroller.current?.scrollTo({ left: Math.max(0, liveScaleRef.current.x(h) - 40), behavior: "smooth" }),
    };
  }, [apiRef]);

  // ---------------------------------------------------------------- pointer handling

  const trackPos = (e: { clientX: number; clientY: number }) => {
    const r = track.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const laneAt = (y: number) => lay.lanes.find(l => y >= l.y && y < l.y + l.h)?.char.id ?? null;

  const begin = (d: Drag, e: RPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = d;
    setDrag(d);
  };

  const onMove = (e: RPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const st = useTimeline.getState();
    if (d.kind === "connect") { setPointer(trackPos(e)); return; }
    const dx = e.clientX - d.startX;
    if (!d.started) {
      if (Math.abs(dx) < 4 && (d.kind !== "event" || Math.abs(e.clientY - d.startY) < 4)) return;
      d.started = true;
      frozen.current = liveScale;
      st.startGesture();
    }
    const sc = frozen.current ?? liveScale;
    if (d.kind === "event") {
      const delta = sc.hours(sc.x(d.span.start) + dx) - d.span.start;
      const lane = laneAt(trackPos(e).y);
      st.gesture(doc => {
        const f = findEvent(doc.arcs, d.id);
        if (!f) return;
        f.event.when = shiftWhen(d.base, delta);
        // dropped on another character's lane: the event changes hands
        if (lane && lane !== d.lane && !f.event.chars.includes(lane)) f.event.chars = f.event.chars.map(c => (c === d.lane ? lane : c));
      });
    } else if (d.kind === "resize") {
      const end = sc.hours(sc.x(d.span.end) + dx);
      st.gesture(doc => {
        const f = findEvent(doc.arcs, d.id);
        if (f) f.event.length = formatDuration(Math.max(0.5, Math.round((end - d.span.start) * 2) / 2));
      });
    } else if (d.kind === "arc") {
      const delta = sc.hours(sc.x(d.spanStart) + dx) - d.spanStart;
      st.gesture(doc => {
        const a = doc.arcs.find(x => x.id === d.id);
        if (a) a.start = shiftWhen(d.base, delta);
      });
    }
  };


  const onUp = (e: RPointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    setPointer(null);
    const st = useTimeline.getState();
    if (!d) return;
    if (d.kind === "connect") {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-event]");
      const to = el?.dataset.event;
      if (to && to !== d.id) {
        let made: string | null = null;
        st.edit(doc => { made = addConnection(doc.arcs, d.id, to)?.id ?? null; });
        if (made) st.select({ kind: "connection", id: made });
      }
      return;
    }
    if (d.started) { st.endGesture(); frozen.current = null; return; }
    st.select(d.kind === "arc" ? { kind: "arc", id: d.id } : { kind: "event", id: d.id });
  };

  const onTrackDouble = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-event]")) return;
    const p = trackPos(e);
    const lane = laneAt(p.y);
    if (!lane) return;
    const st = useTimeline.getState();
    let made: string | null = null;
    st.edit((doc, r) => { made = newEvent(doc.arcs, r, lane, liveScale.hours(p.x))?.id ?? null; });
    if (made) st.select({ kind: "event", id: made });
  };

  // ---------------------------------------------------------------- connections

  const selectedEvent = selection?.kind === "event" ? selection.id : null;
  const links = useMemo(() => doc.arcs.flatMap(a => a.connections.flatMap(c => {
    const f = lay.primary.get(c.from), t = lay.primary.get(c.to);
    return f && t ? [{ c, f, t }] : [];
  })), [doc.arcs, lay]);

  const linkPath = (f: PlacedEvent, t: PlacedEvent) => {
    const x1 = f.box.x + f.box.w, y1 = f.box.y + f.box.h / 2;
    const x2 = t.box.x, y2 = t.box.y + t.box.h / 2;
    const dx = Math.max(36, Math.abs(x2 - x1) / 2);
    return { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
  };

  return (
    <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto overscroll-contain">
      <div className="relative" style={{ width: LABEL_W + scale.width, minHeight: "100%" }}>
        {/* header: arc band + date axis */}
        <div className="sticky top-0 z-20 flex border-b border-ink-line/70 bg-ink" style={{ height: headerH }}>
          <div className="sticky left-0 z-30 shrink-0 bg-ink" style={{ width: LABEL_W }} />
          <div className="relative shrink-0" style={{ width: scale.width }}>
            {lay.arcs.map(({ arc, span, box }) => {
              const on = selection?.kind === "arc" && selection.id === arc.id;
              return (
                <div key={arc.id} data-arc={arc.id}
                  onPointerDown={e => begin({ kind: "arc", id: arc.id, startX: e.clientX, base: arc.start, started: false, spanStart: span.start }, e)}
                  onPointerMove={onMove} onPointerUp={onUp}
                  title={`${arc.name}: ${formatSpan(span.start, span.end, span.precision)}`}
                  className={cn("absolute flex cursor-grab items-center overflow-clip rounded-sm border-l-[3px] px-1.5 font-sans text-[13px] leading-none whitespace-nowrap active:cursor-grabbing",
                    on ? "bg-paper text-ink" : "bg-ink-3 text-bone hover:bg-ink-line hover:text-paper",
                    !span.pinned && "border-dashed")}
                  style={{ left: box.x, top: 4 + box.y, width: Math.max(box.w, 4), height: ARC_ROW_H - 6, borderLeftColor: arc.color ?? "var(--color-caramel)" }}>
                  <span className="sticky pt-px" style={{ left: LABEL_W + 6 }}>{arc.name}</span>
                </div>
              );
            })}
            <div className="absolute inset-x-0 bottom-0" style={{ height: AXIS_H }}>
              {axis.gaps.map((g, i) => (
                <div key={i} className="absolute bottom-0 top-0 flex items-start justify-center pt-0.5 font-talk text-[10px] text-taupe"
                  style={{ left: g.x0, width: g.x1 - g.x0, background: "repeating-linear-gradient(135deg, transparent 0 5px, rgba(138,125,114,.18) 5px 7px)" }}>
                  {g.label}
                </div>
              ))}
              {axis.ticks.map((t, i) => (
                <div key={i} className="absolute bottom-0 h-full" style={{ left: t.x }}>
                  <div className={cn("absolute bottom-0 w-px", t.major ? "h-3 bg-bone/60" : "h-2 bg-taupe/50")} />
                  {t.label && <span className={cn("absolute bottom-3.5 left-1 whitespace-nowrap font-talk text-[11px]", t.major ? "text-bone" : "text-taupe")}>{t.label}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* lanes */}
        <div className="flex">
          <div className="sticky left-0 z-10 shrink-0 border-r border-ink-line/60 bg-ink" style={{ width: LABEL_W, height: lay.height }}>
            {lay.lanes.map(l => {
              const on = selection?.kind === "char" && selection.id === l.char.id;
              return (
                <div key={l.char.id} className="group/lane absolute inset-x-0 flex items-start gap-1 border-b border-ink-line/40 pl-2 pr-1 pt-2" style={{ top: l.y, height: l.h }}>
                  <button onClick={() => s.toggleCollapsed(l.char.id)} aria-label={l.collapsed ? "Expand lane" : "Collapse lane"}
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-sm text-taupe hover:text-paper">
                    {l.collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => s.select({ kind: "char", id: l.char.id })}
                    className={cn("min-w-0 truncate border-b-2 text-left font-sans text-[15px] leading-6", on ? "text-paper" : "text-bone hover:text-paper")}
                    style={{ borderColor: colorOf.get(l.char.id) }}>{l.char.name}</button>
                </div>
              );
            })}
          </div>

          <div ref={track} className="relative shrink-0" style={{ width: scale.width, height: lay.height }} onDoubleClick={onTrackDouble}
            onPointerMove={drag?.kind === "connect" ? onMove : undefined}>
            {/* collapsed stretches and weekends */}
            {axis.gaps.map((g, i) => (
              <div key={`g${i}`} className="pointer-events-none absolute inset-y-0" style={{ left: g.x0, width: g.x1 - g.x0, background: "repeating-linear-gradient(135deg, transparent 0 5px, rgba(138,125,114,.08) 5px 7px)" }} />
            ))}
            {axis.ticks.filter(t => t.weekend).map((t, i) => (
              <div key={`w${i}`} className="pointer-events-none absolute inset-y-0 bg-paper/[.025]" style={{ left: t.weekend!.x0, width: t.weekend!.x1 - t.weekend!.x0 }} />
            ))}
            {lay.lanes.map(l => <div key={l.char.id} className="pointer-events-none absolute inset-x-0 border-b border-ink-line/40" style={{ top: l.y, height: l.h }} />)}
            {birthdays.map((b, i) => {
              const l = lay.lanes.find(x => x.char.id === b.char);
              if (!l) return null;
              return (
                <div key={`b${i}`} title={b.label} className="absolute z-[5] w-px" style={{ left: b.x, top: l.y, height: l.h, background: colorOf.get(b.char) }}>
                  <Cake className="absolute -left-[7px] top-0.5 h-3.5 w-3.5 rounded-sm bg-ink" style={{ color: colorOf.get(b.char) }} />
                </div>
              );
            })}

            {/* links */}
            <svg className="pointer-events-none absolute inset-0 overflow-visible" width={scale.width} height={lay.height}>
              {links.map(({ c, f, t }) => {
                const p = linkPath(f, t);
                const on = (selection?.kind === "connection" && selection.id === c.id) || selectedEvent === c.from || selectedEvent === c.to || hoverLink === c.id;
                const color = colorOf.get(f.event.chars[0]) ?? "#d9d0c7";
                return (
                  <g key={c.id} opacity={on ? 1 : 0.55}>
                    <path d={p.d} fill="none" stroke={color} strokeWidth={on ? 2.5 : 1.5} />
                    <path d={`M${p.x2},${p.y2} l-7,-4 v8 z`} fill={color} />
                    <path d={p.d} fill="none" stroke="transparent" strokeWidth={12} className="pointer-events-auto cursor-pointer"
                      onPointerEnter={() => setHoverLink(c.id)} onPointerLeave={() => setHoverLink(null)}
                      onClick={() => s.select({ kind: "connection", id: c.id })} />
                  </g>
                );
              })}
              {drag?.kind === "connect" && pointer && (() => {
                const f = lay.primary.get(drag.id);
                if (!f) return null;
                return <path d={`M${f.box.x + f.box.w},${f.box.y + f.box.h / 2} L${pointer.x},${pointer.y}`} stroke="var(--color-paper)" strokeDasharray="4 4" strokeWidth={1.5} fill="none" />;
              })()}
            </svg>
            {links.map(({ c, f, t }) => {
              const on = (selection?.kind === "connection" && selection.id === c.id) || selectedEvent === c.from || selectedEvent === c.to || hoverLink === c.id;
              if (!on || !c.label) return null;
              const p = linkPath(f, t);
              return (
                <div key={`l${c.id}`} className="pointer-events-none absolute z-10 max-w-56 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-ink-2 px-1.5 py-0.5 text-center font-talk text-[11px] leading-tight text-paper shadow"
                  style={{ left: p.mx, top: p.my }}>{c.label}</div>
              );
            })}

            {/* events */}
            {lay.events.map(p => {
              const { event, span, box } = p;
              const color = colorOf.get(p.lane) ?? "#d9d0c7";
              const on = selectedEvent === event.id;
              const lane = lay.lanes.find(l => l.char.id === p.lane);
              const vague = span.precision === "year" || span.precision === "month" || !span.pinned;
              const role = factRole(event);
              const problem = flagged.get(event.id);
              return (
                <div key={`${p.lane}:${event.id}`} data-event={event.id}
                  onPointerDown={e => begin({ kind: "event", id: event.id, lane: p.lane, startX: e.clientX, startY: e.clientY, base: event.when, started: false, span }, e)}
                  onPointerMove={onMove} onPointerUp={onUp}
                  title={`${event.text || "(no text)"}\n${formatSpan(span.start, span.end, span.precision)} · ${event.length ?? DEFAULT_LENGTH}`}
                  className={cn("group/card absolute cursor-grab overflow-hidden rounded-md border text-left active:cursor-grabbing",
                    vague ? "border-dashed" : "border-solid",
                    on ? "z-10 ring-2 ring-paper" : "hover:z-10",
                    role === "learns" && "ring-2 ring-[#6fcf8e]", role === "needs" && "ring-2 ring-butter", role === "none" && "opacity-35")}
                  style={{
                    left: box.x, top: box.y, width: box.w, height: box.h,
                    background: `color-mix(in srgb, ${color} ${on ? 34 : 22}%, var(--color-ink-2))`,
                    borderColor: `color-mix(in srgb, ${color} 70%, transparent)`,
                    borderLeft: `3px solid ${color}`,
                  }}>
                  {!lane?.collapsed && (
                    <p className="line-clamp-3 px-1.5 py-1 font-talk text-[11.5px] leading-[14px] text-paper">
                      {event.text || <span className="text-taupe italic">empty</span>}
                    </p>
                  )}
                  {problem && (
                    <span className={cn("absolute bottom-1 right-1 h-2 w-2 rotate-45", problem === "error" ? "bg-coral" : "bg-butter")}
                      title={problem === "error" ? "Has an error (see Checks)" : "Has a warning (see Checks)"} />
                  )}
                  {event.scene && !lane?.collapsed && (
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full ring-1 ring-ink" title={`Scene: ${event.scene.split("/").pop()} (${sceneStatus.get(event.scene) ?? "no status"})`}
                      style={{ background: statusColor(sceneStatus.get(event.scene)) }} />
                  )}
                  {/* resize on the right edge, connect from the dot */}
                  <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
                    onPointerDown={e => begin({ kind: "resize", id: event.id, startX: e.clientX, started: false, span }, e)}
                    onPointerMove={onMove} onPointerUp={onUp} />
                  {!lane?.collapsed && (
                    <div title="Drag to another event to connect them"
                      className="absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-paper bg-ink opacity-0 transition-opacity group-hover/card:opacity-100"
                      onPointerDown={e => { const r = trackPos(e); setPointer(r); begin({ kind: "connect", id: event.id, x: r.x, y: r.y }, e); }}
                      onPointerMove={onMove} onPointerUp={onUp} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

import { cn } from "@/shared/lib/utils";
import { arrowPath, siblingLines, stubPath, type Arrow, type Stub } from "../lib/arrows";
import type { Card, Layout } from "../lib/layout";
import { reveal } from "../lib/nav";

type Props = {
  lay: Layout;
  arrows: Arrow[];
  stubs: Stub[];
  /** the selected event, or the hovered one */
  focus: string | null;
  selected: string | null;
  hoverLink: string | null;
  setHoverLink: (key: string | null) => void;
  /** when each of the selected event's arrows draws (ms) */
  drawAt: Map<string, number>;
  colorOf: (c: Card) => string;
  onSelect: (eventId: string) => void;
  /** an arrow being drawn from a card's dot to the pointer */
  connecting: { from: string; to: { x: number; y: number } } | null;
};

/** The arrows between events (and stubs for those with one end off the board), with their labels while in focus. */
export function BoardArrows({ lay, arrows, stubs, focus, selected, hoverLink, setHoverLink, drawAt, colorOf, onSelect, connecting }: Props) {
  const hot = (key: string, ...ids: string[]) => hoverLink === key || ids.includes(focus ?? "");
  const hoverable = (key: string) => ({ onPointerEnter: () => setHoverLink(key), onPointerLeave: () => setHoverLink(null) });
  const start = connecting && lay.primary.get(connecting.from);
  // where the arrows run: when that changes (the board moved) they're drawn again, after the cards got there
  const runs = arrows.map(a => arrowPath(a.from, a.to).d).join() + stubs.map(st => stubPath(st).d).join();
  return (
    <div key={runs} className="board-arrows pointer-events-none absolute inset-0">
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width={lay.width} height={lay.height}>
        {siblingLines(lay, focus).map((s, i) => <line key={i} x1={s.x} x2={s.x} y1={s.y0} y2={s.y1} stroke="var(--color-paper)" strokeOpacity={0.5} strokeWidth={2} strokeDasharray="2 4" />)}
        {arrows.map(({ key, from, to }) => {
          const p = arrowPath(from, to);
          const on = hot(key, from.event.id, to.event.id);
          const color = colorOf(from);
          const draw = drawAt.get(key);
          const delay = { "--d": `${draw ?? 0}ms` } as React.CSSProperties;
          return (
            // keyed by the selection too, so picking another event replays the drawing
            <g key={draw === undefined ? key : `${key}@${selected}`} opacity={on ? 1 : from.dim && to.dim ? 0.12 : 0.5} className="transition-opacity duration-150">
              <path d={p.d} fill="none" stroke={color} strokeWidth={on ? 2.5 : 1.5}
                pathLength={draw === undefined ? undefined : 1} className={draw === undefined ? undefined : "link-draw"} style={delay} />
              <path d={p.head} fill={color} className={draw === undefined ? undefined : "link-head"} style={delay} />
              <path d={p.d} fill="none" stroke="transparent" strokeWidth={12} className="pointer-events-auto cursor-pointer"
                {...hoverable(key)} onClick={() => onSelect(from.event.id)} />
            </g>
          );
        })}
        {stubs.map(st => {
          const p = stubPath(st);
          const on = hot(st.key, st.card.event.id);
          const color = colorOf(st.card);
          return (
            <g key={`s${st.key}`} opacity={on ? 1 : st.card.dim ? 0.12 : 0.5}>
              <path d={p.d} fill="none" stroke={color} strokeWidth={on ? 2.5 : 1.5} strokeDasharray="3 3" />
              <path d={p.head} fill={color} />
              <path d={p.d} fill="none" stroke="transparent" strokeWidth={12} className="pointer-events-auto cursor-pointer"
                {...hoverable(st.key)} onClick={() => reveal(st.other)} />
            </g>
          );
        })}
        {start && connecting && (
          <path d={`M${start.box.x + start.box.w},${start.box.y + start.box.h / 2} L${connecting.to.x},${connecting.to.y}`}
            stroke="var(--color-paper)" strokeDasharray="4 4" strokeWidth={1.5} fill="none" />
        )}
      </svg>

      {arrows.map(({ key, from, to, label }) => {
        if (!label || !hot(key, from.event.id, to.event.id)) return null;
        const p = arrowPath(from, to);
        return (
          <div key={`l${key}`} className="pointer-events-none absolute z-10 max-w-56 -translate-x-1/2 -translate-y-1/2 rounded-md bg-ink-2 px-1.5 py-0.5 text-center font-talk text-xs leading-tight text-paper shadow-lift"
            style={{ left: p.mx, top: p.my }}>{label}</div>
        );
      })}

      {stubs.map(st => {
        const p = stubPath(st);
        const on = hot(st.key, st.card.event.id);
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
    </div>
  );
}

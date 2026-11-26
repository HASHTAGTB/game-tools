import { StickyNote } from "lucide-react";
import type { PointerEvent as RPointerEvent } from "react";
import { cn } from "@/shared/lib/utils";
import type { Card } from "../lib/layout";
import type { GroupBy } from "../lib/types";

type Props = {
  card: Card;
  color: string;
  groupBy: GroupBy;
  /** the main copy of an event on several lanes (arrows start and end there) */
  primary: boolean;
  selected: boolean;
  /** selected or hovered */
  focused: boolean;
  /** being dragged (the lifted copy follows the pointer) */
  lifted: boolean;
  problem: "error" | "warning" | "info" | undefined;
  /** when its pulse plays (ms), as the other end of a selected event's arrow */
  arrive: number | undefined;
  /** the lanes' colours (made visible on ink) and the characters' names */
  threadColor: Map<string, string>;
  charColor: Map<string, string>;
  charName: Map<string, string>;
  /** pointer down on the card (move), its right edge (resize) or its dot (draw an arrow) */
  onDown: (part: "move" | "resize" | "connect", e: RPointerEvent) => void;
  onMove: (e: RPointerEvent) => void;
  onUp: (e: RPointerEvent) => void;
  onHover: (on: boolean) => void;
};

/** An event on its lane: its title, the characters and threads the lane doesn't already say, a note mark, and a
 *  problem mark. Drag it to move it, its right edge to span more columns, its dot to draw an arrow. */
export function BoardCard({ card: c, color, groupBy, primary, selected, focused, lifted, problem, arrive, threadColor, charColor, charName, onDown, onMove, onUp, onHover }: Props) {
  const { event, box } = c;
  // what the lane doesn't already say
  const others = groupBy === "chars" ? event.chars.filter(x => x !== c.lane.id) : event.chars;
  const dots = groupBy === "threads" ? event.threads.filter(x => x !== c.lane.id) : event.threads;
  // squashed cards (crowded lane) drop the chips first, then title lines
  const chips = (others.length > 0 || dots.length > 0) && box.h >= 44;
  const lines = Math.max(1, Math.floor((box.h - 6 - (chips ? 14 : 0)) / 15));
  const part = (p: "resize" | "connect") => ({ onPointerDown: (e: RPointerEvent) => onDown(p, e), onPointerMove: onMove, onPointerUp: onUp });
  return (
    <div data-event={event.id} data-primary={primary || undefined}
      onPointerDown={e => onDown("move", e)} onPointerMove={onMove} onPointerUp={onUp}
      onPointerEnter={() => onHover(true)} onPointerLeave={() => onHover(false)}
      title={[event.title || "(untitled)", event.note].filter(Boolean).join("\n\n")}
      className={cn("board-move board-enter group/card absolute cursor-grab overflow-hidden rounded-md border-[1.5px] text-left active:cursor-grabbing",
        "border-[color-mix(in_srgb,var(--c)_50%,transparent)]",
        selected ? "z-10 bg-[color-mix(in_srgb,var(--c)_34%,var(--color-ink-2))] shadow-lift ring-2 ring-paper"
          : cn("bg-[color-mix(in_srgb,var(--c)_20%,var(--color-ink-2))] hover:z-10 hover:border-[color-mix(in_srgb,var(--c)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--c)_27%,var(--color-ink-2))]",
            focused && "z-10 ring-1 ring-paper/60"),
        c.dim && !selected && "opacity-25", lifted && "opacity-30", arrive !== undefined && "link-arrive")}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, "--c": color, "--d": `${arrive ?? 0}ms` } as React.CSSProperties}>
      <p className={cn("overflow-hidden px-1.5 font-talk text-xs leading-[15px] text-paper", box.h < 30 ? "pt-0.5" : "pt-1", event.note && "pr-5")}
        style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines }}>
        {event.title || <span className="italic text-taupe">untitled</span>}
      </p>
      {chips && (
        <div className="absolute inset-x-1.5 bottom-1 flex items-center gap-1 overflow-hidden whitespace-nowrap">
          {dots.map(t => <span key={t} className="h-1.5 w-3 shrink-0 rounded-full" style={{ background: threadColor.get(t) }} />)}
          {others.map(x => <span key={x} className="font-sans text-xs leading-none" style={{ color: charColor.get(x) }}>{charName.get(x) ?? x}</span>)}
        </div>
      )}
      {event.note && <StickyNote className={cn("absolute right-1 h-3 w-3 text-taupe", box.h < 30 ? "top-0.5" : "top-1")} />}
      {problem && <span className={cn("absolute bottom-1 right-1 h-2 w-2 rotate-45", problem === "error" ? "bg-coral" : "bg-butter")} title="See Checks" />}
      <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" {...part("resize")} />
      <div title="Drag onto another event to draw an arrow"
        className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-paper bg-ink opacity-0 transition-opacity group-hover/card:opacity-100"
        {...part("connect")} />
    </div>
  );
}

import { X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/** A pill for a character, a thread or a list: a ring in its colour, filled while `pressed`. With `onClick` it's a
 *  toggle; with `onRemove` it gets a small × (a filter that can be dropped). `color` must already read well on ink. */
export function Chip({ color, pressed, onClick, onRemove, removeLabel, dot, className, children }: {
  color: string; pressed?: boolean; onClick?: () => void; onRemove?: () => void; removeLabel?: string;
  /** a colour dot before the name, for chips that aren't toggles */
  dot?: boolean; className?: string; children: ReactNode;
}) {
  const style = {
    borderColor: pressed || !onClick ? color : `color-mix(in srgb, ${color} 45%, transparent)`,
    background: pressed ? color : "transparent",
  } as CSSProperties;
  const cls = cn("inline-flex max-w-full items-center gap-1.5 rounded-full border-2 py-px font-sans text-sm transition-colors",
    onRemove ? "pl-2.5 pr-0.5" : "px-2.5", pressed ? "text-ink" : onClick ? "text-bone hover:text-paper" : "text-paper", className);
  const body = <>
    {dot && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
    <span className="truncate">{children}</span>
  </>;
  if (onClick) return <button type="button" aria-pressed={pressed} onClick={onClick} className={cls} style={style}>{body}</button>;
  return (
    <span className={cls} style={style}>
      {body}
      {onRemove && (
        <button type="button" aria-label={removeLabel} onClick={onRemove}
          className="grid h-4 w-4 place-items-center rounded-full text-taupe hover:text-paper"><X className="h-3 w-3" /></button>
      )}
    </span>
  );
}

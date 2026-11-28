import { useId, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { m, spring } from "./motion";

export type SegOption<T extends string> = {
  value: T;
  label?: ReactNode;
  /** dashed: the game has no file for this (still pickable) */
  missing?: boolean;
  /** greyed out and not pickable */
  disabled?: boolean;
  title?: string;
};

/** One of several, side by side in one frame (a version's time, a fade, an outfit, a transition): the picked one sits
 *  on a thumb that slides to the next pick, like the chat box's Live/Earlier (only then: when the row itself moves, the
 *  thumb moves with it). Wraps when there are many.
 *  `onHover`: the option under the pointer or focus (null when it leaves), for a preview. `children` go after the
 *  options, inside the frame (a "+" to add one). */
export function Segmented<T extends string>({ value, options, onChange, onHover, label, className, children }: {
  value: T; options: SegOption<T>[]; onChange: (v: T) => void; onHover?: (v: T | null) => void;
  label?: string; className?: string; children?: ReactNode;
}) {
  const thumb = useId();
  return (
    <div role="radiogroup" aria-label={label} onPointerLeave={onHover && (() => onHover(null))}
      className={cn("inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg border border-ink-line bg-ink p-1", className)}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} disabled={o.disabled}
            title={o.title ?? (o.missing ? "The game has no file for this yet" : undefined)}
            onClick={() => !on && onChange(o.value)}
            onPointerEnter={onHover && (() => onHover(o.value))} onFocus={onHover && (() => onHover(o.value))} onBlur={onHover && (() => onHover(null))}
            className={cn("relative isolate inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 font-talk text-sm transition-colors focus-visible:outline-2 focus-visible:outline-periwinkle",
              on ? "text-paper" : "text-bone hover:bg-ink-2 hover:text-paper",
              o.missing && "outline-1 -outline-offset-2 outline-dashed outline-taupe/60",
              o.disabled && "pointer-events-none opacity-35")}>
            {on && <m.span layoutId={thumb} layoutDependency={value} aria-hidden transition={spring.bouncy}
              className="absolute inset-0 -z-10 rounded-md bg-[color-mix(in_srgb,var(--color-caramel)_24%,var(--color-ink-3))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-caramel)_55%,transparent)]" />}
            {o.label ?? o.value}
          </button>
        );
      })}
      {children}
    </div>
  );
}

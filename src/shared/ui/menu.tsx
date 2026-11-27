import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { m, spring } from "./motion";
import { MotionFollow, MotionItem } from "./motion-list";

/* Lists laid out like the game's main menu: items beside a thin vertical rule, and a short bar on the rule marks the
   selected one. Every sidebar list and every result list in a popup uses this, so "selected" looks the same everywhere. */

/** The thin rule. Put the items (MenuItem, or rows with a MenuMarker) inside. */
export function MenuRule({ className, children, ...p }: React.ComponentProps<"ul">) {
  return <ul className={cn("relative border-l-2 border-bone/40", className)} {...p}>{children}</ul>;
}

/** The bar on the rule. Give it a `layoutId` to make it slide from item to item (only one item is selected at a time).
 *  `idle` shows it small and faint, for items that carry a color but aren't selected. */
export function MenuMarker({ color = "var(--color-caramel)", layoutId, idle, className, style }: {
  color?: string; layoutId?: string; idle?: boolean; className?: string; style?: CSSProperties;
}) {
  const cls = cn("pointer-events-none absolute inset-y-1.5 left-[-3px] w-1 rounded-full", className);
  if (layoutId) return (
    <m.span layoutId={layoutId} aria-hidden transition={spring.bouncy} className={cls} style={style}
      initial={false} animate={{ backgroundColor: color }} />
  );
  return <span aria-hidden className={cn(cls, "transition-[opacity,scale] duration-200 ease-out", idle && "scale-y-50 opacity-40")}
    style={{ background: color, ...style }} />;
}

type ItemProps = {
  label: ReactNode;
  /** Dimmed second line (a date, a path). */
  sub?: ReactNode;
  active: boolean;
  /** The marker's color. Default caramel. */
  color?: string;
  /** Show the marker small and faint while not active (items that carry a color). */
  showIdle?: boolean;
  /** Slide the marker between items of this list. */
  layoutId?: string;
  /** Another item is focused: dim this one more. */
  faded?: boolean;
  /** Open for editing elsewhere (the Inspector): a caramel underline, separate from `active`. */
  editing?: boolean;
  /** `aria-pressed` for toggles (filters), `aria-current` otherwise. */
  toggle?: boolean;
  size?: "lg" | "base";
  onClick: () => void;
  /** Icon buttons on the right; they show on hover. */
  actions?: ReactNode;
  title?: string;
  /** Passed on to the row, for a MotionList. */
  ref?: React.Ref<HTMLLIElement>;
};

/** A row of the menu. In a MotionList it drops in, crumples away and slides to its place like any list item. */
export function MenuItem({ label, sub, active, color, showIdle, layoutId, faded, editing, toggle, size = "lg", onClick, actions, title, ref }: ItemProps) {
  return (
    <MotionItem ref={ref} className="group/item relative flex items-center">
      {(active || showIdle) && <MenuMarker color={color} layoutId={active ? layoutId : undefined} idle={!active} />}
      <button onClick={onClick} title={title} aria-pressed={toggle ? active : undefined} aria-current={!toggle && active ? true : undefined}
        className={cn("block min-w-0 flex-1 py-1 pl-4 text-left font-sans decoration-2 underline-offset-[6px] transition-colors",
          size === "lg" ? "text-lg" : "text-base",
          active ? "text-paper" : faded ? "text-taupe/70 hover:text-paper" : "text-bone/75 hover:text-paper",
          editing && "underline decoration-caramel")}>
        <span className="block truncate">{label}</span>
        {sub && <span className="block truncate font-talk text-xs text-taupe">{sub}</span>}
      </button>
      {actions && (
        <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/item:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100">
          {actions}
        </span>
      )}
    </MotionItem>
  );
}

/** A titled group of menu items (a sidebar block). `actions` sit next to the title and are always visible. It slides
 *  along when a list above it grows or shrinks. */
export function MenuGroup({ title, hint, actions, children, className }: {
  title?: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <MotionFollow className={className}>
      {(title || actions) && (
        <div className="mb-1.5 flex min-h-7 items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-sans text-base text-taupe">{title}</span>
          {hint && <span className="font-talk text-xs text-taupe/80">{hint}</span>}
          {actions && <span className="-mr-1.5 flex">{actions}</span>}
        </div>
      )}
      {children}
    </MotionFollow>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Rule } from "./heading";

type Props = {
  /** Heading content: text, or an input for renamable sections. */
  title: ReactNode;
  /** Short dimmed note after the title. */
  note?: ReactNode;
  /** Color of the rule under the title. Ties the section to its highlight in the prompt. */
  color?: string;
  /** Icon buttons on the right. They fade in while the section is hovered or has focus. */
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
};

/** One block of the editor: title over a short colored rule, quiet actions on the right, content below. */
export function Section({ title, note, color, actions, className, children }: Props) {
  return (
    <section className={cn("group/section", className)}>
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <div className="min-w-0 font-sans text-xl leading-tight text-paper">{title}</div>
            {note && <span className="shrink-0 font-talk text-sm text-taupe">{note}</span>}
          </div>
          <Rule color={color} />
        </div>
        {actions && <HoverActions>{actions}</HoverActions>}
      </header>
      {children}
    </section>
  );
}

/** Row of actions that stays hidden until its section is hovered or focused (keyboard users still reach it).
    Plain CSS: it's a hover effect. */
export function HoverActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      "flex items-center gap-0.5 opacity-0 transition-opacity duration-150",
      "group-hover/section:opacity-100 group-focus-within/section:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100",
      className,
    )}>
      {children}
    </div>
  );
}

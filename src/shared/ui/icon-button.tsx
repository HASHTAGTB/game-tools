import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Tooltip } from "./tooltip";

const TONES = {
  default: "text-taupe hover:bg-ink-3 hover:text-paper",
  danger: "text-taupe hover:bg-coral/15 hover:text-coral",
};

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: LucideIcon;
  /** Required: the tooltip and the accessible name. */
  label: ReactNode;
  kbd?: string;
  tone?: keyof typeof TONES;
  size?: "sm" | "md";
  tooltipSide?: "top" | "bottom" | "left" | "right";
  /** A toggle (bold, italic…): shown pressed, and says so to screen readers. */
  pressed?: boolean;
};

/** Icon-only button. Always has a tooltip, since it has no visible text. Forwards props and ref,
    so it can be the trigger of a Popover or Confirm. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(
  ({ icon: Icon, label, kbd, tone = "default", size = "md", tooltipSide, pressed, className, ...p }, ref) => (
    <Tooltip label={label} kbd={kbd} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={typeof label === "string" ? label : undefined}
        aria-pressed={pressed}
        className={cn(
          "grid shrink-0 place-items-center rounded-md transition-[color,background-color,scale,opacity] active:scale-90 disabled:pointer-events-none disabled:opacity-30",
          size === "sm" ? "h-7 w-7" : "h-8 w-8",
          TONES[tone], pressed && "bg-caramel/20 text-paper", className,
        )}
        {...p}
      >
        <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.25} />
      </button>
    </Tooltip>
  ),
);
IconButton.displayName = "IconButton";

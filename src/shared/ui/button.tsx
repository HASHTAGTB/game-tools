import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

/** Text buttons in the style of the game's menus: no fill, underline on hover. `primary` and `destructive` are the
 *  one filled button of a popup or footer; `quiet` is for toolbars (fills on hover, no underline). */
const VARIANTS = {
  default: "text-bone hover:text-paper hover:underline",
  ghost: "text-taupe hover:text-paper hover:underline",
  primary: "px-3 bg-paper text-ink hover:bg-bone",
  destructive: "px-3 bg-coral text-ink hover:bg-paper",
  danger: "text-taupe hover:text-coral hover:underline",
  quiet: "text-taupe hover:bg-ink-3 hover:text-paper",
};
const SIZES = { sm: "h-7 px-1.5 gap-1.5", md: "h-8 px-2 gap-1.5", icon: "h-7 w-7 justify-center" };

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES };

export const Button = forwardRef<HTMLButtonElement, Props>(({ className, variant = "default", size = "md", ...p }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex shrink-0 items-center rounded-md font-sans text-base underline-offset-4 decoration-2 transition-colors disabled:opacity-40 disabled:pointer-events-none select-none",
      SIZES[size], VARIANTS[variant], className,
    )}
    {...p}
  />
));
Button.displayName = "Button";

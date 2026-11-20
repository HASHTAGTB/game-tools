import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/** Text buttons in the style of the game's menus: no fill, underline on hover. */
const VARIANTS = {
  default: "text-bone hover:text-paper hover:underline",
  ghost: "text-taupe hover:text-paper hover:underline",
  primary: "rounded-md bg-paper text-ink hover:bg-bone",
  danger: "text-taupe hover:text-coral hover:underline",
};
const SIZES = { sm: "h-7 px-1.5 text-[15px] gap-1.5", md: "h-8 px-2 text-base gap-1.5", icon: "h-7 w-7 justify-center" };

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES };

export const Button = forwardRef<HTMLButtonElement, Props>(({ className, variant = "default", size = "md", ...p }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center rounded font-sans underline-offset-4 decoration-2 transition-colors disabled:opacity-40 disabled:pointer-events-none select-none",
      VARIANTS[variant], SIZES[size], className,
    )}
    {...p}
  />
));
Button.displayName = "Button";

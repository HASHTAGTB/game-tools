import { Popover as P } from "@base-ui/react/popover";
import { useRef, type ReactElement, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Rule } from "./heading";
import { bloomRef } from "./flair";
import { bloomCls } from "./motion";
import { DEFAULT_COLOR } from "@/shared/lib/colors";

/** The raised surface every popup uses (popovers, menus, dialogs, suggestion lists, toasts): one step lighter than the
 *  page, a thin line and a soft shadow. Rows inside highlight with `bg-paper/8`, since ink-3 is the surface itself. */
export const surfaceCls = "rounded-lg border border-ink-line bg-ink-3 font-talk text-base text-paper shadow-panel";
export const popoverCls = cn(surfaceCls, "p-4 outline-hidden origin-(--transform-origin)");

/** Popup heading: the title over the short colored rule, like a Section. */
export function PopoverTitle({ children, color = DEFAULT_COLOR, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <div className={cn("mb-3", className)}>
      <p className="font-sans text-lg text-paper">{children}</p>
      <Rule color={color} short />
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trigger element; Base UI adds its props to it. Or, for a popup opened from elsewhere, `anchor`. */
  trigger?: ReactElement;
  /** What it opens next to when it has no trigger (an element CodeMirror or a box drew). */
  anchor?: Element | null;
  side?: P.Positioner.Props["side"];
  align?: P.Positioner.Props["align"];
  className?: string;
  /** Where focus goes on close (default: back to the trigger). */
  finalFocus?: P.Popup.Props["finalFocus"];
  children: ReactNode;
};

/** Controlled popover that blooms out of its trigger (see `bloomCls`) and fades on close. While it closes it keeps
 *  showing what it showed last, so a caller can clear its state at once. */
export function Popover({ open, onOpenChange, trigger, anchor, side = "bottom", align = "center", className, finalFocus, children }: Props) {
  const last = useRef(children);
  if (open) last.current = children;
  return (
    <P.Root open={open} onOpenChange={v => onOpenChange(v)}>
      {trigger && <P.Trigger render={trigger} />}
      <P.Portal>
        <P.Positioner anchor={anchor ?? undefined} side={side} align={align} sideOffset={6} collisionPadding={12} className="z-50">
          <P.Popup className={cn(popoverCls, bloomCls, className)} finalFocus={finalFocus}>
            {/* its items pop in after it */}
            <div className="contents" ref={bloomRef}>{last.current}</div>
          </P.Popup>
        </P.Positioner>
      </P.Portal>
    </P.Root>
  );
}

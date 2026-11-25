import { Popover as P } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Rule } from "./heading";
import { AnimatePresence, m, pop } from "./motion";

/** The raised surface every popup uses (popovers, menus, dialogs, suggestion lists, toasts): one step lighter than the
 *  page, a thin line and a soft shadow. Rows inside highlight with `bg-paper/8`, since ink-3 is the surface itself. */
export const surfaceCls = "rounded-lg border border-ink-line bg-ink-3 font-talk text-base text-paper shadow-panel";
export const popoverCls = cn(surfaceCls, "p-4 outline-hidden origin-(--transform-origin)");

/** Popup heading: the title over the short colored rule, like a Section. */
export function PopoverTitle({ children, color = "#c4956a", className }: { children: ReactNode; color?: string; className?: string }) {
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
  /** The trigger element; Base UI adds its props to it. */
  trigger: ReactElement;
  side?: P.Positioner.Props["side"];
  align?: P.Positioner.Props["align"];
  className?: string;
  children: ReactNode;
};

/** Controlled popover that springs open and fades out on close.
    The Portal is kept mounted so AnimatePresence, not Base UI, removes it after the exit animation. */
export function Popover({ open, onOpenChange, trigger, side = "bottom", align = "center", className, children }: Props) {
  return (
    <P.Root open={open} onOpenChange={v => onOpenChange(v)}>
      <P.Trigger render={trigger} />
      <AnimatePresence>
        {open && (
          <P.Portal keepMounted>
            <P.Positioner side={side} align={align} sideOffset={6} className="z-50">
              <P.Popup className={cn(popoverCls, className)} render={<m.div {...pop} />}>
                {children}
              </P.Popup>
            </P.Positioner>
          </P.Portal>
        )}
      </AnimatePresence>
    </P.Root>
  );
}

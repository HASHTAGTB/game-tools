import { Popover as P } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { AnimatePresence, m, pop } from "./motion";

/** Popover framed like the game's dialogue box. */
export const popoverCls = "rounded-xl border-[3px] border-paper bg-ink-2 p-4 font-talk text-[15px] text-paper shadow-[0_12px_40px_rgba(0,0,0,.45)] outline-hidden origin-(--transform-origin)";

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

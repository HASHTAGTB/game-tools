import { Tooltip as T } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

/** Wrap the app once so neighbouring tooltips open instantly after the first one. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <T.Provider delay={450} closeDelay={0}>{children}</T.Provider>;
}

type Props = {
  /** Text shown in the tooltip. */
  label: ReactNode;
  /** Optional keyboard shortcut, shown dimmed after the label. */
  kbd?: string;
  side?: T.Positioner.Props["side"];
  /** The trigger. Base UI adds its props and ref to it. */
  children: ReactElement;
};

/** Small label for icon-only controls. CSS transition (Base UI's starting/ending style), not Motion: it's a hover effect. */
export function Tooltip({ label, kbd, side = "top", children }: Props) {
  return (
    <T.Root>
      <T.Trigger render={children} />
      <T.Portal>
        <T.Positioner side={side} sideOffset={6} className="z-60">
          <T.Popup
            className="flex origin-(--transform-origin) items-center gap-2 rounded-md bg-paper px-2 py-1 font-talk text-[13px] font-semibold text-ink shadow-[0_6px_20px_rgba(0,0,0,.4)] transition-[opacity,scale] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            {label}
            {kbd && <kbd className="font-talk text-[12px] font-bold text-taupe">{kbd}</kbd>}
          </T.Popup>
        </T.Positioner>
      </T.Portal>
    </T.Root>
  );
}

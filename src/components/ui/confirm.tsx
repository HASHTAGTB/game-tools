import * as Popover from "@radix-ui/react-popover";
import { useState, type ReactNode } from "react";
import { Button } from "./button";

/** Popover framed like the game's dialogue box. */
export const popoverCls = "z-50 rounded-xl border-[3px] border-paper bg-ink-2 p-4 font-talk text-[15px] text-paper shadow-[0_12px_40px_rgba(0,0,0,.45)] animate-pop-in";

/** Small "are you sure?" popover (window.confirm is unreliable inside webviews). */
export function Confirm({ children, message, onConfirm, label = "Delete" }: {
  children: ReactNode; message: string; onConfirm: () => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="end" sideOffset={6} className={`${popoverCls} w-72`}>
          <p className="mb-3">{message}</p>
          <div className="flex justify-end gap-3">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" className="rounded-md bg-coral px-3 text-ink hover:bg-paper hover:no-underline" onClick={() => { setOpen(false); onConfirm(); }}>{label}</Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

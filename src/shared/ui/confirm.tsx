import { useState, type ReactElement } from "react";
import { Button } from "./button";
import { Popover } from "./popover";

/** Small "are you sure?" popover (window.confirm is unreliable inside webviews). */
export function Confirm({ children, message, onConfirm, label = "Delete" }: {
  children: ReactElement; message: string; onConfirm: () => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} trigger={children} align="end" className="w-72">
      <p className="mb-3">{message}</p>
      <div className="flex justify-end gap-3">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" className="rounded-md bg-coral px-3 text-ink hover:bg-paper hover:no-underline" onClick={() => { setOpen(false); onConfirm(); }}>{label}</Button>
      </div>
    </Popover>
  );
}

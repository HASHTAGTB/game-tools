import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import type { Location } from "@/shared/lib/workspace";
import { Button } from "./button";
import { Popover } from "./popover";

/** Small "are you sure?" popover (window.confirm is unreliable inside webviews). */
export function Confirm({ children, message, onConfirm, label = "Delete" }: {
  children: ReactElement; message: string; onConfirm: () => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} trigger={children} align="end" className="w-72">
      <p className="mb-3 text-bone">{message}</p>
      <div className="flex justify-end gap-3">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" variant="destructive" onClick={() => { setOpen(false); onConfirm(); }}>{label}</Button>
      </div>
    </Popover>
  );
}

/** "Are you sure?" inside a popup that's already open: the first click arms it (showing `sure`), the second does it.
 *  It disarms itself after 3 s. */
export function ArmButton({ children, sure, disabled, onConfirm }: { children: ReactNode; sure: string; disabled?: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return (
    <Button size="sm" variant="danger" disabled={disabled} className={cn(armed && "text-coral")} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? sure : children}
    </Button>
  );
}

/** The end of a "delete a file?" message: whether it can come back, by where the data is. */
export const undoNote = (loc: Location | null) =>
  loc?.kind === "github" ? "Git history still has it if it was saved."
    : loc?.kind === "folder" ? "This can't be undone unless the vault is in git."
    : "This can't be undone.";

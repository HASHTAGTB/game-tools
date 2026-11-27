import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "@/shared/ui/icon-button";

/** The pieces the vault's file tree and the scene list share: rows' hover actions, renaming in place, the drop
 *  highlight, the menu rule of a group and opening a closed group while something is dragged over it. */

/** A row's icon buttons: hidden until the row is hovered or focused (always shown on touch). */
export const hoverOnly = "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100";

/** Rename and delete, on a row's right. */
export function RowActions({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  return (
    <span className="relative flex">
      <IconButton icon={Pencil} size="sm" label="Rename" tooltipSide="right" className={hoverOnly} onClick={onRename} />
      <IconButton icon={Trash2} size="sm" tone="danger" label="Delete" tooltipSide="right" className={hoverOnly} onClick={onDelete} />
    </span>
  );
}

/** The ring on a row (a folder, a chapter) while something can be dropped into it. */
export const DropRing = () => <span aria-hidden className="absolute inset-y-0.5 left-2 right-2 rounded-md bg-caramel/20 ring-2 ring-caramel" />;

/** The thin menu rule down a group's rows: caramel while something can be dropped in, brighter while the open file
 *  is in it. */
export function GroupRule({ drop, holdsOpen, style }: { drop: boolean; holdsOpen: boolean; style?: CSSProperties }) {
  return <span aria-hidden className={cn("absolute inset-y-1 w-0.5 transition-colors", drop ? "bg-caramel" : holdsOpen ? "bg-bone/40" : "bg-bone/15")} style={style} />;
}

/** A row's name as a field. Enter or leaving it commits (once), Escape cancels. */
export function InlineRename({ value, onCommit, onCancel, label, className, style }: {
  value: string; onCommit: (v: string) => void; onCancel: () => void; label: string; className?: string; style?: CSSProperties;
}) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  // after the context menu closes, so its focus return doesn't steal the input's focus
  useEffect(() => { const t = setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 0); return () => clearTimeout(t); }, []);
  const done = useRef(false);
  const commit = () => { if (done.current) return; done.current = true; onCommit(v); };
  return (
    <div className="relative flex h-full min-w-0 flex-1 items-center" style={style}>
      <input ref={ref} value={v} onChange={e => setV(e.target.value)} aria-label={label}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { done.current = true; onCancel(); }
        }}
        onBlur={commit}
        className={cn("h-6 min-w-0 flex-1 rounded-md border-b-2 border-caramel bg-ink px-1 text-base text-paper focus:outline-hidden", className)} />
    </div>
  );
}

/** While dragging: hovering a closed group for a moment opens it, so you can drop into it. Call `over` with the group
 *  under the pointer (null if none, or it's open); `reset` when the drag ends. */
export function useHoverOpen(open: (id: string) => void, ms = 700) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const at = useRef<string | null>(null);
  return {
    over(closed: string | null) {
      if (closed === at.current) return;
      clearTimeout(timer.current);
      at.current = closed;
      if (closed) timer.current = setTimeout(() => open(closed), ms);
    },
    reset() { clearTimeout(timer.current); at.current = null; },
  };
}

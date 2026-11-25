import { Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "./icon-button";

/** Boxed text field, for forms (popups, the Inspector). Same height as `md` buttons' rows: 36px. */
export const fieldCls =
  "h-9 w-full min-w-0 rounded-md border border-ink-line bg-ink px-2.5 font-talk text-base text-paper placeholder:text-taupe transition-[border-color,box-shadow] focus:border-caramel focus:outline-hidden focus:ring-3 focus:ring-caramel/25 disabled:opacity-40";
export const textareaCls = cn(fieldCls, "h-auto resize-none py-1.5 leading-snug");

/** Underlined line for inline inputs (sidebar "add" fields, the negative prompt). Goes on the wrapper, so buttons
 *  and labels beside the input sit on the same line; `lineInputCls` goes on the input. */
export const lineCls = "flex items-center gap-1 border-b-2 border-ink-line transition-colors focus-within:border-caramel";
export const lineInputCls = "h-9 min-w-0 flex-1 bg-transparent font-talk text-base text-paper placeholder:text-taupe focus:outline-hidden";

/** "New …" field with a + button. Enter adds too. */
export function AddField({ placeholder, label = "Add", onAdd, className }: {
  placeholder: string; label?: string; onAdd: (name: string) => void; className?: string;
}) {
  const [name, setName] = useState("");
  const add = () => { const n = name.trim(); if (n) { onAdd(n); setName(""); } };
  return (
    <div className={cn(lineCls, className)}>
      <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
        placeholder={placeholder} aria-label={placeholder} className={lineInputCls} />
      <IconButton icon={Plus} size="sm" label={label} kbd="Enter" onClick={add} disabled={!name.trim()} />
    </div>
  );
}

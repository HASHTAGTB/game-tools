import { Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_COLOR } from "@/shared/lib/colors";
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

/** A labelled form field. Stacked (label over the control, hint under it) in panels like the Inspector; `inline` puts
 *  the label before the control, for a row of fields (the scene header). */
export function Field({ label, hint, inline, children, className }: { label: string; hint?: ReactNode; inline?: boolean; children: ReactNode; className?: string }) {
  if (inline) return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <span className="font-sans text-sm text-taupe">{label}</span>{children}
    </span>
  );
  return (
    <div className={className}>
      <span className="mb-1 block font-sans text-sm text-taupe">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-talk text-xs text-taupe">{hint}</span>}
    </div>
  );
}

/** Keeps its own text while focused, so the caret doesn't jump when the store re-renders it. */
function useOwnText<E extends HTMLElement>(value: string) {
  const ref = useRef<E>(null);
  const [text, setText] = useState(value);
  useEffect(() => { if (document.activeElement !== ref.current) setText(value); }, [value]);
  return { ref, text, setText, reset: () => setText(value) };
}

/** A boxed textarea that grows with its text. */
export function AutoText({ value, onChange, placeholder, autoFocus, className, minRows = 2 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; className?: string; minRows?: number;
}) {
  const { ref, text, setText, reset } = useOwnText<HTMLTextAreaElement>(value);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [text, ref]);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus, ref]);
  return (
    <textarea ref={ref} value={text} rows={minRows} placeholder={placeholder}
      onChange={e => { setText(e.target.value); onChange(e.target.value); }} onBlur={reset}
      className={cn(textareaCls, className)} />
  );
}

/** A boxed one-line text field. */
export function TextInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const { ref, text, setText, reset } = useOwnText<HTMLInputElement>(value);
  return (
    <input ref={ref} value={text} placeholder={placeholder} onChange={e => { setText(e.target.value); onChange(e.target.value); }} onBlur={reset}
      className={cn(fieldCls, className)} />
  );
}

/** A colour swatch that opens the system picker, with its hex beside it. */
export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_COLOR} onChange={e => onChange(e.target.value)}
        className="h-9 w-11 cursor-pointer rounded-md border border-ink-line bg-ink p-1" />
      <span className="font-talk text-sm text-taupe">{value}</span>
    </div>
  );
}

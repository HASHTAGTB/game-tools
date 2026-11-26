import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { fieldCls as inputCls, textareaCls } from "@/shared/ui/field";
import { visible } from "../lib/colors";
import { DEFAULT_COLOR } from "@/shared/lib/colors";

/** The shared field styles, under the names this tool already uses. */
export { inputCls, textareaCls };

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("block", className)}>
      <span className="mb-1 block font-sans text-sm text-taupe">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-talk text-xs text-taupe">{hint}</span>}
    </div>
  );
}

/** A textarea that grows with its text. Keeps its own text while typing so the caret doesn't jump on re-renders. */
export function AutoText({ value, onChange, placeholder, autoFocus, className, minRows = 2 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; className?: string; minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(value);
  useEffect(() => { if (document.activeElement !== ref.current) setText(value); }, [value]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [text]);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  return (
    <textarea ref={ref} value={text} rows={minRows} placeholder={placeholder}
      onChange={e => { setText(e.target.value); onChange(e.target.value); }} onBlur={() => setText(value)}
      className={cn(textareaCls, className)} />
  );
}

/** A one-line text input with the same caret-keeping behaviour. */
export function TextInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  useEffect(() => { if (document.activeElement !== ref.current) setText(value); }, [value]);
  return (
    <input ref={ref} value={text} placeholder={placeholder} onChange={e => { setText(e.target.value); onChange(e.target.value); }} onBlur={() => setText(value)}
      className={cn(inputCls, className)} />
  );
}

export type ChipOption = { id: string; name: string; color: string };

/** Pick any number of options. Picked ones are filled with their color. */
export function ChipPicker({ options, value, onChange, empty }: { options: ChipOption[]; value: string[]; onChange: (v: string[]) => void; empty?: ReactNode }) {
  if (!options.length) return <p className="font-talk text-sm text-taupe">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => {
        const on = value.includes(o.id);
        const c = visible(o.color);
        return (
          <button key={o.id} type="button" aria-pressed={on}
            onClick={() => onChange(on ? value.filter(x => x !== o.id) : [...value, o.id])}
            className={cn("rounded-full border-2 px-2.5 py-px font-sans text-sm transition-colors", on ? "text-ink" : "text-bone hover:text-paper")}
            style={{ borderColor: on ? c : `color-mix(in srgb, ${c} 45%, transparent)`, background: on ? c : "transparent" }}>
            {o.name}
          </button>
        );
      })}
    </div>
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_COLOR} onChange={e => onChange(e.target.value)}
        className="h-9 w-11 cursor-pointer rounded-md border border-ink-line bg-ink p-1" />
      <span className="font-talk text-sm text-taupe">{value}</span>
    </div>
  );
}

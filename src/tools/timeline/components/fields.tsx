import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { visible } from "../lib/colors";

export const inputCls = "h-8 w-full min-w-0 rounded-md border-2 border-ink-line bg-ink px-2 font-talk text-sm text-paper placeholder:text-taupe focus:border-caramel focus:outline-hidden";
export const textareaCls = "w-full resize-none rounded-md border-2 border-ink-line bg-ink px-2 py-1.5 font-talk text-sm leading-snug text-paper placeholder:text-taupe focus:border-caramel focus:outline-hidden";

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("block", className)}>
      <span className="mb-1 block font-sans text-[13px] text-taupe">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-talk text-[12px] text-taupe">{hint}</span>}
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
  if (!options.length) return <p className="font-talk text-[13px] text-taupe">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => {
        const on = value.includes(o.id);
        const c = visible(o.color);
        return (
          <button key={o.id} type="button" aria-pressed={on}
            onClick={() => onChange(on ? value.filter(x => x !== o.id) : [...value, o.id])}
            className={cn("rounded-full border-2 px-2 py-px font-sans text-[13px] transition-colors", on ? "text-ink" : "text-bone hover:text-paper")}
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
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#c4956a"} onChange={e => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded-md border-2 border-ink-line bg-ink p-0.5" />
      <span className="font-talk text-[13px] text-taupe">{value}</span>
    </div>
  );
}

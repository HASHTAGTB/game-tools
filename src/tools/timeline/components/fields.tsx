import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { formatDate, isDuration, parseDate } from "../lib/duration";
import { convertWhen, whenKind, type WhenKind } from "../lib/edit";
import type { Resolved, Span } from "../lib/resolve";
import type { Arc, Ref, When } from "../lib/types";

export const inputCls = "h-8 w-full min-w-0 rounded-md border-2 border-ink-line bg-ink px-2 font-talk text-sm text-paper placeholder:text-taupe focus:border-caramel focus:outline-hidden";

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block font-sans text-[13px] text-taupe">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-talk text-[12px] text-taupe">{hint}</span>}
    </label>
  );
}

/** A text input that only commits values `valid` accepts; anything else is shown in red until fixed or left. */
export function CheckedInput({ value, onCommit, valid, placeholder, className }: {
  value: string; onCommit: (v: string) => void; valid: (v: string) => boolean; placeholder?: string; className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const ok = valid(text);
  return (
    <input value={text} placeholder={placeholder}
      onChange={e => { setText(e.target.value); if (valid(e.target.value)) onCommit(e.target.value); }}
      onBlur={() => { if (!ok) setText(value); }}
      className={cn(inputCls, !ok && "border-coral focus:border-coral", className)} />
  );
}

const okDuration = (v: string) => v.trim() === "" || isDuration(v);

/** Every event and arc as options for "after …" / "parallel to …", grouped by arc. */
export function RefSelect({ arcs, value, onChange, exclude }: { arcs: Arc[]; value: Ref | null; onChange: (r: Ref) => void; exclude?: string }) {
  const v = value ? ("event" in value ? `e:${value.event}` : `a:${value.arc}`) : "";
  return (
    <select value={v} onChange={e => { const [k, id] = [e.target.value.slice(0, 1), e.target.value.slice(2)]; onChange(k === "e" ? { event: id } : { arc: id }); }}
      className={cn(inputCls, "pr-1")}>
      {!value && <option value="">Pick…</option>}
      <optgroup label="Arcs">
        {arcs.filter(a => a.id !== exclude).map(a => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
      </optgroup>
      {arcs.map(a => (
        <optgroup key={a.id} label={a.name}>
          {a.events.filter(e => e.id !== exclude).map(e => (
            <option key={e.id} value={`e:${e.id}`}>{e.chars[0]}: {(e.text || "(empty)").slice(0, 60)}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

const KINDS: { kind: WhenKind; label: string }[] = [
  { kind: "at", label: "Date" },
  { kind: "after", label: "After" },
  { kind: "from", label: "With" },
];

/** Edits a `When`. Switching the kind keeps the current start: "Date" pins it where it is now, "After"/"With" work out
 *  the gap or offset to the picked reference. */
export function WhenEditor({ when, span, arcs, res, onChange, self, defaultRef }: {
  when: When; span: Span | undefined; arcs: Arc[]; res: Resolved; onChange: (w: When) => void;
  /** Id of the thing being edited, so it can't refer to itself. */
  self: string;
  defaultRef: Ref | null;
}) {
  const kind = whenKind(when);
  const ref = "at" in when ? null : "after" in when ? when.after : when.from;
  const switchTo = (k: WhenKind) => {
    if (k === kind || !span) return;
    const nw = convertWhen(k, span.start, span.precision === "hour" ? "hour" : span.precision, ref ?? defaultRef, res);
    if (nw) onChange(nw);
  };
  const date = "at" in when ? parseDate(when.at) : null;
  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-md bg-ink p-0.5">
        {KINDS.map(k => (
          <button key={k.kind} onClick={() => switchTo(k.kind)} disabled={k.kind !== "at" && !ref && !defaultRef}
            className={cn("h-7 flex-1 rounded-sm font-sans text-[14px] transition-colors disabled:opacity-30",
              k.kind === kind ? "bg-ink-3 text-paper" : "text-taupe hover:text-paper")}>
            {k.label}
          </button>
        ))}
      </div>
      {"at" in when ? (
        <Field label="Date" hint={date ? `${formatDate(date.hours, date.precision)} · known to the ${date.precision}` : "2025, 2025-04, 2025-04-07 or 2025-04-07T10:00"}>
          <CheckedInput value={when.at} valid={v => !!parseDate(v)} onCommit={v => onChange({ at: v.trim() })} placeholder="2025-04-07" />
        </Field>
      ) : (
        <>
          <Field label={kind === "after" ? "After the end of" : "Together with the start of"}>
            <RefSelect arcs={arcs} value={ref} exclude={self}
              onChange={r => { const nw = span && convertWhen(kind, span.start, "hour", r, res); onChange(nw ?? (kind === "after" ? { after: r } : { from: r })); }} />
          </Field>
          <Field label={kind === "after" ? "Gap" : "Offset"} hint={kind === "after" ? "4h, 2d, 1d6h" : "negative is earlier: -1d"}>
            {"after" in when ? (
              <CheckedInput value={when.gap ?? ""} valid={okDuration} placeholder="0h"
                onCommit={v => onChange({ after: when.after, ...(v.trim() ? { gap: v.trim() } : {}) })} />
            ) : (
              <CheckedInput value={when.offset ?? ""} valid={okDuration} placeholder="0h"
                onCommit={v => onChange({ from: when.from, ...(v.trim() ? { offset: v.trim() } : {}) })} />
            )}
          </Field>
        </>
      )}
    </div>
  );
}

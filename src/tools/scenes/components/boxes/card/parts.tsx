import { Plus, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Manifest } from "@/shared/lib/game";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { lineCls, lineInputCls } from "@/shared/ui/field";
import { How } from "@/shared/ui/help";
import { Segmented } from "@/shared/ui/segmented";
import { peekAt } from "../../../lib/ui";

/** The pieces every open stage card is built from (the shared base): a labelled row, the transition row, a hint line,
 *  the "+" for a name the lists don't have, and the foot. Each card's main picker sits between them. The card's head
 *  already shows the value (and the one before), so the parts don't repeat it. */

/** A labelled part of a card. `aside`: on the right of the label. */
export function CardRow({ label, aside, children, className }: { label: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-center gap-2 font-sans text-sm text-taupe">
        <span>{label}</span>
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** One quiet line when something else in the scene suggests a change, with one button that makes it. */
export function Hint({ icon: Icon, children, action, onAction }: { icon: LucideIcon; children: ReactNode; action: string; onAction: () => void }) {
  return (
    <div className="bx-hint">
      <Icon className="h-4 w-4 shrink-0 text-periwinkle" />
      <span className="min-w-0 flex-1">{children}</span>
      <Button size="sm" variant="quiet" className="text-paper" onClick={onAction}>{action}</Button>
    </div>
  );
}

/** Keys that work in the card ("[Enter] pick"), what's still missing, and Done. */
export function CardFoot({ keys, note, onDone }: { keys: string[]; note?: ReactNode; onDone: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-line pt-3">
      <span className="flex flex-wrap gap-x-3 gap-y-1 font-talk text-xs text-taupe">
        {keys.map(k => <span key={k}><How text={k} /></span>)}
      </span>
      {note}
      <Button size="sm" variant="primary" className="ml-auto" onClick={onDone}>Done</Button>
    </div>
  );
}

/** "+": a name the lists don't have (a new outfit, a pose, a transform). Opens a small line; Enter or leaving it uses
 *  what's typed, Esc drops it. Nothing is written while typing. The new name then shows in its list, dashed while the
 *  game has no file for it. */
export function NewName({ label, placeholder, onAdd, className }: { label: string; placeholder: string; onAdd: (name: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const done = (use: boolean) => {
    const t = text.trim();
    setOpen(false);
    setText("");
    if (use && t) onAdd(t);
  };
  if (!open) {
    return (
      <button type="button" title={label} aria-label={label} onClick={() => setOpen(true)}
        className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2 font-talk text-sm text-taupe transition-colors hover:bg-ink-2 hover:text-paper focus-visible:outline-2 focus-visible:outline-periwinkle", className)}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <span className={cn(lineCls, "h-7 w-44 px-1", className)}>
      <input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} aria-label={label}
        onBlur={() => done(true)}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); done(true); }
          // handled here: the card's Esc doesn't close it
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
        }}
        className={cn(lineInputCls, "h-7 text-sm")} />
    </span>
  );
}

/** Below a picker's search: the typed name as a new pick, when no listed one is exactly it ("Use "rooftop_rain""). */
export function UseTyped({ query, known, what, onUse }: { query: string; known: (name: string) => boolean; what: string; onUse: (name: string) => void }) {
  const name = query.trim();
  if (!name || known(name)) return null;
  return (
    <Button size="sm" variant="quiet" className="self-start" onClick={() => onUse(name)}>
      <Plus className="h-3.5 w-3.5" />Use “{name}” as {what}<span className="text-taupe">(no file yet)</span>
    </Button>
  );
}

// ---------------------------------------------------------------- transitions

/** The transitions as one row: the game's own first, then the everyday Ren'Py ones, "none" unless one is required,
 *  and "+" for any other name. Hovering one plays the card's line with it in the Preview (`line`). */
export function TransitionStrip({ value, onChange, m, line, required, extra = [] }: {
  value?: string; onChange: (w: string | undefined) => void; m: Manifest | null; line: number; required?: boolean; extra?: string[];
}) {
  const own = m?.transitions.slice(0, Math.max(0, m.transitions.indexOf("dissolve"))) ?? [];
  const common = [...new Set([...own, "dissolve", ...extra, "ease", "easeinright", "easeinleft", "easeoutright", "easeoutleft"])];
  const options = [...(required ? [] : [""]), ...common, ...(value && !common.includes(value) ? [value] : [])];
  return (
    <CardRow label="Transition">
      <Segmented label="Transition" value={value ?? ""} onChange={t => { peekAt(null); onChange(t || undefined); }}
        onHover={t => peekAt(t === null ? null : { line, with: t })}
        options={options.map(t => ({ value: t, label: t || "none", missing: !!t && !!m && !m.transitions.includes(t) }))}>
        <NewName label="Another transition" placeholder="transition name" onAdd={w => onChange(w)} />
      </Segmented>
    </CardRow>
  );
}

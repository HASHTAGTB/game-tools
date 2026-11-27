import { Button } from "./button";
import { AnimatePresence, m, spring } from "./motion";
import { Toasts } from "./toasts";

/** A tool's error and notice, as toasts (`className` places them). */
export function StatusToasts({ error, notice, setError, setNotice, className }: {
  error: string | null; notice: string | null;
  setError: (v: null) => void; setNotice: (v: null) => void; className?: string;
}) {
  return (
    <Toasts className={className} items={[
      ...(error ? [{ id: "error", kind: "error" as const, text: error, onDismiss: () => setError(null) }] : []),
      ...(notice ? [{ id: "notice", kind: "notice" as const, text: notice, onDismiss: () => setNotice(null) }] : []),
    ]} />
  );
}

export type ConflictItem = { key: string; label: string; deleted: boolean };

/** Files someone else changed while this tab had unsaved edits to them: load theirs, or keep mine (overwrite theirs). */
export function ConflictBar({ items, onResolve }: { items: ConflictItem[]; onResolve: (key: string, keep: "mine" | "theirs") => void }) {
  if (!items.length) return null;
  return (
    <div className="shrink-0 space-y-2 border-b-2 border-coral bg-coral/10 px-6 py-2.5">
      {items.map(c => (
        <div key={c.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 font-talk text-base">
          <span className="min-w-0 flex-1 text-paper">
            {c.label} was {c.deleted ? "deleted" : "changed"} somewhere else (Obsidian? git pull?) while you had unsaved edits.
          </span>
          <Button size="sm" onClick={() => onResolve(c.key, "theirs")}>Load theirs</Button>
          <Button size="sm" variant="danger" onClick={() => onResolve(c.key, "mine")}>Keep mine (overwrite)</Button>
        </div>
      ))}
    </div>
  );
}

/** The save state shown next to an open file. */
export const saveState = (s: { saving: boolean; unsaved: boolean; github: boolean }) =>
  s.saving ? "Saving…" : s.unsaved ? "Unsaved" : s.github ? "Staged" : "Saved";

/** The save state, rolling over when it changes (Unsaved → Saving… → Saved). */
export function SaveState(s: { saving: boolean; unsaved: boolean; github: boolean }) {
  const text = saveState(s);
  return (
    <span className="relative inline-grid overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span key={text} className="inline-block whitespace-nowrap"
          initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-100%", opacity: 0, transition: { duration: 0.14, ease: "easeIn" } }}
          transition={spring.bouncy}>
          {text}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

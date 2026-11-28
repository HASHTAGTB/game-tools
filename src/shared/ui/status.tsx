import type { FileCompare } from "@/shared/lib/diff/files";
import type { Resolution } from "@/shared/lib/fileSync";
import { Button } from "./button";
import { openMerge, reviewOutside } from "./diff/sessions";
import { dismissOutside, useOutside } from "./diff/store";
import type { ToolData } from "./tool-page";
import { AnimatePresence, m, spring } from "./motion";
import { Toasts } from "./toasts";

/** A tool's error and notice, as toasts (`className` places them), and files changed elsewhere that were just
 *  loaded, with a link to see how (`data`: the tool, to reload if some of it is undone). */
export function StatusToasts({ error, notice, setError, setNotice, className, data }: {
  error: string | null; notice: string | null;
  setError: (v: null) => void; setNotice: (v: null) => void; className?: string;
  data?: Pick<ToolData, "flush" | "reload">;
}) {
  const outside = useOutside(s => s.last);
  return (
    <Toasts className={className} items={[
      ...(error ? [{ id: "error", kind: "error" as const, text: error, onDismiss: () => setError(null) }] : []),
      ...(notice ? [{ id: "notice", kind: "notice" as const, text: notice, onDismiss: () => setNotice(null) }] : []),
      ...(outside && data ? [{
        id: `outside${outside.id}`, kind: "notice" as const, text: outside.text, onDismiss: dismissOutside,
        action: { label: "See what changed", run: () => { dismissOutside(); reviewOutside(data, outside.files); } },
      }] : []),
    ]} />
  );
}

/** A file someone else changed while this tab had unsaved edits to it. `versions`: where this tab started, its
 *  version and theirs, for the merge. */
export type ConflictItem = { key: string; label: string; deleted: boolean; versions: () => FileCompare | null };

/** Files someone else changed while this tab had unsaved edits to them: each opens the Changes view to merge them
 *  (what only one side changed is merged already; whole sides are a click there too). */
export function ConflictBar({ items, onResolve }: { items: ConflictItem[]; onResolve: (key: string, keep: Resolution) => void }) {
  if (!items.length) return null;
  const merge = (list: ConflictItem[]) => {
    const files = list.flatMap(c => { const v = c.versions(); return v ? [{ c, v }] : []; });
    openMerge(files.map(f => f.v), (path, how) => {
      const c = files.find(f => f.v.path === path)!.c;
      onResolve(c.key, how.whole === "a" ? "mine" : how.whole === "b" ? "theirs" : { text: how.text });
    });
  };
  return (
    <div className="shrink-0 space-y-2 border-b-2 border-coral bg-coral/10 px-6 py-2.5">
      {items.map(c => (
        <div key={c.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 font-talk text-base">
          <span className="min-w-0 flex-1 text-paper">
            {c.label} was {c.deleted ? "deleted" : "changed"} somewhere else (Obsidian? git pull? another tab?) while you were editing it.
          </span>
          <Button size="sm" variant="primary" onClick={() => merge([c])}>Compare and merge…</Button>
        </div>
      ))}
      {items.length > 1 && (
        <div className="flex justify-end"><Button size="sm" onClick={() => merge(items)}>Merge all {items.length} at once…</Button></div>
      )}
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

import { useEffect, useState, useSyncExternalStore } from "react";
import { commit, defaultMessage, discard, keepMine, onPendingChange, pendingSnapshot } from "@/shared/lib/github";
import { cn } from "@/shared/lib/utils";
import { Button } from "./button";
import { fieldCls } from "./field";
import { Popover, PopoverTitle } from "./popover";

type Props = {
  /** Write the tool's in-memory edits out first, so the commit has them. */
  onFlush: () => Promise<void>;
  /** Throw away the tool's in-memory edits: stop autosaving, wait for any write in progress, run `drop` (which drops
   *  the pending changes), then reload without writing anything first. */
  onRevert: (drop: () => Promise<void>) => Promise<void>;
};

const msgOf = (e: unknown) => String(e instanceof Error ? e.message : e);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
/** ".game-tools/timeline/chapters/act-1.json" → "timeline/chapters/act-1" */
const short = (p: string) => p.replace(/^\.game-tools\//, "").replace(/\.json$/, "");

export const usePendingPaths = () => useSyncExternalStore(onPendingChange, pendingSnapshot);

/** Shown in the sidebar footer while the data lives on GitHub: unsaved changes and the Save button. Nothing is pushed
 *  until Save (or Ctrl+S). */
export function GitHubSave({ onFlush, onRevert }: Props) {
  const paths = usePendingPaths();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [conflicts, setConflicts] = useState<string[]>([]);
  /** The last commit made here, shown until the next edit. */
  const [saved, setSaved] = useState("");
  useEffect(() => { if (open) { setMessage(defaultMessage(paths)); setErr(""); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (msg?: string) => {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      await onFlush();
      const r = await commit((msg ?? message).trim() || defaultMessage(pendingSnapshot()));
      if (!r.ok) { setConflicts(r.conflicts); setOpen(true); return; }
      setConflicts([]);
      setOpen(false);
      if (r.files) setSaved(`${plural(r.files, "file")} saved as ${r.sha.slice(0, 7)}`);
    } catch (e) {
      setErr(msgOf(e));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  // Ctrl+S / Cmd+S saves right away with the default message
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const resolve = async (keep: "mine" | "theirs") => {
    setBusy(true);
    try {
      if (keep === "mine") { await keepMine(conflicts); setConflicts([]); setBusy(false); await save(); return; }
      await onRevert(() => discard(conflicts));
      setConflicts([]);
    } catch (e) {
      setErr(msgOf(e));
    } finally {
      setBusy(false);
    }
  };

  const n = paths.length;
  return (
    <div className="px-4 pt-3">
      <Popover open={open} onOpenChange={setOpen} side="top" align="start" className="w-md" trigger={
        <button disabled={busy && !open}
          className={cn("w-full rounded-md p-2 text-left font-sans transition-colors disabled:opacity-60",
            n ? "bg-paper text-ink hover:bg-bone" : "group text-bone hover:text-paper")}>
          <span className="flex items-baseline gap-2">
            <span className={cn("flex-1 text-base underline-offset-4 decoration-2", !n && "group-hover:underline")}>
              {busy ? "Saving…" : n ? "Save to GitHub" : "Saved on GitHub"}
            </span>
            {n > 0 && <kbd className="font-talk text-xs text-taupe">Ctrl+S</kbd>}
          </span>
          <span className={cn("mt-0.5 block font-talk text-xs", n ? "text-ink-3" : "text-taupe")}>
            {n ? plural(n, "unsaved change") : saved || "No unsaved changes"}
          </span>
        </button>
      }>
        {conflicts.length ? (
          <>
            <PopoverTitle color="var(--color-coral)">Changed on GitHub too</PopoverTitle>
            <p className="mb-2 text-sm text-bone">Someone saved these files since you started editing them here. Nothing was saved yet.</p>
            <ul className="mb-3 max-h-40 overflow-y-auto font-talk text-sm text-coral">{conflicts.map(p => <li key={p}>{short(p)}</li>)}</ul>
            <div className="flex items-center justify-end gap-3">
              <Button size="sm" variant="ghost" onClick={() => resolve("theirs")} disabled={busy}>Take theirs (drop my edits)</Button>
              <Button size="sm" variant="primary" onClick={() => resolve("mine")} disabled={busy}>Keep mine and save</Button>
            </div>
          </>
        ) : (
          <>
            <PopoverTitle>Save to GitHub</PopoverTitle>
            {n ? (
              <>
                <ul className="mb-3 max-h-40 overflow-y-auto font-talk text-sm text-bone">{paths.map(p => <li key={p}>{short(p)}</li>)}</ul>
                <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} autoFocus disabled={busy}
                  aria-label="Commit message"
                  className={fieldCls} />
              </>
            ) : <p className="text-sm text-bone">Everything is saved. Edits wait here until you save them.</p>}
          </>
        )}
        {err && <p className="mt-2 text-sm text-coral">{err}</p>}
        {!conflicts.length && (
          <div className="mt-3 flex items-center gap-3">
            {n > 0 && <DiscardAll busy={busy} onDiscard={async () => { await onRevert(() => discard()); setOpen(false); }} />}
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            {n > 0 && <Button size="sm" variant="primary" onClick={() => save()} disabled={busy}>Save</Button>}
          </div>
        )}
      </Popover>
    </div>
  );
}

/** Two clicks, not a nested popover. */
function DiscardAll({ busy, onDiscard }: { busy: boolean; onDiscard: () => void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 3000); return () => clearTimeout(t); }, [sure]);
  return (
    <Button size="sm" variant="danger" disabled={busy} className={cn(sure && "text-coral")} onClick={() => (sure ? onDiscard() : setSure(true))}>
      {sure ? "Really discard?" : "Discard all"}
    </Button>
  );
}

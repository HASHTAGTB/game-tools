import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { folderSupported, STATIC } from "@/shared/lib/env";
import { cn } from "@/shared/lib/utils";
import { pickServerRoot, reconnectFolder, setServerRoot, switchTo, TOOLS_DIR, type Location } from "@/shared/lib/workspace";
import { Button } from "./button";
import { Popover } from "./popover";

type Props = {
  loc: Location | null;
  /** The location changed (or failed to); `msg` says what happened. The tool should reload its data. */
  onChanged: (msg: string) => void;
  onReload: () => void;
};

const msgOf = (e: unknown) => String(e instanceof Error ? e.message : e);
const copiedNote = (n: number) => (n ? ` (copied ${n} file${n > 1 ? "s" : ""} there)` : "");

/** Sidebar footer shared by every tool: the one folder all tools keep their data in (normally the story vault). */
export function WorkspaceLocation({ loc, onChanged, onReload }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setValue(loc?.label ?? ""); setErr(""); }, [loc, open]);

  const run = async (fn: () => Promise<string | null>) => {
    setErr("");
    setBusy(true);
    try {
      const msg = await fn();
      if (msg) { setOpen(false); onChanged(msg); }
    } catch (e) {
      setErr(msgOf(e));
    } finally {
      setBusy(false);
    }
  };

  const useDir = async (d: string) => { const r = await setServerRoot(d); return `Using ${r.label}${copiedNote(r.copied)}`; };
  const saveDir = () => run(() => useDir(value));
  const chooseDir = () => run(async () => {
    const picked = await pickServerRoot();
    return picked ? useDir(picked) : null;   // null: dialog closed
  });
  const use = (t: "browser" | "folder") => run(async () => { const r = await switchTo(t); return r && `Using ${r.label}${copiedNote(r.copied)}`; });

  if (loc && !loc.ready) {
    const action = loc.picked
      ? { title: "Allow folder access", text: `${loc.label}: the browser asks again after a restart.`, go: () => reconnectFolder().then(onReload, e => onChanged(msgOf(e))) }
      : { title: "Choose the story folder", text: "Pick the vault folder once. Every tool keeps its files in it.", go: () => use("folder") };
    return (
      <div className="px-4 py-4">
        <button onClick={action.go} disabled={busy}
          className="group w-full rounded-sm border-l-4 border-caramel bg-caramel/15 p-2 text-left">
          <span className="block font-sans text-[15px] text-paper underline-offset-4 decoration-2 group-hover:underline">{action.title}</span>
          <span className="mt-0.5 block break-all font-talk text-[11px] leading-snug text-bone">{action.text}</span>
        </button>
        {err && <p className="mt-2 text-sm text-coral">{err}</p>}
      </div>
    );
  }

  const option = (t: "browser" | "folder", title: string, text: string, disabled = false) => (
    <button onClick={() => use(t)} disabled={disabled || busy}
      className={cn("block w-full rounded-md border-2 px-3 py-2 text-left disabled:opacity-40",
        loc?.kind === t ? "border-caramel" : "border-ink-line hover:border-bone")}>
      <span className="block font-sans text-paper">{title}{loc?.kind === t && <span className="ml-2 text-sm text-caramel">in use</span>}</span>
      <span className="block text-sm text-bone">{text}</span>
    </button>
  );

  return (
    <div className="flex items-end gap-1 px-4 py-4">
      <Popover open={open} onOpenChange={setOpen} side="top" align="start" className="w-md" trigger={
        <button className="group min-w-0 flex-1 rounded-sm p-2 text-left" title="Change the data folder">
          <span className="block font-sans text-[15px] text-bone underline-offset-4 decoration-2 group-hover:text-paper group-hover:underline">Data folder</span>
          <span className="mt-0.5 block break-all font-talk text-[11px] leading-snug text-taupe">{loc?.label || "…"}</span>
        </button>
      }>
        <p className="mb-2 font-sans text-lg text-paper">Data folder</p>
        {!STATIC ? (
          <>
            <p className="mb-3 text-sm text-bone">
              The story vault. All tools share it and keep their files in its <code>{TOOLS_DIR}</code> folder (hidden in Obsidian, synced by git).
              Pick it with <b>Browse…</b> or type a path (<code>~</code> works). If it has no tool data yet, the current data is copied there.
            </p>
            <div className="flex gap-2">
              <input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === "Enter" && saveDir()} autoFocus disabled={busy}
                className="h-9 min-w-0 flex-1 rounded-md border-2 border-ink-line bg-ink px-2 font-talk text-sm text-paper focus:border-caramel focus:outline-hidden disabled:opacity-40" />
              <Button size="sm" className="h-9 shrink-0" onClick={chooseDir} disabled={busy}>Browse…</Button>
            </div>
            {busy && <p className="mt-2 text-sm text-bone">Pick a folder in the dialog that opened.</p>}
          </>
        ) : (
          <div className="space-y-2">
            {option("folder", "The story folder",
              folderSupported ? `Pick the vault once; every tool keeps its files in its ${TOOLS_DIR} folder. If that has no tool data yet, the current data is copied there.`
                : "Needs Chrome, Edge or another Chromium browser.", !folderSupported)}
            {option("browser", "This browser", "Kept in this browser's storage, without the vault's scene files. Export now and then: clearing site data deletes it.")}
          </div>
        )}
        {err && <p className="mt-2 text-sm text-coral">{err}</p>}
        <div className="mt-3 flex items-center gap-3">
          <span className="flex-1" />
          {!STATIC ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" variant="primary" className="px-3" onClick={saveDir} disabled={busy}>Use this folder</Button>
            </>
          ) : <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>}
        </div>
      </Popover>
      <Button size="icon" variant="ghost" onClick={onReload} title={loc?.kind === "browser" ? "Reload" : "Reload from disk (e.g. after git pull)"} className="mb-2">
        <RefreshCw className="h-4 w-4" />
      </Button>
    </div>
  );
}

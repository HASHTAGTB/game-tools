import * as Popover from "@radix-ui/react-popover";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { folderSupported, pickDataDir, reconnectFolder, setDataDir, STATIC, switchTo, type Location } from "../lib/store";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { popoverCls } from "./ui/confirm";

type Props = {
  loc: Location | null;
  onChanged: (msg: string) => void; onReload: () => void;
};

const msgOf = (e: unknown) => String(e instanceof Error ? e.message : e);

/** Sidebar footer: where characters are saved. */
export function SaveLocation({ loc, onChanged, onReload }: Props) {
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
  const copiedNote = (n: number) => (n ? ` (copied ${n} character${n > 1 ? "s" : ""} there)` : "");

  const useDir = async (d: string) => { const r = await setDataDir(d); return `Saving to ${r.dataDir}${copiedNote(r.copied)}`; };
  const saveDir = () => run(() => useDir(value));
  const chooseDir = () => run(async () => {
    const picked = await pickDataDir();
    return picked ? useDir(picked) : null;   // null: dialog closed
  });
  const use = (t: "browser" | "folder") => run(async () => { const r = await switchTo(t); return r && `Saving to ${r.label}${copiedNote(r.copied)}`; });

  if (loc && !loc.ready) {
    return (
      <div className="px-4 py-4">
        <button onClick={() => reconnectFolder().then(onReload, e => onChanged(msgOf(e)))}
          className="group w-full rounded border-l-4 border-caramel bg-caramel/15 p-2 text-left">
          <span className="block font-sans text-[15px] text-paper underline-offset-4 decoration-2 group-hover:underline">Allow folder access</span>
          <span className="mt-0.5 block break-all font-talk text-[11px] leading-snug text-bone">{loc.label}: the browser asks again after a restart.</span>
        </button>
      </div>
    );
  }

  const option = (t: "browser" | "folder", title: string, text: string, disabled = false) => (
    <button onClick={() => use(t)} disabled={disabled}
      className={cn("block w-full rounded-md border-2 px-3 py-2 text-left disabled:opacity-40",
        loc?.kind === t ? "border-caramel" : "border-ink-line hover:border-bone")}>
      <span className="block font-sans text-paper">{title}{loc?.kind === t && <span className="ml-2 text-sm text-caramel">in use</span>}</span>
      <span className="block text-sm text-bone">{text}</span>
    </button>
  );

  return (
    <div className="flex items-end gap-1 px-4 py-4">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button className="group min-w-0 flex-1 rounded p-2 text-left" title="Change save location">
            <span className="block font-sans text-[15px] text-bone underline-offset-4 decoration-2 group-hover:text-paper group-hover:underline">Save location</span>
            <span className="mt-0.5 block break-all font-talk text-[11px] leading-snug text-taupe">{loc?.label || "…"}</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="top" align="start" sideOffset={6} className={`${popoverCls} w-[28rem]`}>
            <p className="mb-2 font-sans text-lg text-paper">Save location</p>
            {!STATIC ? (
              <>
                <p className="mb-3 text-sm text-bone">
                  Folder for the character files (<code>&lt;id&gt;.json</code>). Pick one with <b>Browse…</b> or type a path (<code>~</code> works).
                  If it doesn't exist or holds no characters yet, the current characters are copied there. Otherwise its characters are loaded.
                </p>
                <div className="flex gap-2">
                  <input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === "Enter" && saveDir()} autoFocus disabled={busy}
                    className="h-9 min-w-0 flex-1 rounded-md border-2 border-ink-line bg-ink px-2 font-talk text-sm text-paper focus:border-caramel focus:outline-none disabled:opacity-40" />
                  <Button size="sm" className="h-9 shrink-0" onClick={chooseDir} disabled={busy}>Browse…</Button>
                </div>
                {busy && <p className="mt-2 text-sm text-bone">Pick a folder in the dialog that opened.</p>}
              </>
            ) : (
              <div className="space-y-2">
                {option("browser", "This browser", "Kept in this browser's storage. Export now and then: clearing site data deletes it.")}
                {option("folder", "A folder on disk",
                  folderSupported ? "One <id>.json per character, e.g. a folder you keep in git. If it's empty the current characters are copied there."
                    : "Needs Chrome, Edge or another Chromium browser.", !folderSupported)}
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
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <Button size="icon" variant="ghost" onClick={onReload} title={loc?.kind === "browser" ? "Reload characters" : "Reload characters from disk (e.g. after git pull)"} className="mb-2">
        <RefreshCw className="h-4 w-4" />
      </Button>
    </div>
  );
}

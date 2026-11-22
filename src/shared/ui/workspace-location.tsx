import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { folderSupported, STATIC } from "@/shared/lib/env";
import { cn } from "@/shared/lib/utils";
import { disconnect, getConfig } from "@/shared/lib/github";
import {
  pickServerRoot, reconnectFolder, refreshLocation, setServerRoot, switchTo, switchToGitHub, TOOLS_DIR, type Location,
} from "@/shared/lib/workspace";
import { Button } from "./button";
import { GitHubSave, usePendingPaths } from "./github-save";
import { Popover } from "./popover";

type Props = {
  loc: Location | null;
  /** The location changed (or failed to); `msg` says what happened. The tool should reload its data. */
  onChanged: (msg: string) => void;
  onReload: () => void;
  /** Write the tool's in-memory edits out now (before a GitHub save). */
  onFlush: () => Promise<void>;
};

const msgOf = (e: unknown) => String(e instanceof Error ? e.message : e);
const copiedNote = (n: number) => (n ? ` (copied ${n} file${n > 1 ? "s" : ""} there)` : "");

/** Sidebar footer shared by every tool: the one folder all tools keep their data in (normally the story vault). */
export function WorkspaceLocation({ loc, onChanged, onReload: reloadTool, onFlush }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [gh, setGh] = useState({ repo: "", branch: "", token: "", login: "", show: false });
  const pending = usePendingPaths();
  useEffect(() => { setValue(loc?.label ?? ""); setErr(""); }, [loc, open]);
  useEffect(() => {
    if (open) getConfig().then(c => setGh({ repo: c ? `${c.owner}/${c.repo}` : "", branch: c?.branch ?? "", token: "", login: c?.login ?? "", show: false }));
  }, [open, loc]);
  const onReload = () => { refreshLocation().catch(() => {}).finally(reloadTool); };

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
  const connectGitHub = () => run(async () => {
    await onFlush();
    const r = await switchToGitHub(gh.repo, gh.branch, gh.token);
    return `Using ${r.label}${r.copied ? ` (${r.copied} files copied there as unsaved changes)` : ""}`;
  });
  const disconnectGitHub = () => run(async () => {
    await onFlush();
    await switchTo("browser");   // copies the data over if this browser has none yet
    await disconnect();
    return "Disconnected from GitHub. Using this browser";
  });

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
    <>
    {loc?.kind === "github" && <GitHubSave onFlush={onFlush} onReload={reloadTool} />}
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
            {loc?.kind === "github" && !gh.show ? (
              <div className="rounded-md border-2 border-caramel px-3 py-2">
                <span className="block font-sans text-paper">GitHub<span className="ml-2 text-sm text-caramel">in use</span></span>
                <span className="block text-sm text-bone">
                  {gh.repo} ({gh.branch}){gh.login && <>, signed in as {gh.login}</>}. Edits wait in this browser until you click <b>Save to GitHub</b>.
                </span>
                <div className="mt-1 flex gap-3">
                  <Button size="sm" onClick={() => setGh(g => ({ ...g, show: true }))} disabled={busy}>Change…</Button>
                  <DisconnectButton pending={pending.length} busy={busy} onConfirm={disconnectGitHub} />
                </div>
              </div>
            ) : (
              <GitHubForm value={gh} busy={busy} onChange={v => setGh(g => ({ ...g, ...v }))} onConnect={connectGitHub}
                expanded={gh.show || loc?.kind === "github"} onExpand={() => setGh(g => ({ ...g, show: true }))} />
            )}
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
      <Button size="icon" variant="ghost" onClick={onReload} title={loc?.kind === "browser" ? "Reload" : loc?.kind === "github" ? "Reload from GitHub" : "Reload from disk (e.g. after git pull)"} className="mb-2">
        <RefreshCw className="h-4 w-4" />
      </Button>
    </div>
    </>
  );
}

const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";
const field = "h-9 min-w-0 w-full rounded-md border-2 border-ink-line bg-ink px-2 font-talk text-sm text-paper focus:border-caramel focus:outline-hidden disabled:opacity-40";

type GhForm = { repo: string; branch: string; token: string };

function GitHubForm({ value, busy, expanded, onChange, onConnect, onExpand }: {
  value: GhForm; busy: boolean; expanded: boolean; onChange: (v: Partial<GhForm>) => void; onConnect: () => void; onExpand: () => void;
}) {
  if (!expanded) return (
    <button onClick={onExpand} disabled={busy} className="block w-full rounded-md border-2 border-ink-line px-3 py-2 text-left hover:border-bone disabled:opacity-40">
      <span className="block font-sans text-paper">GitHub</span>
      <span className="block text-sm text-bone">The vault's repository, from any browser. Edits wait here until you save them as a commit.</span>
    </button>
  );
  const enter = (e: React.KeyboardEvent) => e.key === "Enter" && onConnect();
  return (
    <div className="space-y-2 rounded-md border-2 border-bone px-3 py-2">
      <span className="block font-sans text-paper">GitHub</span>
      <div className="flex gap-2">
        <input value={value.repo} onChange={e => onChange({ repo: e.target.value })} onKeyDown={enter} placeholder="owner/repository" aria-label="Repository" disabled={busy} autoFocus className={field} />
        <input value={value.branch} onChange={e => onChange({ branch: e.target.value })} onKeyDown={enter} placeholder="main" aria-label="Branch" disabled={busy} className={cn(field, "w-28 shrink-0")} />
      </div>
      <input value={value.token} onChange={e => onChange({ token: e.target.value })} onKeyDown={enter} type="password" autoComplete="off" placeholder="github_pat_…" aria-label="Token" disabled={busy} className={field} />
      <p className="text-sm text-bone">
        <a href={TOKEN_URL} target="_blank" rel="noreferrer" className="text-caramel underline underline-offset-2">Create a fine-grained token</a>{" "}
        for only this repository with <b>Contents: Read and write</b>. If the repository belongs to someone else's account, use a{" "}
        <a href="https://github.com/settings/tokens/new?scopes=repo&description=game-tools" target="_blank" rel="noreferrer" className="text-caramel underline underline-offset-2">classic token</a>{" "}
        with <b>repo</b> instead. It stays in this browser; disconnect on shared computers.
      </p>
      <div className="flex justify-end">
        <Button size="sm" variant="primary" className="px-3" onClick={onConnect} disabled={busy || !value.repo.trim() || !value.token.trim()}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </div>
  );
}

function DisconnectButton({ pending, busy, onConfirm }: { pending: number; busy: boolean; onConfirm: () => void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 3000); return () => clearTimeout(t); }, [sure]);
  return (
    <Button size="sm" variant="danger" disabled={busy} className={cn(sure && "text-coral")} onClick={() => (sure ? onConfirm() : setSure(true))}>
      {sure ? (pending ? `Discard ${pending} unsaved change${pending === 1 ? "" : "s"} and disconnect?` : "Really disconnect?") : "Disconnect"}
    </Button>
  );
}

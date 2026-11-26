import { useEffect } from "react";
import { BookOpen, Code, FilePlus, FolderPlus } from "lucide-react";
import { TOOLS } from "@/app/tools";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { Toasts } from "@/shared/ui/toasts";
import { ToolNav } from "@/shared/ui/tool-nav";
import { WorkspaceLocation } from "@/shared/ui/workspace-location";
import { Editor } from "./components/Editor";
import { VaultProvider } from "@/shared/vault/context";
import { FileTree } from "@/shared/vault/FileTree";
import { PathBar } from "@/shared/vault/PathBar";
import { useVaultUrl } from "@/shared/vault/url";
import { FormatBar } from "./components/FormatBar";
import { useNotes } from "./state";

const words = (s: string) => (s.match(/\S+/g) ?? []).length;

export default function Notes() {
  const s = useNotes();
  const { loc, ready, path, text, saved, rev, saving, conflict, error, notice, mode } = s;

  useVaultUrl(useNotes, "/notes");

  // Ctrl+S saves right away (the GitHub footer handles it itself, as a commit)
  useEffect(() => {
    if (loc?.kind === "github") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); useNotes.getState().flush(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loc?.kind]);

  // Ctrl+E switches Live Preview / Source, as in Obsidian
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        const st = useNotes.getState();
        st.setMode(st.mode === "live" ? "source" : "live");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const unsaved = !!saved && text !== saved.text;

  return (
    <VaultProvider store={useNotes}>
    <div className="grid h-screen grid-cols-[240px_minmax(0,1fr)] bg-ink text-paper xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r border-ink-line/60">
        <ToolNav current={TOOLS.notes} />
        <div className="flex items-center justify-between px-6 pb-2">
          <span className="font-sans text-base text-taupe">{loc?.name ?? "Vault"}</span>
          <span className="flex">
            <IconButton icon={FilePlus} size="sm" label="New note" disabled={!ready} onClick={() => s.create("")} />
            <IconButton icon={FolderPlus} size="sm" label="New folder" disabled={!ready} onClick={() => s.createFolder("")} />
          </span>
        </div>
        {s.busy && <p className="px-6 pb-2 font-talk text-xs text-caramel">{s.busy}</p>}
        <nav className="min-h-0 flex-1 overflow-y-auto"><FileTree /></nav>
        <WorkspaceLocation loc={loc} onChanged={s.reload} onFlush={s.flush} onRevert={s.revert}
          onReload={() => s.reload(loc?.kind === "github" ? "Reloaded from GitHub" : "Reloaded")} />
      </aside>

      <main className="relative flex min-h-0 flex-col">
        <Toasts className="bottom-6" items={[
          ...(error ? [{ id: "error", kind: "error" as const, text: error, onDismiss: () => s.setError(null) }] : []),
          ...(notice ? [{ id: "notice", kind: "notice" as const, text: notice, onDismiss: () => s.setNotice(null) }] : []),
        ]} />

        <PathBar>
          {path && <FormatBar />}
          {path && (
            <span className="shrink-0 font-talk text-xs text-taupe">
              {words(text)} words · {saving ? "Saving…" : unsaved ? "Unsaved" : loc?.kind === "github" ? "Staged" : "Saved"}
            </span>
          )}
          {path && (
            <IconButton icon={mode === "live" ? Code : BookOpen} size="sm" kbd="Ctrl+E" tooltipSide="bottom"
              label={mode === "live" ? "Show the Markdown source" : "Back to Live Preview"}
              onClick={() => s.setMode(mode === "live" ? "source" : "live")} />
          )}
        </PathBar>

        {conflict && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b-2 border-coral bg-coral/10 px-6 py-2.5 font-talk text-base">
            <span className="min-w-0 flex-1">
              This note was {conflict.theirs === null ? "deleted" : "changed"} somewhere else (Obsidian? git pull?) while you had unsaved edits.
            </span>
            <Button size="sm" onClick={() => s.resolveConflict("theirs")}>Load theirs</Button>
            <Button size="sm" variant="danger" onClick={() => s.resolveConflict("mine")}>Keep mine (overwrite)</Button>
          </div>
        )}

        {path ? (
          <div className="min-h-0 flex-1"><Editor path={path} text={text} rev={rev} mode={mode} onChange={s.type} onOpenLink={s.openLink} /></div>
        ) : (
          <div className="grid flex-1 place-items-center px-8 text-center">
            <div className="max-w-md space-y-3">
              <p className="font-sans text-xl font-light text-bone">
                {!ready ? (loc && !loc.ready ? "Pick the story folder at the bottom left." : "Loading…") : "No note open."}
              </p>
              {ready && <p className="font-talk text-sm text-taupe">Pick one on the left, or start a <button className="text-caramel underline underline-offset-4" onClick={() => s.create("")}>new note</button>.</p>}
            </div>
          </div>
        )}
      </main>
    </div>
    </VaultProvider>
  );
}

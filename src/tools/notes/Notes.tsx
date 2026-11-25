import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { BookOpen, Code, FilePlus, FolderPlus } from "lucide-react";
import { TOOLS } from "@/app/tools";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { Toasts } from "@/shared/ui/toasts";
import { ToolNav } from "@/shared/ui/tool-nav";
import { WorkspaceLocation } from "@/shared/ui/workspace-location";
import { Editor } from "./components/Editor";
import { FileTree } from "./components/FileTree";
import { PathBar } from "./components/PathBar";
import { useNotes } from "./state";

const words = (s: string) => (s.match(/\S+/g) ?? []).length;

const toUrl = (path: string | null) => (path ? path.replace(/\.md$/i, "") : "");
const fromUrl = (splat: string) => (splat ? splat + ".md" : null);

/** Keeps the address in step with the open note (/notes/CANON/01_Characters/Rin), both ways: opening a note adds a
 *  history entry, back/forward and typed addresses open the note. Renames, deletes and the like replace the entry. */
function useNoteUrl() {
  const splat = (useParams({ strict: false }) as { _splat?: string })._splat ?? "";
  const navigate = useNavigate();
  const ready = useNotes(s => s.ready);
  const path = useNotes(s => s.path);
  const opened = useNotes(s => s.opened);
  const seen = useRef(opened);
  const first = useRef(splat);

  const go = (p: string | null, replace: boolean) =>
    p ? navigate({ to: "/notes/$", params: { _splat: toUrl(p) }, replace }) : navigate({ to: "/notes", replace });

  useEffect(() => useNotes.getState().init(fromUrl(first.current)), []);

  // note → address
  useEffect(() => {
    const push = opened !== seen.current;
    seen.current = opened;
    if (!ready || toUrl(path) === splat) return;
    go(path, !push);
  }, [path, opened, ready]);   // eslint-disable-line react-hooks/exhaustive-deps

  // address → note
  useEffect(() => {
    if (!ready) return;
    const s = useNotes.getState();
    if (toUrl(s.path) === splat) return;
    const want = fromUrl(splat);
    if (!want) return void go(s.path, true);
    s.open(want).then(() => {
      const now = useNotes.getState().path;
      if (toUrl(now) !== splat) go(now, true);   // it didn't open (gone?): show what's open instead
    });
  }, [splat, ready]);   // eslint-disable-line react-hooks/exhaustive-deps
}

export default function Notes() {
  const s = useNotes();
  const { loc, ready, path, text, saved, rev, saving, conflict, error, notice, mode } = s;

  useNoteUrl();

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
  );
}

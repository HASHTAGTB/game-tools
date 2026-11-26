import { useEffect, useState } from "react";
import { Check, ClipboardCopy, Code, Download, FilePlus, FolderPlus, ScrollText } from "lucide-react";
import { TOOLS } from "@/app/tools";
import { copyText } from "@/shared/lib/clipboard";
import { useGame } from "@/shared/lib/game";
import { download } from "@/shared/lib/utils";
import { IconButton } from "@/shared/ui/icon-button";
import { ConflictBar, saveState, StatusToasts } from "@/shared/ui/status";
import { ToolNav } from "@/shared/ui/tool-nav";
import { WorkspaceLocation } from "@/shared/ui/workspace-location";
import { VaultProvider } from "@/shared/vault/context";
import { FileTree } from "@/shared/vault/FileTree";
import { PathBar } from "@/shared/vault/PathBar";
import { baseName } from "@/shared/vault/store";
import { useVaultUrl } from "@/shared/vault/url";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { SceneHeader } from "./components/SceneHeader";
import { TextBar } from "./components/boxes/TextTools";
import { labelOf } from "./lib/labels";
import { exportRpy, parseScript } from "./lib/script";
import { useSceneUi } from "./lib/ui";
import { useKnownLabels, useSceneIndex, useScenes } from "./state";

/** The scene editor: the vault's scenes written as a screenplay, saved as the Ren'Py the game runs. */
export default function Scenes() {
  const s = useScenes();
  const { loc, ready, path, text, saved, rev, saving, conflict, error, notice, mode } = s;
  const [copied, setCopied] = useState(false);

  useVaultUrl(useScenes, "/scenes");

  useEffect(() => {
    if (!ready) return;
    useGame.getState().load();
    useSceneIndex.getState().load().catch(() => {});   // tried again on the next change
  }, [ready, loc]);

  // the open scene's labels, as saved, for the other scenes' checks
  useEffect(() => { if (path && saved) useSceneIndex.getState().update(path, saved.text); }, [path, saved]);

  const labels = useKnownLabels();

  // Ctrl+S saves right away (the GitHub footer handles it itself, as a commit); Ctrl+E switches script / source
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "s" && useScenes.getState().loc?.kind !== "github") { e.preventDefault(); useScenes.getState().flush(); }
      if (k === "e") { e.preventDefault(); const st = useScenes.getState(); st.setMode(st.mode === "live" ? "source" : "live"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const unsaved = !!saved && text !== saved.text;
  const label = useSceneUi(u => (u.script ? labelOf(u.script) : null));
  const fileName = path ? baseName(path) : "";

  const copy = async () => {
    await copyText(exportRpy(useScenes.getState().text));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const downloadRpy = () => {
    const t = useScenes.getState().text;
    download(`${labelOf(parseScript(t)) ?? fileName}.rpy`, exportRpy(t));
  };

  return (
    <VaultProvider store={useScenes}>
      <div className="grid h-screen grid-cols-[240px_minmax(0,1fr)] bg-ink text-paper lg:grid-cols-[240px_minmax(0,1fr)_340px] xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <aside className="flex min-h-0 flex-col border-r border-ink-line/60">
          <ToolNav current={TOOLS.scenes} />
          <div className="flex items-center justify-between px-6 pb-2">
            <span className="font-sans text-base text-taupe">Scenes</span>
            <span className="flex">
              <IconButton icon={FilePlus} size="sm" label="New scene" disabled={!ready} onClick={() => s.create(useScenes.config.root)} />
              <IconButton icon={FolderPlus} size="sm" label="New folder" disabled={!ready} onClick={() => s.createFolder(useScenes.config.root)} />
            </span>
          </div>
          {s.busy && <p className="px-6 pb-2 font-talk text-xs text-caramel">{s.busy}</p>}
          <nav className="min-h-0 flex-1 overflow-y-auto"><FileTree /></nav>
          <WorkspaceLocation loc={loc} onChanged={s.reload} onFlush={s.flush} onRevert={s.revert}
            onReload={() => s.reload(loc?.kind === "github" ? "Reloaded from GitHub" : "Reloaded")} />
        </aside>

        <main className="relative flex min-h-0 flex-col">
          <StatusToasts className="bottom-6" error={error} notice={notice} setError={s.setError} setNotice={s.setNotice} />

          <PathBar rootLabel="Scenes">
            {path && mode === "live" && <TextBar />}
            {path && (
              <span className="shrink-0 font-talk text-xs text-taupe">
                {saveState({ saving, unsaved, github: loc?.kind === "github" })}
              </span>
            )}
            {path && (
              <span className="flex shrink-0">
                <IconButton icon={copied ? Check : ClipboardCopy} size="sm" tooltipSide="bottom" label="Copy the Ren'Py (for the game's scenes folder)" onClick={copy} />
                <IconButton icon={Download} size="sm" tooltipSide="bottom" label={`Download ${label ?? fileName}.rpy`} onClick={downloadRpy} />
                <IconButton icon={mode === "live" ? Code : ScrollText} size="sm" kbd="Ctrl+E" tooltipSide="bottom"
                  label={mode === "live" ? "Show the Ren'Py source" : "Back to the script view"}
                  onClick={() => s.setMode(mode === "live" ? "source" : "live")} />
              </span>
            )}
          </PathBar>

          <ConflictBar items={conflict ? [{ key: "scene", label: "This scene", deleted: conflict.theirs === null }] : []}
            onResolve={(_, keep) => s.resolveConflict(keep)} />

          {path && <SceneHeader text={text} fileName={fileName} />}

          {path ? (
            <div className="min-h-0 flex-1">
              <Editor path={path} text={text} rev={rev} mode={mode} labels={labels} fileName={fileName} onChange={s.type} />
            </div>
          ) : (
            <div className="grid flex-1 place-items-center px-8 text-center">
              <div className="max-w-md space-y-3">
                <p className="font-sans text-xl font-light text-bone">
                  {!ready ? (loc && !loc.ready ? "Pick the story folder at the bottom left." : "Loading…") : "No scene open."}
                </p>
                {ready && <p className="font-talk text-sm text-taupe">Pick one on the left, or start a <button className="text-caramel underline underline-offset-4" onClick={() => s.create(useScenes.config.root)}>new scene</button>.</p>}
              </div>
            </div>
          )}
        </main>

        <div className="hidden min-h-0 lg:flex lg:flex-col">{path && <Preview />}</div>
      </div>
    </VaultProvider>
  );
}

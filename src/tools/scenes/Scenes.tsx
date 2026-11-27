import { useEffect } from "react";
import { Check, ClipboardCopy, Code, Download, FilePlus, ScrollText } from "lucide-react";
import { TOOLS } from "@/app/tools";
import { useGame } from "@/shared/lib/game";
import { useHotkeys } from "@/shared/lib/hotkeys";
import { download } from "@/shared/lib/utils";
import { HelpButton, type Gesture } from "@/shared/ui/help";
import { IconButton } from "@/shared/ui/icon-button";
import { MenuGroup } from "@/shared/ui/menu";
import { SaveState } from "@/shared/ui/status";
import { EmptyState, HintLink, NotReady, ToolPage } from "@/shared/ui/tool-page";
import { useCopy } from "@/shared/ui/use-copy";
import { VaultProvider } from "@/shared/vault/context";
import { PathBar } from "@/shared/vault/PathBar";
import { baseName } from "@/shared/vault/store";
import { useVaultUrl } from "@/shared/vault/url";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { SceneHeader } from "./components/SceneHeader";
import { SceneList } from "./components/SceneList";
import { TextBar } from "./components/boxes/TextTools";
import { readInfo } from "./lib/header";
import { createScene, useChapters, useKnownLabels, useSceneIndex, useScenes } from "./state";

const HELP: Gesture[] = [
  ["Click the scene's name", "Find a scene by name"],
  ["Right-click the list", "New scene, rename, duplicate, delete"],
  ["Drag a scene onto a chapter", "Put it in that chapter (onto dev: into the dev folder)"],
  ["Double-click a scene", "Rename it"],
  ["[Enter]", "Split the line at the caret"],
  ["[Shift] [Enter]", "A line break inside the line"],
  ["[Ctrl] [Enter]", "A new box after this one"],
  ["[Enter] or [/] on an empty line", "Add something else: a card, a choice, a chat…"],
  ["[Tab] · [Shift] [Tab]", "Next or previous speaker"],
  ["Type {", "Text effects: pauses, waits, speed"],
  ["[Ctrl] + scroll on a mark", "Step a pause or a speed by 0.05"],
  ["[Alt] [↑] · [Alt] [↓]", "Move the box up or down"],
  ["[Ctrl] [Z] · [Ctrl] [Shift] [Z]", "Undo · redo (the whole file)"],
  ["[Ctrl] [E]", "The script view or the Ren'Py source"],
  ["[Ctrl] [S]", "Save now (on GitHub: save as a commit)"],
];

/** The scene editor: the game's scene files (.rpy) written as a screenplay, saved as the Ren'Py the game runs. */
export default function Scenes() {
  const s = useScenes();
  const { loc, ready, path, text, saved, rev, saving, conflict, mode } = s;
  const [copied, copy] = useCopy();

  useVaultUrl(useScenes, "/scenes");

  useEffect(() => {
    if (!ready) return;
    useGame.getState().load();
    useChapters.getState().load();
    useSceneIndex.getState().load().catch(() => {});   // tried again on the next change
  }, [ready, loc]);

  // the open scene's labels, as saved, for the other scenes' checks
  useEffect(() => { if (path && saved) useSceneIndex.getState().update(path, saved.text); }, [path, saved]);

  const labels = useKnownLabels();

  // the script view or the Ren'Py source
  useHotkeys({ "mod+e": () => s.setMode(useScenes.getState().mode === "live" ? "source" : "live") });

  const unsaved = !!saved && text !== saved.text;
  const fileName = path ? baseName(path) : "";
  const title = readInfo(text).title || fileName;

  const downloadRpy = () => download(`${fileName}.rpy`, useScenes.getState().text);

  return (
    <VaultProvider store={useScenes}>
      <ToolPage tool={TOOLS.scenes} data={s}
        sidebar={<>
          <MenuGroup className="px-6" title="By chapter"
            actions={<IconButton icon={FilePlus} size="sm" label="New scene" disabled={!ready} onClick={createScene} />}>
            {s.busy && <p className="pb-2 font-talk text-xs text-caramel">{s.busy}</p>}
          </MenuGroup>
          <SceneList />
        </>}
        bar={
          <PathBar rootLabel="Scenes" title={title}>
            {path && mode === "live" && <TextBar />}
            {path && (
              <span className="shrink-0 font-talk text-xs text-taupe">
                <SaveState saving={saving} unsaved={unsaved} github={loc?.kind === "github"} />
              </span>
            )}
            {path && (
              <span className="flex shrink-0">
                <IconButton icon={copied ? Check : ClipboardCopy} size="sm" tooltipSide="bottom" label={copied ? "Copied" : "Copy the Ren'Py"}
                  onClick={() => copy(useScenes.getState().text)} />
                <IconButton icon={Download} size="sm" tooltipSide="bottom" label={`Download ${fileName}.rpy`} onClick={downloadRpy} />
                <IconButton icon={mode === "live" ? Code : ScrollText} size="sm" kbd="Ctrl+E" tooltipSide="bottom"
                  label={mode === "live" ? "Show the Ren'Py source" : "Back to the script view"}
                  onClick={() => s.setMode(mode === "live" ? "source" : "live")} />
              </span>
            )}
            <HelpButton items={HELP} />
          </PathBar>
        }
        conflicts={conflict ? [{ key: "scene", label: "This scene", deleted: conflict.theirs === null }] : []}
        onResolve={(_, keep) => s.resolveConflict(keep)}
        // a fragment, so the column stays while no scene is open
        aside={<>{path && <Preview />}</>}>
        {path && <SceneHeader text={text} title={title} />}
        {path ? (
          <div className="min-h-0 flex-1">
            <Editor path={path} text={text} rev={rev} mode={mode} labels={labels} title={title} onChange={s.type} />
          </div>
        ) : !ready ? <NotReady loc={loc} /> : (
          <EmptyState title="No scene open.">
            Pick one on the left, or start a <HintLink onClick={createScene}>new scene</HintLink>.
          </EmptyState>
        )}
      </ToolPage>
    </VaultProvider>
  );
}

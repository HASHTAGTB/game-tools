import { useEffect } from "react";
import { Check, ClipboardCopy, Code, Download, FilePlus, ScrollText } from "lucide-react";
import { TOOLS } from "@/app/tools";
import { useGame } from "@/shared/lib/game";
import { usePick } from "@/shared/lib/usePick";
import { download } from "@/shared/lib/utils";
import type { Gesture } from "@/shared/ui/help";
import { IconButton } from "@/shared/ui/icon-button";
import { useCopy } from "@/shared/ui/use-copy";
import { baseName } from "@/shared/vault/store";
import { VaultToolPage } from "@/shared/vault/VaultToolPage";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { SceneHeader } from "./components/SceneHeader";
import { SceneList } from "./components/SceneList";
import { TextBar } from "./components/boxes/TextTools";
import { readInfo } from "./lib/header";
import { createScene, useChapters, useChatHistory, useKnownLabels, useSceneIndex, useScenes } from "./state";

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
  const { loc, ready, path, mode } = usePick(useScenes, "loc", "ready", "path", "mode");
  const [copied, copy] = useCopy();

  useEffect(() => {
    if (!ready) return;
    useGame.getState().fresh();
    useChapters.getState().load();
    useSceneIndex.getState().load().catch(() => {});   // tried again on the next change
  }, [ready, loc]);

  const labels = useKnownLabels();
  const history = useChatHistory(path);

  const fileName = path ? baseName(path) : "";
  const title = useScenes(st => readInfo(st.text).title) || fileName;

  return (
    <VaultToolPage store={useScenes} tool={TOOLS.scenes} url="/scenes" help={HELP} onCreate={createScene}
      sidebar={{
        title: "By chapter", list: <SceneList />,
        actions: <IconButton icon={FilePlus} size="sm" label="New scene" disabled={!ready} onClick={createScene} />,
      }}
      rootLabel="Scenes" title={title}
      tools={mode === "live" && <TextBar />}
      actions={<>
        <IconButton icon={copied ? Check : ClipboardCopy} size="sm" tooltipSide="bottom" label={copied ? "Copied" : "Copy the Ren'Py"}
          onClick={() => copy(useScenes.getState().text)} />
        <IconButton icon={Download} size="sm" tooltipSide="bottom" label={`Download ${fileName}.rpy`}
          onClick={() => download(`${fileName}.rpy`, useScenes.getState().text)} />
      </>}
      modes={{ source: { icon: Code, label: "Show the Ren'Py source" }, live: { icon: ScrollText, label: "Back to the script view" } }}
      asideTitle="Preview" aside={<Preview />}
      header={<SceneHeader title={title} />}
      editor={<Editor mode={mode} labels={labels} title={title} history={history} />} />
  );
}

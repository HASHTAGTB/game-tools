import { BookOpen, Code, FilePlus, FolderPlus } from "lucide-react";
import { TOOLS } from "@/app/tools";
import { usePick } from "@/shared/lib/usePick";
import type { Gesture } from "@/shared/ui/help";
import { IconButton } from "@/shared/ui/icon-button";
import { FileTree } from "@/shared/vault/FileTree";
import { VaultToolPage } from "@/shared/vault/VaultToolPage";
import { Editor } from "./components/Editor";
import { FormatBar } from "./components/FormatBar";
import { useNotes } from "./state";

const HELP: Gesture[] = [
  ["Click the note's name", "Find a note by name (Enter opens it)"],
  ["Click a folder in the path", "What's in it"],
  ["Right-click the tree", "New note or folder, rename, duplicate, delete"],
  ["Drag a note or folder", "Move it into another folder"],
  ["Double-click a note", "Rename it"],
  ["Type [[", "Link to another note"],
  ["[Ctrl] [B] · [Ctrl] [I]", "Bold · italic"],
  ["[Ctrl] [E]", "Live Preview or the Markdown source"],
  ["[Ctrl] [S]", "Save now (on GitHub: save as a commit)"],
];

export default function Notes() {
  const { loc, ready, mode, create, createFolder, openLink } = usePick(useNotes, "loc", "ready", "mode", "create", "createFolder", "openLink");
  return (
    <VaultToolPage store={useNotes} tool={TOOLS.notes} url="/notes" help={HELP} onCreate={() => create("")}
      sidebar={{
        title: loc?.name ?? "Vault", list: <FileTree />,
        actions: <>
          <IconButton icon={FilePlus} size="sm" label="New note" disabled={!ready} onClick={() => create("")} />
          <IconButton icon={FolderPlus} size="sm" label="New folder" disabled={!ready} onClick={() => createFolder("")} />
        </>,
      }}
      tools={<FormatBar />} words
      // Live Preview / Source, as in Obsidian
      modes={{ source: { icon: Code, label: "Show the Markdown source" }, live: { icon: BookOpen, label: "Back to Live Preview" } }}
      editor={<Editor mode={mode} onOpenLink={openLink} />} />
  );
}

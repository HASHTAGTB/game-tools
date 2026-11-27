import { BookOpen, Code, FilePlus, FolderPlus } from "lucide-react";
import { TOOLS } from "@/app/tools";
import { useHotkeys } from "@/shared/lib/hotkeys";
import { HelpButton, type Gesture } from "@/shared/ui/help";
import { IconButton } from "@/shared/ui/icon-button";
import { MenuGroup } from "@/shared/ui/menu";
import { EmptyState, HintLink, NotReady, ToolPage } from "@/shared/ui/tool-page";
import { Editor } from "./components/Editor";
import { VaultProvider } from "@/shared/vault/context";
import { DocStatus } from "@/shared/vault/DocStatus";
import { FileTree } from "@/shared/vault/FileTree";
import { PathBar } from "@/shared/vault/PathBar";
import { useVaultPick } from "@/shared/vault/store";
import { useVaultUrl } from "@/shared/vault/url";
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
  // not the text: the editor and DocStatus follow that themselves
  const s = useVaultPick(useNotes, "loc", "ready", "path", "conflict", "mode", "busy", "error", "notice",
    "setError", "setNotice", "reload", "flush", "revert", "create", "createFolder", "setMode", "resolveConflict", "openLink");
  const { loc, ready, path, conflict, mode } = s;

  useVaultUrl(useNotes, "/notes");
  // Live Preview / Source, as in Obsidian
  useHotkeys({ "mod+e": () => s.setMode(useNotes.getState().mode === "live" ? "source" : "live") });

  return (
    <VaultProvider store={useNotes}>
      <ToolPage tool={TOOLS.notes} data={s}
        sidebar={<>
          <MenuGroup className="px-6" title={loc?.name ?? "Vault"} actions={<>
            <IconButton icon={FilePlus} size="sm" label="New note" disabled={!ready} onClick={() => s.create("")} />
            <IconButton icon={FolderPlus} size="sm" label="New folder" disabled={!ready} onClick={() => s.createFolder("")} />
          </>}>
            {s.busy && <p className="pb-2 font-talk text-xs text-caramel">{s.busy}</p>}
          </MenuGroup>
          <FileTree />
        </>}
        bar={
          <PathBar>
            {path && <FormatBar />}
            {path && <DocStatus words />}
            {path && (
              <IconButton icon={mode === "live" ? Code : BookOpen} size="sm" kbd="Ctrl+E" tooltipSide="bottom"
                label={mode === "live" ? "Show the Markdown source" : "Back to Live Preview"}
                onClick={() => s.setMode(mode === "live" ? "source" : "live")} />
            )}
            <HelpButton items={HELP} />
          </PathBar>
        }
        conflicts={conflict ? [{ key: "note", label: "This note", deleted: conflict.theirs === null }] : []}
        onResolve={(_, keep) => s.resolveConflict(keep)}>
        {path ? (
          <div className="min-h-0 flex-1"><Editor mode={mode} onOpenLink={s.openLink} /></div>
        ) : !ready ? <NotReady loc={loc} /> : (
          <EmptyState title="No note open.">
            Pick one on the left, or start a <HintLink onClick={() => s.create("")}>new note</HintLink>.
          </EmptyState>
        )}
      </ToolPage>
    </VaultProvider>
  );
}

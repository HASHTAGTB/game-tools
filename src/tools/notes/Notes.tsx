import { BookOpen, Code, FilePlus, FolderPlus } from "lucide-react";
import { TOOLS } from "@/app/tools";
import { useHotkeys } from "@/shared/lib/hotkeys";
import { HelpButton, type Gesture } from "@/shared/ui/help";
import { IconButton } from "@/shared/ui/icon-button";
import { MenuGroup } from "@/shared/ui/menu";
import { SaveState } from "@/shared/ui/status";
import { EmptyState, HintLink, NotReady, ToolPage } from "@/shared/ui/tool-page";
import { Editor } from "./components/Editor";
import { VaultProvider } from "@/shared/vault/context";
import { FileTree } from "@/shared/vault/FileTree";
import { PathBar } from "@/shared/vault/PathBar";
import { useVaultUrl } from "@/shared/vault/url";
import { FormatBar } from "./components/FormatBar";
import { useNotes } from "./state";

const words = (s: string) => (s.match(/\S+/g) ?? []).length;

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
  const s = useNotes();
  const { loc, ready, path, text, saved, rev, saving, conflict, mode } = s;

  useVaultUrl(useNotes, "/notes");
  // Live Preview / Source, as in Obsidian
  useHotkeys({ "mod+e": () => s.setMode(useNotes.getState().mode === "live" ? "source" : "live") });

  const unsaved = !!saved && text !== saved.text;

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
            {path && (
              <span className="shrink-0 font-talk text-xs text-taupe">
                {words(text)} words · <SaveState saving={saving} unsaved={unsaved} github={loc?.kind === "github"} />
              </span>
            )}
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
          <div className="min-h-0 flex-1"><Editor path={path} text={text} rev={rev} mode={mode} onChange={s.type} onOpenLink={s.openLink} /></div>
        ) : !ready ? <NotReady loc={loc} /> : (
          <EmptyState title="No note open.">
            Pick one on the left, or start a <HintLink onClick={() => s.create("")}>new note</HintLink>.
          </EmptyState>
        )}
      </ToolPage>
    </VaultProvider>
  );
}

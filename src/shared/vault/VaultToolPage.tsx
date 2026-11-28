import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ToolInfo } from "@/app/tools";
import { useHotkeys } from "@/shared/lib/hotkeys";
import { usePick } from "@/shared/lib/usePick";
import { HelpButton, type Gesture } from "@/shared/ui/help";
import { IconButton } from "@/shared/ui/icon-button";
import { MenuGroup } from "@/shared/ui/menu";
import { EmptyState, HintLink, NotReady, ToolPage } from "@/shared/ui/tool-page";
import { VaultProvider } from "./context";
import { DocStatus } from "./DocStatus";
import { PathBar } from "./PathBar";
import type { Mode, VaultStore } from "./store";
import { useVaultUrl } from "./url";

/** A button for one of the two editor modes: what it shows while the other mode is on. */
type ModeButton = { icon: LucideIcon; label: string };

type Props = {
  store: VaultStore;
  tool: ToolInfo;
  url: "/notes" | "/scenes";
  /** the sidebar: a title over the tree or list, with its actions */
  sidebar: { title: ReactNode; actions: ReactNode; list: ReactNode };
  /** the path bar's first crumb, and the open file's name there (its file name if left out) */
  rootLabel?: string;
  title?: string;
  /** in the bar while a file is open: tools before the save status, actions after it (before the mode button) */
  tools?: ReactNode;
  actions?: ReactNode;
  /** the save status counts words */
  words?: boolean;
  /** the buttons that switch to the source view (`source`) and back (`live`); Ctrl+E does too */
  modes: { source: ModeButton; live: ModeButton };
  help: Gesture[];
  /** starts a new file (the empty page links to it) */
  onCreate: () => void;
  /** above the editor while a file is open */
  header?: ReactNode;
  /** the editor, while a file is open */
  editor: ReactNode;
  asideTitle?: ReactNode;
  /** the right column; it stays while no file is open */
  aside?: ReactNode;
};

/** The page of a tool that edits a vault store's files (Notes, Scenes): the tree or list on the left, the path bar with
 *  the save status and the mode switch on top, the open file's editor, or why there's none. Ctrl+E switches modes. */
export function VaultToolPage(p: Props) {
  // not the text: the editor, the list and DocStatus follow that themselves
  const s = usePick(p.store, "loc", "ready", "path", "conflict", "mode", "busy", "error", "notice",
    "setError", "setNotice", "reload", "flush", "revert", "setMode", "resolveConflict", "conflictVersions");
  const { loc, ready, path, conflict, mode } = s;
  const other: Mode = mode === "live" ? "source" : "live";
  const { noun } = p.store.config;

  useVaultUrl(p.store, p.url);
  useHotkeys({ "mod+e": () => s.setMode(p.store.getState().mode === "live" ? "source" : "live") });

  const modeButton = p.modes[other];
  return (
    <VaultProvider store={p.store}>
      <ToolPage tool={p.tool} data={s}
        sidebar={<>
          <MenuGroup className="px-6" title={p.sidebar.title} actions={p.sidebar.actions}>
            {s.busy && <p className="pb-2 font-talk text-xs text-caramel">{s.busy}</p>}
          </MenuGroup>
          {p.sidebar.list}
        </>}
        bar={
          <PathBar rootLabel={p.rootLabel} title={p.title}>
            {path && p.tools}
            {path && <DocStatus words={p.words} />}
            {path && (
              <span className="flex shrink-0">
                {p.actions}
                <IconButton icon={modeButton.icon} size="sm" kbd="Ctrl+E" tooltipSide="bottom" label={modeButton.label} onClick={() => s.setMode(other)} />
              </span>
            )}
            <HelpButton items={p.help} />
          </PathBar>
        }
        conflicts={conflict ? [{ key: noun, label: `This ${noun}`, deleted: conflict.theirs === null, versions: s.conflictVersions }] : []}
        onResolve={(_, keep) => s.resolveConflict(keep)}
        asideTitle={p.asideTitle}
        // a fragment, so the column stays while no file is open
        aside={p.aside === undefined ? undefined : <>{path && p.aside}</>}>
        {path && p.header}
        {path ? <div className="min-h-0 flex-1">{p.editor}</div>
          : !ready ? <NotReady loc={loc} /> : (
            <EmptyState title={`No ${noun} open.`}>
              Pick one on the left, or start a <HintLink onClick={p.onCreate}>new {noun}</HintLink>.
            </EmptyState>
          )}
      </ToolPage>
    </VaultProvider>
  );
}

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { bloomRef } from "@/shared/ui/flair";
import { bloomCls } from "@/shared/ui/motion";
import { ContextMenu } from "@base-ui/react/context-menu";
import { ChevronRight, Copy, FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useRef, useState, type DragEvent, type MouseEvent } from "react";
import { cn, isUnder } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { undoNote } from "@/shared/ui/confirm";
import { ContextMenuItem as Item, ContextMenuSeparator } from "@/shared/ui/menu-item";
import { IconButton } from "@/shared/ui/icon-button";
import { AnimatePresence, m, spring } from "@/shared/ui/motion";
import { MenuMarker } from "@/shared/ui/menu";
import { MotionItem, MotionList } from "@/shared/ui/motion-list";
import { popoverCls } from "@/shared/ui/popover";
import { Rule } from "@/shared/ui/heading";
import { useVault } from "./context";
import { baseName, parentOf, type Node } from "./store";
import { DropRing, GroupRule, hoverOnly, hoverSlot, InlineRename, RowActions, useHoverOpen } from "./tree-parts";

const INDENT = 14;
/** Left padding of a top-level row. */
const BASE = 12;
/** Where the menu rule of rows at `depth` runs (each folder level has its own, under its folder's chevron). */
const ruleX = (depth: number) => BASE - INDENT + 6 + depth * INDENT;

/** The row (or the empty space: the vault itself) an event happened on. */
function nodeAt(target: EventTarget | null): Node | null {
  const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-path]");
  if (!el) return null;
  const path = el.dataset.path!;
  return { path, name: path.split("/").pop()!, kind: el.dataset.kind as Node["kind"] };
}
/** Where something dropped on `n` goes: into the folder, or next to the note; `root` for the empty space. */
const dropDirOf = (n: Node | null, root: string) => (!n ? root : n.kind === "directory" ? n.path : parentOf(n.path));

/** The vault's folders and notes, like Obsidian's file explorer. Folders are listed when first opened.
 *  Right-click for every action, drag rows onto folders to move them. */
export function FileTree() {
  const useStore = useVault();
  const { root: rootDir, noun } = useStore.config;
  const Noun = useStore.Noun;
  // what this draws, picked one by one: the rows pick their own, so typing in the editor redraws none of it
  const root = useStore(s => s.tree[rootDir]);
  const ready = useStore(s => s.ready);
  const busy = useStore(s => s.busy);
  const { create, createFolder, setRenaming, duplicate, move, toggle } = useStore.getState();
  /** What the context menu is for; null is the vault. */
  const [menuFor, setMenuFor] = useState<Node | null>(null);
  const [deleting, setDeleting] = useState<Node | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropDir, setDropDir] = useState<string | null>(null);
  const hoverOpen = useHoverOpen(toggle);

  if (!ready) return null;

  const canDrop = (dir: string) => !!dragging && dir !== parentOf(dragging) && !isUnder(dir, dragging);
  const onDragOver = (e: DragEvent) => {
    const n = nodeAt(e.target);
    const dir = dropDirOf(n, rootDir);
    if (!canDrop(dir)) { setDropDir(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropDir(dir);
    // hovering a closed folder for a moment opens it, so you can drop deeper
    hoverOpen.over(n?.kind === "directory" && !useStore.getState().expanded.has(n.path) ? n.path : null);
  };
  const endDrag = () => { setDragging(null); setDropDir(null); hoverOpen.reset(); };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const dir = dropDirOf(nodeAt(e.target), rootDir);
    if (dragging && canDrop(dir)) move(dragging, dir);
    endDrag();
  };

  const dir = menuFor?.kind === "directory" ? menuFor : null;
  const note = menuFor?.kind === "file" ? menuFor : null;
  const here = dir?.path ?? (note ? parentOf(note.path) : rootDir);
  const inHere = here !== rootDir ? ` in ${here.split("/").pop()}` : "";

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={<div />}
          className={cn("min-h-full pb-4 transition-colors", dropDir === rootDir && "bg-caramel/8")}
          onContextMenu={(e: MouseEvent) => setMenuFor(nodeAt(e.target))}
          onDragOver={onDragOver} onDrop={onDrop} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node)) setDropDir(null); }}>
          {!root ? <p className="px-6 font-talk text-sm text-taupe">Loading…</p>
            : !root.length ? <p className="px-6 font-talk text-sm text-taupe">No {noun}s here yet. Right-click for a new one.</p>
            : (
              // a row made, moved or renamed drops in, a deleted one crumples (rows of a folder just listed don't)
              <ul role="tree" aria-label={`${Noun}s`} className="relative">
                <MotionList>{root.map(n => <Row key={n.path} node={n} depth={0} dropDir={dropDir} dragging={dragging}
                  onDragStart={p => setDragging(p)} onDragEnd={endDrag} onDelete={setDeleting} />)}</MotionList>
              </ul>
            )}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner className="z-50">
            <ContextMenu.Popup className={cn(popoverCls, "min-w-48 p-1.5", bloomCls)}>
<div className="contents" ref={bloomRef}>
              {busy ? <p className="px-2.5 py-1.5 text-sm text-taupe">{busy}</p> : (
                <>
                  {note && <Item icon={Pencil} label="Rename" onClick={() => setRenaming(note.path)} />}
                  {note && <Item icon={Copy} label="Duplicate" onClick={() => duplicate(note.path)} />}
                  {note && <Item icon={Trash2} label="Delete…" danger onClick={() => setDeleting(note)} />}
                  {note && <ContextMenuSeparator />}
                  <Item icon={FilePlus} label={`New ${noun}${inHere}`} onClick={() => create(here)} />
                  <Item icon={FolderPlus} label={`New folder${inHere}`} onClick={() => createFolder(here)} />
                  {dir && <ContextMenuSeparator />}
                  {dir && <Item icon={Pencil} label="Rename folder" onClick={() => setRenaming(dir.path)} />}
                  {dir && <Item icon={Trash2} label="Delete folder…" danger onClick={() => setDeleting(dir)} />}
                </>
              )}
            </div>
</ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <DeleteDialog node={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

type RowProps = {
  node: Node; depth: number; dropDir: string | null; dragging: string | null;
  onDragStart: (path: string) => void; onDragEnd: () => void; onDelete: (n: Node) => void; ref?: React.Ref<HTMLLIElement>;
};

function Row({ node, depth, dropDir, dragging, onDragStart, onDragEnd, onDelete, ref }: RowProps) {
  const useStore = useVault();
  const isDir = node.kind === "directory";
  const isOpen = useStore(s => s.expanded.has(node.path));
  const active = useStore(s => s.path === node.path);
  const children = useStore(s => s.tree[node.path]);
  const renaming = useStore(s => s.renaming === node.path);
  /** the open note is directly in this folder */
  const holdsOpen = useStore(s => isDir && !!s.path && parentOf(s.path) === node.path);
  const { toggle, open: openNote, create, setRenaming, rename } = useStore.getState();
  const pad = { paddingLeft: BASE + depth * INDENT };
  const target = isDir && dropDir === node.path;

  return (
    <MotionItem ref={ref} role="treeitem" aria-expanded={isDir ? isOpen : undefined} aria-selected={active}>
      <div data-path={node.path} data-kind={node.kind}
        className={cn("group/row relative flex h-7 items-center pr-2", dragging && isUnder(node.path, dragging) && "opacity-40")}>
        {active && (
          // the signature moment: the marker slides along the menu rules to the note that was just opened
          <MenuMarker layoutId={`${useStore.config.noun}-marker`} className="z-10" style={{ left: ruleX(depth) - 1 }} />
        )}
        {target && <DropRing />}

        {renaming ? (
          <InlineRename value={baseName(node.path)} label={isDir ? "Folder name" : "Name"} onCommit={v => rename(node.path, v)} onCancel={() => setRenaming(null)}
            className={isDir ? "font-sans" : "font-talk"} style={{ paddingLeft: pad.paddingLeft + (isDir ? 0 : 18) }} />
        ) : (
          <button
            draggable
            onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", node.path); onDragStart(node.path); }}
            onDragEnd={onDragEnd}
            onClick={() => (isDir ? toggle(node.path) : openNote(node.path))}
            onDoubleClick={() => !isDir && setRenaming(node.path)}
            title={node.path}
            className={cn("relative flex h-full min-w-0 flex-1 items-center gap-1 text-left transition-colors",
              isDir ? "font-sans text-base text-bone hover:text-paper" : "font-talk text-base",
              !isDir && (active ? "text-paper" : "text-bone/75 hover:text-paper"))}
            style={pad}>
            {isDir && <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-taupe transition-transform duration-200", isOpen && "rotate-90")} strokeWidth={2.5} />}
            <span className={cn("truncate", !isDir && "pl-[18px]")}>{isDir ? node.name : baseName(node.path)}</span>
          </button>
        )}

        {!renaming && !dragging && (
          <span className={isDir ? hoverSlot : "contents"}>
            {isDir ? (
              <IconButton icon={FilePlus} size="sm" label={`New ${useStore.config.noun} here`} tooltipSide="right" className={hoverOnly} onClick={() => create(node.path)} />
            ) : <RowActions onRename={() => setRenaming(node.path)} onDelete={() => onDelete(node)} />}
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {isDir && isOpen && (
          <m.ul role="group" key="kids" className="relative overflow-hidden" transition={spring.smooth}
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {/* the menu rule, one per folder level; lights up while something can be dropped into this folder */}
            <GroupRule drop={target} holdsOpen={holdsOpen} style={{ left: ruleX(depth + 1) }} />
            {children === undefined
              ? <li className="h-7 font-talk text-sm leading-7 text-taupe" style={{ paddingLeft: BASE + (depth + 1) * INDENT + 18 }}>…</li>
              : children.length === 0
                ? <li className="h-7 font-talk text-sm italic leading-7 text-taupe" style={{ paddingLeft: BASE + (depth + 1) * INDENT + 18 }}>empty</li>
                : <MotionList>{children.map(c => <Row key={c.path} node={c} depth={depth + 1} dropDir={dropDir} dragging={dragging}
                    onDragStart={onDragStart} onDragEnd={onDragEnd} onDelete={onDelete} />)}</MotionList>}
          </m.ul>
        )}
      </AnimatePresence>
    </MotionItem>
  );
}

/** "Are you sure?" for notes and folders, as a dialog: it can be opened from the context menu, which has no anchor.
 *  `name`: what the file is called (its file name if not given); `what`: what breaks when it's gone. */
export function DeleteDialog({ node, onClose, name, what = "Links to it will stop working." }: {
  node: Node | null; onClose: () => void; name?: string; what?: string;
}) {
  const useStore = useVault();
  const loc = useStore(s => s.loc);
  const { remove, removeFolder } = useStore.getState();
  const last = useRef(node);
  if (node) last.current = node;
  const n = last.current;
  const isDir = n?.kind === "directory";
  return (
    <AlertDialog.Root open={!!node} onOpenChange={o => { if (!o) onClose(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Popup className={cn(popoverCls, "fixed left-1/2 top-1/3 z-50 w-96 -translate-x-1/2", bloomCls, "origin-center")}>
          <div className="mb-3">
            <AlertDialog.Title className="font-sans text-lg text-paper">{isDir ? `Delete the folder "${n?.name}"?` : `Delete "${name ?? (n ? baseName(n.path) : "")}"?`}</AlertDialog.Title>
            <Rule color="var(--color-coral)" short />
          </div>
          <AlertDialog.Description className="mb-4 text-sm text-bone">
            {isDir ? "Everything inside it goes too, images and other files included." : what}
            {" "}{undoNote(loc)}
          </AlertDialog.Description>
          <div className="flex justify-end gap-3">
            <AlertDialog.Close render={<Button size="sm" variant="ghost">Cancel</Button>} />
            <Button size="sm" variant="destructive"
              onClick={() => {
                if (n) (isDir ? removeFolder : remove)(n.path);
                onClose();
              }}>Delete</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

import { ContextMenu } from "@base-ui/react/context-menu";
import { bloomRef } from "@/shared/ui/flair";
import { bloomCls } from "@/shared/ui/motion";
import { ChevronRight, Copy, FilePlus, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState, type DragEvent, type MouseEvent } from "react";
import { useShallow } from "zustand/shallow";
import { cn, isUnder } from "@/shared/lib/utils";
import { ContextMenuItem as Item, ContextMenuSeparator } from "@/shared/ui/menu-item";
import { MenuMarker } from "@/shared/ui/menu";
import { AnimatePresence, m, spring } from "@/shared/ui/motion";
import { popoverCls } from "@/shared/ui/popover";
import { MotionItem, MotionList } from "@/shared/ui/motion-list";
import { DeleteDialog } from "@/shared/vault/FileTree";
import { DropRing, GroupRule, InlineRename, RowActions, useHoverOpen } from "@/shared/vault/tree-parts";
import { GAME_DIR, NEW_SCENE_DIR } from "@/shared/vault/places";
import { readInfo, type SceneInfo } from "../lib/header";
import { createScene, duplicateScene, moveScene, retitleScene, titleOf, useChapters, useSceneIndex, useScenes } from "../state";

const DEV_DIR = `${GAME_DIR}/dev`;

type Row = { path: string; title: string };
type Group = { id: string; name: string; rows: Row[] };

/** The chapter group a drag event is over. */
const groupAt = (target: EventTarget | null) => (target as HTMLElement | null)?.closest<HTMLElement>("[data-group]")?.dataset.group ?? null;

const byTitle = (a: Row, b: Row) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });

/** The scenes as one flat list, grouped by their timeline chapter (in the timeline's order); scenes without one go
 *  under "No chapter", dev/ files without one under "dev". Right-click or hover for the actions; drag a scene onto
 *  another group to put it in that chapter (onto "dev": into the dev/ folder). */
export function SceneList() {
  const files = useSceneIndex(i => i.files);
  const chapters = useChapters(c => c.list);
  const ready = useScenes(s => s.ready);
  const open = useScenes(s => s.path);
  const { setRenaming } = useScenes.getState();
  const [menuFor, setMenuFor] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<{ path: string; group: string } | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const toggle = (id: string) => setClosed(s => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  const hoverOpen = useHoverOpen(toggle);

  // the open scene from its live text, so a new title shows while typing (only its header: not on every keystroke)
  const openInfo = useScenes(useShallow(s => (s.path ? readInfo(s.text) : null)));

  const groups = useMemo(() => {
    if (!files) return null;
    const infoOf = (p: string): SceneInfo | undefined => (p === open && openInfo ? openInfo : files[p]?.info);
    const byChapter = new Map<string, Row[]>();
    for (const p of Object.keys(files)) {
      const info = infoOf(p);
      const id = info?.chapter || (isUnder(p, DEV_DIR) ? ":dev" : ":none");
      byChapter.set(id, [...(byChapter.get(id) ?? []), { path: p, title: titleOf(p, info) }]);
    }
    const out: Group[] = [];
    const take = (id: string, name: string) => { const rows = byChapter.get(id); if (rows) { out.push({ id, name, rows: rows.sort(byTitle) }); byChapter.delete(id); } };
    for (const c of chapters ?? []) take(c.id, c.name);
    // chapter ids the timeline doesn't have (yet): by their id
    for (const id of [...byChapter.keys()].filter(k => !k.startsWith(":")).sort()) take(id, id);
    take(":none", "No chapter");
    take(":dev", "dev");
    return out;
  }, [files, chapters, open, openInfo]);

  if (!ready) return null;
  const rowAt = (target: EventTarget | null): Row | null => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-path]");
    return el ? { path: el.dataset.path!, title: el.dataset.title! } : null;
  };

  const startDrag = (path: string, group: string) => setDragging({ path, group });
  const endDrag = () => { setDragging(null); setDropGroup(null); hoverOpen.reset(); };
  const onDragOver = (e: DragEvent) => {
    const g = groupAt(e.target);
    if (!dragging || !g || g === dragging.group) { setDropGroup(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropGroup(g);
    // hovering a closed group for a moment opens it
    hoverOpen.over(closed.has(g) ? g : null);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const g = groupAt(e.target);
    if (dragging && g && g !== dragging.group) {
      const p = dragging.path;
      if (g === ":dev") moveScene(p, "", DEV_DIR);
      else if (g === ":none") moveScene(p, "", isUnder(p, DEV_DIR) ? NEW_SCENE_DIR : undefined);
      else moveScene(p, g);
    }
    endDrag();
  };

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger render={<div />} className="min-h-full pb-4" onContextMenu={(e: MouseEvent) => setMenuFor(rowAt(e.target))}
          onDragOver={onDragOver} onDrop={onDrop} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node)) setDropGroup(null); }}>
          {!groups ? <p className="px-6 font-talk text-sm text-taupe">Loading…</p>
            : !groups.length ? <p className="px-6 font-talk text-sm text-taupe">No scenes yet. Right-click for a new one.</p>
            : (
              <ul aria-label="Scenes" className="relative">
                {groups.map(g => (
                  <li key={g.id} data-group={g.id}>
                    <button onClick={() => toggle(g.id)}
                      className="relative flex h-7 w-full items-center gap-1 pl-3 pr-2 text-left font-sans text-base text-bone transition-colors hover:text-paper">
                      {dropGroup === g.id && <DropRing />}
                      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-taupe transition-transform duration-200", !closed.has(g.id) && "rotate-90")} strokeWidth={2.5} />
                      <span className={cn("relative truncate", g.id.startsWith(":") && "italic text-taupe")}>{g.name}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {!closed.has(g.id) && (
                        <m.ul key="rows" className="relative overflow-hidden" transition={spring.smooth}
                          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                          <GroupRule drop={dropGroup === g.id} holdsOpen={g.rows.some(r => r.path === open)} style={{ left: 18 }} />
                          {/* a new scene drops in, a deleted one crumples, one moved to another chapter does both
                              (not when the timeline's chapters arrive and sort them all for the first time) */}
                          <MotionList reset={!!chapters}>{g.rows.map(r => <SceneRow key={r.path} row={r} active={r.path === open} onDelete={setDeleting}
                            dragging={dragging?.path === r.path ? "self" : dragging ? "other" : null}
                            onDragStart={() => startDrag(r.path, g.id)} onDragEnd={endDrag} />)}</MotionList>
                        </m.ul>
                      )}
                    </AnimatePresence>
                  </li>
                ))}
              </ul>
            )}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner className="z-50">
            <ContextMenu.Popup className={cn(popoverCls, "min-w-48 p-1.5", bloomCls)}>
<div className="contents" ref={bloomRef}>
              {menuFor && <Item icon={Pencil} label="Rename" onClick={() => setRenaming(menuFor.path)} />}
              {menuFor && <Item icon={Copy} label="Duplicate" onClick={() => duplicateScene(menuFor.path)} />}
              {menuFor && <Item icon={Trash2} label="Delete…" danger onClick={() => setDeleting(menuFor)} />}
              {menuFor && <ContextMenuSeparator />}
              <Item icon={FilePlus} label="New scene" onClick={createScene} />
            </div>
</ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <DeleteDialog node={deleting && { path: deleting.path, name: deleting.path.split("/").pop()!, kind: "file" }} name={deleting?.title}
        what="Jumps to its labels will stop working." onClose={() => setDeleting(null)} />
    </>
  );
}

type RowProps = {
  row: Row; active: boolean; onDelete: (r: Row) => void; ref?: React.Ref<HTMLLIElement>;
  dragging: "self" | "other" | null; onDragStart: () => void; onDragEnd: () => void;
};

function SceneRow({ row, active, onDelete, dragging, onDragStart, onDragEnd, ref }: RowProps) {
  const renaming = useScenes(s => s.renaming === row.path);
  const { open, setRenaming } = useScenes.getState();
  return (
    <MotionItem ref={ref} aria-current={active || undefined}>
      <div data-path={row.path} data-title={row.title} className={cn("group/row relative flex h-7 items-center pr-2", dragging === "self" && "opacity-40")}>
        {/* the signature moment: the marker slides along the rule to the scene that was just opened */}
        {active && <MenuMarker layoutId="scene-marker" className="z-10" style={{ left: 17 }} />}
        {renaming ? (
          // the scene's `## title:` line; the file keeps its name
          <InlineRename value={row.title} label="Title" className="font-talk" style={{ paddingLeft: 30 }}
            onCommit={v => (v !== row.title ? retitleScene(row.path, v) : setRenaming(null))} onCancel={() => setRenaming(null)} />
        ) : (
          <button draggable
            onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", row.path); onDragStart(); }}
            onDragEnd={onDragEnd}
            onClick={() => open(row.path)} onDoubleClick={() => setRenaming(row.path)} title={row.path.slice(GAME_DIR.length + 1)}
            className={cn("relative flex h-full min-w-0 flex-1 items-center pl-[30px] text-left font-talk text-base transition-colors",
              active ? "text-paper" : "text-bone/75 hover:text-paper")}>
            <span className="truncate">{row.title}</span>
          </button>
        )}
        {!renaming && !dragging && (
          <RowActions onRename={() => setRenaming(row.path)} onDelete={() => onDelete(row)} />
        )}
      </div>
    </MotionItem>
  );
}

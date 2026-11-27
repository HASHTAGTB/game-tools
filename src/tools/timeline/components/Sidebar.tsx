import { Pencil } from "lucide-react";
import { TOOLS } from "@/app/tools";
import { uniqueId } from "@/shared/lib/utils";
import { AddField } from "@/shared/ui/field";
import { MenuGroup, MenuItem, MenuRule } from "@/shared/ui/menu";
import { MotionFollow, MotionList } from "@/shared/ui/motion-list";
import { IconButton } from "@/shared/ui/icon-button";
import { ToolNav } from "@/shared/ui/tool-nav";
import { WorkspaceLocation } from "@/shared/ui/workspace-location";
import { visible } from "../lib/colors";
import { castOf, isFiltered, threadsOf } from "../lib/model";
import { nav } from "../lib/nav";
import { useTimelinePick } from "../state";
import { DEFAULT_COLOR } from "@/shared/lib/colors";

const PALETTE = ["#e86a92", "#7fae5a", "#e0b44a", "#6c8fd9", "#d9603b", "#4fb39b", "#c98bd6", "#c4956a"];

/** Like the game's menu: a vertical rule with text links. Characters and threads are focus toggles; the pencil edits. */
export function Sidebar() {
  const { doc, loc, loaded, filter, viewId, selection, select, edit, reload, flush, revert, setFilter } = useTimelinePick("doc", "loc", "loaded", "filter", "viewId", "selection", "select", "edit", "reload", "flush", "revert", "setFilter");
  const cast = castOf(doc.roster, doc.chapters);
  const threads = threadsOf(doc.threads, doc.chapters);
  const toggle = (key: "chars" | "threads", id: string) =>
    setFilter({ [key]: filter[key].includes(id) ? filter[key].filter(x => x !== id) : [...filter[key], id] }, null);
  const isSel = (kind: string, id: string) => selection?.kind === kind && selection.id === id;

  return (
    <aside className="flex min-h-0 flex-col border-r border-ink-line/60">
      <ToolNav current={TOOLS.timeline} />
      <nav className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 pb-4">
        <MenuGroup title="Views">
          <MenuRule>
            <MenuItem label="Everything" active={!isFiltered(filter) && !viewId} layoutId="view-marker"
              onClick={() => setFilter({ chars: [], threads: [], hideOthers: false }, null)} />
            <MotionList reset={loaded}>{doc.views.map(v => (
              <MenuItem key={v.id} label={v.name} active={viewId === v.id} layoutId="view-marker" editing={isSel("view", v.id)}
                onClick={() => setFilter(v, v.id)} actions={<EditButton label="Edit view" onClick={() => select({ kind: "view", id: v.id })} />} />
            ))}</MotionList>
          </MenuRule>
        </MenuGroup>

        <MenuGroup title="Characters" hint="Click to focus">
          <MenuRule>
            <MotionList reset={loaded}>{cast.map(c => (
              <MenuItem key={c.id} label={c.name} color={visible(c.color)} showIdle toggle active={filter.chars.includes(c.id)}
                faded={filter.chars.length > 0 && !filter.chars.includes(c.id)} editing={isSel("char", c.id)} onClick={() => toggle("chars", c.id)}
                actions={<EditButton label="Edit character" onClick={() => select({ kind: "char", id: c.id })} />} />
            ))}</MotionList>
          </MenuRule>
          <MotionFollow><AddField className="ml-4 mt-2" placeholder="New character" onAdd={n => {
            const id = uniqueId(n, cast.map(c => c.id));
            edit(d => { d.roster.push({ id, name: n, color: DEFAULT_COLOR }); });
            select({ kind: "char", id });
          }} /></MotionFollow>
        </MenuGroup>

        <MenuGroup title="Threads">
          <MenuRule>
            <MotionList reset={loaded}>{threads.map(t => (
              <MenuItem key={t.id} label={t.name} color={visible(t.color)} showIdle toggle active={filter.threads.includes(t.id)}
                faded={filter.threads.length > 0 && !filter.threads.includes(t.id)} editing={isSel("thread", t.id)} onClick={() => toggle("threads", t.id)}
                actions={<EditButton label="Edit thread" onClick={() => select({ kind: "thread", id: t.id })} />} />
            ))}</MotionList>
          </MenuRule>
          <MotionFollow><AddField className="ml-4 mt-2" placeholder="New thread (a storyline)" onAdd={n => {
            const id = uniqueId(n, threads.map(t => t.id));
            edit(d => { d.threads.push({ id, name: n, color: PALETTE[d.threads.length % PALETTE.length] }); });
            select({ kind: "thread", id });
          }} /></MotionFollow>
        </MenuGroup>

        <MenuGroup title="Chapters">
          <MenuRule>
            <MotionList reset={loaded}>{doc.chapters.map(c => (
              <MenuItem key={c.id} size="base" label={c.name} sub={c.when} active={isSel("chapter", c.id)} layoutId="chapter-marker"
                onClick={() => { select({ kind: "chapter", id: c.id }); nav.toChapter(c.id); }} />
            ))}</MotionList>
          </MenuRule>
        </MenuGroup>
      </nav>
      <WorkspaceLocation loc={loc} onChanged={reload} onFlush={flush} onRevert={revert}
        onReload={() => reload(loc?.kind === "browser" ? "Reloaded" : loc?.kind === "github" ? "Reloaded from GitHub" : "Reloaded from disk")} />
    </aside>
  );
}

const EditButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <IconButton icon={Pencil} size="sm" tooltipSide="right" label={label} onClick={onClick} />
);

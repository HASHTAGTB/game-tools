import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { TOOLS } from "@/app/tools";
import { cn, uniqueId } from "@/shared/lib/utils";
import { IconButton } from "@/shared/ui/icon-button";
import { ToolNav } from "@/shared/ui/tool-nav";
import { WorkspaceLocation } from "@/shared/ui/workspace-location";
import { visible } from "../lib/colors";
import { castOf, isFiltered, threadsOf } from "../lib/model";
import { nav } from "../lib/nav";
import { useTimeline } from "../state";

const PALETTE = ["#e86a92", "#7fae5a", "#e0b44a", "#6c8fd9", "#d9603b", "#4fb39b", "#c98bd6", "#c4956a"];

/** Like the game's menu: a vertical rule with text links. Characters and threads are focus toggles; the pencil edits. */
export function Sidebar() {
  const { doc, loc, filter, viewId, selection, select, edit, reload, setFilter } = useTimeline();
  const cast = castOf(doc.roster, doc.chapters);
  const threads = threadsOf(doc.threads, doc.chapters);
  const toggle = (key: "chars" | "threads", id: string) =>
    setFilter({ [key]: filter[key].includes(id) ? filter[key].filter(x => x !== id) : [...filter[key], id] }, null);
  const isSel = (kind: string, id: string) => selection?.kind === kind && selection.id === id;

  return (
    <aside className="flex min-h-0 flex-col border-r border-ink-line/60">
      <ToolNav current={TOOLS.timeline} />
      <nav className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 pb-4">
        <Group title="Views">
          <Item label="Everything" active={!isFiltered(filter) && !viewId} onClick={() => setFilter({ chars: [], threads: [], hideOthers: false }, null)} />
          {doc.views.map(v => (
            <Item key={v.id} label={v.name} active={viewId === v.id} selected={isSel("view", v.id)}
              onClick={() => setFilter(v, v.id)} onEdit={() => select({ kind: "view", id: v.id })} editLabel="Edit view" />
          ))}
        </Group>

        <Group title="Characters" hint="Click to focus">
          {cast.map(c => (
            <Item key={c.id} label={c.name} color={c.color} active={filter.chars.includes(c.id)} faded={filter.chars.length > 0 && !filter.chars.includes(c.id)}
              selected={isSel("char", c.id)} onClick={() => toggle("chars", c.id)} onEdit={() => select({ kind: "char", id: c.id })} editLabel="Edit character" />
          ))}
          <AddInput placeholder="New character" onAdd={n => {
            const id = uniqueId(n, cast.map(c => c.id));
            edit(d => { d.roster.push({ id, name: n, color: "#c4956a" }); });
            select({ kind: "char", id });
          }} />
        </Group>

        <Group title="Threads">
          {threads.map(t => (
            <Item key={t.id} label={t.name} color={t.color} active={filter.threads.includes(t.id)} faded={filter.threads.length > 0 && !filter.threads.includes(t.id)}
              selected={isSel("thread", t.id)} onClick={() => toggle("threads", t.id)} onEdit={() => select({ kind: "thread", id: t.id })} editLabel="Edit thread" />
          ))}
          <AddInput placeholder="New thread (a storyline)" onAdd={n => {
            const id = uniqueId(n, threads.map(t => t.id));
            edit(d => { d.threads.push({ id, name: n, color: PALETTE[d.threads.length % PALETTE.length] }); });
            select({ kind: "thread", id });
          }} />
        </Group>

        <Group title="Chapters">
          {doc.chapters.map(c => (
            <li key={c.id}>
              <button onClick={() => { select({ kind: "chapter", id: c.id }); nav.toChapter(c.id); }}
                className={cn("block w-full py-0.5 pl-4 text-left", isSel("chapter", c.id) ? "text-paper" : "text-bone/80 hover:text-paper")}>
                <span className="block truncate font-sans text-[15px]">{c.name}</span>
                {c.when && <span className="block truncate font-talk text-[11px] text-taupe">{c.when}</span>}
              </button>
            </li>
          ))}
        </Group>
      </nav>
      <WorkspaceLocation loc={loc} onChanged={reload} onReload={() => reload(loc?.kind === "browser" ? "Reloaded" : "Reloaded from disk")} />
    </aside>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-baseline justify-between gap-2 font-sans text-[13px] uppercase tracking-wider text-taupe">
        {title}{hint && <span className="font-talk text-[11px] normal-case tracking-normal text-taupe/80">{hint}</span>}
      </p>
      <ul className="border-l-2 border-bone/40">{children}</ul>
    </div>
  );
}

function Item({ label, color, active, faded, selected, onClick, onEdit, editLabel }: {
  label: string; color?: string; active: boolean; faded?: boolean; selected?: boolean; onClick: () => void; onEdit?: () => void; editLabel?: string;
}) {
  return (
    <li className="group/item relative flex items-center">
      {(active || color) && (
        <span aria-hidden className={cn("absolute left-[-3px] top-1.5 h-[calc(100%-12px)] w-1 rounded-full transition-opacity", !active && "opacity-40")}
          style={{ background: color ? visible(color) : "var(--color-paper)" }} />
      )}
      <button onClick={onClick} aria-pressed={active}
        className={cn("block min-w-0 flex-1 truncate py-0.5 pl-4 text-left font-sans text-[16px] decoration-2 underline-offset-[6px] transition-colors",
          active ? "text-paper" : faded ? "text-taupe/70 hover:text-paper" : "text-bone/80 hover:text-paper",
          selected && "underline decoration-caramel")}>{label}</button>
      {onEdit && (
        <IconButton icon={Pencil} size="sm" tooltipSide="right" label={editLabel} onClick={onEdit}
          className="opacity-0 focus-visible:opacity-100 group-hover/item:opacity-100 [@media(hover:none)]:opacity-100" />
      )}
    </li>
  );
}

function AddInput({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const add = () => { const n = name.trim(); if (n) { onAdd(n); setName(""); } };
  return (
    <li className="ml-4 mt-2 flex items-center gap-1 border-b-2 border-ink-line focus-within:border-caramel">
      <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder={placeholder} aria-label={placeholder}
        className="h-8 min-w-0 flex-1 bg-transparent font-talk text-[14px] text-paper placeholder:text-taupe focus:outline-hidden" />
      <IconButton icon={Plus} size="sm" label="Add" kbd="Enter" onClick={add} disabled={!name.trim()} />
    </li>
  );
}

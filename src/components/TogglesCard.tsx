import { ChevronRight, Plus, Trash2 } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useState } from "react";
import type { ListKey, Toggle } from "../lib/types";
import { sameKey } from "../lib/prompt";
import type { TagDb } from "../lib/tags";
import { cn, uniqueId } from "../lib/utils";
import { Button } from "./ui/button";
import { Confirm } from "./ui/confirm";
import { Switch } from "./ui/switch";
import { Heading } from "./ui/heading";
import { TagList } from "./TagList";
import { useDropTarget } from "../lib/dnd";

type Props = {
  toggles: Toggle[];
  db: TagDb | null;
  activeKey: ListKey;
  setActive: (k: ListKey) => void;
  onChange: (fn: (t: Toggle[]) => void) => void;
};

/** Free on/off extras (accessories, props, effects…). Any number can be on at once. */
export function TogglesCard({ toggles, db, activeKey, setActive, onChange }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const dropTarget = useDropTarget();
  const setOpenFor = (id: string, v: boolean) => setOpen(s => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n; });
  const edit = (id: string, fn: (t: Toggle) => void) => onChange(ts => { const t = ts.find(t => t.id === id); if (t) fn(t); });

  return (
    <section>
      <header className="flex items-start gap-2">
        <div className="flex-1"><Heading note="any number can be on" color="#c4956a">Toggles</Heading></div>
        <Button size="sm" variant="ghost" onClick={() => {
          const id = uniqueId("toggle", toggles.map(t => t.id));
          onChange(ts => { ts.push({ id, name: "New toggle", tags: [], on: true }); });
          setOpenFor(id, true);
          setActive({ kind: "toggle", id });
        }}><Plus className="h-4 w-4" />Add toggle</Button>
      </header>
      <div className="mt-3">
        {!toggles.length && <p className="py-1 font-talk text-[15px] text-taupe">No toggles yet. Add accessories, props or effects you want to switch on and off.</p>}
        {toggles.map(t => {
          const isOpen = open.has(t.id);
          return (
            <Collapsible.Root key={t.id} open={isOpen} onOpenChange={v => setOpenFor(t.id, v)} className="py-1">
              <div className="-mx-1 flex items-center gap-3 rounded-md px-1 py-0.5" {...dropTarget({ kind: "toggle", id: t.id })}>
                <Switch checked={t.on} onCheckedChange={v => edit(t.id, x => { x.on = v; })} aria-label={`${t.name} on or off`} />
                <input
                  value={t.name}
                  onChange={e => edit(t.id, x => { x.name = e.target.value; })}
                  aria-label="Toggle name"
                  className={cn("w-40 bg-transparent font-sans text-[17px] focus:outline-none", t.on ? "text-paper" : "text-taupe")}
                />
                <Collapsible.Trigger asChild>
                  <button className="flex min-w-0 flex-1 items-center gap-1 truncate text-left font-talk text-sm text-taupe hover:text-bone">
                    <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-90")} />
                    <span className="truncate">{isOpen ? "" : t.tags.join(", ") || "no tags"}</span>
                  </button>
                </Collapsible.Trigger>
                <Confirm message={`Delete toggle "${t.name}"?`} onConfirm={() => onChange(ts => { ts.splice(ts.findIndex(x => x.id === t.id), 1); })}>
                  <Button size="icon" variant="danger" title="Delete toggle"><Trash2 className="h-3.5 w-3.5" /></Button>
                </Confirm>
              </div>
              <Collapsible.Content className="pb-2 pt-1">
                <TagList
                  listKey={{ kind: "toggle", id: t.id }}
                  tags={t.tags}
                  db={db}
                  active={sameKey(activeKey, { kind: "toggle", id: t.id })}
                  onActivate={() => setActive({ kind: "toggle", id: t.id })}
                  onChange={tags => edit(t.id, x => { x.tags = tags; })}
                />
              </Collapsible.Content>
            </Collapsible.Root>
          );
        })}
      </div>
    </section>
  );
}

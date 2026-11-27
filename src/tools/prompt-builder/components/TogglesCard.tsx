import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { Collapsible } from "@base-ui/react/collapsible";
import { useState } from "react";
import type { ListKey, Toggle } from "../lib/types";
import { sameKey, segColor } from "../lib/prompt";
import type { TagDb } from "../lib/tags";
import { cn, uniqueId } from "@/shared/lib/utils";
import { Confirm } from "@/shared/ui/confirm";
import { IconButton } from "@/shared/ui/icon-button";
import { Switch } from "@/shared/ui/switch";
import { CollapsiblePanel } from "@/shared/ui/collapsible";
import { Section } from "@/shared/ui/section";
import { m, spring } from "@/shared/ui/motion";
import { MotionItem, MotionList } from "@/shared/ui/motion-list";
import { TagList } from "./TagList";
import { useDropTarget } from "../lib/dnd";

type Props = {
  toggles: Toggle[];
  db: TagDb | null;
  activeKey: ListKey;
  setActive: (k: ListKey) => void;
  onChange: (fn: (t: Toggle[]) => void) => void;
};

const COLOR = segColor(-1);

/** Free on/off extras (accessories, props, effects…). Any number can be on at once. */
export function TogglesCard({ toggles, db, activeKey, setActive, onChange }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const dropTarget = useDropTarget();
  const setOpenFor = (id: string, v: boolean) => setOpen(s => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n; });
  const edit = (id: string, fn: (t: Toggle) => void) => onChange(ts => { const t = ts.find(t => t.id === id); if (t) fn(t); });
  const onCount = toggles.filter(t => t.on).length;

  const add = () => {
    const id = uniqueId("toggle", toggles.map(t => t.id));
    onChange(ts => { ts.push({ id, name: "New toggle", tags: [], on: true }); });
    setOpenFor(id, true);
    setActive({ kind: "toggle", id });
  };

  return (
    <Section
      title="Toggles"
      note={toggles.length ? `${onCount} of ${toggles.length} on` : "any number can be on"}
      color={COLOR}
      actions={<IconButton icon={Plus} label="Add toggle" onClick={add} />}
    >
      <div className="relative mt-3">
        {!toggles.length && (
          <button onClick={add} className="flex min-h-11 w-full items-center gap-2 rounded-lg border-2 border-dashed border-ink-3 px-3 text-left font-talk text-base text-taupe transition-colors hover:border-ink-line hover:text-bone">
            <Plus className="h-4 w-4" />Add a toggle for accessories, props or effects you switch on and off.
          </button>
        )}
        <MotionList>
          {toggles.map(t => {
            const isOpen = open.has(t.id);
            return (
              <MotionItem as="div" key={t.id} className="group/row">
                <Collapsible.Root open={isOpen} onOpenChange={v => setOpenFor(t.id, v)} className="py-0.5">
                  <div className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-ink-2" {...dropTarget({ kind: "toggle", id: t.id })}>
                    <Switch checked={t.on} onCheckedChange={v => edit(t.id, x => { x.on = v; })} aria-label={`${t.name} on or off`} />
                    <input
                      value={t.name}
                      onChange={e => edit(t.id, x => { x.name = e.target.value; })}
                      aria-label="Toggle name"
                      className={cn("field-sizing-content min-w-16 max-w-56 bg-transparent font-sans text-lg transition-colors focus:outline-hidden", t.on ? "text-paper" : "text-taupe")}
                    />
                    <Collapsible.Trigger render={
                      <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-talk text-sm text-taupe hover:text-bone">
                        <m.span animate={{ rotate: isOpen ? 90 : 0 }} transition={spring.snappy} className="grid shrink-0 place-items-center">
                          <ChevronRight className="h-4 w-4" />
                        </m.span>
                        <span className={cn("truncate transition-opacity", isOpen && "opacity-0")}>
                          {t.tags.length ? t.tags.join(", ") : "no tags"}
                        </span>
                      </button>
                    } />
                    <Confirm message={`Delete toggle "${t.name}"?`} onConfirm={() => onChange(ts => { ts.splice(ts.findIndex(x => x.id === t.id), 1); })}>
                      <IconButton icon={Trash2} size="sm" tone="danger" label={`Delete “${t.name}”`}
                        className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100" />
                    </Confirm>
                  </div>
                  <CollapsiblePanel className="pb-2 pl-12 pt-1">
                    <TagList
                      listKey={{ kind: "toggle", id: t.id }}
                      tags={t.tags}
                      db={db}
                      accent={COLOR}
                      active={sameKey(activeKey, { kind: "toggle", id: t.id })}
                      onActivate={() => setActive({ kind: "toggle", id: t.id })}
                      onChange={tags => edit(t.id, x => { x.tags = tags; })}
                    />
                  </CollapsiblePanel>
                </Collapsible.Root>
              </MotionItem>
            );
          })}
        </MotionList>
      </div>
    </Section>
  );
}

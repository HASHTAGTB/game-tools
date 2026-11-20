import * as Tabs from "@radix-ui/react-tabs";
import { Copy, Plus, Trash2 } from "lucide-react";
import type { Category, ListKey } from "../lib/types";
import { segColor, sameKey } from "../lib/prompt";
import type { TagDb } from "../lib/tags";
import { cn, uniqueId } from "../lib/utils";
import { Button } from "./ui/button";
import { Confirm } from "./ui/confirm";
import { Rule } from "./ui/heading";
import { TagList } from "./TagList";
import { useDropTarget } from "../lib/dnd";

const NONE = "__none";

type Props = {
  cat: Category;
  color: number;
  db: TagDb | null;
  activeKey: ListKey;
  setActive: (k: ListKey) => void;
  onChange: (fn: (c: Category) => void) => void;
  onDelete: () => void;
};

/** A pick-one group (Outfit, Expression, Pose, …). The selected tab is what goes into the prompt. */
export function CategoryCard({ cat, color, db, activeKey, setActive, onChange, onDelete }: Props) {
  const sel = cat.presets.find(p => p.id === cat.selected) ?? null;
  const dropTarget = useDropTarget();
  const hex = segColor(color);

  const addPreset = (from?: { name: string; tags: string[] }) => {
    const name = from ? `${from.name} copy` : `${cat.name} ${cat.presets.length + 1}`;
    const id = uniqueId(name, cat.presets.map(p => p.id));
    onChange(c => { c.presets.push({ id, name, tags: from ? [...from.tags] : [] }); c.selected = id; });
    setActive({ kind: "preset", cat: cat.id, preset: id });
  };

  return (
    <section>
      <Tabs.Root
        value={cat.selected ?? NONE}
        onValueChange={v => {
          onChange(c => { c.selected = v === NONE ? null : v; });
          if (v !== NONE) setActive({ kind: "preset", cat: cat.id, preset: v });
        }}
      >
        <header className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <input
              value={cat.name}
              onChange={e => onChange(c => { c.name = e.target.value; })}
              aria-label="Category name"
              className="w-full max-w-xs bg-transparent font-sans text-[22px] leading-tight text-paper focus:outline-none"
            />
            <Rule color={hex} />
          </div>
          <Confirm message={`Delete the whole "${cat.name}" category with ${cat.presets.length} presets?`} onConfirm={onDelete}>
            <Button size="sm" variant="danger" title="Delete category"><Trash2 className="h-3.5 w-3.5" />Delete category</Button>
          </Confirm>
        </header>

        <Tabs.List className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1">
          <Tabs.Trigger value={NONE} title="Leave this category out of the prompt" className={tabCls} style={{ textDecorationColor: hex }}>
            None
          </Tabs.Trigger>
          {cat.presets.map(p => (
            <Tabs.Trigger key={p.id} value={p.id} className={tabCls} style={{ textDecorationColor: hex }}
              {...dropTarget({ kind: "preset", cat: cat.id, preset: p.id })}>
              {p.name || "untitled"}
              <small className="ml-1.5 font-talk text-xs text-taupe no-underline">{p.tags.length}</small>
            </Tabs.Trigger>
          ))}
          <Button size="icon" variant="ghost" title={`New ${cat.name.toLowerCase()}`} onClick={() => addPreset()}>
            <Plus className="h-4 w-4" />
          </Button>
        </Tabs.List>

        <div className="mt-2">
          {!sel ? (
            <p className="py-1 font-talk text-[15px] text-taupe">
              Left out of the prompt. {cat.presets.length ? "Pick a preset above to use it." : "Add a preset with +."}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={sel.name}
                  onChange={e => onChange(c => { const p = c.presets.find(p => p.id === sel.id); if (p) p.name = e.target.value; })}
                  placeholder="Preset name"
                  aria-label="Preset name"
                  className="h-8 flex-1 border-b-2 border-transparent bg-transparent font-talk text-[15px] text-bone placeholder:text-taupe hover:border-ink-line focus:border-caramel focus:outline-none"
                />
                <Button size="sm" variant="ghost" onClick={() => addPreset(sel)} title="Duplicate preset"><Copy className="h-3.5 w-3.5" />Duplicate</Button>
                <Confirm message={`Delete preset "${sel.name}"?`} onConfirm={() => onChange(c => {
                  const i = c.presets.findIndex(p => p.id === sel.id);
                  c.presets.splice(i, 1);
                  c.selected = c.presets[Math.min(i, c.presets.length - 1)]?.id ?? null;
                })}>
                  <Button size="sm" variant="danger"><Trash2 className="h-3.5 w-3.5" />Delete</Button>
                </Confirm>
              </div>
              <TagList
                listKey={{ kind: "preset", cat: cat.id, preset: sel.id }}
                tags={sel.tags}
                db={db}
                active={sameKey(activeKey, { kind: "preset", cat: cat.id, preset: sel.id })}
                onActivate={() => setActive({ kind: "preset", cat: cat.id, preset: sel.id })}
                onChange={tags => onChange(c => { const p = c.presets.find(p => p.id === sel.id); if (p) p.tags = tags; })}
              />
            </div>
          )}
        </div>
      </Tabs.Root>
    </section>
  );
}

const tabCls = cn(
  "inline-flex h-8 items-center rounded px-2 font-sans text-base text-taupe underline-offset-[6px] decoration-[3px] transition-colors hover:text-paper",
  "data-[state=active]:text-paper data-[state=active]:underline",
);

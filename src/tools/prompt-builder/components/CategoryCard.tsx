import { Tabs } from "@base-ui/react/tabs";
import { ArrowDown, ArrowUp, Copy, PencilLine, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import type { Category, ListKey } from "../lib/types";
import { segColor, sameKey } from "../lib/prompt";
import type { TagDb } from "../lib/tags";
import { uniqueId } from "@/shared/lib/utils";
import { Confirm } from "@/shared/ui/confirm";
import { IconButton } from "@/shared/ui/icon-button";
import { HoverActions, Section } from "@/shared/ui/section";
import { AnimatePresence, fade, LayoutGroup, m, spring } from "@/shared/ui/motion";
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
  /** Move this category one slot earlier (-1) or later (1) — also its place in the prompt. */
  onMove: (dir: -1 | 1) => void;
  canUp: boolean;
  canDown: boolean;
};

/** A pick-one group (Outfit, Expression, Pose, …). The selected tab is what goes into the prompt.
    Double-click a tab to rename it; category and preset actions show on hover. */
export function CategoryCard({ cat, color, db, activeKey, setActive, onChange, onDelete, onMove, canUp, canDown }: Props) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const sel = cat.presets.find(p => p.id === cat.selected) ?? null;
  const dropTarget = useDropTarget();
  const hex = segColor(color);

  const editPreset = (id: string, fn: (p: Category["presets"][number]) => void) =>
    onChange(c => { const p = c.presets.find(p => p.id === id); if (p) fn(p); });

  const addPreset = (from?: { name: string; tags: string[] }) => {
    const name = from ? `${from.name} copy` : `${cat.name} ${cat.presets.length + 1}`;
    const id = uniqueId(name, cat.presets.map(p => p.id));
    onChange(c => { c.presets.push({ id, name, tags: from ? [...from.tags] : [] }); c.selected = id; });
    setActive({ kind: "preset", cat: cat.id, preset: id });
    setRenaming(id);
  };

  const move = (dir: -1 | 1) => {
    if (dir === -1 ? !canUp : !canDown) return;
    onMove(dir);
  };

  return (
    <Section
      color={hex}
      title={
        <input
          ref={nameRef}
          value={cat.name}
          onKeyDown={e => {
            if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
            e.preventDefault();
            move(e.key === "ArrowUp" ? -1 : 1);
            // React may re-insert this node while reordering, which drops focus.
            requestAnimationFrame(() => { nameRef.current?.focus(); nameRef.current?.scrollIntoView({ block: "nearest" }); });
          }}
          onChange={e => onChange(c => { c.name = e.target.value; })}
          aria-label="Category name"
          className="field-sizing-content min-w-12 max-w-full bg-transparent focus:outline-hidden"
        />
      }
      actions={<>
        <IconButton icon={ArrowUp} label="Move up" kbd="Alt+↑" disabled={!canUp} onClick={() => move(-1)} />
        <IconButton icon={ArrowDown} label="Move down" kbd="Alt+↓" disabled={!canDown} onClick={() => move(1)} />
        <Confirm message={`Delete the whole "${cat.name}" category with ${cat.presets.length} presets?`} label="Delete category" onConfirm={onDelete}>
          <IconButton icon={Trash2} tone="danger" label={`Delete category “${cat.name}”`} />
        </Confirm>
      </>}
    >
      <Tabs.Root
        value={cat.selected ?? NONE}
        onValueChange={(v: string) => {
          onChange(c => { c.selected = v === NONE ? null : v; });
          if (v !== NONE) setActive({ kind: "preset", cat: cat.id, preset: v });
        }}
      >
        <div className="mt-3 flex items-start gap-2">
          {/* One LayoutGroup per card, so each card's underline slides only between its own tabs. */}
          <LayoutGroup id={`cat-${cat.id}`}>
            <Tabs.List activateOnFocus className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 gap-y-1">
              <Tabs.Tab value={NONE} title="Leave this category out of the prompt" className={tabCls}>
                None
                {!sel && <Underline color={hex} />}
              </Tabs.Tab>
              {cat.presets.map(p => renaming === p.id ? (
                <span key={p.id} className="relative inline-flex h-8 items-center px-2">
                  <input
                    autoFocus
                    onFocus={e => e.currentTarget.select()}
                    value={p.name}
                    aria-label="Preset name"
                    onChange={e => editPreset(p.id, x => { x.name = e.target.value; })}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
                    onBlur={() => setRenaming(null)}
                    className="field-sizing-content min-w-8 rounded-sm bg-ink-3 px-1 font-sans text-base text-paper outline-2 outline-(--c) focus:outline-solid"
                    style={{ "--c": hex } as React.CSSProperties}
                  />
                  {sel?.id === p.id && <Underline color={hex} />}
                </span>
              ) : (
                <Tabs.Tab key={p.id} value={p.id} className={tabCls}
                  onDoubleClick={() => setRenaming(p.id)}
                  title="Double-click to rename"
                  {...dropTarget({ kind: "preset", cat: cat.id, preset: p.id })}>
                  {p.name || "untitled"}
                  <small className="ml-1.5 font-talk text-xs tabular-nums text-taupe">{p.tags.length}</small>
                  {sel?.id === p.id && <Underline color={hex} />}
                </Tabs.Tab>
              ))}
              <IconButton icon={Plus} size="sm" label={`New ${cat.name.toLowerCase() || "preset"}`} onClick={() => addPreset()} />
            </Tabs.List>
          </LayoutGroup>

          {sel && (
            <HoverActions>
              <IconButton icon={PencilLine} size="sm" label={`Rename “${sel.name}”`} onClick={() => setRenaming(sel.id)} />
              <IconButton icon={Copy} size="sm" label={`Duplicate “${sel.name}”`} onClick={() => addPreset(sel)} />
              <Confirm message={`Delete preset "${sel.name}"?`} onConfirm={() => onChange(c => {
                const i = c.presets.findIndex(p => p.id === sel.id);
                c.presets.splice(i, 1);
                c.selected = c.presets[Math.min(i, c.presets.length - 1)]?.id ?? null;
              })}>
                <IconButton icon={Trash2} size="sm" tone="danger" label={`Delete “${sel.name}”`} />
              </Confirm>
            </HoverActions>
          )}
        </div>

        {/* Switching presets crossfades the tag box. */}
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={sel?.id ?? NONE}
            className="mt-2"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, opacity: fade.in } }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
          >
            {!sel ? (
              <p className="flex min-h-11 items-center rounded-xl border-2 border-dashed border-ink-3 px-3 font-talk text-[15px] text-taupe">
                Left out of the prompt. {cat.presets.length ? "Pick a preset above to use it." : "Add a preset with +."}
              </p>
            ) : (
              <TagList
                listKey={{ kind: "preset", cat: cat.id, preset: sel.id }}
                tags={sel.tags}
                db={db}
                accent={hex}
                active={sameKey(activeKey, { kind: "preset", cat: cat.id, preset: sel.id })}
                onActivate={() => setActive({ kind: "preset", cat: cat.id, preset: sel.id })}
                onChange={tags => editPreset(sel.id, p => { p.tags = tags; })}
              />
            )}
          </m.div>
        </AnimatePresence>
      </Tabs.Root>
    </Section>
  );
}

const tabCls = "relative inline-flex h-8 items-center rounded-md px-2 font-sans text-base text-taupe transition-colors hover:bg-ink-2 hover:text-paper data-active:text-paper";

/** The selected tab's underline. Shares one layoutId within the card's LayoutGroup, so it springs to the new tab. */
function Underline({ color }: { color: string }) {
  return <m.span layoutId="tab-underline" aria-hidden transition={spring.bouncy}
    className="pointer-events-none absolute inset-x-2 bottom-0.5 h-[3px] rounded-full" style={{ background: color }} />;
}

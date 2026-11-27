import { useEffect, useMemo } from "react";
import { CopyPlus, Plus, Trash2 } from "lucide-react";
import { TOOLS } from "@/app/tools";
import { listFor, listLabel, sameKey, segColor, tagKey } from "./lib/prompt";
import type { Character, ListKey } from "./lib/types";
import { cn, uniqueId } from "@/shared/lib/utils";
import { BASE, currentChar, targetKey, usePromptBuilder } from "./state";
import { Sidebar } from "./components/Sidebar";
import { TagList } from "./components/TagList";
import { CategoryCard } from "./components/CategoryCard";
import { TogglesCard } from "./components/TogglesCard";
import { PromptPanel } from "./components/PromptPanel";
import { TagBrowser } from "./components/TagBrowser";
import { SearchDropZones } from "./components/SearchDropZones";
import { Button } from "@/shared/ui/button";
import { Confirm, undoNote } from "@/shared/ui/confirm";
import { textareaCls } from "@/shared/ui/field";
import { HelpButton, type Gesture } from "@/shared/ui/help";
import { IconButton } from "@/shared/ui/icon-button";
import { Section } from "@/shared/ui/section";
import { BarDivider, EmptyState, NotReady, ToolBar, ToolPage } from "@/shared/ui/tool-page";
import { MotionFollow, MotionItem, MotionList } from "@/shared/ui/motion-list";

export default function PromptBuilder() {
  const s = usePromptBuilder();
  const { chars, loaded, curId, db, loc, drag, update, setActiveKey, setError } = s;
  const cur = currentChar(s);
  const target = targetKey(s);

  useEffect(() => usePromptBuilder.getState().init(), []);

  // the dragged chip may be unmounted by a move, so its dragend never fires: clear on any drop/dragend
  useEffect(() => {
    if (!drag) return;
    const clear = () => setTimeout(usePromptBuilder.getState().dragEnd, 0);
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => { window.removeEventListener("dragend", clear); window.removeEventListener("drop", clear); };
  }, [drag]);

  const targetTags = cur ? listFor(cur, target) ?? [] : [];
  const selected = useMemo(() => new Set(targetTags.map(tagKey)), [targetTags]);

  return (
    <>
      <ToolPage tool={TOOLS.promptBuilder} data={s}
        sidebar={<Sidebar chars={chars} loaded={loaded} current={curId} onSelect={s.select} onCreate={n => s.create(n)} onImport={s.importChars} onError={setError} />}
        bar={
          <ToolBar>
            {cur ? (
              <input value={cur.name} onChange={e => update(c => { c.name = e.target.value; })} aria-label="Character name"
                className="h-full min-w-0 flex-1 bg-transparent font-sans text-lg text-paper focus:outline-hidden" />
            ) : <span className="flex-1" />}
            {cur && <>
              <IconButton icon={CopyPlus} size="sm" tooltipSide="bottom" label="Duplicate character" onClick={() => s.create(cur.name + " copy", cur)} />
              <Confirm label="Delete character" message={`Delete character "${cur.name}"? ${undoNote(loc)}`} onConfirm={() => s.remove(cur.id)}>
                <IconButton icon={Trash2} size="sm" tone="danger" tooltipSide="bottom" label="Delete character" />
              </Confirm>
              <BarDivider />
            </>}
            <HelpButton items={HELP} />
          </ToolBar>
        }
        conflicts={s.conflicts.map(c => ({ key: c.path, label: `Character ${c.label}`, deleted: c.theirs === null }))} onResolve={s.resolveConflict}
        asideTitle="Tags"
        aside={<TagBrowser db={db} target={cur ? listLabel(cur, target) : "General"} targetColor={cur ? targetColor(cur, target) : segColor(0)} selected={selected} onToggle={text => cur && s.toggleInTarget(text)} />}>
          {!loaded ? <NotReady loc={loc} /> : !cur ? (
            <EmptyState title="No character open.">Name one on the left to start.</EmptyState>
          ) : (
            <>
              <div className="relative min-h-0 flex-1 space-y-10 overflow-y-auto px-8 pb-6 pt-6">
                <Section title="General" note="always in the prompt" color={segColor(0)}>
                  <div className="mt-3">
                    <TagList listKey={BASE} tags={cur.base} db={db} accent={segColor(0)} active={sameKey(target, BASE)} onActivate={() => setActiveKey(BASE)}
                      onChange={tags => update(c => { c.base = tags; })} />
                  </div>
                </Section>

                <MotionList reset={cur.id}>{cur.categories.map((cat, i) => (
                  <MotionItem as="div" key={cat.id}>
                  <CategoryCard
                    cat={cat}
                    color={i + 1}
                    db={db}
                    activeKey={target}
                    setActive={setActiveKey}
                    onChange={fn => update(c => { const x = c.categories.find(x => x.id === cat.id); if (x) fn(x); })}
                    onDelete={() => update(c => { c.categories = c.categories.filter(x => x.id !== cat.id); })}
                    canUp={i > 0}
                    canDown={i < cur.categories.length - 1}
                    onMove={dir => update(c => {
                      const a = c.categories.findIndex(x => x.id === cat.id), b = a + dir;
                      if (a < 0 || b < 0 || b >= c.categories.length) return;
                      [c.categories[a], c.categories[b]] = [c.categories[b], c.categories[a]];
                    })}
                  />
                  </MotionItem>
                ))}</MotionList>
                <MotionFollow className="mt-5! space-y-10">
                <div className="flex items-center gap-2">
                  <Button variant="default" size="sm" onClick={() => update(c => {
                    c.categories.push({ id: uniqueId("category", c.categories.map(x => x.id)), name: "New category", presets: [], selected: null });
                  })}><Plus className="h-4 w-4" />Add category</Button>
                  <span className="font-talk text-sm text-taupe">A pick-one group, like Hairstyle or Location.</span>
                </div>

                <TogglesCard toggles={cur.toggles} db={db} activeKey={target} setActive={setActiveKey}
                  onChange={fn => update(c => fn(c.toggles))} />

                <Section title="Notes" note="not part of the prompt">
                  <textarea
                    value={cur.notes}
                    onChange={e => update(c => { c.notes = e.target.value; })}
                    rows={2}
                    aria-label="Notes"
                    placeholder="Anything to remember about this character"
                    className={cn(textareaCls, "mt-3 field-sizing-content min-h-16 py-2")}
                  />
                </Section>
                </MotionFollow>
              </div>
              <PromptPanel ch={cur} onNegative={v => update(c => { c.negative = v; })} />
            </>
          )}
      </ToolPage>
      <SearchDropZones />
    </>
  );
}

/** Section color of a tag list, matching its rule and its highlight in the prompt. */
function targetColor(c: Character, key: ListKey) {
  if (key.kind === "base") return segColor(0);
  if (key.kind === "toggle") return segColor(-1);
  return segColor(c.categories.findIndex(x => x.id === key.cat) + 1);
}

const HELP: Gesture[] = [
  ["Click a tag", "Switch it off or on"],
  ["Double-click a tag", "Edit it"],
  ["Double-click a preset tab", "Rename it"],
  ["[Ctrl] + scroll on a tag", "Change its weight"],
  ["Drag a tag", "Move it to another list, a preset tab or a toggle row"],
  ["[Ctrl] + drag", "Copy instead of move"],
  ["Drag a tag onto the tag browser", "Look it up on Danbooru or Google"],
  ["[Alt] [↑] · [Alt] [↓]", "Move a category (in its name)"],
  ["[Ctrl] [Shift] [C]", "Copy the prompt"],
];

import { useEffect, useMemo, useState } from "react";
import { CircleHelp, CopyPlus, Plus, Trash2 } from "lucide-react";
import { listFor, listLabel, sameKey, segColor, tagKey } from "./lib/prompt";
import type { Character, ListKey } from "./lib/types";
import { uniqueId } from "@/shared/lib/utils";
import { BASE, currentChar, targetKey, usePromptBuilder } from "./state";
import { Sidebar } from "./components/Sidebar";
import { TagList } from "./components/TagList";
import { CategoryCard } from "./components/CategoryCard";
import { TogglesCard } from "./components/TogglesCard";
import { PromptPanel } from "./components/PromptPanel";
import { TagBrowser } from "./components/TagBrowser";
import { SearchDropZones } from "./components/SearchDropZones";
import { Button } from "@/shared/ui/button";
import { Confirm } from "@/shared/ui/confirm";
import { IconButton } from "@/shared/ui/icon-button";
import { Popover } from "@/shared/ui/popover";
import { HoverActions, Section } from "@/shared/ui/section";
import { Toasts } from "@/shared/ui/toasts";
import { m, spring } from "@/shared/ui/motion";

export default function PromptBuilder() {
  const s = usePromptBuilder();
  const { chars, curId, db, loc, error, notice, drag, update, setActiveKey, setError, setNotice } = s;
  const cur = currentChar(s);
  const target = targetKey(s);

  useEffect(() => { usePromptBuilder.getState().init(); }, []);

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
      <div className="grid h-screen grid-cols-[190px_minmax(0,1fr)_270px] bg-ink text-paper lg:grid-cols-[230px_minmax(0,1fr)_340px] 2xl:grid-cols-[260px_minmax(0,1fr)_400px]">
        <Sidebar
          chars={chars} current={curId} onSelect={s.select} onCreate={n => s.create(n)} loc={loc} onImport={s.importChars} onError={setError}
          onDirChanged={s.reload} onFlush={s.flush}
          onReload={() => s.reload(loc?.kind === "browser" ? "Reloaded" : loc?.kind === "github" ? "Reloaded from GitHub" : "Reloaded from disk")}
        />

        <main className="relative flex min-h-0 flex-col">
          <Toasts className="top-4" items={[
            ...(error ? [{ id: "error", kind: "error" as const, text: error, onDismiss: () => setError(null) }] : []),
            ...(notice ? [{ id: "notice", kind: "notice" as const, text: notice, onDismiss: () => setNotice(null) }] : []),
          ]} />
          {!cur ? (
            <div className="grid flex-1 place-items-center font-sans text-2xl font-light text-bone">Name a character on the left to start.</div>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-10 overflow-y-auto px-8 pb-6 pt-6">
                <header className="group/section flex items-end gap-3">
                  <input
                    value={cur.name}
                    onChange={e => update(c => { c.name = e.target.value; })}
                    aria-label="Character name"
                    className="min-w-0 flex-1 bg-transparent font-sans text-[56px] font-light leading-none text-paper focus:outline-hidden"
                  />
                  <HoverActions className="mb-2">
                    <IconButton icon={CopyPlus} label="Duplicate character" onClick={() => s.create(cur.name + " copy", cur)} />
                    <Confirm label="Delete character" message={`Delete character "${cur.name}"? ${loc?.kind === "browser" ? "This can't be undone." : "This removes its file."}`} onConfirm={() => s.remove(cur.id)}>
                      <IconButton icon={Trash2} tone="danger" label="Delete character" />
                    </Confirm>
                  </HoverActions>
                  <HelpButton />
                </header>

                <Section title="General" note="always in the prompt" color={segColor(0)}>
                  <div className="mt-3">
                    <TagList listKey={BASE} tags={cur.base} db={db} accent={segColor(0)} active={sameKey(target, BASE)} onActivate={() => setActiveKey(BASE)}
                      onChange={tags => update(c => { c.base = tags; })} />
                  </div>
                </Section>

                {cur.categories.map((cat, i) => (
                  // layout: reordering a category slides it into its new place
                  <m.div key={cat.id} layout="position" transition={spring.smooth}>
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
                  </m.div>
                ))}
                <m.div layout="position" className="mt-5! flex items-center gap-2">
                  <Button variant="default" size="sm" onClick={() => update(c => {
                    c.categories.push({ id: uniqueId("category", c.categories.map(x => x.id)), name: "New category", presets: [], selected: null });
                  })}><Plus className="h-4 w-4" />Add category</Button>
                  <span className="font-talk text-sm text-taupe">A pick-one group, like Hairstyle or Location.</span>
                </m.div>

                <TogglesCard toggles={cur.toggles} db={db} activeKey={target} setActive={setActiveKey}
                  onChange={fn => update(c => fn(c.toggles))} />

                <Section title="Notes" note="not part of the prompt">
                  <textarea
                    value={cur.notes}
                    onChange={e => update(c => { c.notes = e.target.value; })}
                    rows={2}
                    aria-label="Notes"
                    placeholder="Anything to remember about this character"
                    className="mt-3 field-sizing-content min-h-16 w-full resize-none rounded-xl border-2 border-ink-3 bg-ink-2 px-3 py-2 font-talk text-[15px] text-bone transition-colors placeholder:text-taupe hover:border-ink-line focus:border-caramel focus:outline-hidden"
                  />
                </Section>
              </div>
              <PromptPanel ch={cur} onNegative={v => update(c => { c.negative = v; })} />
            </>
          )}
        </main>

        <div className="relative flex min-h-0 flex-col">
          <TagBrowser db={db} target={cur ? listLabel(cur, target) : "General"} targetColor={cur ? targetColor(cur, target) : segColor(0)} selected={selected} onToggle={text => cur && s.toggleInTarget(text)} />
        </div>
      </div>
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

const HELP: [string, string][] = [
  ["Click", "switch a tag off or on"],
  ["Double-click", "edit a tag, or rename a preset tab"],
  ["Ctrl + scroll", "change a tag's weight"],
  ["Drag", "move tags between lists, onto preset tabs or toggle rows"],
  ["Ctrl + drag", "copy instead of move"],
  ["Drag to the right", "look a tag up on Danbooru or Google"],
  ["Alt + ↑ / ↓", "move a category (in its name)"],
  ["Ctrl + Shift + C", "copy the prompt"],
];

function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} align="end" className="w-96" trigger={<IconButton icon={CircleHelp} label="Shortcuts" className="mb-2" />}>
      <p className="mb-2 font-sans text-lg text-paper">Shortcuts</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {HELP.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-bold text-paper">{k}</dt>
            <dd className="text-bone">{v}</dd>
          </div>
        ))}
      </dl>
    </Popover>
  );
}

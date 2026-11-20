import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyPlus, Plus, Trash2 } from "lucide-react";
import type { Character, ListKey } from "./lib/types";
import { listFor, listLabel, sameKey, tagKey } from "./lib/prompt";
import { loadTagDb, type TagDb } from "./lib/tags";
import { deleteCharacter, getLocation, listCharacters, newCharacter, NeedsPermission, saveCharacter, STATIC, type Location } from "./lib/store";
import { DndContext, type DndApi, type DragTag } from "./lib/dnd";
import { uniqueId } from "./lib/utils";
import { Sidebar } from "./components/Sidebar";
import { TagList } from "./components/TagList";
import { CategoryCard } from "./components/CategoryCard";
import { TogglesCard } from "./components/TogglesCard";
import { PromptPanel } from "./components/PromptPanel";
import { TagBrowser } from "./components/TagBrowser";
import { SearchDropZones } from "./components/SearchDropZones";
import { ImagePanel } from "./components/ImagePanel";
import { Button } from "./components/ui/button";
import { Confirm } from "./components/ui/confirm";
import { Heading } from "./components/ui/heading";

const BASE: ListKey = { kind: "base" };

export default function App() {
  const [chars, setChars] = useState<Character[]>([]);
  const [curId, setCurId] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<ListKey>(BASE);
  const [db, setDb] = useState<TagDb | null>(null);
  const [loc, setLoc] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragTag | null>(null);
  const [lookup, setLookup] = useState<string | null>(null);   // tag shown in the image panel
  const savedJson = useRef(new Map<string, string>());
  const charsRef = useRef(chars);
  charsRef.current = chars;

  /** Save every character that changed since its last save. */
  const flush = useCallback(async () => {
    for (const c of charsRef.current) {
      const json = JSON.stringify(c);
      if (savedJson.current.get(c.id) === json) continue;
      savedJson.current.set(c.id, json);
      await saveCharacter(c).catch(e => setError("save failed: " + e.message));
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const l = await getLocation();
      setLoc(l);
      if (!l.ready) { setChars([]); savedJson.current = new Map(); return; }   // folder waits for "Allow folder access"
      const cs = await listCharacters();
      savedJson.current = new Map(cs.map(c => [c.id, JSON.stringify(c)]));
      setChars(cs);
      setCurId(id => (cs.some(c => c.id === id) ? id : cs[0]?.id ?? null));
      setError(null);
    } catch (e) {
      if (e instanceof NeedsPermission) return void setLoc(l => l && { ...l, ready: false });
      const hint = STATIC ? "" : ' (is this running through "pnpm dev"?)';
      setError(`Could not load characters${hint}: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  useEffect(() => {
    load();
    loadTagDb().then(setDb).catch(e => setError("tag data: " + e));
  }, [load]);

  // autosave 400ms after the last edit
  useEffect(() => {
    const t = setTimeout(flush, 400);
    return () => clearTimeout(t);
  }, [chars, flush]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const cur = chars.find(c => c.id === curId) ?? null;

  const update = useCallback((fn: (c: Character) => void) => {
    setChars(cs => cs.map(c => {
      if (c.id !== curId) return c;
      const next = structuredClone(c);
      fn(next);
      return next;
    }));
  }, [curId]);

  const select = (id: string) => { setCurId(id); setActiveKey(BASE); };

  const create = (name: string, from?: Character) => {
    const id = uniqueId(name, chars.map(c => c.id));
    const c = from ? { ...structuredClone(from), id, name } : newCharacter(name, id);
    setChars(cs => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)));
    select(id);
  };

  /** Imported characters replace ones with the same id (restoring a backup), the rest are added. */
  const importChars = (incoming: Character[]) => {
    const ids = new Set(chars.map(c => c.id));
    const replaced = incoming.filter(c => ids.has(c.id)).length;
    const byId = new Map(chars.map(c => [c.id, c]));
    for (const c of incoming) byId.set(c.id, c);
    setChars([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
    if (incoming[0]) select(incoming[0].id);
    setNotice(`Imported ${incoming.length} character${incoming.length === 1 ? "" : "s"}${replaced ? ` (${replaced} replaced)` : ""}`);
  };

  const remove = async (id: string) => {
    await deleteCharacter(id).catch(e => setError(e.message));
    savedJson.current.delete(id);
    const rest = chars.filter(c => c.id !== id);
    setChars(rest);
    setCurId(rest[0]?.id ?? null);
  };

  // ---------------------------------------------------------------- drag & drop between tag lists
  const dnd: DndApi = useMemo(() => ({
    drag,
    start: d => setDrag(d),
    end: () => setDrag(null),
    drop: (to, index, copy) => {
      const d = drag;
      setDrag(null);
      if (!d) return;
      update(c => {
        const dst = listFor(c, to);
        if (!dst) return;
        const src = d.from ? listFor(c, d.from) : null;
        const sameList = !!d.from && sameKey(d.from, to);
        if (src && sameList && !copy) {          // reorder
          const [t] = src.splice(d.index, 1);
          src.splice(Math.min(index > d.index ? index - 1 : index, src.length), 0, t);
          return;
        }
        if (!dst.some(t => tagKey(t) === tagKey(d.tag))) dst.splice(Math.min(index, dst.length), 0, d.tag);
        if (src && !copy && src[d.index] === d.tag) src.splice(d.index, 1);
      });
    },
  }), [drag, update]);

  // the dragged chip may be unmounted by a move, so its dragend never fires: clear on any drop/dragend
  useEffect(() => {
    if (!drag) return;
    const clear = () => setTimeout(() => setDrag(null), 0);
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => { window.removeEventListener("dragend", clear); window.removeEventListener("drop", clear); };
  }, [drag]);

  const closeLookup = useCallback(() => setLookup(null), []);

  // ---------------------------------------------------------------- tag browser target
  const target = cur && listFor(cur, activeKey) ? activeKey : BASE;
  const targetTags = cur ? listFor(cur, target) ?? [] : [];
  const selected = useMemo(() => new Set(targetTags.map(tagKey)), [targetTags]);
  const toggleInTarget = (text: string) => update(c => {
    const list = listFor(c, target);
    if (!list) return;
    const i = list.findIndex(t => tagKey(t) === tagKey(text));
    if (i >= 0) list.splice(i, 1); else list.push(text);
  });

  return (
    <DndContext.Provider value={dnd}>
      <div className="grid h-screen grid-cols-[190px_minmax(0,1fr)_270px] bg-ink text-paper lg:grid-cols-[230px_minmax(0,1fr)_340px] 2xl:grid-cols-[260px_minmax(0,1fr)_400px]">
        <Sidebar
          chars={chars} current={curId} onSelect={select} onCreate={n => create(n)} loc={loc} onImport={importChars} onError={setError}
          onDirChanged={async msg => { await flush(); await load(); setNotice(msg); }}
          onReload={async () => { await flush(); await load(); setNotice(loc?.kind === "browser" ? "Reloaded" : "Reloaded from disk"); }}
        />

        <main className="flex min-h-0 flex-col">
          {error && (
            <div role="alert" className="flex items-center justify-between gap-4 border-l-4 border-coral bg-coral/15 px-5 py-2.5 font-talk text-[15px] text-paper">
              {error}<button onClick={() => setError(null)} className="font-sans text-bone underline-offset-4 hover:text-paper hover:underline">Dismiss</button>
            </div>
          )}
          {notice && <div role="status" className="border-l-4 border-caramel bg-caramel/15 px-5 py-2.5 font-talk text-[15px] text-paper">{notice}</div>}
          {!cur ? (
            <div className="grid flex-1 place-items-center font-sans text-2xl font-light text-bone">Name a character on the left to start.</div>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-10 overflow-y-auto px-8 pb-6 pt-6">
                <div className="flex items-end gap-2">
                  <input
                    value={cur.name}
                    onChange={e => update(c => { c.name = e.target.value; })}
                    aria-label="Character name"
                    className="min-w-0 flex-1 bg-transparent font-sans text-[56px] font-light leading-none text-paper focus:outline-none"
                  />
                  <Button size="sm" variant="ghost" onClick={() => create(cur.name + " copy", cur)}><CopyPlus className="h-3.5 w-3.5" />Duplicate character</Button>
                  <Confirm message={`Delete character "${cur.name}"? ${loc?.kind === "browser" ? "This can't be undone." : "This removes its file."}`} onConfirm={() => remove(cur.id)}>
                    <Button size="sm" variant="danger"><Trash2 className="h-3.5 w-3.5" />Delete character</Button>
                  </Confirm>
                </div>

                <section>
                  <Heading note="always in the prompt">General</Heading>
                  <div className="mt-3">
                    <TagList listKey={BASE} tags={cur.base} db={db} active={sameKey(target, BASE)} onActivate={() => setActiveKey(BASE)}
                      onChange={tags => update(c => { c.base = tags; })} />
                  </div>
                </section>

                {cur.categories.map((cat, i) => (
                  <CategoryCard
                    key={cat.id}
                    cat={cat}
                    color={i + 1}
                    db={db}
                    activeKey={target}
                    setActive={setActiveKey}
                    onChange={fn => update(c => { const x = c.categories.find(x => x.id === cat.id); if (x) fn(x); })}
                    onDelete={() => update(c => { c.categories = c.categories.filter(x => x.id !== cat.id); })}
                  />
                ))}
                <div className="!mt-6">
                  <Button variant="default" size="sm" onClick={() => update(c => {
                    c.categories.push({ id: uniqueId("category", c.categories.map(x => x.id)), name: "New category", presets: [], selected: null });
                  })}><Plus className="h-4 w-4" />Add category</Button>
                  <span className="ml-2 font-talk text-sm text-taupe">A pick-one group, like Hairstyle or Location.</span>
                </div>

                <TogglesCard toggles={cur.toggles} db={db} activeKey={target} setActive={setActiveKey}
                  onChange={fn => update(c => fn(c.toggles))} />

                <label className="block">
                  <span className="mb-3 block"><Heading>Notes</Heading></span>
                  <textarea
                    value={cur.notes}
                    onChange={e => update(c => { c.notes = e.target.value; })}
                    rows={2}
                    className="w-full resize-y rounded-xl border-2 border-ink-3 bg-ink-2 px-3 py-2 font-talk text-[15px] text-bone hover:border-ink-line focus:border-caramel focus:outline-none"
                  />
                </label>
                <p className="max-w-[70ch] font-talk text-sm leading-relaxed text-taupe">
                  Click a tag to switch it off or on. Ctrl+scroll changes its weight and double-click edits it.
                  Drag tags to move them, onto preset tabs and toggle rows too (hold Ctrl to copy). Drop a tag on the boxes that appear on the right to see pictures of it.
                </p>
              </div>
              <PromptPanel ch={cur} onNegative={v => update(c => { c.negative = v; })} />
            </>
          )}
        </main>

        <div className="relative flex min-h-0 flex-col">
          <TagBrowser db={db} target={cur ? listLabel(cur, target) : "—"} selected={selected} onToggle={text => cur && toggleInTarget(text)} />
          {lookup && <ImagePanel tag={lookup} onTag={setLookup} onClose={closeLookup} />}
        </div>
      </div>
      <SearchDropZones onDanbooru={setLookup} />
    </DndContext.Provider>
  );
}

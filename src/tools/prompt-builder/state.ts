import { create } from "zustand";
import { STATIC } from "@/shared/lib/env";
import { uniqueId } from "@/shared/lib/utils";
import type { DragTag } from "./lib/dnd";
import { listFor, sameKey, tagKey } from "./lib/prompt";
import { getLocation, NeedsPermission, type Location } from "@/shared/lib/workspace";
import { deleteCharacter, listCharacters, newCharacter, saveCharacter } from "./lib/store";
import { loadTagDb, type TagDb } from "./lib/tags";
import type { Character, ListKey } from "./lib/types";

export const BASE: ListKey = { kind: "base" };

type State = {
  chars: Character[];
  curId: string | null;
  /** The tag list the tag browser adds to (the one last clicked). */
  activeKey: ListKey;
  db: TagDb | null;
  loc: Location | null;
  error: string | null;
  notice: string | null;
  /** The tag being dragged, if any. */
  drag: DragTag | null;
};

type Actions = {
  /** Load characters and tag data. Called once when the tool opens. */
  init: () => void;
  load: () => Promise<void>;
  /** Save every character that changed since its last save. */
  flush: () => Promise<void>;
  /** Save pending edits, reload from the save location, then show `msg`. */
  reload: (msg: string) => Promise<void>;
  /** Drop unsaved in-memory edits: run `drop`, then reload without saving first. */
  revert: (drop: () => Promise<void>) => Promise<void>;
  /** Change the current character. `fn` gets a copy it may mutate. */
  update: (fn: (c: Character) => void) => void;
  select: (id: string) => void;
  create: (name: string, from?: Character) => void;
  importChars: (incoming: Character[]) => void;
  remove: (id: string) => Promise<void>;
  setActiveKey: (k: ListKey) => void;
  /** Add the tag to the target list, or remove it if it's already there. */
  toggleInTarget: (text: string) => void;
  setError: (msg: string | null) => void;
  setNotice: (msg: string | null) => void;
  dragStart: (d: DragTag) => void;
  dragEnd: () => void;
  /** Drop the dragged tag into list `to` before position `index` (Infinity = end). `copy` keeps it in its old list. */
  drop: (to: ListKey, index: number, copy: boolean) => void;
};

/** JSON of each character as last saved, to skip saves that would change nothing. */
let savedJson = new Map<string, string>();
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
const byName = (a: Character, b: Character) => a.name.localeCompare(b.name);

export const usePromptBuilder = create<State & Actions>()((set, get) => ({
  chars: [],
  curId: null,
  activeKey: BASE,
  db: null,
  loc: null,
  error: null,
  notice: null,
  drag: null,

  init: () => {
    get().load();
    loadTagDb().then(db => set({ db }), e => set({ error: "tag data: " + e }));
  },

  load: async () => {
    try {
      const loc = await getLocation();
      set({ loc });
      if (!loc.ready) { savedJson = new Map(); set({ chars: [] }); return; }   // folder waits for "Allow folder access"
      const cs = await listCharacters();
      savedJson = new Map(cs.map(c => [c.id, JSON.stringify(c)]));
      set(s => ({ chars: cs, curId: cs.some(c => c.id === s.curId) ? s.curId : cs[0]?.id ?? null, error: null }));
    } catch (e) {
      if (e instanceof NeedsPermission) return set(s => ({ loc: s.loc && { ...s.loc, ready: false } }));
      const hint = STATIC ? "" : ' (is this running through "pnpm dev"?)';
      set({ error: `Could not load characters${hint}: ${e instanceof Error ? e.message : e}` });
    }
  },

  flush: async () => {
    for (const c of get().chars) {
      const json = JSON.stringify(c);
      if (savedJson.get(c.id) === json) continue;
      savedJson.set(c.id, json);
      await saveCharacter(c).catch(e => set({ error: "save failed: " + e.message }));
    }
  },

  reload: async msg => {
    await get().flush();
    await get().load();
    get().setNotice(msg);
  },

  revert: async drop => {
    clearTimeout(saveTimer);
    await drop();
    await get().load();
    get().setNotice("Discarded");
  },

  update: fn => set(s => ({
    chars: s.chars.map(c => {
      if (c.id !== s.curId) return c;
      const next = structuredClone(c);
      fn(next);
      return next;
    }),
  })),

  select: id => set({ curId: id, activeKey: BASE }),

  create: (name, from) => {
    const id = uniqueId(name, get().chars.map(c => c.id));
    const c = from ? { ...structuredClone(from), id, name } : newCharacter(name, id);
    set(s => ({ chars: [...s.chars, c].sort(byName) }));
    get().select(id);
  },

  /** Imported characters replace ones with the same id (restoring a backup), the rest are added. */
  importChars: incoming => {
    const byId = new Map(get().chars.map(c => [c.id, c]));
    const replaced = incoming.filter(c => byId.has(c.id)).length;
    for (const c of incoming) byId.set(c.id, c);
    set({ chars: [...byId.values()].sort(byName) });
    if (incoming[0]) get().select(incoming[0].id);
    get().setNotice(`Imported ${incoming.length} character${incoming.length === 1 ? "" : "s"}${replaced ? ` (${replaced} replaced)` : ""}`);
  },

  remove: async id => {
    await deleteCharacter(id).catch(e => set({ error: e.message }));
    savedJson.delete(id);
    const rest = get().chars.filter(c => c.id !== id);
    set({ chars: rest, curId: rest[0]?.id ?? null });
  },

  setActiveKey: activeKey => set({ activeKey }),

  toggleInTarget: text => {
    const target = targetKey(get());
    get().update(c => {
      const list = listFor(c, target);
      if (!list) return;
      const i = list.findIndex(t => tagKey(t) === tagKey(text));
      if (i >= 0) list.splice(i, 1); else list.push(text);
    });
  },

  setError: error => set({ error }),

  setNotice: notice => {
    clearTimeout(noticeTimer);
    set({ notice });
    if (notice) noticeTimer = setTimeout(() => set({ notice: null }), 5000);
  },

  dragStart: drag => set({ drag }),
  dragEnd: () => set({ drag: null }),

  drop: (to, index, copy) => {
    const d = get().drag;
    set({ drag: null });
    if (!d) return;
    get().update(c => {
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
}));

// ---------------------------------------------------------------- derived values

export const currentChar = (s: State) => s.chars.find(c => c.id === s.curId) ?? null;

/** The list the tag browser adds to: the active one, or General if that list no longer exists. */
export function targetKey(s: State): ListKey {
  const cur = currentChar(s);
  return cur && listFor(cur, s.activeKey) ? s.activeKey : BASE;
}

// ---------------------------------------------------------------- autosave

let saveTimer: ReturnType<typeof setTimeout> | undefined;

// 400ms after the last edit
usePromptBuilder.subscribe((s, prev) => {
  if (s.chars === prev.chars) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => usePromptBuilder.getState().flush(), 400);
});

// right away when the tab is hidden or closed, so the last edit isn't lost
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    clearTimeout(saveTimer);
    usePromptBuilder.getState().flush();
  });
}

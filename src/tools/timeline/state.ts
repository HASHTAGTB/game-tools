import { create } from "zustand";
import { createFileSync, type FileConflict } from "@/shared/lib/fileSync";
import { browserPrefs, debounce, noticeSetter, whenHidden } from "@/shared/lib/toolState";
import { errorMessage, freeName } from "@/shared/lib/utils";
import { getLocation, NeedsPermission, type Location } from "@/shared/lib/workspace";
import type { Doc } from "./lib/model";
import { applyFile, blankFile, docFiles, docPaths, EMPTY_DOC, fileLabel, normalizeFilter, sortChapters } from "./lib/store";
import { NO_FILTER, type Chapter, type Filter } from "./lib/types";

export type { Doc };
export type Selection = { kind: "event" | "chapter" | "thread" | "char" | "view"; id: string } | null;

type State = {
  loc: Location | null;
  loaded: boolean;
  doc: Doc;
  selection: Selection;
  /** Column width factor. */
  zoom: number;
  /** What the board shows right now (this browser only). */
  filter: Filter;
  /** The saved view the filter came from, if any. */
  viewId: string | null;
  /** Chapters folded to a strip (this browser only). */
  folded: Set<string>;
  conflicts: FileConflict[];
  error: string | null;
  notice: string | null;
  canUndo: boolean;
  canRedo: boolean;
};

type Actions = {
  init: () => () => void;
  load: () => Promise<void>;
  reload: (msg: string) => Promise<void>;
  flush: () => Promise<void>;
  /** Drop unsaved in-memory edits: wait for any write in progress, run `drop`, reload without writing first. */
  revert: (drop: () => Promise<void>) => Promise<void>;
  /** Change the data. `fn` gets a copy it may mutate. Edits with the same `key` less than 1.5s apart (typing in one
   *  field) are one undo step. */
  edit: (fn: (d: Doc) => void, key?: string) => void;
  undo: () => void;
  redo: () => void;
  select: (s: Selection) => void;
  setZoom: (z: number) => void;
  setFilter: (f: Partial<Filter>, viewId?: string | null) => void;
  toggleFolded: (id: string) => void;
  resolveConflict: (path: string, keep: "mine" | "theirs") => void;
  setError: (msg: string | null) => void;
  setNotice: (msg: string | null) => void;
};

/** Zoom, focus and folded chapters: this browser only. */
const prefs = browserPrefs("timeline-view-2", p => ({
  zoom: typeof p.zoom === "number" ? p.zoom : 1,
  filter: p.filter ? normalizeFilter(p.filter) : NO_FILTER,
  viewId: typeof p.viewId === "string" ? p.viewId : null,
  folded: new Set<string>(Array.isArray(p.folded) ? p.folded : []),
}));
const saved = prefs.read();

export const useTimeline = create<State & Actions>()((set, get) => {
  /** Saving: a moment after the last change (and when the tab is hidden, below). */
  const autosave = debounce(() => get().flush(), 400);

  // ---------------------------------------------------------------- undo
  let past: Doc[] = [];
  let future: Doc[] = [];
  let lastKey: string | undefined;
  let lastAt = 0;
  const setDoc = (doc: Doc, history: "push" | "none" | "clear", from?: Doc) => {
    if (history === "push" && from) { past.push(from); if (past.length > 200) past.shift(); future = []; }
    if (history === "clear") { past = []; future = []; }
    set({ doc, canUndo: past.length > 0, canRedo: future.length > 0 });
    if (get().loaded) autosave.schedule();
  };
  const savePrefs = () => { const s = get(); prefs.write({ zoom: s.zoom, filter: s.filter, viewId: s.viewId, folded: [...s.folded] }); };

  // ---------------------------------------------------------------- files (shared/lib/fileSync)
  const sync = createFileSync({
    empty: EMPTY_DOC,
    get: () => get().doc,
    set: doc => setDoc(doc, "clear"),
    files: docFiles,
    applyFile,
    list: docPaths,
    blank: blankFile,
    label: path => fileLabel(get().doc, path),
    conflicts: () => get().conflicts,
    setConflicts: conflicts => set({ conflicts }),
    onError: e => set({ error: "Saving failed: " + errorMessage(e) }),
    onReloaded: labels => get().setNotice(labels.length === 1
      ? `${labels[0]} changed on disk and was reloaded.`
      : `${labels.length} files changed on disk and were reloaded.`),
  });

  return {
    loc: null, loaded: false, doc: EMPTY_DOC, selection: null,
    zoom: saved.zoom, filter: saved.filter, viewId: saved.viewId, folded: saved.folded,
    conflicts: [], error: null, notice: null, canUndo: false, canRedo: false,

    init: () => {
      // opened again after another tool: keep what's here, only look for changes made meanwhile
      if (get().loaded && sync.current()) sync.check(); else get().load();
      return sync.watch(() => get().loaded);
    },

    load: async () => {
      try {
        const loc = await getLocation();
        set({ loc });
        if (!loc.ready) { sync.reset(); setDoc(EMPTY_DOC, "clear"); set({ loaded: false }); return; }
        const broken = await sync.load();
        set({ loaded: true, error: broken.length ? `These files couldn't be read and are left alone: ${broken.join(", ")}` : null });
      } catch (e) {
        if (e instanceof NeedsPermission) return set(s => ({ loc: s.loc && { ...s.loc, ready: false } }));
        set({ error: `Could not load the timeline: ${errorMessage(e)}` });
      }
    },

    reload: async msg => {
      await get().flush();
      await get().load();
      get().setNotice(msg);
    },

    flush: () => { autosave.cancel(); return sync.flush(); },

    revert: async drop => {
      autosave.cancel();
      // queued after any flush already running, so nothing writes between dropping and loading
      await sync.run(async () => { await drop(); await get().load(); });
      get().setNotice("Discarded");
    },

    edit: (fn, key) => {
      const before = get().doc;
      const after = structuredClone(before);
      fn(after);
      after.chapters = sortChapters(after.chapters);
      // nothing changed (a resize drag over the same column, an arrow that already exists): no save, no undo step
      if (JSON.stringify(after) === JSON.stringify(before)) return;
      const now = Date.now();
      const merge = key !== undefined && key === lastKey && now - lastAt < 1500 && past.length > 0;
      lastKey = key; lastAt = now;
      setDoc(after, merge ? "none" : "push", before);
      if (merge) future = [];
    },

    undo: () => {
      lastKey = undefined;
      const prev = past.pop();
      if (!prev) return;
      future.push(get().doc);
      setDoc(prev, "none");
    },
    redo: () => {
      const next = future.pop();
      if (!next) return;
      past.push(get().doc);
      setDoc(next, "none");
    },

    select: selection => set({ selection }),

    setZoom: zoom => { set({ zoom: Math.min(2, Math.max(0.45, zoom)) }); savePrefs(); },
    setFilter: (f, viewId) => { set(s => ({ filter: normalizeFilter({ ...s.filter, ...f }), viewId: viewId === undefined ? s.viewId : viewId })); savePrefs(); },
    toggleFolded: id => { set(s => { const f = new Set(s.folded); if (!f.delete(id)) f.add(id); return { folded: f }; }); savePrefs(); },

    resolveConflict: (path, keep) => sync.resolve(path, keep),

    setError: error => set({ error }),
    setNotice: noticeSetter(set),
  };
});

/** A new chapter's file id, unique among `chapters`. */
export const chapterIdFor = (chapters: Chapter[], base = "chapter") => {
  const taken = new Set(chapters.map(c => c.id));
  return freeName(base, id => taken.has(id));
};

whenHidden(() => useTimeline.getState().flush());

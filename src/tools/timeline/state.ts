import { create } from "zustand";
import { getLocation, NeedsPermission, type Location } from "@/shared/lib/workspace";
import type { Doc } from "./lib/model";
import {
  CHAPTERS_DIR, chapterPath, listFiles, loadChapters, loadShared, normalizeChapter, normalizeFilter, normalizeRoster, normalizeThreads,
  normalizeViews, readFile, removeFile, ROSTER_PATH, sortChapters, statFile, THREADS_PATH, toText, VIEWS_PATH, writeText, type Known,
} from "./lib/store";
import { NO_FILTER, type Chapter, type Filter } from "./lib/types";

export type { Doc };
export type Selection = { kind: "event" | "chapter" | "thread" | "char" | "view"; id: string } | null;
/** Someone else changed (or deleted: `theirs` null) a file while this tab had unsaved edits to it. */
export type Conflict = { path: string; label: string; theirs: string | null; mtime: number | null };

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
  conflicts: Conflict[];
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

// ---------------------------------------------------------------- per-viewer settings (this browser only)

const PREFS = "timeline-view-2";
type Prefs = { zoom: number; filter: Filter; viewId: string | null; folded: string[] };
function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? "{}");
    return { zoom: typeof p.zoom === "number" ? p.zoom : 1, filter: normalizeFilter(p.filter), viewId: p.viewId ?? null, folded: Array.isArray(p.folded) ? p.folded : [] };
  } catch { return { zoom: 1, filter: NO_FILTER, viewId: null, folded: [] }; }
}
function writePrefs(s: Pick<State, "zoom" | "filter" | "viewId" | "folded">) {
  try { localStorage.setItem(PREFS, JSON.stringify({ zoom: s.zoom, filter: s.filter, viewId: s.viewId, folded: [...s.folded] })); } catch { /* private window */ }
}

// ---------------------------------------------------------------- files

const SHARED = [ROSTER_PATH, THREADS_PATH, VIEWS_PATH];
const isShared = (p: string) => SHARED.includes(p);

/** Every file the doc is made of, as path → text. Shared files only once they exist or were edited. */
function docFiles(d: Doc, all = false): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of d.chapters) out.set(chapterPath(c.id), toText(c));
  if (all || shared.has(ROSTER_PATH)) out.set(ROSTER_PATH, toText({ version: 1, characters: d.roster }));
  if (all || shared.has(THREADS_PATH)) out.set(THREADS_PATH, toText({ version: 1, threads: d.threads }));
  if (all || shared.has(VIEWS_PATH)) out.set(VIEWS_PATH, toText({ version: 1, views: d.views }));
  return out;
}

/** The doc with one file's contents put in (null: the file was deleted). */
function applyFile(d: Doc, path: string, text: string | null): Doc {
  const data = text === null ? null : JSON.parse(text);
  if (path === ROSTER_PATH) return data ? { ...d, roster: normalizeRoster(data).characters } : d;
  if (path === THREADS_PATH) return data ? { ...d, threads: normalizeThreads(data) } : d;
  if (path === VIEWS_PATH) return data ? { ...d, views: normalizeViews(data) } : d;
  const rest = d.chapters.filter(c => chapterPath(c.id) !== path);
  if (!data) return { ...d, chapters: rest };
  return { ...d, chapters: sortChapters([...rest, normalizeChapter(data, path.split("/").pop()!.replace(/\.json$/, ""))]) };
}

const labelOf = (d: Doc, path: string) =>
  path === ROSTER_PATH ? "The character list" : path === THREADS_PATH ? "The thread list" : path === VIEWS_PATH ? "The saved views"
    : `Chapter "${d.chapters.find(c => chapterPath(c.id) === path)?.name ?? path.split("/").pop()}"`;

let known = new Map<string, Known>();
/** Shared files that exist or were edited, so they get written. */
const shared = new Set<string>();
let past: Doc[] = [];
let future: Doc[] = [];
let lastKey: string | undefined;
let lastAt = 0;
let queue: Promise<void> = Promise.resolve();
const serial = (fn: () => Promise<void>) => (queue = queue.then(fn, fn));
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

const EMPTY: Doc = { chapters: [], roster: [], threads: [], views: [] };
const prefs = readPrefs();

export const useTimeline = create<State & Actions>()((set, get) => {
  const setDoc = (doc: Doc, history: "push" | "none" | "clear", from?: Doc) => {
    if (history === "push" && from) { past.push(from); if (past.length > 200) past.shift(); future = []; }
    if (history === "clear") { past = []; future = []; }
    set({ doc, canUndo: past.length > 0, canRedo: future.length > 0 });
  };
  const savePrefs = () => writePrefs(get());

  return {
    loc: null, loaded: false, doc: EMPTY, selection: null,
    zoom: prefs.zoom, filter: prefs.filter, viewId: prefs.viewId, folded: new Set(prefs.folded),
    conflicts: [], error: null, notice: null, canUndo: false, canRedo: false,

    init: () => {
      get().load();
      const timer = setInterval(() => {
        if (document.visibilityState === "visible" && get().loaded) serial(poll);
      }, 4000);
      return () => clearInterval(timer);
    },

    load: async () => {
      try {
        const loc = await getLocation();
        set({ loc });
        if (!loc.ready) { known = new Map(); setDoc(EMPTY, "clear"); set({ loaded: false }); return; }
        const [{ chapters, known: k, broken }, r, t, v] = await Promise.all([
          loadChapters(), loadShared(ROSTER_PATH, normalizeRoster), loadShared(THREADS_PATH, normalizeThreads), loadShared(VIEWS_PATH, normalizeViews),
        ]);
        known = k;
        shared.clear();
        for (const [path, f] of [[ROSTER_PATH, r.known], [THREADS_PATH, t.known], [VIEWS_PATH, v.known]] as const) {
          if (f) { known.set(path, f); shared.add(path); }
        }
        setDoc({ chapters, roster: r.data.characters, threads: t.data, views: v.data }, "clear");
        set({ loaded: true, conflicts: [], error: broken.length ? `These files couldn't be read and are left alone: ${broken.join(", ")}` : null });
      } catch (e) {
        if (e instanceof NeedsPermission) return set(s => ({ loc: s.loc && { ...s.loc, ready: false } }));
        set({ error: `Could not load the timeline: ${e instanceof Error ? e.message : e}` });
      }
    },

    reload: async msg => {
      await get().flush();
      await get().load();
      get().setNotice(msg);
    },

    flush: () => serial(flushNow),

    edit: (fn, key) => {
      const before = get().doc;
      const after = structuredClone(before);
      fn(after);
      after.chapters = sortChapters(after.chapters);
      if (JSON.stringify(after.roster) !== JSON.stringify(before.roster)) shared.add(ROSTER_PATH);
      if (JSON.stringify(after.threads) !== JSON.stringify(before.threads)) shared.add(THREADS_PATH);
      if (JSON.stringify(after.views) !== JSON.stringify(before.views)) shared.add(VIEWS_PATH);
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

    resolveConflict: (path, keep) => {
      const c = get().conflicts.find(x => x.path === path);
      if (!c) return;
      set(s => ({ conflicts: s.conflicts.filter(x => x.path !== path) }));
      if (c.theirs === null) known.delete(path); else known.set(path, { text: c.theirs, mtime: c.mtime! });
      // "theirs": take their file; "mine": we now count as having seen theirs, so the next save overwrites it
      if (keep === "theirs") setDoc(applyFile(get().doc, path, c.theirs), "clear");
      else get().flush();
    },

    setError: error => set({ error }),
    setNotice: notice => {
      clearTimeout(noticeTimer);
      set({ notice });
      if (notice) noticeTimer = setTimeout(() => set({ notice: null }), 5000);
    },
  };

  // ---------------------------------------------------------------- saving and watching (run one at a time)

  async function flushNow() {
    const { doc, conflicts } = get();
    const files = docFiles(doc);
    const blocked = new Set(conflicts.map(c => c.path));
    try {
      for (const [path, text] of files) {
        const k = known.get(path);
        if (k?.text === text || blocked.has(path)) continue;
        const now = await statFile(path);
        if (k ? now !== k.mtime : now !== null) { await addConflict(path); continue; }
        known.set(path, { text, mtime: await writeText(path, text) });
      }
      // chapters deleted here
      for (const [path, k] of [...known]) {
        if (files.has(path) || isShared(path) || blocked.has(path)) continue;
        const now = await statFile(path);
        if (now !== null && now !== k.mtime) { await addConflict(path); continue; }
        await removeFile(path);
        known.delete(path);
      }
    } catch (e) {
      set({ error: "Saving failed: " + (e instanceof Error ? e.message : e) });
    }
  }

  async function addConflict(path: string) {
    const f = await readFile(path);
    if (get().conflicts.some(c => c.path === path)) return;
    set(s => ({ conflicts: [...s.conflicts, { path, label: labelOf(s.doc, path), theirs: f?.text ?? null, mtime: f?.mtime ?? null }] }));
  }

  /** Pick up changes other people made (git pull, another tab). Files this tab hasn't changed are reloaded; files it
   *  has changed become conflicts. */
  async function poll() {
    try {
      const paths = new Set([...await listFiles(CHAPTERS_DIR, ".json"), ...SHARED, ...known.keys()]);
      const local = docFiles(get().doc, true);
      const changed: string[] = [];
      let doc = get().doc;
      for (const path of paths) {
        const k = known.get(path);
        const now = await statFile(path);
        if ((k && now === k.mtime) || (!k && now === null)) continue;
        const f = now === null ? null : await readFile(path);
        const theirs = f?.text ?? null;
        const mine = local.get(path) ?? null;
        const unsaved = isShared(path) && !shared.has(path) ? false : mine !== (k?.text ?? null);
        if (theirs === mine) { if (f) known.set(path, f); else known.delete(path); continue; }
        if (unsaved) { if (!get().conflicts.some(c => c.path === path)) set(s => ({ conflicts: [...s.conflicts, { path, label: labelOf(doc, path), theirs, mtime: f?.mtime ?? null }] })); continue; }
        try { doc = applyFile(doc, path, theirs); } catch { continue; }   // half-written file: try again next time
        if (f) known.set(path, f); else known.delete(path);
        if (isShared(path)) shared.add(path);
        changed.push(labelOf(doc, path));
      }
      if (changed.length) {
        setDoc(doc, "clear");
        get().setNotice(changed.length === 1 ? `${changed[0]} changed on disk and was reloaded.` : `${changed.length} files changed on disk and were reloaded.`);
      }
    } catch { /* offline folder, permission gone: the next load shows it */ }
  }
});

/** A new chapter's file id, unique among `chapters`. */
export const chapterIdFor = (chapters: Chapter[], base = "chapter") => {
  const taken = new Set(chapters.map(c => c.id));
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
};

// ---------------------------------------------------------------- autosave

let saveTimer: ReturnType<typeof setTimeout> | undefined;
useTimeline.subscribe((s, prev) => {
  if (s.doc === prev.doc || !s.loaded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => useTimeline.getState().flush(), 400);
});
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    clearTimeout(saveTimer);
    useTimeline.getState().flush();
  });
}

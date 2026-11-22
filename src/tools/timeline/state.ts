import { create } from "zustand";
import type { RosterCharacter } from "@/shared/lib/roster";
import { getLocation, NeedsPermission, type Location } from "@/shared/lib/workspace";
import { resolve, type Resolved } from "./lib/resolve";
import { loadScenes, type Scene } from "./lib/scenes";
import {
  ARCS_DIR, arcPath, FACTS_PATH, listFiles, loadArcs, loadFactsFile, loadRosterFile, normalizeArc, normalizeFacts, normalizeRoster,
  readFile, removeFile, ROSTER_PATH, statFile, toText, writeText, type Known,
} from "./lib/store";
import type { Arc, Fact } from "./lib/types";

export type Doc = { arcs: Arc[]; roster: RosterCharacter[]; facts: Fact[] };
export type Selection = { kind: "event" | "arc" | "connection" | "char" | "fact"; id: string } | null;
/** Someone else changed (or deleted: `theirs` null) a file while this tab had unsaved edits to it. */
export type Conflict = { path: string; label: string; theirs: string | null; mtime: number | null };

type State = {
  loc: Location | null;
  loaded: boolean;
  doc: Doc;
  res: Resolved;
  /** The vault's scene files (empty without a vault). */
  scenes: Scene[];
  selection: Selection;
  pxPerHour: number;
  hidden: Set<string>;
  collapsed: Set<string>;
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
  loadScenes: () => Promise<void>;
  flush: () => Promise<void>;
  /** Change the data. `fn` gets a copy it may mutate (or return a new arcs list) and the current resolved times.
   *  Edits with the same `key` less than 1.5s apart (typing in one field) are one undo step. */
  edit: (fn: (d: Doc, res: Resolved) => void | Arc[], key?: string) => void;
  /** Drags: `startGesture`, then any number of `gesture` calls (each starts again from the state at the start), then
   *  `endGesture`. The whole drag is one undo step. */
  startGesture: () => void;
  gesture: (fn: (d: Doc, res: Resolved) => void) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  select: (s: Selection) => void;
  setZoom: (pxPerHour: number) => void;
  toggleHidden: (id: string) => void;
  toggleCollapsed: (id: string) => void;
  resolveConflict: (path: string, keep: "mine" | "theirs") => void;
  setError: (msg: string | null) => void;
  setNotice: (msg: string | null) => void;
};

// ---------------------------------------------------------------- per-viewer settings (this browser only)

const PREFS = "timeline-view";
type Prefs = { pxPerHour: number; hidden: string[]; collapsed: string[] };
function readPrefs(): Prefs {
  try { return { pxPerHour: 8, hidden: [], collapsed: [], ...JSON.parse(localStorage.getItem(PREFS) ?? "{}") }; } catch { return { pxPerHour: 8, hidden: [], collapsed: [] }; }
}
function writePrefs(s: Pick<State, "pxPerHour" | "hidden" | "collapsed">) {
  try { localStorage.setItem(PREFS, JSON.stringify({ pxPerHour: s.pxPerHour, hidden: [...s.hidden], collapsed: [...s.collapsed] })); } catch { /* private window */ }
}

// ---------------------------------------------------------------- files

/** Every file the doc is made of, as path → text. The roster and facts files only once they exist or were edited. */
function docFiles(d: Doc, all = false): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of d.arcs) out.set(arcPath(a.id), toText(a));
  if (all || shared.has(ROSTER_PATH)) out.set(ROSTER_PATH, toText({ version: 1, characters: d.roster }));
  if (all || shared.has(FACTS_PATH)) out.set(FACTS_PATH, toText({ version: 1, facts: d.facts }));
  return out;
}

/** The doc with one file's contents put in (null: the file was deleted). */
function applyFile(d: Doc, path: string, text: string | null): Doc {
  if (path === ROSTER_PATH) return { ...d, roster: text === null ? d.roster : normalizeRoster(JSON.parse(text)).characters };
  if (path === FACTS_PATH) return { ...d, facts: text === null ? d.facts : normalizeFacts(JSON.parse(text)) };
  const id = path.split("/").pop()!.replace(/\.json$/, "");
  const rest = d.arcs.filter(a => arcPath(a.id) !== path);
  if (text === null) return { ...d, arcs: rest };
  const arc = normalizeArc(JSON.parse(text), id);
  const i = d.arcs.findIndex(a => arcPath(a.id) === path);
  const arcs = [...rest];
  arcs.splice(i < 0 ? arcs.length : i, 0, arc);
  return { ...d, arcs };
}

const labelOf = (d: Doc, path: string) => path === ROSTER_PATH ? "The character list" : path === FACTS_PATH ? "The fact list" : `Arc "${d.arcs.find(a => arcPath(a.id) === path)?.name ?? path.split("/").pop()}"`;

let known = new Map<string, Known>();
/** Shared files (roster, facts) that exist or were edited, so they get written. */
const shared = new Set<string>();
let past: Doc[] = [];
let future: Doc[] = [];
let gestureBase: Doc | null = null;
let lastKey: string | undefined;
let lastAt = 0;
let queue: Promise<void> = Promise.resolve();
const serial = (fn: () => Promise<void>) => (queue = queue.then(fn, fn));
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

const EMPTY: Doc = { arcs: [], roster: [], facts: [] };
const prefs = readPrefs();

export const useTimeline = create<State & Actions>()((set, get) => {
  const setDoc = (doc: Doc, history: "push" | "none" | "clear", from?: Doc) => {
    if (history === "push" && from) { past.push(from); if (past.length > 200) past.shift(); future = []; }
    if (history === "clear") { past = []; future = []; }
    set({ doc, res: resolve(doc.arcs), canUndo: past.length > 0, canRedo: future.length > 0 });
  };
  const draft = (fn: (d: Doc, res: Resolved) => void | Arc[], base: Doc) => {
    const d = structuredClone(base);
    const arcs = fn(d, get().res);
    if (arcs) d.arcs = arcs;
    return d;
  };

  return {
    loc: null, loaded: false, doc: EMPTY, res: resolve([]), scenes: [], selection: null,
    pxPerHour: prefs.pxPerHour, hidden: new Set(prefs.hidden), collapsed: new Set(prefs.collapsed),
    conflicts: [], error: null, notice: null, canUndo: false, canRedo: false,

    init: () => {
      get().load();
      const timer = setInterval(() => {
        if (document.visibilityState === "visible" && get().loaded && !gestureBase) serial(poll);
      }, 4000);
      // scenes are written in Obsidian: look at them again when coming back to this tab
      const onFocus = () => { if (get().loaded) get().loadScenes(); };
      window.addEventListener("focus", onFocus);
      return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
    },

    load: async () => {
      try {
        const loc = await getLocation();
        set({ loc });
        if (!loc.ready) { known = new Map(); setDoc(EMPTY, "clear"); set({ loaded: false }); return; }
        const [{ arcs, known: k, broken }, r, f] = await Promise.all([loadArcs(), loadRosterFile(), loadFactsFile()]);
        known = k;
        shared.clear();
        if (r.known) { known.set(ROSTER_PATH, r.known); shared.add(ROSTER_PATH); }
        if (f.known) { known.set(FACTS_PATH, f.known); shared.add(FACTS_PATH); }
        setDoc({ arcs, roster: r.roster.characters, facts: f.facts }, "clear");
        set({ loaded: true, conflicts: [], error: broken.length ? `These files couldn't be read and are left alone: ${broken.join(", ")}` : null });
        get().loadScenes();
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

    loadScenes: async () => {
      if (get().loc?.kind === "browser") return set({ scenes: [] });
      try { set({ scenes: await loadScenes() }); } catch { set({ scenes: [] }); }
    },

    edit: (fn, key) => {
      const before = get().doc;
      const after = draft(fn, before);
      if (JSON.stringify(after.roster) !== JSON.stringify(before.roster)) shared.add(ROSTER_PATH);
      if (JSON.stringify(after.facts) !== JSON.stringify(before.facts)) shared.add(FACTS_PATH);
      const now = Date.now();
      const merge = key !== undefined && key === lastKey && now - lastAt < 1500 && past.length > 0;
      lastKey = key; lastAt = now;
      setDoc(after, merge ? "none" : "push", before);
      if (merge) future = [];
    },

    startGesture: () => { gestureBase = get().doc; },
    gesture: fn => { if (gestureBase) setDoc(draft(fn, gestureBase), "none"); },
    endGesture: () => {
      const base = gestureBase;
      gestureBase = null;
      if (base && base !== get().doc && JSON.stringify(base.arcs) !== JSON.stringify(get().doc.arcs)) setDoc(get().doc, "push", base);
      lastKey = undefined;
      get().flush();
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

    setZoom: pxPerHour => { set({ pxPerHour: Math.min(120, Math.max(0.25, pxPerHour)) }); writePrefs(get()); },
    toggleHidden: id => set(s => { const h = new Set(s.hidden); if (!h.delete(id)) h.add(id); writePrefs({ ...s, hidden: h }); return { hidden: h }; }),
    toggleCollapsed: id => set(s => { const c = new Set(s.collapsed); if (!c.delete(id)) c.add(id); writePrefs({ ...s, collapsed: c }); return { collapsed: c }; }),

    resolveConflict: (path, keep) => {
      const c = get().conflicts.find(x => x.path === path);
      if (!c) return;
      set(s => ({ conflicts: s.conflicts.filter(x => x.path !== path) }));
      if (keep === "theirs") {
        if (c.theirs === null) known.delete(path); else known.set(path, { text: c.theirs, mtime: c.mtime! });
        setDoc(applyFile(get().doc, path, c.theirs), "clear");
      } else {
        // pretend we had seen their version, so the next save overwrites it
        if (c.theirs === null) known.delete(path); else known.set(path, { text: c.theirs, mtime: c.mtime! });
        get().flush();
      }
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
      // arcs deleted here
      for (const [path, k] of [...known]) {
        if (files.has(path) || path === ROSTER_PATH || path === FACTS_PATH || blocked.has(path)) continue;
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
      const paths = new Set([...await listFiles(ARCS_DIR, ".json"), ROSTER_PATH, FACTS_PATH, ...known.keys()]);
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
        const unsaved = (path === ROSTER_PATH || path === FACTS_PATH) && !shared.has(path) ? false : mine !== (k?.text ?? null);
        if (theirs === mine) { if (f) known.set(path, f); else known.delete(path); continue; }
        if (unsaved) { if (!get().conflicts.some(c => c.path === path)) set(s => ({ conflicts: [...s.conflicts, { path, label: labelOf(doc, path), theirs, mtime: f?.mtime ?? null }] })); continue; }
        try { doc = applyFile(doc, path, theirs); } catch { continue; }   // half-written file: try again next time
        if (f) known.set(path, f); else known.delete(path);
        if (path === ROSTER_PATH || path === FACTS_PATH) shared.add(path);
        changed.push(labelOf(doc, path));
      }
      if (changed.length) {
        setDoc(doc, "clear");
        get().setNotice(changed.length === 1 ? `${changed[0]} changed on disk and was reloaded.` : `${changed.length} files changed on disk and were reloaded.`);
      }
    } catch { /* offline folder, permission gone: the next load shows it */ }
  }
});

// ---------------------------------------------------------------- autosave

let saveTimer: ReturnType<typeof setTimeout> | undefined;
useTimeline.subscribe((s, prev) => {
  if (s.doc === prev.doc || !s.loaded || gestureBase) return;
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

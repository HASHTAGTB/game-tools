import { create } from "zustand";
import type { FileCompare } from "@/shared/lib/diff/files";
import { writeIfUnchanged, type Resolution } from "@/shared/lib/fileSync";
import { noteOutside } from "@/shared/ui/diff/store";
import { browserPrefs, debounce, noticeSetter, serialQueue, whenHidden, whileVisible } from "@/shared/lib/toolState";
import { fileName as lastPart, isUnder, joinPath, parentOf, rebase } from "@/shared/lib/paths";
import { errorMessage, freeName, plural, strings } from "@/shared/lib/utils";
import {
  getLocation, listDir, locationVersion, makeDir, movePath, NeedsPermission, readFile, removeDir, removeFile, statFile, walkFiles, writeText,
  type Entry, type Location,
} from "@/shared/lib/workspace";
import { indexFiles, resolve, rewriteLinks } from "./links";

/** A folder of the vault's files of one type, edited in place: the Notes tool (the whole vault's Markdown) and the
 *  Scenes tool (the game's scene .rpy files) each make one with `createVaultStore`. Paths are vault paths
 *  ("CANON/01_Characters/Rin.md"). Dot-folders (.obsidian, .git, .game-tools) and other file types are left out. */

export type VaultConfig = {
  /** localStorage key for this browser's view (open folders, last file, mode) */
  prefsKey: string;
  /** The folder the tree, search and new files start at ("" is the vault). */
  root: string;
  /** Files and folders this tool leaves to another one (not listed, not searched). */
  hide?: (path: string) => boolean;
  /** What a new file starts with; `name` is its file name without its extension. */
  template?: (name: string) => string;
  /** "note", "scene": used in messages. */
  noun: string;
  /** The files this tool edits: ".md" (the default) or ".rpy". [[links]] are only updated for ".md". */
  ext?: string;
  /** A link led to a file this tool hides (`hide`): let the tool that has it open it. */
  openElsewhere?: (path: string) => void;
};

export type Node = { name: string; path: string; kind: "file" | "directory" };
/** Someone else changed (or deleted: `theirs` null) the open note while it had unsaved edits. */
export type Conflict = { theirs: string | null; mtime: number | null };
/** How the editor shows Markdown: "live" hides the markup except where the cursor is (Obsidian's Live Preview),
 *  "source" is the raw text. */
export type Mode = "live" | "source";

type State = {
  loc: Location | null;
  ready: boolean;
  /** Folder path ("" is the vault) → its folders and notes, once listed. */
  tree: Record<string, Node[]>;
  expanded: Set<string>;
  /** Open note, its current text, and the text/change time last read or written. */
  path: string | null;
  text: string;
  saved: { text: string; mtime: number | null } | null;
  /** Bumped when the open note's text is replaced from outside the editor (opened, reloaded), so it resets. */
  rev: number;
  saving: boolean;
  conflict: Conflict | null;
  renaming: string | null;
  /** Folders made here that may still be empty (browser storage and GitHub can't keep empty folders). */
  virtual: Set<string>;
  /** A slow operation in progress (moving, updating links), shown instead of the tree's actions. */
  busy: string | null;
  /** Every note in the vault, for the quick switcher; null until first listed */
  index: string[] | null;
  /** Notes opened lately, newest first (this browser only) */
  recent: string[];
  /** Editor mode, the same for every note (this browser only) */
  mode: Mode;
  /** The open note's last move or rename, so the editor can tell it's the same note under a new name */
  moved: { from: string; to: string } | null;
  /** Counts the notes opened by `open`, so the URL knows which path changes deserve a history entry */
  opened: number;
  error: string | null;
  notice: string | null;
};

type Actions = {
  /** `want`: the note to open first (from the URL); the last one open here if none. */
  init: (want?: string | null) => () => void;
  load: () => Promise<void>;
  reload: (msg: string) => Promise<void>;
  flush: () => Promise<void>;
  revert: (drop: () => Promise<void>) => Promise<void>;
  toggle: (dir: string) => Promise<void>;
  /** List a folder (fresh), for the path bar's menus. */
  listFolder: (dir: string) => Promise<Node[]>;
  loadIndex: () => Promise<void>;
  open: (path: string) => Promise<void>;
  /** Follow a [[wikilink]] target (or a relative Markdown link) from the open note. */
  openLink: (target: string) => Promise<void>;
  setMode: (mode: Mode) => void;
  type: (text: string) => void;
  create: (dir: string) => Promise<void>;
  createFolder: (parent: string) => Promise<void>;
  /** Rename a note or folder; links to it (and to anything inside) are updated. */
  rename: (path: string, name: string) => Promise<void>;
  /** Move a note or folder into `dir` ("" is the vault); links are updated. */
  move: (path: string, dir: string) => Promise<void>;
  duplicate: (path: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  removeFolder: (path: string) => Promise<void>;
  setRenaming: (path: string | null) => void;
  resolveConflict: (keep: Resolution) => void;
  /** The open file's three versions while it has a conflict, for the merge. */
  conflictVersions: () => FileCompare | null;
  setError: (msg: string | null) => void;
  setNotice: (msg: string | null) => void;
};

// ---------------------------------------------------------------- per-viewer settings (this browser only)

const vaultPrefs = (key: string) => browserPrefs(key, p => ({
  expanded: strings(p.expanded), path: typeof p.path === "string" ? p.path : null, recent: strings(p.recent),
  mode: (p.mode === "source" ? "source" : "live") as Mode,
}));
const RECENT = 12;
/** What `updateLinks` says when nothing was moved that links could point at. */
const NO_LINK_CHANGES = { updated: 0, fix: (_text: string, _note: string): string | null => null, openDisk: null as string | null };

// ---------------------------------------------------------------- helpers

/** A file's name without its folder and its .md or .rpy. */
export const baseName = (path: string) => lastPart(path).replace(/\.(md|rpy)$/i, "");
const BAD_NAME = /[\\/:*?"<>|#^[\]]/;
const hasExt = (p: string, ext: string) => p.toLowerCase().endsWith(ext);
const byKindThenName = (a: Node, b: Node) =>
  a.kind !== b.kind ? (a.kind === "directory" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** `next`, or `prev` if it lists the same: a folder that didn't change keeps its array, so what shows it doesn't draw
 *  again (the poll lists the open folders every few seconds). */
const sameList = (prev: Node[] | undefined, next: Node[]) =>
  prev && prev.length === next.length && prev.every((n, i) => n.path === next[i].path && n.kind === next[i].kind) ? prev : next;

/** The view state that names paths (open folders, folders made here, recent files, the finder's list), with each path
 *  changed by `f` (null: it's gone). A list nothing changed in keeps its object. */
function mapPaths(s: Pick<State, "expanded" | "virtual" | "recent" | "index">, f: (path: string) => string | null) {
  const map = <L extends Iterable<string>>(list: L, make: (paths: string[]) => L): L => {
    const before = [...list];
    const after = before.flatMap(p => { const n = f(p); return n === null ? [] : [n]; });
    return after.length === before.length && after.every((p, i) => p === before[i]) ? list : make(after);
  };
  return {
    expanded: map(s.expanded, ps => new Set(ps)), virtual: map(s.virtual, ps => new Set(ps)),
    recent: map(s.recent, ps => ps), index: s.index && map(s.index, ps => ps),
  };
}
const without = (gone: (path: string) => boolean) => (p: string) => (gone(p) ? null : p);

async function listNodes(dir: string, ext: string, virtual: Set<string>, hide: (path: string) => boolean): Promise<Node[]> {
  const shown = (e: Entry) => !e.name.startsWith(".") && (e.kind === "directory" || hasExt(e.name, ext));
  const nodes: Node[] = (await listDir(dir)).filter(shown).map(e => ({ name: e.name, kind: e.kind, path: joinPath(dir, e.name) }))
    .filter(n => !hide(n.path));
  for (const v of virtual) {
    if (parentOf(v) === dir && !nodes.some(n => n.path === v)) nodes.push({ name: lastPart(v), kind: "directory", path: v });
  }
  return nodes.sort(byKindThenName);
}

/** A name that isn't taken in `dir`: "Untitled.md", "Untitled 2.md", … (`ext` "" for folders) */
async function freeFileName(dir: string, base: string, ext: string, virtual: Set<string> = new Set()) {
  const taken = new Set([...(await listDir(dir)).map(e => e.name), ...[...virtual].filter(v => parentOf(v) === dir).map(lastPart)].map(n => n.toLowerCase()));
  return freeName(base + ext, n => taken.has(n.toLowerCase()), i => `${base} ${i}${ext}`);
}

export function createVaultStore(cfg: VaultConfig) {
  const { root, noun } = cfg;
  const ext = (cfg.ext ?? ".md").toLowerCase();
  const markdown = ext === ".md";
  const hide = cfg.hide ?? (() => false);
  const isNote = (p: string) => hasExt(p, ext);
  /** The files a move has to look at: the whole vault for Markdown (links), else only this tool's folder. */
  const filesForMoves = () => (markdown ? walkFiles() : walkFiles(root, hide));
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  const serial = serialQueue();
  /** Saving: a moment after the last keystroke (and when the tab is hidden, below). */
  const autosave = debounce(() => store.getState().flush(), 600);
  let indexing: Promise<void> | null = null;
  let startWith: string | null = null;
  /** Every note in the vault, also the hidden ones, for following links */
  let everyNote: string[] | null = null;
  const prefsStore = vaultPrefs(cfg.prefsKey);
  const prefs = prefsStore.read();
  /** The location the store last loaded from (see `init`) */
  let loadedFor = -1;
  /** A file this tool shows */
  const mine = (p: string | null): p is string => !!p && (!root || isUnder(p, root)) && !hide(p);

  const store = create<State & Actions>()((set, get) => {
  const savePrefs = () => { const s = get(); prefsStore.write({ expanded: [...s.expanded], path: s.path, recent: s.recent, mode: s.mode }); };
  /** List these folders again (all at once). Only the ones that changed get a new array. */
  const refreshDirs = async (dirs: string[]) => {
    const lists = await Promise.all(dirs.map(d => listNodes(d, ext, get().virtual, hide)));
    set(s => {
      let tree = s.tree;
      dirs.forEach((d, i) => { const l = sameList(tree[d], lists[i]); if (l !== tree[d]) tree = { ...tree, [d]: l }; });
      return tree === s.tree ? s : { tree };
    });
    return lists;
  };
  const refreshDir = (dir: string) => refreshDirs([dir]);
  /** List the vault and every open folder again; open folders that are gone get closed. */
  const refreshAll = async () => {
    const dirs = [root, ...get().expanded];
    const lists = await Promise.all(dirs.map(d => listNodes(d, ext, get().virtual, hide).catch(() => null)));
    const prev = get().tree;
    const next: Record<string, Node[]> = {};
    dirs.forEach((d, i) => { if (lists[i]) next[d] = sameList(prev[d], lists[i]!); });
    const keys = Object.keys(next);
    const tree = keys.length === Object.keys(prev).length && keys.every(k => next[k] === prev[k]) ? prev : next;
    const open = [...get().expanded].filter(d => tree[d]?.length || tree[parentOf(d)]?.some(n => n.path === d));
    set(s => ({ tree, expanded: open.length === s.expanded.size ? s.expanded : new Set(open) }));
    savePrefs();
  };
  const fail = (what: string) => (e: unknown) => set({ error: `${what}: ${errorMessage(e)}`, busy: null });

  /** Move or rename `from` (a note or a folder) to the path `to`, then point every [[link]] to what moved at its new
   *  place. Runs in the save queue, after the open note is saved, so nothing writes in between. */
  const relocate = (from: string, to: string) => {
    autosave.cancel();
    return serial(async () => {
      await saveNow();
      if (to === from) return;
      await checkMove(from, to);

      set({ busy: `Moving ${lastPart(from)}…` });
      const before = await filesForMoves();
      const moving = before.filter(f => isUnder(f, from));
      if (moving.length) await movePath(from, to);
      else await movePath(from, to).catch(() => {});   // an empty folder: real on disk, or only shown here
      const moves = new Map(moving.map(f => [f, rebase(f, from, to)]));
      const after = before.map(f => moves.get(f) ?? f);

      // links in every note (on disk; the open note's unsaved text is handled below)
      const open = get().path;
      const now = open && rebase(open, from, to);
      const { updated, fix, openDisk } = moves.size && markdown ? await updateLinks(before, after, moves, now) : NO_LINK_CHANGES;

      if (open && now) await followOpenNote(open, now, openDisk, fix);
      set(s => ({ ...mapPaths(s, p => rebase(p, from, to)), busy: null }));
      await refreshAll();
      const verb = parentOf(from) === parentOf(to) ? `Renamed to ${baseName(to)}` : `Moved to ${parentOf(to) || "the vault"}`;
      get().setNotice(updated ? `${verb} · links updated in ${plural(updated, "note")}` : verb);
    }).catch(fail("Couldn't move it"));
  };
  /** A move or rename that can't happen: the vault itself, a folder into itself, a name that's taken. */
  async function checkMove(from: string, to: string) {
    if (!from || !to) throw new Error("The vault itself can't be moved.");
    if (isUnder(to.toLowerCase(), from.toLowerCase()) && to.toLowerCase() !== from.toLowerCase()) throw new Error("A folder can't go inside itself.");
    // Only the case changes (rin.md → Rin.md): fine unless the new name is listed as a file of its own, which a
    // case-sensitive disk allows. Otherwise any name that differs only in case counts as taken.
    const caseOnly = to.toLowerCase() === from.toLowerCase();
    const clash = (await listDir(parentOf(to))).some(e => caseOnly ? e.name === lastPart(to) : e.name.toLowerCase() === lastPart(to).toLowerCase())
      || (!caseOnly && get().virtual.has(to));
    if (clash) throw new Error(`There is already something called "${lastPart(to)}" there.`);
  }

  /** The open note was at `open` and is at `now` after a move (`openDisk`: its text on disk if the links in it changed,
   *  `fix`: the same link changes for any text). Typing went on while the links were updated, and a conflict may hold
   *  back unsaved edits, so the editor keeps its own text (with the same link changes) and only learns what is on disk. */
  async function followOpenNote(open: string, now: string, openDisk: string | null, fix: (text: string, note: string) => string | null) {
    const mtime = openDisk !== null || now !== open ? await statFile(now) : get().saved?.mtime ?? null;
    const s = get();   // read after the awaits
    if (s.path !== open || !s.saved) return;
    if (now !== open) set({ moved: { from: open, to: now } });
    const live = fix(s.text, now) ?? s.text;
    const disk = openDisk ?? (s.conflict ? s.conflict.theirs : s.saved.text);
    if (!s.conflict && s.text === s.saved.text) {
      if (openDisk !== null) show(now, { text: openDisk, mtime });
      else set({ path: now, saved: { text: s.saved.text, mtime } });
    } else {
      set({
        path: now, text: live, rev: live === s.text ? s.rev : s.rev + 1,
        ...(s.conflict
          ? { conflict: { theirs: disk, mtime: disk === null ? null : mtime } }
          : { saved: { text: disk ?? "", mtime } }),
      });
      if (!s.conflict) autosave.schedule();
    }
  }

  /** After `moves` (old path → new path; `before`/`after`: every file around it): point every [[link]] to what moved at
   *  its new place, in every note on disk. `open`: the open note's path now; its new text on disk is handed back. */
  async function updateLinks(before: string[], after: string[], moves: Map<string, string>, open: string | null) {
    const bi = indexFiles(before), ai = indexFiles(after);
    const back = new Map([...moves].map(([o, n]) => [n, o]));
    const fix = (text: string, note: string) => (text.includes("[[") ? rewriteLinks(text, back.get(note) ?? note, bi, ai, moves) : null);
    const notes = after.filter(f => /\.md$/i.test(f));
    let done = 0;
    const progress = () => set({ busy: `Updating links… ${done}/${notes.length}` });
    progress();
    const texts = await Promise.all(notes.map(async n => { const f = await readFile(n); done++; progress(); return f?.text; }));
    let updated = 0, openDisk: string | null = null;
    for (const [i, note] of notes.entries()) {
      const next = texts[i] === undefined ? null : fix(texts[i]!, note);
      if (next === null) continue;
      await writeText(note, next);
      updated++;
      if (note === open) openDisk = next;
    }
    return { updated, fix, openDisk };
  }

  /** Show a note's text in the editor (opened or reloaded). */
  const show = (path: string | null, f: { text: string; mtime: number | null } | null) =>
    set(s => ({ path, text: f?.text ?? "", saved: f, rev: s.rev + 1, conflict: null }));

  /** Write the open note if it changed (`force`: even if it reads as saved, to put it back over theirs). */
  async function saveNow(force = false) {
    const { path, text, saved, conflict, ready } = get();
    if (!ready || !path || !saved || conflict || (text === saved.text && !force)) return;
    set({ saving: true });
    try {
      const r = await writeIfUnchanged(path, text, saved.mtime);
      if ("theirs" in r) return set({ conflict: { theirs: r.theirs?.text ?? null, mtime: r.theirs?.mtime ?? null } });
      // only the text that was written counts as saved; typing during the write stays unsaved
      if (get().path === path) set({ saved: { text, mtime: r.mtime } });
    } catch (e) {
      set({ error: "Saving failed: " + errorMessage(e) });
    } finally {
      set({ saving: false });
    }
  }

  /** Pick up changes made elsewhere (Obsidian, git pull): the open note and the folders that are open. */
  async function poll() {
    try {
      await refreshDirs([root, ...get().expanded]);
      const { path, saved } = get();
      if (!path || !saved || get().conflict) return;
      const now = await statFile(path);
      if (now === saved.mtime) return;
      const f = now === null ? null : await readFile(path);
      // read again after the awaits: typing goes on meanwhile, and that text must not be replaced
      const { text, conflict } = get();
      if (get().path !== path || get().saved !== saved || conflict) return;
      if (f?.text === text) return set({ saved: f });
      if (text !== saved.text) return set({ conflict: { theirs: f?.text ?? null, mtime: f?.mtime ?? null } });
      if (!f) { show(null, null); savePrefs(); return get().setNotice(`${baseName(path)} was deleted elsewhere.`); }
      show(path, f);
      noteOutside(`${baseName(path)} changed on disk and was reloaded.`, [{ path, a: saved.text, b: f.text }]);
    } catch { /* permission gone, offline: the next load shows it */ }
  }

  return {
    loc: null, ready: false, tree: {}, expanded: new Set(prefs.expanded), path: null, text: "", saved: null, rev: 0,
    saving: false, conflict: null, renaming: null, virtual: new Set(), busy: null, error: null, notice: null,
    index: null, recent: prefs.recent, mode: prefs.mode, opened: 0, moved: null,

    init: want => {
      startWith = want ?? null;
      // Opened again after another tool: what's here is still good, so only look for changes made meanwhile.
      if (get().ready && loadedFor === locationVersion()) {
        // files may have come and gone meanwhile: the finder and link lookups list them again when asked
        everyNote = null;
        set({ index: null });
        serial(poll);
      } else get().load();
      return whileVisible(() => { if (get().ready) serial(poll); });
    },

    load: async () => {
      try {
        const version = locationVersion();
        const loc = await getLocation();
        set({ loc });
        if (!loc.ready) return set({ ready: false, tree: {} });
        await refreshAll();
        loadedFor = version;
        set({ ready: true, error: null });
        const want = [get().path, startWith, prefs.path].find(mine) ?? null;
        const f = want ? await readFile(want) : null;
        show(f ? want : null, f);
        if (!f && want && want === startWith) get().setNotice(`There's no ${noun} called ${baseName(want)}.`);
        startWith = null;
        everyNote = null;
        set({ index: null });
        savePrefs();
      } catch (e) {
        if (e instanceof NeedsPermission) return set(s => ({ ready: false, loc: s.loc && { ...s.loc, ready: false } }));
        set({ error: `Could not load the ${noun}s: ` + errorMessage(e) });
      }
    },

    reload: async msg => {
      await get().flush();
      await get().load();
      get().setNotice(msg);
    },

    flush: () => { autosave.cancel(); return serial(saveNow); },

    revert: async drop => {
      autosave.cancel();
      await serial(async () => {
        await drop();
        startWith = get().path;
        set({ path: null });   // load reads the note again (the same one) instead of keeping the edits
        await get().load();
      });
      get().setNotice("Discarded");
    },

    toggle: async dir => {
      if (!get().expanded.has(dir)) {
        // list first, then open: the folder grows to its full height in one movement instead of jumping at the end
        if (!get().tree[dir]) {
          try { await refreshDir(dir); } catch (e) { return set({ error: errorMessage(e) }); }
        }
        set(s => ({ expanded: new Set([...s.expanded, dir]) }));
      } else {
        set(s => { const expanded = new Set(s.expanded); expanded.delete(dir); return { expanded }; });
      }
      savePrefs();
    },

    listFolder: async dir => (await refreshDirs([dir]))[0],

    loadIndex: () => {
      if (!get().ready) return Promise.resolve();
      // Markdown: every note, for following links; other files: only this tool's folders
      return (indexing ??= filesForMoves()
        .then(files => {
          everyNote = files.filter(isNote);
          set({ index: everyNote.filter(mine).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) });
        })
        .catch(e => set({ error: `Couldn't list the ${noun}s: ` + errorMessage(e) }))
        .finally(() => { indexing = null; }));
    },

    open: async path => {
      if (path === get().path) return;
      await get().flush();
      try {
        const f = await readFile(path);
        if (!f) {
          await refreshDir(parentOf(path)).catch(() => {});
          set(s => mapPaths(s, without(p => p === path)));
          savePrefs();
          return get().setNotice(`${baseName(path)} doesn't exist any more.`);
        }
        show(path, f);
        set(s => ({ opened: s.opened + 1, recent: [path, ...s.recent.filter(p => p !== path)].slice(0, RECENT) }));
        savePrefs();
      } catch (e) {
        set({ error: `Could not open ${baseName(path)}: ${errorMessage(e)}` });
      }
    },

    type: text => {
      set({ text });
      autosave.schedule();
    },

    create: async dir => {
      try {
        const name = await freeFileName(dir, "Untitled", ext);
        const path = joinPath(dir, name);
        await writeText(path, cfg.template?.(baseName(name)) ?? "");
        set(s => ({ index: s.index && [...s.index, path] }));
        if (dir) set(s => ({ expanded: new Set([...s.expanded, dir]) }));
        await refreshDir(dir);
        await get().open(path);
        set({ renaming: path });
      } catch (e) {
        set({ error: `Could not create the ${noun}: ` + errorMessage(e) });
      }
    },

    createFolder: async parent => {
      try {
        const path = joinPath(parent, await freeFileName(parent, "New folder", "", get().virtual));
        await makeDir(path);
        set(s => ({ virtual: new Set([...s.virtual, path]), expanded: parent ? new Set([...s.expanded, parent]) : s.expanded }));
        await refreshDir(parent);
        set({ renaming: path });
      } catch (e) { fail("Could not create the folder")(e); }
    },

    rename: async (path, name) => {
      set({ renaming: null });
      const file = isNote(path);
      const clean = file ? baseName(name.trim()) : name.trim();
      if (!clean || clean === (file ? baseName(path) : lastPart(path))) return;
      if (BAD_NAME.test(clean) || clean.startsWith(".")) return set({ error: "Names can't start with a dot or contain \\ / : * ? \" < > | # ^ [ ]" });
      await relocate(path, joinPath(parentOf(path), file ? clean + ext : clean));
    },

    move: async (path, dir) => {
      if (parentOf(path) === dir) return;
      await relocate(path, joinPath(dir, lastPart(path)));
    },

    duplicate: async path => {
      try {
        await get().flush();
        const dir = parentOf(path);
        const copy = joinPath(dir, await freeFileName(dir, baseName(path), ext));
        await writeText(copy, get().path === path ? get().text : (await readFile(path))?.text ?? "");
        set(s => ({ index: s.index && [...s.index, copy] }));
        await refreshDir(dir);
        await get().open(copy);
      } catch (e) { fail("Could not duplicate it")(e); }
    },

    remove: async path => {
      try {
        // in the queue, after a move that may still be rewriting links in this note
        if (get().path === path) autosave.cancel();
        await serial(async () => {
          if (get().path === path) { show(null, null); savePrefs(); }
          await removeFile(path);
        });
        set(s => mapPaths(s, without(p => p === path)));
        savePrefs();
        await refreshDir(parentOf(path));
        get().setNotice(`Deleted ${baseName(path)}`);
      } catch (e) { fail("Deleting failed")(e); }
    },

    removeFolder: async path => {
      try {
        const inside = () => { const open = get().path; return !!open && isUnder(open, path); };
        if (inside()) autosave.cancel();
        await serial(async () => {
          if (inside()) show(null, null);
          await removeDir(path);
        });
        set(s => mapPaths(s, without(p => isUnder(p, path))));
        savePrefs();
        await refreshAll();
        get().setNotice(`Deleted the folder ${lastPart(path)}`);
      } catch (e) { fail("Deleting failed")(e); }
    },

    setRenaming: renaming => set({ renaming }),

    conflictVersions: () => {
      const { conflict, path, saved, text } = get();
      return conflict && path ? { path, o: saved?.text ?? null, a: text, b: conflict.theirs } : null;
    },

    resolveConflict: keep => {
      const { conflict, path } = get();
      if (!conflict || !path) return;
      // a merge that comes to their file (or to no file: they deleted it) is taking theirs
      if (typeof keep === "object" && (keep.text === conflict.theirs || keep.text === null)) keep = "theirs";
      if (typeof keep === "object") {
        // the merge goes over their version, like keeping mine
        set(s => ({ conflict: null, saved: { text: conflict.theirs ?? "", mtime: conflict.mtime }, text: keep.text!, rev: s.rev + 1 }));
        autosave.cancel();
        void serial(() => saveNow(true));
        return;
      }
      if (keep === "theirs") {
        if (conflict.theirs === null) { show(null, null); savePrefs(); return; }
        show(path, { text: conflict.theirs, mtime: conflict.mtime });
        return;
      }
      // "mine": count their version as seen, and put this one over it
      set({ conflict: null, saved: { text: conflict.theirs ?? "", mtime: conflict.mtime } });
      autosave.cancel();
      void serial(() => saveNow(true));
    },

    openLink: async target => {
      const name = target.replace(/[#^].*$/, "").trim();
      const from = get().path ?? "";
      if (!name) return;   // [[#Heading]]: a place in this note
      if (!everyNote) await get().loadIndex();
      const hit = resolve(name, from, indexFiles(everyNote ?? []));
      if (hit && mine(hit)) return get().open(hit);
      if (hit && cfg.openElsewhere) return cfg.openElsewhere(hit);
      get().setNotice(`There's no ${noun} called ${name}.`);
    },

    setMode: mode => { set({ mode }); savePrefs(); },

    setError: error => set({ error }),
    setNotice: noticeSetter(set),
  };
  });

  whenHidden(() => store.getState().flush());
  return Object.assign(store, { config: { ...cfg, hide }, Noun });
}

export type VaultStore = ReturnType<typeof createVaultStore>;
export type VaultState = State & Actions;

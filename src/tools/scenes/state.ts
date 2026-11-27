import { useMemo, useRef } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/shallow";
import { useGame } from "@/shared/lib/game";
import { errorMessage, freeName, isUnder } from "@/shared/lib/utils";
import { joinPath, listFiles, readFile, readJson, writeText } from "@/shared/lib/workspace";
import { GAME_DIR, NEW_SCENE_DIR, SCENE_DIRS } from "@/shared/vault/places";
import { baseName, createVaultStore, parentOf } from "@/shared/vault/store";
import { CHAPTERS_DIR, chapterIdOf } from "@/tools/timeline/lib/store";
import { readInfo, setInfo, withInfo, type SceneInfo } from "./lib/header";
import { labelsIn } from "./lib/labels";
import { chatsIn, type ChatMsg } from "./lib/phone";
import { parseScript, sceneTemplate, suggestLabel } from "./lib/script";
import { useSceneUi } from "./lib/ui";

/** The scene files: the game's .rpy files in renpy/game/scenes and renpy/game/dev, on the same kind of store as the
 *  Notes tool. */
export const useScenes = createVaultStore({
  prefsKey: "scenes-view-2",
  root: GAME_DIR,
  ext: ".rpy",
  noun: "scene",
  hide: p => !SCENE_DIRS.some(d => isUnder(p, d)),
});

/** The scene folders are always "open", so the store's poll lists them again and new or deleted files show up. */
useScenes.setState({ expanded: new Set(SCENE_DIRS) });

/** Which story folder the scenes come from (another one: the index is read again). */
const locKey = () => { const l = useScenes.getState().loc; return l ? `${l.kind}:${l.label}:${l.name ?? ""}` : ""; };

/** What the list, the jump checks and the chats need of a scene: its labels, its header, its chat messages. */
export type SceneEntry = { labels: string[]; info: SceneInfo; chats: ChatMsg[] };
export const entryOf = (text: string): SceneEntry => {
  const s = parseScript(text);
  return { labels: [...labelsIn(s)], info: readInfo(text), chats: chatsIn(s).msgs };
};
/** What the list calls a scene: its title, else its file name. */
export const titleOf = (path: string, info: SceneInfo | undefined) => info?.title || baseName(path);

type SceneIndex = {
  /** Every scene's labels and header, by path; null until read. */
  files: Record<string, SceneEntry> | null;
  /** The story folder `files` is (being) read from, and the read in progress. */
  readFor: string | null;
  reading: Promise<void> | null;
  /** The open scene's entry from before the index was read. */
  pending: Record<string, SceneEntry>;
  /** Read every scene once per story folder, a few files at a time (on GitHub each is a request). A read that fails
   *  is tried again on the next call. */
  load: () => Promise<void>;
  /** A scene changed (opened, saved, written): keep its entry up to date. */
  update: (path: string, text: string) => void;
  drop: (path: string) => void;
  /** The scene folders were listed again: read files that are new, forget the ones that are gone. */
  sync: () => void;
};

const same = (a: SceneEntry | undefined, b: SceneEntry) =>
  !!a && a.labels.join() === b.labels.join() && JSON.stringify(a.info) === JSON.stringify(b.info) && JSON.stringify(a.chats) === JSON.stringify(b.chats);

export const useSceneIndex = create<SceneIndex>()((set, get) => ({
  files: null, readFor: null, reading: null, pending: {},

  load: () => {
    const key = locKey();
    if (key !== get().readFor) set(s => ({ readFor: key, reading: null, files: null, pending: s.readFor === null ? s.pending : {} }));
    const reading = get().reading ?? (async () => {
      await useScenes.getState().loadIndex();
      const paths = useScenes.getState().index ?? [];
      const files: Record<string, SceneEntry> = {};
      for (let i = 0; i < paths.length; i += 8) {
        await Promise.all(paths.slice(i, i + 8).map(async p => {
          const f = await readFile(p).catch(() => null);
          if (f) files[p] = entryOf(f.text);
        }));
      }
      if (locKey() !== key) return;   // another folder was picked meanwhile
      set(s => ({ files: { ...files, ...s.pending, ...(s.files ?? {}) } }));
    })().catch(e => { if (get().readFor === key) set({ reading: null }); throw e; });
    set({ reading });
    return reading;
  },

  update: (path, text) => {
    const entry = entryOf(text);
    const { files } = get();
    if (!files) return set(s => ({ pending: { ...s.pending, [path]: entry } }));
    if (same(files[path], entry)) return;
    set({ files: { ...files, [path]: entry } });
  },

  drop: path => set(s => {
    const { [path]: _, ...files } = s.files ?? {};
    const { [path]: __, ...pending } = s.pending;
    return { files: s.files && files, pending };
  }),

  sync: () => {
    const { files } = get();
    const { tree } = useScenes.getState();
    if (!files) return;
    for (const dir of SCENE_DIRS) {
      const list = tree[dir];
      if (!list) continue;
      const now = new Set(list.filter(n => n.kind === "file").map(n => n.path));
      for (const p of Object.keys(files)) if (parentOf(p) === dir && !now.has(p)) get().drop(p);
      for (const p of now) {
        if (!files[p]) readFile(p).then(f => { if (f) get().update(p, f.text); }).catch(() => {});
      }
    }
  },
}));

useScenes.subscribe((s, prev) => {
  if (s.tree !== prev.tree) useSceneIndex.getState().sync();
  // the open scene's labels, as saved, for the other scenes' checks
  if (s.saved !== prev.saved && s.path && s.saved) useSceneIndex.getState().update(s.path, s.saved.text);
});

/** The labels jumps can go to: every scene's and the game's own (null while the scenes are being read). */
export function useKnownLabels(): Set<string> | null {
  const files = useSceneIndex(i => i.files);
  const manifest = useGame(g => g.manifest);
  return useMemo(() => (files ? new Set([...Object.values(files).flatMap(f => f.labels), ...(manifest?.labels ?? [])]) : null), [files, manifest]);
}

// ---------------------------------------------------------------- story order

export type SceneRow = { path: string; title: string };
export type SceneGroup = { id: string; name: string; rows: SceneRow[] };
const DEV_DIR = `${GAME_DIR}/dev`;
const byTitle = (a: SceneRow, b: SceneRow) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });

/** The scenes grouped by their timeline chapter, in the timeline's order, each chapter's by title (dates sort right:
 *  "07.04.2025 Mo"); then chapter ids the timeline doesn't have, "No chapter" and "dev". The scene list shows this,
 *  and it is the story's order (which scenes come before which: the chats' history). */
export function groupScenes(paths: string[], infoOf: (p: string) => SceneInfo | undefined, chapters: ChapterRef[] | null): SceneGroup[] {
  const byChapter = new Map<string, SceneRow[]>();
  for (const p of paths) {
    const info = infoOf(p);
    const id = info?.chapter || (isUnder(p, DEV_DIR) ? ":dev" : ":none");
    byChapter.set(id, [...(byChapter.get(id) ?? []), { path: p, title: titleOf(p, info) }]);
  }
  const out: SceneGroup[] = [];
  const take = (id: string, name: string) => { const rows = byChapter.get(id); if (rows) { out.push({ id, name, rows: rows.sort(byTitle) }); byChapter.delete(id); } };
  for (const c of chapters ?? []) take(c.id, c.name);
  for (const id of [...byChapter.keys()].filter(k => !k.startsWith(":")).sort()) take(id, id);
  take(":none", "No chapter");
  take(":dev", "dev");
  return out;
}

/** The chat messages of every scene before `path` in the story, oldest first (null while the scenes or the chapters
 *  are read). The open scene is placed by its live header, as the scene list does, and the result keeps its identity
 *  while its content stays the same (saving the open scene doesn't change the scenes before it). */
export function useChatHistory(path: string | null): ChatMsg[] | null {
  const files = useSceneIndex(i => i.files);
  const chapters = useChapters(c => c.list);
  const openInfo = useScenes(useShallow(s => (s.path && s.path === path ? readInfo(s.text) : null)));
  const last = useRef<{ key: string; value: ChatMsg[] | null }>({ key: "", value: null });
  return useMemo(() => {
    if (!files || !path || !chapters) return null;
    const order = groupScenes(Object.keys(files), p => (p === path && openInfo ? openInfo : files[p]?.info), chapters).flatMap(g => g.rows);
    const at = order.findIndex(r => r.path === path);
    const value = (at < 0 ? [] : order.slice(0, at)).flatMap(r => files[r.path].chats.map(msg => ({ ...msg, scene: { path: r.path, title: r.title } })));
    const key = JSON.stringify(value);
    if (key !== last.current.key || !last.current.value) last.current = { key, value };
    return last.current.value;
  }, [files, chapters, path, openInfo]);
}

// ---------------------------------------------------------------- chapters (from the timeline)

/** A timeline chapter, as far as the scenes care. Later the timeline could link its events to scenes too. */
export type ChapterRef = { id: string; name: string; order: number };

type Chapters = { list: ChapterRef[] | null; load: () => Promise<void> };

export const useChapters = create<Chapters>()(set => ({
  list: null,
  load: async () => {
    try {
      const paths = await listFiles(CHAPTERS_DIR, ".json");
      const raw = await Promise.all(paths.map(async p => ({ p, c: await readJson<Partial<ChapterRef>>(p).catch(() => null) })));
      const list = raw.map(({ p, c }) => {
        const id = c?.id || chapterIdOf(p);
        return { id, name: c?.name || id, order: typeof c?.order === "number" ? c.order : 0 };
      });
      set({ list: list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)) });
    } catch {
      set({ list: [] });   // no timeline yet: every scene is "No chapter"
    }
  },
}));

// ---------------------------------------------------------------- list actions

/** Every label in use (scenes and game), and every file name in `dir`, for picking new ones. */
function taken(dir: string) {
  const files = useSceneIndex.getState().files ?? {};
  const labels = new Set([...Object.values(files).flatMap(f => f.labels), ...(useGame.getState().manifest?.labels ?? [])]);
  const names = new Set(Object.keys(files).filter(p => parentOf(p) === dir).map(p => baseName(p).toLowerCase()));
  return { labels, names };
}
const freeLabel = (base: string, dir: string) => {
  const t = taken(dir);
  return freeName(base, n => t.labels.has(n) || t.names.has(n.toLowerCase()), i => `${base}_${i}`);
};

/** A file the store doesn't know about yet: list its folder again and add it to the index. */
async function added(path: string, text: string) {
  useSceneIndex.getState().update(path, text);
  useScenes.setState(s => ({ index: s.index && [...s.index, path] }));
  await useScenes.getState().listFolder(parentOf(path));
}

/** A new scene in renpy/game/scenes, named after its label (`scene_untitled.rpy`), opened with its title being
 *  edited in the list. */
export async function createScene() {
  const st = useScenes.getState();
  try {
    const title = "Untitled";
    const label = freeLabel(suggestLabel(title), NEW_SCENE_DIR);
    const path = joinPath(NEW_SCENE_DIR, `${label}.rpy`);
    const text = sceneTemplate(title, label);
    await writeText(path, text);
    await added(path, text);
    await useScenes.getState().open(path);
    st.setRenaming(path);
  } catch (e) { st.setError("Could not create the scene: " + errorMessage(e)); }
}

/** A copy of a scene next to it, with "(copy)" in its title and its own labels (the game can't have a label twice). */
export async function duplicateScene(path: string) {
  const st = useScenes.getState();
  try {
    await st.flush();
    const text = st.path === path ? st.text : (await readFile(path))?.text;
    if (text === undefined) return;
    const dir = parentOf(path);
    const own = [...labelsIn(parseScript(text))];
    const renames = new Map<string, string>();
    for (const l of own) {
      const t = taken(dir);
      const base = `${l}_copy`;
      const name = freeName(base, n => t.labels.has(n) || [...renames.values()].includes(n) || t.names.has(n.toLowerCase()), i => `${base}_${i}`);
      renames.set(l, name);
    }
    let copy = text.split("\n").map(line => {
      if (!/^\s*(label|jump|call)\b/.test(line) && !/\b(jump|call)\s+\w/.test(line)) return line;
      return line.replace(/\b\w+\b/g, w => renames.get(w) ?? w);
    }).join("\n");
    copy = withInfo(copy, "title", `${titleOf(path, readInfo(text))} (copy)`);
    const first = renames.get(own[0]) ?? freeLabel(`${baseName(path)}_copy`, dir);
    const to = joinPath(dir, `${first}.rpy`);
    await writeText(to, copy);
    await added(to, copy);
    await useScenes.getState().open(to);
  } catch (e) { st.setError("Could not duplicate it: " + errorMessage(e)); }
}

/** Give a scene a new title (its `## title:` line). The open scene changes through its editor, so Ctrl+Z undoes it. */
export async function retitleScene(path: string, title: string) {
  const st = useScenes.getState();
  st.setRenaming(null);
  const clean = title.replace(/\s+/g, " ").trim();
  if (!clean) return;
  const view = useSceneUi.getState().view;
  if (st.path === path && view) {
    const c = setInfo(view.state.doc.toString(), "title", clean);
    if (c) view.dispatch({ changes: c, userEvent: "input.info" });
    return;
  }
  try {
    const f = await readFile(path);
    if (!f) return;
    const next = withInfo(f.text, "title", clean);
    if (next === f.text) return;
    await writeText(path, next);
    useSceneIndex.getState().update(path, next);
  } catch (e) { st.setError("Could not rename it: " + errorMessage(e)); }
}

/** Put a scene in a timeline chapter (its `## chapter:` line; "" takes it out), and into `dir` if given (the list's
 *  "dev" group is the dev/ folder). The open scene changes through its editor, so Ctrl+Z undoes the chapter. */
export async function moveScene(path: string, chapter: string, dir?: string) {
  const st = useScenes.getState();
  const view = useSceneUi.getState().view;
  try {
    if (st.path === path && view) {
      const c = setInfo(view.state.doc.toString(), "chapter", chapter);
      if (c) view.dispatch({ changes: c, userEvent: "input.info" });
    } else {
      const f = await readFile(path);
      if (!f) return;
      const next = withInfo(f.text, "chapter", chapter);
      if (next !== f.text) {
        await writeText(path, next);
        useSceneIndex.getState().update(path, next);
      }
    }
    if (dir && parentOf(path) !== dir) await useScenes.getState().move(path, dir);
  } catch (e) { st.setError("Could not move it: " + errorMessage(e)); }
}

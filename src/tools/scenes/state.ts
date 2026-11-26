import { create } from "zustand";
import { readFile } from "@/shared/lib/workspace";
import { SCENES_DIR } from "@/shared/vault/places";
import { createVaultStore } from "@/shared/vault/store";
import { readInfo } from "./lib/frontmatter";
import { parseScript, sceneTemplate } from "./lib/script";

/** The scene files (CANON/03_Story/02_Scenes), on the same store as the Notes tool. */
export const useScenes = createVaultStore({
  prefsKey: "scenes-view-1",
  root: SCENES_DIR,
  noun: "scene",
  template: sceneTemplate,
});

type SceneFacts = { labels: string[]; owner: string };
/** The open scene's facts from before the index was read */
const pending: Record<string, SceneFacts> = {};

/** What the other scenes hold that this one refers to: their labels (for jumps) and owners (for suggestions). Read
 *  once per story folder, a few files at a time (on GitHub each is a request); the open scene keeps its own entry up
 *  to date. Picking another folder reads it again; a read that fails is tried again on the next `load`. */
let loading: Promise<void> | null = null;
/** the story folder `loading` reads */
let loadedFor: string | null = null;
const locKey = () => { const l = useScenes.getState().loc; return l ? `${l.kind}:${l.label}:${l.name ?? ""}` : ""; };
export const useSceneIndex = create<{
  /** null until read */
  files: Record<string, SceneFacts> | null;
  load: () => Promise<void>;
  update: (path: string, text: string) => void;
}>()((set, get) => ({
  files: null,
  load: () => {
    const key = locKey();
    if (key !== loadedFor) {
      if (loadedFor !== null) { loading = null; set({ files: null }); for (const k in pending) delete pending[k]; }
      loadedFor = key;
    }
    return (loading ??= (async () => {
      await useScenes.getState().loadIndex();
      const paths = useScenes.getState().index ?? [];
      const files: Record<string, SceneFacts> = {};
      for (let i = 0; i < paths.length; i += 8) {
        await Promise.all(paths.slice(i, i + 8).map(async p => {
          const f = await readFile(p).catch(() => null);
          if (f) files[p] = factsOf(f.text);
        }));
      }
      if (locKey() !== key) return;   // another folder was picked meanwhile
      set(s => ({ files: { ...files, ...pending, ...(s.files ?? {}) } }));
    })().catch(e => { if (loadedFor === key) loading = null; throw e; }));
  },
  update: (path, text) => {
    const facts = factsOf(text);
    const files = get().files;
    if (!files) { pending[path] = facts; return; }
    const old = files[path];
    if (old && old.owner === facts.owner && old.labels.join() === facts.labels.join()) return;
    set({ files: { ...files, [path]: facts } });
  },
}));

function factsOf(text: string): SceneFacts {
  const s = parseScript(text);
  return { labels: s.parsed.flatMap(p => (p?.kind === "label" ? [p.name] : [])), owner: readInfo(text)?.owner ?? "" };
}

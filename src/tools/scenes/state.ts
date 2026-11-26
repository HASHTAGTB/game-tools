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
 *  once, a few files at a time (on GitHub each is a request); the open scene keeps its own entry up to date. */
let loading: Promise<void> | null = null;
export const useSceneIndex = create<{
  /** null until read */
  files: Record<string, SceneFacts> | null;
  load: () => Promise<void>;
  update: (path: string, text: string) => void;
}>()((set, get) => ({
  files: null,
  load: () => (loading ??= (async () => {
    await useScenes.getState().loadIndex();
    const paths = useScenes.getState().index ?? [];
    const files: Record<string, SceneFacts> = {};
    for (let i = 0; i < paths.length; i += 8) {
      await Promise.all(paths.slice(i, i + 8).map(async p => {
        const f = await readFile(p).catch(() => null);
        if (f) files[p] = factsOf(f.text);
      }));
    }
    set(s => ({ files: { ...files, ...pending, ...(s.files ?? {}) } }));
  })()),
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

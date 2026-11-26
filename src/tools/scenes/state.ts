import { useMemo } from "react";
import { create } from "zustand";
import { useGame } from "@/shared/lib/game";
import { readFile } from "@/shared/lib/workspace";
import { SCENES_DIR } from "@/shared/vault/places";
import { createVaultStore } from "@/shared/vault/store";
import { labelsIn } from "./lib/labels";
import { parseScript, sceneTemplate } from "./lib/script";

/** The scene files (CANON/03_Story/02_Scenes), on the same store as the Notes tool. */
export const useScenes = createVaultStore({
  prefsKey: "scenes-view-1",
  root: SCENES_DIR,
  noun: "scene",
  template: sceneTemplate,
});

/** Which story folder the scenes come from (another one: the index is read again). */
const locKey = () => { const l = useScenes.getState().loc; return l ? `${l.kind}:${l.label}:${l.name ?? ""}` : ""; };

type SceneIndex = {
  /** Every scene's labels (for jumps), by path; null until read. */
  files: Record<string, string[]> | null;
  /** The story folder `files` is (being) read from, and the read in progress. */
  readFor: string | null;
  reading: Promise<void> | null;
  /** The open scene's labels from before the index was read. */
  pending: Record<string, string[]>;
  /** Read every scene once per story folder, a few files at a time (on GitHub each is a request). A read that fails
   *  is tried again on the next call. */
  load: () => Promise<void>;
  /** The open scene changed: keep its entry up to date. */
  update: (path: string, text: string) => void;
};

export const useSceneIndex = create<SceneIndex>()((set, get) => ({
  files: null, readFor: null, reading: null, pending: {},

  load: () => {
    const key = locKey();
    if (key !== get().readFor) set(s => ({ readFor: key, reading: null, files: null, pending: s.readFor === null ? s.pending : {} }));
    const reading = get().reading ?? (async () => {
      await useScenes.getState().loadIndex();
      const paths = useScenes.getState().index ?? [];
      const files: Record<string, string[]> = {};
      for (let i = 0; i < paths.length; i += 8) {
        await Promise.all(paths.slice(i, i + 8).map(async p => {
          const f = await readFile(p).catch(() => null);
          if (f) files[p] = labelsOf(f.text);
        }));
      }
      if (locKey() !== key) return;   // another folder was picked meanwhile
      set(s => ({ files: { ...files, ...s.pending, ...(s.files ?? {}) } }));
    })().catch(e => { if (get().readFor === key) set({ reading: null }); throw e; });
    set({ reading });
    return reading;
  },

  update: (path, text) => {
    const labels = labelsOf(text);
    const { files } = get();
    if (!files) return set(s => ({ pending: { ...s.pending, [path]: labels } }));
    if (files[path]?.join() === labels.join()) return;
    set({ files: { ...files, [path]: labels } });
  },
}));

const labelsOf = (text: string) => [...labelsIn(parseScript(text))];

/** The labels jumps can go to: every scene's and the game's own (null while the scenes are being read). */
export function useKnownLabels(): Set<string> | null {
  const files = useSceneIndex(i => i.files);
  const manifest = useGame(g => g.manifest);
  return useMemo(() => (files ? new Set([...Object.values(files).flat(), ...(manifest?.labels ?? [])]) : null), [files, manifest]);
}

import type { ChatMsg } from "./phone";
import { MapMode, StateEffect, StateField } from "@codemirror/state";
import { useGame, type Manifest } from "@/shared/lib/game";
import { parseScript, type Script } from "./script";

/** What the scene editor's CodeMirror view holds besides the text: the file, parsed; the game's data; what the checks
 *  need to know about the other scenes; and a lasting name for every line. The box view, the source view and the
 *  checks all read them from the view's state. */

// ---------------------------------------------------------------- state

export const setManifest = StateEffect.define<Manifest | null>();
export const manifestField = StateField.define<Manifest | null>({
  create: () => useGame.getState().manifest,
  update: (v, tr) => { for (const e of tr.effects) if (e.is(setManifest)) return e.value; return v; },
});

/** The file, parsed; kept in step with every change. */
export const scriptField = StateField.define<Script>({
  create: s => parseScript(s.doc.toString()),
  update: (v, tr) => (tr.docChanged ? parseScript(tr.newDoc.toString()) : v),
});

/** A name for every line that stays with it while lines above are added or removed (the box view's React keys:
 *  boxes below an edit keep their place instead of being built again). A line that's new, or that an edit
 *  replaced from its start, gets a new name. */
let nextLineId = 0;
/** Lines that moved (two boxes swapped places): from line `at` on, the lines now carry these names, so the boxes keep
 *  theirs (they slide to their new place, and stay open or shown as Ren'Py). */
export const moveLineIds = StateEffect.define<{ at: number; ids: number[] }>();
export const lineIds = StateField.define<number[]>({
  create: s => Array.from({ length: s.doc.lines }, () => ++nextLineId),
  update: (ids, tr) => {
    if (!tr.docChanged) return ids;
    const old = tr.startState.doc, doc = tr.newDoc;
    const out: number[] = new Array(doc.lines).fill(0);
    for (let n = 1; n <= old.lines; n++) {
      const at = tr.changes.mapPos(old.line(n).from, -1, MapMode.TrackDel);
      if (at === null) continue;
      const m = doc.lineAt(at);
      if (m.from === at && !out[m.number - 1]) out[m.number - 1] = ids[n - 1];
    }
    for (const e of tr.effects) if (e.is(moveLineIds)) out.splice(e.value.at - 1, e.value.ids.length, ...e.value.ids);
    for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = ++nextLineId;
    return out;
  },
});

/** What the checks need besides the text and the game's data. */
export type CheckInput = {
  /** labels of the other scenes and the game's own; null while they're being read */
  labels: Set<string> | null;
  /** the scene's title (for the label it suggests) */
  title: string;
  /** the chat messages of the scenes before this one (replies, reactions); null while they're read */
  history: ChatMsg[] | null;
};
export const setCheckInput = StateEffect.define<CheckInput>();
export const checkInputField = StateField.define<CheckInput>({
  create: () => ({ labels: null, title: "", history: null }),
  update: (v, tr) => { for (const e of tr.effects) if (e.is(setCheckInput)) return e.value; return v; },
});

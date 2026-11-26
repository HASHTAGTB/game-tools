import type { EditorView } from "@codemirror/view";
import { createContext, useContext, useLayoutEffect, useState, type RefObject } from "react";
import type { Manifest } from "@/shared/lib/game";
import type { Box, Place } from "../../lib/blocks";
import type { Problem } from "../../lib/checks";
import { legible, who } from "../../lib/scriptView";
import { EMPTY_STAGE, type Stage } from "../../lib/stage";

/** What every box needs: the view that holds the file, the game's data, what's on stage at each line, who's in the
 *  scene, and the problems by line. */
export type BoxCtx = {
  view: EditorView;
  manifest: Manifest | null;
  /** the stage after each line (index = line - 1) */
  stages: Stage[];
  /** who can speak here (Tab, the speaker menu, the Add menu) */
  cast: string[];
  problems: Map<number, Problem[]>;
  /** new labels (choices): the scene's label without `sc_` / `scene_`, and the labels the file has */
  base: string;
  labels: Set<string>;
  /** each line's lasting name (`lineIds`), for keys */
  ids: number[];
  /** changes when what every box shows changes (the game's data, the cast): all boxes draw again */
  epoch: number;
};

/** One object for the whole view, updated in place on every edit: boxes don't all draw again because the file changed.
 *  Each box draws again when its own key (see `keyOf` in List) changes; handlers always read the current values. */
export const BoxContext = createContext<BoxCtx | null>(null);
export const useBox = () => useContext(BoxContext)!;

/** Hovered or focused: only then a box mounts its buttons (hundreds of boxes, each with a toolbar, would be slow). */
export function useHot() {
  const [hot, setHot] = useState(false);
  return {
    hot,
    bind: {
      onPointerEnter: () => setHot(true),
      onPointerLeave: (e: React.PointerEvent<HTMLElement>) => { if (!e.currentTarget.contains(document.activeElement)) setHot(false); },
      onFocus: () => setHot(true),
      onBlur: (e: React.FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node) && !e.currentTarget.matches(":hover")) setHot(false); },
    },
  };
}

/** How a list lays out its boxes: where a new one goes after a box, and whether it's in a chat. */
export type ListLayout = Omit<Place, "after">;

/** The stage just before line `n`. */
export const stageBefore = (c: BoxCtx, n: number) => (n > 1 ? c.stages[n - 2] ?? EMPTY_STAGE : EMPTY_STAGE);

/** Name and colours for the speaker column: the game's colour, and one that reads on ink. */
export function speaker(c: BoxCtx, id: string) {
  const w = who(c.manifest, id);
  return { ...w, legible: legible(w.color) };
}

/** The problems on a box's lines (for nested boxes: only the lines the box itself draws). */
export function problemsOf(c: BoxCtx, b: Box): Problem[] {
  const lines = b.kind === "menu" ? [b.from, ...b.options.map(o => o.line)] : b.kind === "chat" ? [b.from] : range(b.from, b.to);
  return lines.flatMap(n => c.problems.get(n) ?? []);
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** A textarea that grows with its text. */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [ref, value]);
}

/** Tell the source view's cursor (and so the preview and header) which line the box in focus is on. */
export function follow(view: EditorView, line: number) {
  const { doc, selection } = view.state;
  if (line > doc.lines) return;
  if (doc.lineAt(selection.main.head).number === line) return;
  view.dispatch({ selection: { anchor: doc.line(line).to } });
}

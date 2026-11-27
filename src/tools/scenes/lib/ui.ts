import type { EditorView } from "@codemirror/view";
import { lineIds } from "./editorState";
import { create } from "zustand";
import type { Box, Place } from "./blocks";
import type { Problem } from "./checks";
import type { Marks } from "./richtext";
import type { Script } from "./script";

/** What the scene editor shares between its parts: the CodeMirror view holding the file (visible in the source view,
 *  hidden behind the boxes otherwise), the parsed script and the line in focus (for the preview and the header),
 *  and what the box view has open. */

export type Caret = "start" | "end" | number;

/** The one popup the box view has open: the Add menu at a slot, who says a line, or one of a chat's popups. */
export type BoxMenu =
  | { kind: "add"; anchor: Element; place: Place; /** an empty box this replaces */ replace?: Box; level: boolean; chat: boolean }
  | { kind: "speaker"; anchor: Element; line: number; chat: boolean }
  | PhoneMenu;

/** A chat's popups (components/boxes/PhoneMenus.tsx). `line`: the message, reaction or chat head they're about.
 *  pick: the earlier message a reply (`reply`), a reaction (`react`) or a new reaction at `place` (`new`) points at.
 *  emoji: a reaction's emoji and who reacts (`new`: a new reaction to the message at `line`). */
export type PhoneMenu =
  | { kind: "pick"; anchor: Element; line: number; for: "reply" | "react" | "new"; place?: Place }
  | { kind: "emoji"; anchor: Element; line: number; new?: boolean }
  | { kind: "photos" | "typing" | "chat" | "date"; anchor: Element; line: number };

type SceneUi = {
  view: EditorView | null;
  script: Script | null;
  /** 1-based line in focus (the box you're in, or the cursor's line in the source view) */
  line: number;
  /** counts moves to another line (the preview restarts its text crawl on a change) */
  moved: number;
  /** the open scene's problems, from the last check */
  problems: Problem[];
  /** the scene the editor last loaded (its path): when it changes another scene opened, the box view starts again */
  opened: string | null;
  /** counts loads (another scene, this one reloaded or reverted): the whole script was replaced, so the boxes that
   *  were there just go, they don't crumple away one by one */
  loaded: number;

  /** where the caret goes once the boxes have been drawn again (after an edit that moved lines) */
  focus: { line: number; caret: Caret } | null;
  /** the stage card that's open for editing (its line's `lineIds` name, so it stays open when lines above move) */
  openCard: number | null;
  /** the tab each choice shows (by the choice line's `lineIds` name) */
  tabs: Record<number, number>;
  /** a line to scroll to and point at (from the checks list) */
  reveal: { line: number; at: number } | null;
  menu: BoxMenu | null;
  /** the box Enter just split off the one above (its first line's `lineIds` name): it peels out of it instead of
   *  dropping in */
  entering: number | null;
  /** boxes shown as Ren'Py though the editor could draw them (by their first line's `lineIds` name). Only for this
   *  session: the file doesn't say, and anything the editor can't draw is Ren'Py anyway. */
  rawIds: ReadonlySet<number>;
  /** the say box you're typing in, for the text tools in the top bar (null: none, the tools are dimmed) */
  typing: { el: HTMLElement; marks: Marks; commit: () => void } | null;
  /** the speed slider is open (the box keeps its place in `typing` while the slider has focus) */
  speedOpen: boolean;
};

export const useSceneUi = create<SceneUi>(() => ({
  view: null, script: null, line: 1, moved: 0, problems: [], opened: null, loaded: 0,
  focus: null, openCard: null, tabs: {}, reveal: null, menu: null, entering: null, rawIds: new Set(),
  typing: null, speedOpen: false,
}));

export const focusLine = (line: number, caret: Caret = "end") => useSceneUi.setState({ focus: { line, caret } });
export const closeMenu = () => useSceneUi.setState({ menu: null });

/** Line `line`'s `lineIds` name: stays with the line when lines above it come or go. */
export const idAt = (view: EditorView, line: number) => view.state.field(lineIds)[line - 1];

/** Show the box starting at `line` as Ren'Py (`on`), or as the editor draws it again. */
export function markRaw(view: EditorView, line: number, on: boolean) {
  const id = view.state.field(lineIds)[line - 1];
  if (id === undefined) return;
  const was = useSceneUi.getState().rawIds;
  if (was.has(id) === on) return;
  const next = new Set(was);
  if (on) next.add(id); else next.delete(id);
  useSceneUi.setState({ rawIds: next });
}
export const isRaw = (view: EditorView, line: number) => useSceneUi.getState().rawIds.has(view.state.field(lineIds)[line - 1]);

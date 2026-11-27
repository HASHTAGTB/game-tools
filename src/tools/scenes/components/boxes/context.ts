import type { EditorView } from "@codemirror/view";
import { createContext, useContext, useState } from "react";
import type { Manifest } from "@/shared/lib/game";
import type { Place } from "../../lib/blocks";
import type { Problem } from "../../lib/checks";
import { blockAt, msgAt, priorAt, reactsOn, resolveRef, snippet, type PhoneIndex } from "../../lib/phone";
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
  /** what boxes there are, in order, at every level: changes when boxes come, go or move (then they slide) */
  structure: string;
  /** changes when what every box shows changes (the game's data, the cast): all boxes draw again */
  epoch: number;
  /** the scene's chats, and the messages of the scenes before it */
  phone: PhoneIndex;
};

/** One object for the whole view, updated in place on every edit: boxes don't all draw again because the file changed.
 *  Each box draws again when its own key (see `keyOf` in List) changes; handlers always read the current values. */
export const BoxContext = createContext<BoxCtx | null>(null);
export const useBox = () => useContext(BoxContext)!;

/** Hovered or focused: only then a say box listens for the caret, so the top bar's text tools act on the box you're
 *  in (the hover buttons themselves are always there, shown by CSS). */
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

/** A field's own value while you type in it, the file's otherwise: what you type is written to the file as you go,
 *  and the field doesn't take the file's value back meanwhile (the caret would jump); undo and the source view show
 *  in it once you leave it. */
export function useDraft(fileValue: string) {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? fileValue,
    onChange: (v: string) => setDraft(v),
    onFocus: () => setDraft(fileValue),
    onBlur: () => setDraft(null),
  };
}

/** What a message or reaction at `line` shows of other lines: the message it replies or reacts to, and the reactions
 *  on it. For the box keys: it draws again when one of those changes. */
export function phoneLook(c: BoxCtx, line: number, ref: string | null) {
  const block = blockAt(c.phone, line);
  if (!block) return null;
  const target = ref !== null ? resolveRef(ref, priorAt(c.phone, block.key, line)) : null;
  const msg = msgAt(c.phone, line);
  return { block, target, reacts: msg ? reactsOn(c.phone, msg) : [] };
}
export const phoneKey = (c: BoxCtx, line: number, ref: string | null) => {
  const l = phoneLook(c, line, ref);
  return l ? JSON.stringify([c.phone.known, l.block.head, l.target && [l.target.who, snippet(l.target), l.target.line, l.target.scene?.title, l.target.photos[0]], l.reacts]) : "";
};


/** Tell the source view's cursor (and so the preview and header) which line the box in focus is on. */
export function follow(view: EditorView, line: number) {
  const { doc, selection } = view.state;
  if (line > doc.lines) return;
  if (doc.lineAt(selection.main.head).number === line) return;
  view.dispatch({ selection: { anchor: doc.line(line).to } });
}

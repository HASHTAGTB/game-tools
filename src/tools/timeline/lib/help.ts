import type { Gesture } from "@/shared/ui/help";

/** What you can do on the board: shown in the empty Inspector and behind the toolbar's "?". */
export const GESTURES: Gesture[] = [
  ["Double-click a lane", "Add an event there"],
  ["Drag a card", "Move it to another column or lane"],
  ["Drag its right edge", "Make it last longer"],
  ["Drag its dot onto a card", "Draw an arrow"],
  ["Click a column label", "Name it: “Mo”, “after school”"],
  ["Click a name on the left", "Focus on that character or thread"],
  ["[Ctrl] + scroll", "Wider or narrower columns"],
  ["[Ctrl] [K]", "Find an event"],
  ["[Ctrl] [Z] · [Ctrl] [Shift] [Z]", "Undo · redo"],
  ["[Del] or [Ctrl] [⌫]", "Delete the selected event"],
  ["[Esc]", "Leave a field, or deselect"],
];

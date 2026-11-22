import { useShallow } from "zustand/react/shallow";
import { usePromptBuilder } from "../state";
import type { ListKey } from "./types";

/** A tag being dragged. `from` is null when it comes from the tag browser (copy only). */
export type DragTag = { tag: string; from: ListKey | null; index: number };

/** The drag state and actions from the prompt builder store. */
export const useDnd = () => usePromptBuilder(useShallow(s => ({ drag: s.drag, start: s.dragStart, end: s.dragEnd, drop: s.drop })));

/** dataTransfer payload. Firefox needs some data set or the drag does not start. */
export const DRAG_MIME = "text/plain";

const HOVER = ["ring-2", "ring-caramel"];

/** Props that make any element (preset tab, toggle row…) a drop target that appends to list `key`. */
export function useDropTarget() {
  const dnd = useDnd();
  return (key: ListKey) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dnd.drag) return;
      e.preventDefault();
      e.currentTarget.classList.add(...HOVER);
    },
    onDragLeave: (e: React.DragEvent) => e.currentTarget.classList.remove(...HOVER),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.currentTarget.classList.remove(...HOVER);
      dnd.drop(key, Infinity, e.ctrlKey || e.altKey);
    },
  });
}

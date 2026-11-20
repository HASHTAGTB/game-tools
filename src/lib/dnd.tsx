import { createContext, useContext } from "react";
import type { ListKey } from "./types";

/** A tag being dragged. `from` is null when it comes from the tag browser (copy only). */
export type DragTag = { tag: string; from: ListKey | null; index: number };

export type DndApi = {
  drag: DragTag | null;
  start: (d: DragTag) => void;
  end: () => void;
  /** Drop the dragged tag into list `to` before position `index` (Infinity = end). Ctrl/Alt held = copy. */
  drop: (to: ListKey, index: number, copy: boolean) => void;
};

export const DndContext = createContext<DndApi>({ drag: null, start: () => {}, end: () => {}, drop: () => {} });
export const useDnd = () => useContext(DndContext);

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

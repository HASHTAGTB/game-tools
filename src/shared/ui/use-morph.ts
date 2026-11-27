import { useLayoutEffect, useRef, type RefObject } from "react";
import { morph, sizeOf, type Size } from "./flair";

/** When `key` changes (a card opens or closes, another tab or preset shows), `ref`'s element morphs from the size it
 *  had to its new one instead of jumping, and what's below it follows along. Not on the first draw. */
export function useMorph(ref: RefObject<HTMLElement | null>, key: unknown, easing?: string) {
  const last = useRef<{ key: unknown; size: Size } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = last.current;
    // measured before the morph starts (it draws the old size at once)
    last.current = { key, size: sizeOf(el) };
    if (before && before.key !== key) morph(el, before.size, easing);
  });
}

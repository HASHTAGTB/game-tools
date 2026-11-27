import { useLayoutEffect, useRef, type RefObject } from "react";
import { roll, wash } from "./flair";

/** Colour wash when `key` changes (another speaker, another character): the new look sweeps over `box` from the
 *  left, and `label` (their name) rolls in. Not on the first draw. */
export function useWash(key: string | null, box: RefObject<HTMLElement | null>, label?: RefObject<HTMLElement | null>) {
  const was = useRef<{ key: string | null; background: string; border: string } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const before = was.current;
    if (before && before.key === key) return;
    if (before) { wash(el, before); if (label?.current) roll(label.current); }
    const cs = getComputedStyle(el);
    was.current = { key, background: cs.backgroundColor, border: cs.borderTopColor };
  });
}

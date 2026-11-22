import type { Transition } from "motion/react";

/* Shared animation vocabulary. Every tool imports from here, so the whole app moves the same way.
   Use `m.*` (not `motion.*`): <MotionProvider> runs LazyMotion in strict mode and loads the features on demand. */
export { m, AnimatePresence, LayoutGroup, useReducedMotion } from "motion/react";

/** Springs, by feel. `visualDuration` is roughly how long until it looks settled; `bounce` is overshoot (0 = none). */
export const spring = {
  /** Popups and small UI: quick, a hint of overshoot. */
  snappy: { type: "spring", visualDuration: 0.2, bounce: 0.15 },
  /** Size changes (expanding panels): no overshoot, so content doesn't jiggle. */
  smooth: { type: "spring", visualDuration: 0.3, bounce: 0 },
  /** Things that travel (switch thumb, tab underline): visible bounce. */
  bouncy: { type: "spring", visualDuration: 0.25, bounce: 0.3 },
} satisfies Record<string, Transition>;

/** Plain fades. Opacity stays a tween: Base UI watches it to know when a closing popup or panel has finished. */
export const fade = {
  in: { duration: 0.15, ease: "easeOut" },
  out: { duration: 0.12, ease: "easeIn" },
} satisfies Record<string, Transition>;

/** Popup enter/exit. Pair with `origin-(--transform-origin)` so it grows out of its trigger. */
export const pop = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1, transition: { ...spring.snappy, opacity: fade.in } },
  exit: { opacity: 0, scale: 0.96, transition: fade.out },
};

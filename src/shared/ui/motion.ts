import type { TargetAndTransition, Transition } from "motion/react";

/* How the app moves. Every tool uses these, so the same thing always moves the same way; a tool doesn't pick an
   animation, it uses the piece that owns the situation:

     something added to / gone from / moved in a list   MotionList + MotionItem (./motion-list.tsx): Drop in, Crumple,
                                                        the rest slides; moved up/down: `liftItem` (Lift and arc).
                                                        Enter splitting a line: `enter="peel"`.
     a popup opens / closes                             Popover, or `bloomCls` on a Base UI popup; `animate-bloom` on
                                                        a plain one (Bloom; its items rise in: `bloomRef`)
     one thing opens, closes or shows something else    useMorph (./use-morph.ts): it morphs to its new size and what's
       (a card, a choice's route, a preset's tags)      below follows
     a card on the board                                .board-move / .board-enter (src/index.css), `crumple` on delete
     a speaker / character changes                      SayTab (Tab swap) + useWash (Colour wash, name roll)
     text in an editor React doesn't own                ./flair.ts: decode, wave, glow, typeIn
     pointing at one thing                              ./flair.ts: spotlight; the board's ping
     a scene opens                                      ./flair.ts: cascade
     the same text shown another way (script ↔ source)  ./flair.ts: unfold, from the line you were on (kept where it
                                                        was on screen)

   Springs and presets for Motion are here; ./flair.ts has the Web Animations ones. Reduced motion: Motion follows
   <MotionProvider>, flair checks `calm()`, CSS animations are off (src/index.css).
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
  /** Popups blooming out of their trigger. */
  bloom: { type: "spring", visualDuration: 0.32, bounce: 0.3 },
} satisfies Record<string, Transition>;

/** Plain fades. Opacity stays a tween: Base UI watches it to know when a closing popup or panel has finished. */
export const fade = {
  in: { duration: 0.15, ease: "easeOut" },
  out: { duration: 0.12, ease: "easeIn" },
} satisfies Record<string, Transition>;

/** Bloom, for every popup (popovers, menus, context menus, dialogs: Base UI animates them with CSS and waits for the
 *  exit): it grows out of its trigger with a bounce, and its items pop in after it (`bloomRef` in ./flair.ts).
 *  Popups that aren't Base UI's use `animate-bloom` (src/index.css), the same curve. */
export const bloomCls = "origin-(--transform-origin) transition-[opacity,scale] duration-300 ease-[cubic-bezier(.3,1.35,.45,1)] " +
  "data-starting-style:scale-[.4] data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 " +
  "data-ending-style:duration-100 data-ending-style:ease-in motion-reduce:transition-none";

/** Drop in / Crumple, for list items (see ./motion-list.tsx): falls into place with a small bounce and squash; leaves
 *  squeezed, tilted and blurred. The bounce's `times` are for its 4 keyframes only: the fade has its own timing. */
export const listItem: { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition } = {
  initial: { opacity: 0, y: -22 },
  animate: {
    opacity: 1, y: [-22, 3, -1, 0], scaleY: [1, 0.95, 1.02, 1],
    transition: { duration: 0.52, times: [0, 0.65, 0.82, 1], ease: "easeOut", opacity: { duration: 0.25, ease: "easeOut" } },
  },
  exit: { opacity: 0, scaleX: 0.4, scaleY: 0.2, rotate: -6, filter: "blur(3px)", transition: { duration: 0.32, ease: "easeIn" } },
};

/** Peel, for a list item split off the one above it (Enter in the middle of a line): it comes out from under that
 *  one. Leaves like any list item. */
export const listPeel: typeof listItem = {
  initial: { opacity: 0.3, y: "-70%", scale: 0.96, originX: 0, originY: 0 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.42, ease: [0.3, 1.35, 0.45, 1] } },
  exit: listItem.exit,
};

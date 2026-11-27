import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { lift } from "./flair";
import { AnimatePresence, listItem, listPeel, m } from "./motion";

/* Motion for keyed lists React draws (sidebar rows, tree rows, tabs, cards, the scene's boxes). The data decides,
   nobody announces anything: whatever is added drops in, whatever is gone (deleted here, in the Inspector, on disk)
   crumples away while the rest of the list slides shut, and whatever changed place slides to it.

     <MotionList reset={loaded}>
       {items.map(i => <MotionItem key={i.id}>…</MotionItem>)}
     </MotionList>

   The list's parent needs `position: relative` (a leaving item is taken out of the flow while it crumples), and a
   component put straight into a MotionList (a row) passes its `ref` on to its MotionItem: that's how the list
   measures what leaves.
   Rows drawn outside a MotionList (a popup's fixed choices) don't move. */

/** null: not in a list. `slideWhen`: see MotionList. */
const InList = createContext<{ slideWhen?: string } | null>(null);

type ListProps = {
  /** When it changes the list is replaced, not edited (loaded, another character): nothing animates. */
  reset?: string | number | boolean | null;
  /** Items slide only when this changes (what the lists hold), else they snap: for lists you type in, where a line
   *  that wraps shouldn't set everything below it sliding. Default: they slide whenever they move. */
  slideWhen?: string;
  children: ReactNode;
};

export function MotionList({ reset, slideWhen, children }: ListProps) {
  return (
    <InList value={{ slideWhen }}>
      <AnimatePresence key={String(reset)} initial={false} mode="popLayout">{children}</AnimatePresence>
    </InList>
  );
}

const tags = { li: m.li, div: m.div, span: m.span };
type Tag = keyof typeof tags;

/** How a new item comes in: drops in, or peels out of the one above it (Enter splitting a line). */
const ENTER = { drop: listItem, peel: listPeel };

/** One item of a MotionList (an `li` unless `as` says otherwise). Outside a MotionList it's a plain element. */
export function MotionItem<T extends Tag = "li">({ as, enter = "drop", children, ...p }:
  { as?: T; enter?: keyof typeof ENTER } & ComponentProps<(typeof tags)[T]>) {
  const list = useContext(InList);
  const C = tags[as ?? "li"] as typeof m.li;
  // position only: an item whose own size changes (renamed, wraps) snaps to it instead of stretching
  const motion = list && { layout: "position" as const, layoutDependency: list.slideWhen, ...ENTER[enter] };
  return (
    <C data-motion-item {...motion} {...(p as ComponentProps<typeof m.li>)}>
      {/* what's inside isn't in the list (a menu in a popup in a card stays still) unless it has its own MotionList */}
      <InList value={null}>{children as ReactNode}</InList>
    </C>
  );
}

/** The item `inside` is in is being moved up or down: it lifts while the list slides it to its new place. */
export const liftItem = (inside: Element | null) => lift(inside?.closest<HTMLElement>("[data-motion-item]") ?? null);

/** Something right after a list (an Add field, a button): slides along when the list grows or shrinks. */
export function MotionFollow({ children, className }: { children: ReactNode; className?: string }) {
  return <m.div layout="position" className={className}>{children}</m.div>;
}

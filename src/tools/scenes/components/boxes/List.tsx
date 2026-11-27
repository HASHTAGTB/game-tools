import { Braces, ChevronDown, ChevronUp, LayoutList, Plus, Trash2 } from "lucide-react";
import { memo, type ReactNode } from "react";
import { IconButton } from "@/shared/ui/icon-button";
import { MotionItem, MotionList } from "@/shared/ui/motion-list";
import { placeAfter, type Box, type Place } from "../../lib/blocks";
import type { Problem } from "../../lib/checks";
import { removeBox, swapBoxes } from "../../lib/ops";
import { focusLine, markRaw, useSceneUi } from "../../lib/ui";
import { BoxProblems } from "../problems";
import { ChatBox } from "./ChatBox";
import { ChoiceBox } from "./ChoiceBox";
import { problemsOf, stageBefore, useBox, type BoxCtx, type ListLayout } from "./context";
import { liftAt, shownAs } from "./motion";
import { NoteBox, RawBox } from "./NoteBox";
import { SayBox } from "./SayBox";
import { StageCard } from "./StageCard";

/** A list of boxes with a slot before, between and after them. `start`: where a box at the very top goes;
 *  `layout`: where one goes after a box. */
/** A new box drops in (or peels out of the one above, when Enter split it), a deleted one crumples, and the boxes
 *  around slide: when boxes come, go or move anywhere in the scene, not while a line you type in wraps. Boxes are
 *  keyed by their first line's lasting name, so a box keeps its place (and its motion) while lines above change. */
export function List({ boxes, start, layout, empty }: { boxes: Box[]; start: Place; layout: ListLayout; empty?: string }) {
  const c = useBox();
  const entering = useSceneUi(s => s.entering);
  const lay = JSON.stringify(layout);
  return (
    <div className="bx-list relative">
      {boxes.length ? <Slot place={start} /> : <FirstSlot place={start} label={empty ?? "Add the first line"} />}
      <MotionList slideWhen={c.structure}>
        {boxes.map((b, i) => {
          const prev = boxes[i - 1] ?? null, next = boxes[i + 1] ?? null;
          const id = c.ids[b.from - 1] ?? -b.from;
          return (
            <MotionItem as="div" key={id} data-at={b.from} enter={id === entering ? "peel" : "drop"}>
              <Item box={b} prev={prev} next={next} layout={layout} k={keyOf(c, b, prev, next, lay)} />
              <Slot place={placeAfter(b, layout)} />
            </MotionItem>
          );
        })}
      </MotionList>
    </div>
  );
}

const near = (b: Box | null) => (b ? `${b.kind}:${b.from}-${b.to}:${b.kind === "say" ? b.who : ""}` : "");

/** Everything a box shows, as a string: it draws again only when this changes. Choices and chats always draw again
 *  (their own lists then skip what didn't change). */
function keyOf(c: BoxCtx, b: Box, prev: Box | null, next: Box | null, layout: string) {
  if (b.kind === "menu" || b.kind === "chat") return null;
  const probs = problemsOf(c, b).map(p => p.severity + p.message + (p.fix?.label ?? "")).join("|");
  const stage = b.kind === "say" ? `${stageBefore(c, b.from).pov}:${b.who === "extend" ? stageBefore(c, b.from).speaker : ""}` : b.kind === "stmt" ? JSON.stringify(stageBefore(c, b.from)) : "";
  return [JSON.stringify(b), near(prev), near(next), layout, probs, stage, c.epoch].join("\u0000");
}

const Item = memo(function Item(p: ItemProps & { k: string | null }) {
  return <BoxItem {...p} />;
}, (a, b) => a.k !== null && a.k === b.k);

export type ItemProps = { box: Box; prev: Box | null; next: Box | null; layout: ListLayout };

export function BoxItem(p: ItemProps) {
  switch (p.box.kind) {
    case "say": return <SayBox {...p} box={p.box} />;
    case "stmt": return <StageCard {...p} box={p.box} />;
    case "note": return <NoteBox {...p} box={p.box} />;
    case "raw": return <RawBox {...p} box={p.box} />;
    case "menu": return <ChoiceBox {...p} box={p.box} />;
    case "chat": return <ChatBox {...p} box={p.box} />;
  }
}

// ---------------------------------------------------------------- slots

function openAdd(anchor: Element, place: Place, replace?: Box) {
  useSceneUi.setState({ menu: { kind: "add", anchor, place, replace, level: place.level, chat: place.chat } });
}

const samePlace = (a: { place: Place }, b: { place: Place }) =>
  a.place.after === b.place.after && a.place.indent === b.place.indent && a.place.tight === b.place.tight && a.place.level === b.place.level && a.place.chat === b.place.chat;

export const Slot = memo(function Slot({ place }: { place: Place }) {
  const open = useSceneUi(s => s.menu?.kind === "add" && !s.menu.replace && s.menu.place.after === place.after && s.menu.place.indent === place.indent);
  return (
    <button type="button" className="bx-slot" aria-label="Add here" title="Add here" data-open={open || undefined}
      onClick={e => openAdd(e.currentTarget, place)}>
      <span className="bx-slot-plus"><Plus className="h-3 w-3" strokeWidth={3} /></span>
    </button>
  );
}, samePlace);

function FirstSlot({ place, label }: { place: Place; label: string }) {
  const open = useSceneUi(s => s.menu?.kind === "add" && s.menu.place.after === place.after && s.menu.place.indent === place.indent);
  return (
    <div className="py-1.5">
      <button type="button" className="bx-first" data-open={open || undefined} onClick={e => openAdd(e.currentTarget, place)}>
        <Plus className="h-4 w-4" strokeWidth={2.5} />{label}
      </button>
    </div>
  );
}

/** The Add menu at the slot after `b`, or in place of an empty `b`. */
export const addAfter = (anchor: Element, b: Box, layout: ListLayout) => openAdd(anchor, placeAfter(b, layout));
export const addInstead = (anchor: Element, b: Box, layout: ListLayout) => openAdd(anchor, placeAfter(b, layout), b);

// ---------------------------------------------------------------- moving, deleting

/** Boxes that can swap places: neighbours in a list, neither a choice (a choice's routes hang on its place). */
export const movable = (a: Box | null, b: Box | null): a is Box => !!a && !!b && a.kind !== "menu" && b.kind !== "menu";

export function useMoves(box: Box, prev: Box | null, next: Box | null) {
  const { view } = useBox();
  /** where `a` starts once it's below `b` */
  const below = (a: Box, b: Box) => a.from + (b.to - b.from + 1) + (b.from - a.to - 1);
  // the moved box lifts while its list slides both to their new places (the lines keep their names, see swapBoxes)
  const up = movable(prev, box) ? () => { liftAt(box.from); swapBoxes(view, prev!, box); focusLine(prev!.from); } : null;
  const down = movable(next, box) ? () => { liftAt(box.from); swapBoxes(view, box, next!); focusLine(below(box, next!)); } : null;
  // it crumples on its own once it's gone from the list
  const remove = () => { markRaw(view, box.from, false); const n = removeBox(view, box); focusLine(prev ? prev.from : n); };
  return { up, down, remove };
}

const AS: Record<string, string> = { stmt: "a card", menu: "a choice", chat: "a chat", say: "a line", note: "a note" };

/** Show a box as Ren'Py, or a box shown so as the editor draws it again (session only, the file doesn't change). */
function RawToggle({ box }: { box: Box }) {
  const { view } = useBox();
  const back = box.kind === "raw" ? box.as : null;
  if (box.kind === "raw" && !back) return null;
  const flip = () => {
    markRaw(view, box.from, !back);
    useSceneUi.setState({ openCard: null });
    focusLine(box.from, "end");
    shownAs(box.from, !back);
  };
  return back
    ? <IconButton icon={LayoutList} size="sm" label={`Show as ${AS[back] ?? "a box"}`} onClick={flip} />
    : <IconButton icon={Braces} size="sm" label="Edit as Ren'Py" onClick={flip} />;
}

/** The icons that show on hover: move up, move down, delete (and whatever a box adds in front). */
export function Acts({ box, prev, next, children }: { box: Box; prev: Box | null; next: Box | null; children?: ReactNode }) {
  const { up, down, remove } = useMoves(box, prev, next);
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="bx-acts" onMouseDown={keep}>
      {children}
      <RawToggle box={box} />
      <IconButton icon={ChevronUp} size="sm" label="Move up" kbd="Alt+↑" disabled={!up} onClick={() => up?.()} />
      <IconButton icon={ChevronDown} size="sm" label="Move down" kbd="Alt+↓" disabled={!down} onClick={() => down?.()} />
      <IconButton icon={Trash2} size="sm" tone="danger" label="Delete" onClick={remove} />
    </div>
  );
}

// ---------------------------------------------------------------- problems

/** A box's problems under it. */
export function Problems({ list }: { list: Problem[] }) {
  return <BoxProblems list={list} view={useBox().view} />;
}

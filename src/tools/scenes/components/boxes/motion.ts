import { decode, faceOf, flip, morph, sizeOf, wash } from "@/shared/ui/flair";
import { liftItem } from "@/shared/ui/motion-list";

/* The box view's motion beyond what its lists do on their own (List: new boxes drop in or peel out of the box above,
   deleted ones crumple, the others slide). These two are about one box the user just acted on, found by the line
   it starts on (its wrapper's `data-at`). */

const wrapperAt = (line: number) => document.querySelector<HTMLElement>(`[data-at="${line}"]`);
const boxIn = (wrapper: HTMLElement | null) => wrapper?.querySelector<HTMLElement>(".bx-box") ?? null;
const nameIn = (box: HTMLElement | null) => box?.querySelector<HTMLElement>(":scope > .bx-who") ?? null;

/** The box at `line` is being moved up or down: it lifts on its way (call it right before the swap). */
export const liftAt = (line: number) => liftItem(wrapperAt(line));

/** The box at `line` is about to be switched to Ren'Py (`code`) or back. Call it right before the switch: it takes
 *  the box's size, colours and name as they are, then, once the box is drawn again, morphs it from that size, washes
 *  the new colour over it and flips the name over (speaker ↔ "Ren'Py"); going to Ren'Py its text decodes into code. */
export function shownAs(line: number, code: boolean) {
  const was = boxIn(wrapperAt(line));
  if (!was) return;
  const size = sizeOf(was);
  const cs = getComputedStyle(was);
  const colours = { background: cs.backgroundColor, border: cs.borderTopColor };
  const name = faceOf(nameIn(was));
  requestAnimationFrame(() => {
    const box = boxIn(wrapperAt(line));
    if (!box || box === was) return;
    morph(box, size);
    wash(box, colours);
    flip(name, nameIn(box));
    const editor = code ? box.querySelector<HTMLElement>(".cm-content") : null;
    if (editor) decode(editor, editor.innerText);
  });
}

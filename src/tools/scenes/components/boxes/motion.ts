import { decode, fadeIn } from "@/shared/ui/flair";
import { liftItem } from "@/shared/ui/motion-list";

/* The box view's motion beyond what its lists do on their own (List: new boxes drop in or peel out of the box above,
   deleted ones crumple, the others slide). These two are about one box the user just acted on, found by the line
   it starts on (its wrapper's `data-at`). */

const wrapperAt = (line: number) => document.querySelector<HTMLElement>(`[data-at="${line}"]`);

/** The box at `line` is being moved up or down: it lifts on its way (call it right before the swap). */
export const liftAt = (line: number) => liftItem(wrapperAt(line));

/** The box at `line` was just switched to Ren'Py (`code`: its text decodes into code) or back (it fades in). Call it
 *  right after the switch: it waits for the box to be drawn again. */
export function shownAs(line: number, code: boolean) {
  requestAnimationFrame(() => {
    const el = wrapperAt(line);
    const editor = code ? el?.querySelector<HTMLElement>(".cm-content") : null;
    if (editor) decode(editor, editor.innerText);
    else if (el && !code) fadeIn(el);
  });
}

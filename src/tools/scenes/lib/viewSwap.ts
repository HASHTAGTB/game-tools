import type { EditorView } from "@codemirror/view";

/** Switching between the script view (boxes) and the source view: the line your eyes are on, and where it was on
 *  screen (`y`, viewport px), so the other view can put it at the same height (and unfold from it). It's the cursor's
 *  line when that can be seen, else the line at the top of the view. `loaded`: the editor it was measured in (a new
 *  one, another scene or a reload, opens as usual). */
export type Swap = { line: number; y: number; loaded: number };

/** The drawn box (or part of one: a choice's option) that holds `line`: the smallest one. A line no box holds (an
 *  empty line between two, the header, a fence) goes by the next box, else the one before it. */
export function boxFor(page: Element, line: number): HTMLElement | null {
  let best: HTMLElement | null = null, span = Infinity;
  let next: HTMLElement | null = null, nextFrom = Infinity, prev: HTMLElement | null = null, prevTo = -Infinity;
  for (const el of page.querySelectorAll<HTMLElement>("[data-from]")) {
    if (!el.getClientRects().length) continue;
    const from = +el.dataset.from!, to = +el.dataset.to!;
    if (from <= line && line <= to) { if (to - from < span) { best = el; span = to - from; } }
    else if (from > line) { if (from < nextFrom) { next = el; nextFrom = from; } }
    else if (to > prevTo) { prev = el; prevTo = to; }
  }
  return best ?? next ?? prev;
}

const cursorLine = (v: EditorView) => v.state.doc.lineAt(v.state.selection.main.head).number;

/** In the box view (`page` is its scroller). */
export function swapFromBoxes(page: HTMLElement, v: EditorView, loaded: number): Swap | null {
  const view = page.getBoundingClientRect();
  const seen = (r: DOMRect) => r.bottom > view.top && r.top < view.bottom;
  const at = boxFor(page, cursorLine(v));
  if (at) {
    const r = at.getBoundingClientRect();
    if (seen(r)) return { line: cursorLine(v), y: r.top, loaded };
  }
  // the first box that can be seen
  for (const el of page.querySelectorAll<HTMLElement>("[data-from]")) {
    const r = el.getBoundingClientRect();
    if (r.bottom > view.top && (r.width || r.height)) return { line: +el.dataset.from!, y: r.top, loaded };
  }
  return null;
}

/** In the source view (while it's shown). */
export function swapFromSource(v: EditorView, loaded: number): Swap | null {
  const view = v.scrollDOM.getBoundingClientRect();
  if (!view.height) return null;
  const top = v.documentTop;
  const b = v.lineBlockAt(v.state.doc.line(cursorLine(v)).from);
  if (top + b.bottom > view.top && top + b.top < view.bottom) return { line: cursorLine(v), y: top + b.top, loaded };
  const first = v.lineBlockAtHeight(view.top - top);
  return { line: v.state.doc.lineAt(first.from).number, y: top + first.top, loaded };
}

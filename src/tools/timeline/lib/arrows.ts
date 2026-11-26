import type { Card, Layout } from "./layout";
import { allEvents, findEvent } from "./model";
import type { Chapter } from "./types";

/** The board's arrows (an event's `links`), as geometry: pure, from the layout. */

/** An arrow with both ends on the board. */
export type Arrow = { key: string; from: Card; to: Card; label?: string };

/** An arrow with one end off the board (folded chapter, hidden by the focus): a short stub that says where it goes.
 *  `out`: it leaves this card; `later`: the other end is later in time; `chapter`: where the other end is. */
export type Stub = { key: string; card: Card; other: string; out: boolean; later: boolean; chapter: string; label?: string };

export function arrowsOf(lay: Layout): Arrow[] {
  return lay.cards.filter(c => lay.primary.get(c.event.id) === c).flatMap(f => (f.event.links ?? []).flatMap(l => {
    const t = lay.primary.get(l.to);
    return t ? [{ key: `${f.event.id}>${l.to}`, from: f, to: t, label: l.label }] : [];
  }));
}

export function stubsOf(lay: Layout, chapters: Chapter[]): Stub[] {
  const chapterIndex = new Map(chapters.map((c, i) => [c.id, i]));
  const at = (e: string) => { const f = findEvent(chapters, e); return f && { chapter: f.chapter, p: chapterIndex.get(f.chapter.id)! * 10000 + f.event.col }; };
  const out: Stub[] = [];
  for (const { event } of allEvents(chapters)) for (const l of event.links ?? []) {
    const from = lay.primary.get(event.id), to = lay.primary.get(l.to);
    if (!from === !to) continue;
    const a = at(event.id), b = at(l.to);
    if (!a || !b) continue;
    if (from) out.push({ key: `${event.id}>${l.to}`, card: from, other: l.to, out: true, later: b.p >= a.p, chapter: b.chapter.name, label: l.label });
    else out.push({ key: `${event.id}>${l.to}`, card: to!, other: event.id, out: false, later: a.p > b.p, chapter: a.chapter.name, label: l.label });
  }
  return out;
}

const STUB = 30;

/** The stub leaves (or enters) the side facing the hidden end; its head points the way the arrow goes. */
export function stubPath(s: Stub) {
  const b = s.card.box, y = b.y + b.h / 2;
  const edge = s.later ? b.x + b.w : b.x, far = edge + (s.later ? STUB : -STUB);
  const tip = s.out ? far : edge, dir = (s.out ? far - edge : edge - far) > 0 ? 1 : -1;
  return { d: `M${edge},${y} L${far},${y}`, head: `M${tip},${y} l${-7 * dir},-4 v8 z`, far, y };
}

/** Forward arrows leave from the right edge into the left one; arrows back in time (a reminder of something
 *  earlier) go from the left edge into the right one, so they don't loop around the card. */
export function arrowPath(f: Card, t: Card) {
  const back = t.box.x + t.box.w <= f.box.x;
  const x1 = back ? f.box.x : f.box.x + f.box.w, y1 = f.box.y + f.box.h / 2;
  const x2 = back ? t.box.x + t.box.w : t.box.x, y2 = t.box.y + t.box.h / 2;
  const dx = (back ? -1 : 1) * Math.max(36, Math.abs(x2 - x1) / 2);
  const head = back ? `M${x2},${y2} l7,-4 v8 z` : `M${x2},${y2} l-7,-4 v8 z`;
  return { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, head, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
}

/** The same event on several lanes: lines through its copies while it's in focus. */
export function siblingLines(lay: Layout, focus: string | null) {
  if (!focus) return [];
  const copies = lay.cards.filter(c => c.event.id === focus).sort((a, b) => a.box.y - b.box.y);
  return copies.slice(1).map((c, i) => ({ x: c.box.x + 12, y0: copies[i].box.y + copies[i].box.h, y1: c.box.y }));
}

/** The selected event's arrows, in the order they draw (ms), and when each other end gets its pulse. */
export function drawOrder(arrows: Arrow[], selected: string | null) {
  const drawAt = new Map<string, number>(), arriveAt = new Map<string, number>();
  if (!selected) return { drawAt, arriveAt };
  for (const l of arrows) {
    if (l.from.event.id !== selected && l.to.event.id !== selected) continue;
    const d = drawAt.size * 90;
    drawAt.set(l.key, d);
    const other = l.from.event.id === selected ? l.to.event.id : l.from.event.id;
    if (!arriveAt.has(other)) arriveAt.set(other, d);
  }
  return { drawAt, arriveAt };
}

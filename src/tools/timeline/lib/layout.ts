import type { RosterCharacter } from "@/shared/lib/roster";
import { matches } from "./model";
import type { Chapter, Filter, StoryEvent, Thread } from "./types";

export const ROW_H = 70;
export const CARD_H = 62;
export const LANE_PAD = 6;
export const CHAPTER_PAD = 8;
/** Width of a folded chapter. */
export const STRIP_W = 34;
export const BASE_COL_W = 176;
export const MIN_ROW_H = 26;

/** Row height where a chapter needs `n` rows in one lane: a crowded lane squashes its cards rather than growing
 *  to n full rows (which would make it that tall across the whole story). */
export const rowHeight = (n: number) => (n <= 1 ? ROW_H : Math.max(MIN_ROW_H, Math.floor((ROW_H * 1.5) / n)));
const cardGap = (n: number) => (n <= 1 ? ROW_H - CARD_H : 4);

/** A lane is a character, a thread, everything ("none" grouping), or the catch-all for events with no character /
 *  no thread (`id` null). */
export type LaneDef = { key: string; id: string | null; name: string; color: string };

export type Box = { x: number; y: number; w: number; h: number };
export type PlacedColumn = { i: number; x: number; w: number; label: string };
export type PlacedChapter = { chapter: Chapter; x: number; w: number; columns: PlacedColumn[]; folded: boolean };
export type Lane = LaneDef & { y: number; h: number };
export type Card = { event: StoryEvent; chapter: Chapter; lane: LaneDef; box: Box; dim: boolean };

export type Layout = {
  chapters: PlacedChapter[];
  lanes: Lane[];
  cards: Card[];
  /** Each event's first card, where arrows attach. */
  primary: Map<string, Card>;
  width: number;
  height: number;
};

export const UNSORTED = "__none";

export function laneDefs(filter: Filter, cast: RosterCharacter[], threads: Thread[], events: StoryEvent[]): LaneDef[] {
  if (filter.groupBy === "none") return [{ key: "all", id: null, name: "Story", color: "var(--color-caramel)" }];
  const byChar = filter.groupBy === "chars";
  const items = byChar ? cast : threads;
  const picked = byChar ? filter.chars : filter.threads;
  const lanes: LaneDef[] = items
    .filter(x => !picked.length || picked.includes(x.id))
    .map(x => ({ key: x.id, id: x.id, name: x.name, color: x.color }));
  if (events.some(e => (byChar ? e.chars : e.threads).length === 0))
    lanes.push({ key: UNSORTED, id: null, name: byChar ? "No character" : "No thread", color: "var(--color-taupe)" });
  return lanes;
}

/** Which lanes an event shows on. */
export function lanesOf(e: StoryEvent, filter: Filter, lanes: LaneDef[]): LaneDef[] {
  if (filter.groupBy === "none") return lanes;
  const ids = filter.groupBy === "chars" ? e.chars : e.threads;
  if (!ids.length) return lanes.filter(l => l.key === UNSORTED);
  return lanes.filter(l => l.id && ids.includes(l.id));
}

export function layout(chapters: Chapter[], lanes: LaneDef[], filter: Filter, colW: number, folded: Set<string>): Layout {
  const hide = filter.hideOthers;
  const shown = (e: StoryEvent) => !hide || matches(e, filter);

  // which lanes have something to show (hidden mode drops empty ones)
  const items = chapters.flatMap(chapter => chapter.events.filter(shown).flatMap(event =>
    lanesOf(event, filter, lanes).map(lane => ({ chapter, event, lane }))));
  const used = new Set(items.map(i => i.lane.key));
  const liveLanes = hide ? lanes.filter(l => used.has(l.key)) : lanes;

  // chapters and columns along x
  let x = 0;
  const placed: PlacedChapter[] = [];
  for (const chapter of chapters) {
    const covered = new Set<number>();
    for (const e of chapter.events) if (shown(e)) for (let c = e.col; c < e.col + (e.span ?? 1); c++) covered.add(c);
    const isFolded = folded.has(chapter.id) || (hide && covered.size === 0);
    const columns: PlacedColumn[] = [];
    let cx = x + CHAPTER_PAD;
    chapter.columns.forEach((label, i) => {
      const w = isFolded || (hide && !covered.has(i)) ? 0 : colW;
      columns.push({ i, x: cx, w, label });
      cx += w;
    });
    const w = isFolded ? STRIP_W : cx - x + CHAPTER_PAD;
    placed.push({ chapter, x, w, columns, folded: isFolded });
    x += w;
  }
  const chapterOf = new Map(placed.map(p => [p.chapter.id, p]));

  // lanes along y: pack each chapter's cards into rows; the chapter that needs the most room sets the lane height
  const out: Lane[] = [];
  const cards: Card[] = [];
  const primary = new Map<string, Card>();
  let y = 0;
  for (const lane of liveLanes) {
    const mine = items.filter(i => i.lane.key === lane.key);
    let inner = ROW_H;
    const rowOf = new Map<StoryEvent, number>();
    const rowsIn = new Map<string, number>();
    for (const pc of placed) {
      if (pc.folded) continue;
      const evs = mine.filter(i => i.chapter === pc.chapter).map(i => i.event).sort((a, b) => a.col - b.col || (b.span ?? 1) - (a.span ?? 1));
      const ends: number[] = [];
      for (const e of evs) {
        let r = ends.findIndex(end => end <= e.col);
        if (r < 0) { r = ends.length; ends.push(0); }
        ends[r] = e.col + (e.span ?? 1);
        rowOf.set(e, r);
      }
      rowsIn.set(pc.chapter.id, ends.length);
      inner = Math.max(inner, ends.length * rowHeight(ends.length));
    }
    const h = inner + LANE_PAD * 2;
    for (const it of mine) {
      const pc = chapterOf.get(it.chapter.id)!;
      if (pc.folded) continue;
      const cols = pc.columns.slice(it.event.col, it.event.col + (it.event.span ?? 1));
      if (!cols.length) continue;
      const cx = cols[0].x, cw = cols.reduce((s, c) => s + c.w, 0);
      if (cw <= 0) continue;
      const n = rowsIn.get(it.chapter.id) ?? 1, rh = rowHeight(n), gap = cardGap(n);
      const card: Card = {
        event: it.event, chapter: it.chapter, lane,
        box: { x: cx + 3, y: y + LANE_PAD + rowOf.get(it.event)! * rh + gap / 2, w: cw - 6, h: rh - gap },
        dim: !hide && !matches(it.event, filter),
      };
      cards.push(card);
      if (!primary.has(it.event.id)) primary.set(it.event.id, card);
    }
    out.push({ ...lane, y, h });
    y += h;
  }
  return { chapters: placed, lanes: out, cards, primary, width: x, height: y };
}

/** The chapter column under `x`, if any (folded chapters and hidden columns aren't targets). */
export function columnAt(lay: Layout, x: number): { chapter: Chapter; col: number } | null {
  for (const pc of lay.chapters) {
    if (pc.folded || x < pc.x || x >= pc.x + pc.w) continue;
    const vis = pc.columns.filter(c => c.w > 0);
    if (!vis.length) return null;
    const hit = vis.find(c => x >= c.x && x < c.x + c.w) ?? (x < vis[0].x ? vis[0] : vis[vis.length - 1]);
    return { chapter: pc.chapter, col: hit.i };
  }
  return null;
}

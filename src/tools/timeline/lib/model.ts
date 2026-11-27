import { useGame } from "@/shared/lib/game";
import { withGame, type RosterCharacter } from "@/shared/lib/roster";
import type { Chapter, Filter, StoryEvent, Thread, View } from "./types";
import { UNKNOWN_COLOR } from "@/shared/lib/colors";

export type Doc = { chapters: Chapter[]; roster: RosterCharacter[]; threads: Thread[]; views: View[] };

export const randomId = (prefix = "e") => prefix + crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, "0");

export function findEvent(chapters: Chapter[], id: string): { chapter: Chapter; event: StoryEvent } | null {
  for (const chapter of chapters) {
    const event = chapter.events.find(e => e.id === id);
    if (event) return { chapter, event };
  }
  return null;
}

export const allEvents = (chapters: Chapter[]) => chapters.flatMap(chapter => chapter.events.map(event => ({ chapter, event })));

/** The roster with the game's characters merged in (shared/lib/roster `withGame`, from the game data loaded right now:
 *  components that use it also subscribe to `useGame`). Characters used by events but missing from both still get a
 *  (grey) lane, at the end. */
export function castOf(file: RosterCharacter[], chapters: Chapter[]): (RosterCharacter & { game?: boolean })[] {
  const roster = withGame(file, useGame.getState().manifest?.characters);
  const known = new Set(roster.map(c => c.id));
  const extra: RosterCharacter[] = [];
  for (const { event } of allEvents(chapters)) for (const c of event.chars) {
    if (!known.has(c)) { known.add(c); extra.push({ id: c, name: c, color: UNKNOWN_COLOR }); }
  }
  return [...roster, ...extra];
}

export function threadsOf(threads: Thread[], chapters: Chapter[]): Thread[] {
  const known = new Set(threads.map(t => t.id));
  const extra: Thread[] = [];
  for (const { event } of allEvents(chapters)) for (const t of event.threads) {
    if (!known.has(t)) { known.add(t); extra.push({ id: t, name: t, color: UNKNOWN_COLOR }); }
  }
  return [...threads, ...extra];
}

export const isFiltered = (f: Filter) => f.chars.length > 0 || f.threads.length > 0;

export const matches = (e: StoryEvent, f: Filter) =>
  (!f.chars.length || e.chars.some(c => f.chars.includes(c))) && (!f.threads.length || e.threads.some(t => f.threads.includes(t)));

/** Where an event sits in the whole story, for "is this before that". */
export function position(chapters: Chapter[]) {
  const out = new Map<string, number>();
  chapters.forEach((c, ci) => c.events.forEach(e => out.set(e.id, ci * 10000 + e.col)));
  return out;
}

// ---------------------------------------------------------------- edits (on a draft copy)

/** A new empty column before column `i`; events at or after it move right, events across it get wider. */
export function insertColumn(ch: Chapter, i: number) {
  ch.columns.splice(i, 0, "");
  for (const e of ch.events) {
    if (e.col >= i) e.col++;
    else if (e.col + (e.span ?? 1) > i) e.span = (e.span ?? 1) + 1;
  }
}

/** Removes column `i` if no event starts there. Events across it get narrower. */
export function removeColumn(ch: Chapter, i: number): boolean {
  if (ch.columns.length <= 1 || ch.events.some(e => e.col === i)) return false;
  ch.columns.splice(i, 1);
  for (const e of ch.events) {
    if (e.col > i) e.col--;
    else if (e.col + (e.span ?? 1) > i) { e.span = (e.span ?? 1) - 1; if (e.span <= 1) delete e.span; }
  }
  return true;
}

export function deleteEvent(chapters: Chapter[], id: string) {
  for (const c of chapters) {
    c.events = c.events.filter(e => e.id !== id);
    for (const e of c.events) if (e.links) { e.links = e.links.filter(l => l.to !== id); if (!e.links.length) delete e.links; }
  }
}

/** Moves an event to `col` of chapter `to`, adding columns there if needed. */
export function moveEvent(chapters: Chapter[], id: string, to: string, col: number) {
  const f = findEvent(chapters, id);
  const target = chapters.find(c => c.id === to);
  if (!f || !target) return;
  if (f.chapter !== target) {
    f.chapter.events = f.chapter.events.filter(e => e !== f.event);
    target.events.push(f.event);
  }
  f.event.col = Math.max(0, col);
  while (target.columns.length < f.event.col + (f.event.span ?? 1)) target.columns.push("");
}

/** Swaps `from` for `to` in a list (lane changes). `to` null removes `from`; `from` null adds `to`. */
export function swapIn(list: string[], from: string | null, to: string | null): string[] {
  const out = list.filter(x => x !== from);
  if (to && !out.includes(to)) {
    const i = from ? list.indexOf(from) : -1;
    out.splice(i < 0 ? out.length : i, 0, to);
  }
  return out;
}

/** An order value between two chapters (or after the last one). */
export const orderBetween = (a: number | undefined, b: number | undefined) =>
  a === undefined ? (b === undefined ? 0 : b - 10) : b === undefined ? a + 10 : (a + b) / 2;

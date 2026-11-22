import type { RosterCharacter } from "@/shared/lib/roster";
import type { Resolved, Span } from "./resolve";
import type { Scale } from "./scale";
import type { Arc, StoryEvent } from "./types";

export const ROW_H = 64;      // one sub-row of a lane
export const CARD_H = 54;
export const LANE_PAD = 6;
export const ARC_ROW_H = 26;
export const MIN_CARD_W = 28;

export type Box = { x: number; y: number; w: number; h: number };
export type PlacedEvent = { event: StoryEvent; arc: Arc; span: Span; lane: string; box: Box };
export type PlacedArc = { arc: Arc; span: Span; box: Box };
export type Lane = { char: RosterCharacter; y: number; h: number; rows: number; collapsed: boolean };

export type Layout = {
  lanes: Lane[];
  events: PlacedEvent[];
  /** Box of each event on the first lane it shows on (where connections attach). */
  primary: Map<string, PlacedEvent>;
  arcs: PlacedArc[];
  arcBandH: number;
  height: number;
};

/** Greedy packing: each item goes into the first row whose last item ended before it starts. */
function pack<T>(items: T[], x0: (t: T) => number, x1: (t: T) => number, gap = 4): Map<T, number> {
  const ends: number[] = [];
  const out = new Map<T, number>();
  for (const it of [...items].sort((a, b) => x0(a) - x0(b))) {
    let r = ends.findIndex(e => e + gap <= x0(it));
    if (r < 0) { r = ends.length; ends.push(0); }
    ends[r] = x1(it);
    out.set(it, r);
  }
  return out;
}

/** Characters not in the roster but used by events still get a lane (grey), at the end. */
export function laneChars(roster: RosterCharacter[], arcs: Arc[]): RosterCharacter[] {
  const known = new Set(roster.map(c => c.id));
  const extra: RosterCharacter[] = [];
  for (const a of arcs) for (const e of a.events) for (const c of e.chars) {
    if (!known.has(c)) { known.add(c); extra.push({ id: c, name: c, color: "#9a8f86" }); }
  }
  return [...roster, ...extra];
}

export function layout(arcs: Arc[], chars: RosterCharacter[], res: Resolved, scale: Scale, hidden: Set<string>, collapsed: Set<string>): Layout {
  // arc band
  const arcItems = arcs.flatMap(arc => {
    const span = res.arcs.get(arc.id);
    return span ? [{ arc, span, x: scale.x(span.start), w: Math.max(scale.x(span.end) - scale.x(span.start), MIN_CARD_W) }] : [];
  });
  const arcRows = pack(arcItems, a => a.x, a => a.x + Math.max(a.w, a.arc.name.length * 7 + 16));
  const arcRowCount = Math.max(1, ...[...arcRows.values()].map(r => r + 1));
  const placedArcs: PlacedArc[] = arcItems.map(a => ({ arc: a.arc, span: a.span, box: { x: a.x, y: arcRows.get(a)! * ARC_ROW_H, w: a.w, h: ARC_ROW_H - 4 } }));
  const arcBandH = arcRowCount * ARC_ROW_H + 8;

  // lanes
  const lanes: Lane[] = [];
  const events: PlacedEvent[] = [];
  const primary = new Map<string, PlacedEvent>();
  let y = 0;
  for (const char of chars) {
    if (hidden.has(char.id)) continue;
    const items = arcs.flatMap(arc => arc.events.filter(e => e.chars.includes(char.id)).flatMap(event => {
      const span = res.events.get(event.id);
      if (!span) return [];
      const x = scale.x(span.start);
      return [{ event, arc, span, x, w: Math.max(scale.x(span.end) - x, MIN_CARD_W) }];
    }));
    const isCollapsed = collapsed.has(char.id);
    const rows = pack(items, i => i.x, i => i.x + i.w);
    const rowCount = Math.max(1, ...[...rows.values()].map(r => r + 1));
    const h = isCollapsed ? 28 : rowCount * ROW_H + LANE_PAD * 2;
    for (const it of items) {
      const r = isCollapsed ? 0 : rows.get(it)!;
      const box = isCollapsed
        ? { x: it.x, y: y + 6, w: it.w, h: 16 }
        : { x: it.x, y: y + LANE_PAD + r * ROW_H + (ROW_H - CARD_H) / 2, w: it.w, h: CARD_H };
      const p: PlacedEvent = { event: it.event, arc: it.arc, span: it.span, lane: char.id, box };
      events.push(p);
      if (!primary.has(it.event.id) || it.event.chars[0] === char.id) primary.set(it.event.id, p);
    }
    lanes.push({ char, y, h, rows: rowCount, collapsed: isCollapsed });
    y += h;
  }
  return { lanes, events, primary, arcs: placedArcs, arcBandH, height: y };
}

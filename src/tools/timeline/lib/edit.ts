/** Edits on the timeline data. All of them mutate a draft (the store hands in a copy) and keep everything that depends
 *  on the edited thing where it was, unless the edit is meant to move it. */
import { formatDuration, parseDate, parseDuration, toDateText, type Precision } from "./duration";
import type { Resolved } from "./resolve";
import { type Arc, type Connection, type Ref, type StoryEvent, type When } from "./types";

export type WhenKind = "at" | "after" | "from";
export const whenKind = (w: When): WhenKind => ("at" in w ? "at" : "after" in w ? "after" : "from");
export const refId = (r: Ref) => ("event" in r ? r.event : r.arc);

const hex8 = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, "0")).join("");

export function newId(prefix: string, taken: (id: string) => boolean) {
  let id = `${prefix}_${hex8()}`;
  while (taken(id)) id = `${prefix}_${hex8()}`;
  return id;
}

export const findEvent = (arcs: Arc[], id: string) => {
  for (const a of arcs) { const e = a.events.find(x => x.id === id); if (e) return { arc: a, event: e }; }
  return null;
};
export const allEvents = (arcs: Arc[]) => arcs.flatMap(a => a.events);
export const allConnections = (arcs: Arc[]) => arcs.flatMap(a => a.connections.map(c => ({ arc: a, conn: c })));

const round = (h: number) => Math.round(h * 2) / 2;
const dur = (h: number) => (Math.abs(h) < 0.25 ? undefined : formatDuration(round(h)));

/** The time unit of a precision, for snapping fixed dates. */
const UNIT: Record<Precision, number> = { year: 24 * 365, month: 24 * 30, day: 24, hour: 0.5 };

/** Shift a `When` by `delta` hours: a date moves (snapped to its precision), a gap or offset grows. */
export function shiftWhen(w: When, delta: number): When {
  if ("at" in w) {
    const d = parseDate(w.at);
    if (!d) return w;
    if (d.precision === "year" || d.precision === "month") {
      const steps = Math.round(delta / UNIT[d.precision]);
      if (!steps) return w;
      const t = new Date(Date.UTC(2000, 0, 1) + d.hours * 3.6e6);
      if (d.precision === "year") t.setUTCFullYear(t.getUTCFullYear() + steps);
      else t.setUTCMonth(t.getUTCMonth() + steps);
      return { at: toDateText((t.getTime() - Date.UTC(2000, 0, 1)) / 3.6e6, d.precision) };
    }
    const unit = UNIT[d.precision];
    const h = d.hours + Math.round(delta / unit) * unit;
    return { at: toDateText(h, d.precision) };
  }
  if ("after" in w) {
    const gap = dur((parseDuration(w.gap) ?? 0) + delta);
    return { after: w.after, ...(gap ? { gap } : {}) };
  }
  const offset = dur((parseDuration(w.offset) ?? 0) + delta);
  return { from: w.from, ...(offset ? { offset } : {}) };
}

/** A `When` of another kind that lands on the same start. */
export function convertWhen(kind: WhenKind, start: number, precision: Precision, ref: Ref | null, res: Resolved): When | null {
  if (kind === "at") return { at: toDateText(start, precision) };
  if (!ref) return null;
  const target = "event" in ref ? res.events.get(ref.event) : res.arcs.get(ref.arc);
  if (!target) return null;
  if (kind === "after") { const gap = dur(start - target.end); return { after: ref, ...(gap ? { gap } : {}) }; }
  const offset = dur(start - target.start);
  return { from: ref, ...(offset ? { offset } : {}) };
}

/** Events and arc starts whose time refers to a ref matching `match`, with where they start now. */
function dependents(arcs: Arc[], res: Resolved, match: (r: Ref) => boolean) {
  const out: { when: Exclude<When, { at: string }>; start: number | undefined; set: (w: When) => void }[] = [];
  for (const a of arcs) {
    const w = a.start;
    if (!("at" in w) && match("after" in w ? w.after : w.from)) out.push({ when: w, start: res.arcs.get(a.id)?.start, set: nw => { a.start = nw; } });
    const end = a.end;
    if (end && !("at" in end) && match("after" in end ? end.after : end.from)) {
      out.push({ when: end, start: undefined, set: nw => { a.end = nw; } });   // an end only widens; dropping it is safe
    }
    for (const e of a.events) {
      const w = e.when;
      if (!("at" in w) && match("after" in w ? w.after : w.from)) out.push({ when: w, start: res.events.get(e.id)?.start, set: nw => { e.when = nw; } });
    }
  }
  return out;
}

/** Re-point everything that hangs off `ev` to what `ev` itself hangs off, keeping its start. */
function detachEvent(arcs: Arc[], ev: StoryEvent, res: Resolved) {
  const own = whenKind(ev.when);
  const ownRef = "at" in ev.when ? null : "after" in ev.when ? ev.when.after : ev.when.from;
  const ownPrecision = "at" in ev.when ? parseDate(ev.when.at)?.precision ?? "day" : "hour";
  for (const d of dependents(arcs, res, r => "event" in r && r.event === ev.id)) {
    if (d.start === undefined) { d.set({ at: "2000" }); continue; }
    const precision: Precision = own === "at" && Number.isInteger(d.start / 24) ? ownPrecision : "hour";
    const nw = convertWhen(own, d.start, own === "at" ? precision : "hour", ownRef, res);
    if (nw) d.set(nw);
  }
}

export function deleteEvent(arcs: Arc[], id: string, res: Resolved) {
  const f = findEvent(arcs, id);
  if (!f) return;
  detachEvent(arcs, f.event, res);
  f.arc.events = f.arc.events.filter(e => e.id !== id);
  for (const a of arcs) a.connections = a.connections.filter(c => c.from !== id && c.to !== id);
}

/** Delete an arc and its events. Things elsewhere that hung off them get fixed dates where they are now. */
export function deleteArc(arcs: Arc[], id: string, res: Resolved): Arc[] {
  const arc = arcs.find(a => a.id === id);
  if (!arc) return arcs;
  const gone = new Set([`arc:${id}`, ...arc.events.map(e => `event:${e.id}`)]);
  const rest = arcs.filter(a => a.id !== id);
  for (const d of dependents(rest, res, r => gone.has("event" in r ? `event:${r.event}` : `arc:${r.arc}`))) {
    const r = "after" in d.when ? d.when.after : d.when.from;
    const t = "event" in r ? res.events.get(r.event) : res.arcs.get(r.arc);
    if (!t || d.start === undefined) continue;
    d.set({ at: toDateText(d.start, t.precision === "year" || t.precision === "month" ? "day" : t.precision) });
  }
  const goneEvents = new Set(arc.events.map(e => e.id));
  for (const a of rest) a.connections = a.connections.filter(c => !goneEvents.has(c.from) && !goneEvents.has(c.to));
  return rest;
}

/** Move an event to another arc (keeps its time). Connections from it move along. */
export function moveToArc(arcs: Arc[], id: string, arcId: string) {
  const f = findEvent(arcs, id);
  const to = arcs.find(a => a.id === arcId);
  if (!f || !to || f.arc === to) return;
  f.arc.events = f.arc.events.filter(e => e !== f.event);
  to.events.push(f.event);
  const moving = f.arc.connections.filter(c => c.from === id);
  f.arc.connections = f.arc.connections.filter(c => c.from !== id);
  to.connections.push(...moving);
}

export function addConnection(arcs: Arc[], from: string, to: string): Connection | null {
  if (from === to) return null;
  const f = findEvent(arcs, from);
  if (!f || !findEvent(arcs, to)) return null;
  if (allConnections(arcs).some(({ conn }) => conn.from === from && conn.to === to)) return null;
  const c: Connection = { id: newId("link", id => allConnections(arcs).some(x => x.conn.id === id)), from, to };
  f.arc.connections.push(c);
  return c;
}

/** The arc a new event at `hours` belongs in: the innermost arc covering it, else the nearest one before it. */
export function arcAt(arcs: Arc[], res: Resolved, hours: number): Arc | null {
  let best: Arc | null = null, bestLen = Infinity, before: Arc | null = null, beforeEnd = -Infinity;
  for (const a of arcs) {
    const s = res.arcs.get(a.id);
    if (!s) continue;
    if (s.start <= hours && hours <= s.end && s.end - s.start < bestLen) { best = a; bestLen = s.end - s.start; }
    if (s.end <= hours && s.end > beforeEnd) { before = a; beforeEnd = s.end; }
  }
  return best ?? before ?? arcs[0] ?? null;
}

/** A new event for `char` at `hours`: after the previous event of that character in the same arc, or from the arc's
 *  start if there is none. */
export function newEvent(arcs: Arc[], res: Resolved, char: string, hours: number): StoryEvent | null {
  const arc = arcAt(arcs, res, hours);
  if (!arc) return null;
  const prev = arc.events
    .filter(e => e.chars.includes(char) && (res.events.get(e.id)?.end ?? Infinity) <= hours)
    .sort((a, b) => res.events.get(b.id)!.end - res.events.get(a.id)!.end)[0];
  const when = prev
    ? convertWhen("after", round(hours), "hour", { event: prev.id }, res)!
    : convertWhen("from", round(hours), "hour", { arc: arc.id }, res)!;
  const e: StoryEvent = { id: newId(char, id => !!findEvent(arcs, id)), chars: [char], text: "", when };
  arc.events.push(e);
  return e;
}

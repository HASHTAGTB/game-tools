import { parseDate, parseDateEnd, parseDuration, type Precision } from "./duration.ts";
import { DEFAULT_LENGTH, type Arc, type Ref, type StoryEvent, type When } from "./types.ts";

/** A resolved time span in story hours. `precision` is how exact it really is: an event 4h after something only known
 *  to the year is itself only known to the year. `pinned` means a fixed date was reached (not just "after X"). */
export type Span = { start: number; end: number; precision: Precision; pinned: boolean };

export type IssueKind = "missing-ref" | "cycle" | "bad-date" | "bad-duration" | "duplicate-id" | "unrooted";
export type Issue = { kind: IssueKind; message: string; arc: string; event?: string };

export type Resolved = {
  events: Map<string, Span>;
  arcs: Map<string, Span>;
  /** Arc id of every event. */
  arcOf: Map<string, string>;
  issues: Issue[];
};

/** Works out every event's and arc's time. Never throws: broken references, cycles and bad values become issues,
 *  and the thing they belong to falls back to its arc's start (or 0 for an arc). */
export function resolve(arcs: Arc[]): Resolved {
  const issues: Issue[] = [];
  const arcById = new Map<string, Arc>();
  const eventById = new Map<string, StoryEvent>();
  const arcOf = new Map<string, string>();

  for (const a of arcs) {
    if (arcById.has(a.id)) issues.push({ kind: "duplicate-id", arc: a.id, message: `Two arcs have the id "${a.id}".` });
    else arcById.set(a.id, a);
    for (const e of a.events) {
      if (eventById.has(e.id)) {
        issues.push({ kind: "duplicate-id", arc: a.id, event: e.id, message: `The event id "${e.id}" is used twice (also in ${arcOf.get(e.id)}).` });
        continue;
      }
      eventById.set(e.id, e);
      arcOf.set(e.id, a.id);
    }
  }

  const events = new Map<string, Span>();
  const arcStarts = new Map<string, Span>();
  const arcSpans = new Map<string, Span>();
  const visiting = new Set<string>();

  const hours = (d: string | undefined, arc: string, event: string | undefined, what: string) => {
    const h = parseDuration(d);
    if (h === null) issues.push({ kind: "bad-duration", arc, event, message: `${what} "${d}" is not a duration (like 4h, 2d or 1d6h).` });
    return h ?? 0;
  };

  /** Start of a `When`, or null if it can't be worked out (the issue is already recorded). */
  function whenStart(w: When, arc: string, event: string | undefined, key: string): Omit<Span, "end"> | null {
    if ("at" in w) {
      const d = parseDate(w.at);
      if (!d) { issues.push({ kind: "bad-date", arc, event, message: `"${w.at}" is not a date (like 2025, 2025-04, 2025-04-07 or 2025-04-07T10:00).` }); return null; }
      return { start: d.hours, precision: d.precision, pinned: true };
    }
    const ref: Ref = "after" in w ? w.after : w.from;
    visiting.add(key);
    const target = "event" in ref ? eventSpan(ref.event, arc, event) : arcSpan(ref.arc, "after" in w ? "end" : "start", arc, event);
    visiting.delete(key);
    if (!target) return null;
    const base = "after" in w ? target.end : target.start;
    const delta = "after" in w ? hours(w.gap, arc, event, "Gap") : hours(w.offset, arc, event, "Offset");
    return { start: base + delta, precision: target.precision, pinned: target.pinned };
  }

  function eventSpan(id: string, fromArc: string, fromEvent?: string): Span | null {
    const done = events.get(id);
    if (done) return done;
    const e = eventById.get(id);
    if (!e) {
      issues.push({ kind: "missing-ref", arc: fromArc, event: fromEvent, message: `There is no event "${id}".` });
      return null;
    }
    const key = `e:${id}`;
    if (visiting.has(key)) {
      issues.push({ kind: "cycle", arc: arcOf.get(id)!, event: id, message: `The time of "${id}" depends on itself.` });
      return null;
    }
    const arc = arcOf.get(id)!;
    let s = whenStart(e.when, arc, id, key);
    if (!s) s = { ...(startOf(arc) ?? { start: 0, precision: "year", pinned: false }), pinned: false };
    const len = Math.max(0, hours(e.length ?? DEFAULT_LENGTH, arc, id, "Length"));
    const span = { ...s, end: s.start + len };
    events.set(id, span);
    return span;
  }

  function startOf(id: string): Omit<Span, "end"> | null {
    const done = arcStarts.get(id);
    if (done) return done;
    const a = arcById.get(id)!;
    const key = `a:${id}:start`;
    if (visiting.has(key)) {
      issues.push({ kind: "cycle", arc: id, message: `The start of arc "${a.name}" depends on itself.` });
      return null;
    }
    const s = whenStart(a.start, id, undefined, key) ?? { start: 0, precision: "year" as Precision, pinned: false };
    const span = { ...s, end: s.start };
    arcStarts.set(id, span);
    return span;
  }

  function arcSpan(id: string, need: "start" | "end", fromArc: string, fromEvent?: string): Span | null {
    const a = arcById.get(id);
    if (!a) {
      issues.push({ kind: "missing-ref", arc: fromArc, event: fromEvent, message: `There is no arc "${id}".` });
      return null;
    }
    const start = startOf(id);
    if (!start) return null;
    if (need === "start") return { ...start, end: start.start };
    const done = arcSpans.get(id);
    if (done) return done;
    const key = `a:${id}:end`;
    if (visiting.has(key)) {
      issues.push({ kind: "cycle", arc: id, message: `The end of arc "${a.name}" depends on itself.` });
      return null;
    }
    visiting.add(key);
    let end = start.start;
    for (const e of a.events) {
      const s = eventSpan(e.id, id);
      if (s) end = Math.max(end, s.end);
    }
    if (a.end) {
      // a fixed end date includes that whole day / month / year
      const fixed = "at" in a.end ? parseDateEnd(a.end.at) : null;
      const s = fixed ? { start: fixed.hours } : whenStart(a.end, id, undefined, `a:${id}:endwhen`);
      if (s) end = Math.max(end, s.start);
    }
    visiting.delete(key);
    const span = { ...start, end };
    arcSpans.set(id, span);
    return span;
  }

  for (const a of arcById.values()) {
    const s = arcSpan(a.id, "end", a.id);
    if (s && !s.pinned) issues.push({ kind: "unrooted", arc: a.id, message: `Arc "${a.name}" isn't tied to a date or another arc that has one.` });
  }

  const seen = new Set<string>();
  const unique = issues.filter(i => { const k = `${i.kind}|${i.arc}|${i.event}|${i.message}`; return !seen.has(k) && !!seen.add(k); });
  return { events, arcs: arcSpans, arcOf, issues: unique };
}

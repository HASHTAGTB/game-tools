/** Things in the timeline that are probably wrong. Each check points at what to look at. */
import type { RosterCharacter } from "@/shared/lib/roster";
import { formatDate, parseDate, PRECISIONS } from "./duration";
import { unknownTo, whoKnows } from "./knowledge";
import type { Resolved } from "./resolve";
import type { Scene } from "./scenes";
import { narratorChar } from "./scenes";
import type { Arc, Fact } from "./types";

export type Check = {
  level: "error" | "warning" | "info";
  message: string;
  target: { kind: "event" | "arc" | "connection" | "char" | "fact"; id: string } | null;
};

/** Precision (as an index) at least this fine counts as "really known" for clash checks: day. */
const DAY = PRECISIONS.indexOf("day");

export function runChecks(arcs: Arc[], roster: RosterCharacter[], facts: Fact[], res: Resolved, scenes: Scene[] | null): Check[] {
  const out: Check[] = [];
  const name = (c: string) => roster.find(r => r.id === c)?.name ?? c;
  const label = (id: string) => {
    for (const a of arcs) { const e = a.events.find(x => x.id === id); if (e) return `"${(e.text || "(empty)").slice(0, 48)}"`; }
    return id;
  };

  // from resolving times
  for (const i of res.issues) {
    out.push({ level: i.kind === "unrooted" ? "warning" : "error", message: i.message, target: i.event ? { kind: "event", id: i.event } : { kind: "arc", id: i.arc } });
  }

  const known = new Set(roster.map(c => c.id));
  const unknownChars = new Set<string>();
  const factIds = new Set(facts.map(f => f.id));
  const knowledge = whoKnows(arcs, res);
  const scenesByPath = scenes && new Map(scenes.map(s => [s.path, s]));

  for (const a of arcs) {
    const as = res.arcs.get(a.id);
    for (const e of a.events) {
      const s = res.events.get(e.id);
      if (!s) continue;
      const target = { kind: "event" as const, id: e.id };
      for (const c of e.chars) if (!known.has(c)) unknownChars.add(c);
      if (!e.text.trim()) out.push({ level: "info", message: `An event in "${a.name}" has no text.`, target });
      if (as && s.start < as.start - 1e-6) out.push({ level: "warning", message: `${label(e.id)} starts before its arc "${a.name}" (${formatDate(as.start, as.precision)}).`, target });

      // scene file
      if (e.scene && scenesByPath) {
        const sc = scenesByPath.get(e.scene);
        if (!sc) out.push({ level: "error", message: `${label(e.id)} links a scene file that doesn't exist: ${e.scene}`, target });
        else {
          const d = sc.date ? parseDate(sc.date) : null;
          const slack = s.precision === "hour" ? 1 : s.precision === "day" ? 24 : Infinity;
          if (d && Math.abs(d.hours - s.start) >= slack) {
            out.push({ level: "warning", message: `${label(e.id)} is on ${formatDate(s.start, s.precision)}, but its scene "${sc.name}" says ${formatDate(d.hours, d.precision)}.`, target });
          }
          const pov = sc.narrators.map(n => narratorChar(n, roster)).filter((c): c is RosterCharacter => !!c);
          const missing = pov.filter(c => !e.chars.includes(c.id));
          if (missing.length) out.push({ level: "info", message: `Scene "${sc.name}" is told by ${missing.map(c => c.name).join(", ")}, who ${missing.length > 1 ? "aren't" : "isn't"} on its event.`, target });
        }
      }

      // knowledge
      for (const l of e.learns ?? []) if (!factIds.has(l.fact)) out.push({ level: "error", message: `${label(e.id)} learns a fact that doesn't exist (${l.fact}).`, target });
      for (const f of e.needs ?? []) {
        if (!factIds.has(f)) { out.push({ level: "error", message: `${label(e.id)} acts on a fact that doesn't exist (${f}).`, target }); continue; }
        const who = unknownTo(e, f, knowledge, res);
        if (who.length) out.push({ level: "warning", message: `${who.map(name).join(", ")} act${who.length > 1 ? "" : "s"} on "${facts.find(x => x.id === f)!.name}" in ${label(e.id)} before learning it.`, target });
      }
    }
  }

  // a character in two places at once (only where both times are known to the day or better)
  for (const c of new Set(arcs.flatMap(a => a.events.flatMap(e => e.chars)))) {
    const evs = arcs.flatMap(a => a.events.filter(e => e.chars.includes(c)))
      .map(e => ({ e, s: res.events.get(e.id)! }))
      .filter(x => x.s && x.s.pinned && PRECISIONS.indexOf(x.s.precision) >= DAY && x.s.end > x.s.start)
      .sort((x, y) => x.s.start - y.s.start);
    for (let i = 1; i < evs.length; i++) {
      const prev = evs.slice(0, i).reduce((m, x) => (x.s.end > m.s.end ? x : m));
      if (evs[i].s.start < prev.s.end - 0.5) {
        out.push({ level: "warning", message: `${name(c)} is in ${label(prev.e.id)} and ${label(evs[i].e.id)} at the same time.`, target: { kind: "event", id: evs[i].e.id } });
      }
    }
  }

  // connections that point back in time
  for (const a of arcs) for (const k of a.connections) {
    const f = res.events.get(k.from), t = res.events.get(k.to);
    if (!f || !t) { out.push({ level: "error", message: `A connection points at an event that doesn't exist (${!f ? k.from : k.to}).`, target: { kind: "connection", id: k.id } }); continue; }
    if (t.end < f.start - 1e-6) out.push({ level: "warning", message: `The connection ${k.label ? `"${k.label}" ` : ""}from ${label(k.from)} leads back in time to ${label(k.to)}.`, target: { kind: "connection", id: k.id } });
  }

  for (const c of unknownChars) out.push({ level: "info", message: `"${c}" is used by events but isn't in the character list.`, target: { kind: "char", id: c } });
  for (const f of facts) if (!knowledge.has(f.id)) out.push({ level: "info", message: `Nobody learns the fact "${f.name}" yet.`, target: { kind: "fact", id: f.id } });

  const order = { error: 0, warning: 1, info: 2 };
  return out.sort((x, y) => order[x.level] - order[y.level]);
}

/** Age in whole years at story time `hours`, if the birthday has a year. */
export function ageAt(birthday: string | undefined, hours: number): number | null {
  const m = birthday?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(2000, 0, 1) + hours * 3.6e6);
  let age = d.getUTCFullYear() - +m[1];
  if (d.getUTCMonth() + 1 < +m[2] || (d.getUTCMonth() + 1 === +m[2] && d.getUTCDate() < +m[3])) age--;
  return age;
}

import { slug } from "./import-md";
import type { Resolved } from "./resolve";
import type { Arc, StoryEvent } from "./types";

/** When a character first learns a fact: the event, and the story time it ends (they know it from then on). */
export type Learned = { event: StoryEvent; at: number };

/** fact → character → first time they learn it. */
export function whoKnows(arcs: Arc[], res: Resolved): Map<string, Map<string, Learned>> {
  const out = new Map<string, Map<string, Learned>>();
  for (const a of arcs) for (const e of a.events) for (const l of e.learns ?? []) {
    const span = res.events.get(e.id);
    if (!span) continue;
    const m = out.get(l.fact) ?? new Map<string, Learned>();
    out.set(l.fact, m);
    for (const c of l.who?.length ? l.who : e.chars) {
      const prev = m.get(c);
      if (!prev || span.end < prev.at) m.set(c, { event: e, at: span.end });
    }
  }
  return out;
}

/** Characters of `e` that act on `fact` without having learned it before `e` starts. */
export function unknownTo(e: StoryEvent, fact: string, known: Map<string, Map<string, Learned>>, res: Resolved): string[] {
  const start = res.events.get(e.id)?.start;
  if (start === undefined) return [];
  const m = known.get(fact);
  return e.chars.filter(c => { const l = m?.get(c); return !l || l.at > start + 1e-6; });
}

/** Id for a new fact from its name ("Kaishis Gefühle" → "kaishis-gefuehle"), not clashing with `taken`. */
export function factId(name: string, taken: string[]) {
  const base = slug(name);
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

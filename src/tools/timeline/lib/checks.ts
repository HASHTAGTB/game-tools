import type { RosterCharacter } from "@/shared/lib/roster";
import { allEvents, position } from "./model";
import type { Chapter, Thread } from "./types";

export type Target = { kind: "event" | "thread" | "char" | "chapter"; id: string };
/** `go`: what clicking a check does when it isn't about one thing. */
export type Check = { level: "error" | "warning" | "info"; message: string; target?: Target; go?: "thread-lanes" };

/** A thread missing from this many chapters in a row (and then back) gets a note. */
const THREAD_GAP = 3;

/** A few things worth a look. Kept short on purpose: problems, not style rules. */
export function runChecks(chapters: Chapter[], roster: RosterCharacter[], threads: Thread[]): Check[] {
  const out: Check[] = [];
  const events = allEvents(chapters);
  const ids = new Set(events.map(x => x.event.id));
  const pos = position(chapters);
  const chars = new Set(roster.map(c => c.id));
  const threadIds = new Set(threads.map(t => t.id));
  const name = (t: string) => `"${t.length > 50 ? t.slice(0, 48) + "…" : t || "(untitled)"}"`;
  const unknownChars = new Set<string>(), unknownThreads = new Set<string>(), usedThreads = new Set<string>();
  let noThread = 0;

  for (const { chapter, event: e } of events) {
    const target = { kind: "event" as const, id: e.id };
    for (const l of e.links ?? []) {
      if (!ids.has(l.to)) out.push({ level: "error", message: `${name(e.title)} points to an event that no longer exists.`, target });
      else if (!l.label && pos.get(l.to)! < pos.get(e.id)!)
        out.push({ level: "warning", message: `${name(e.title)} has an arrow back to an earlier event without a label. Label it if it's a reminder, or turn it around.`, target });
    }
    if (!e.title.trim()) out.push({ level: "warning", message: `An event in "${chapter.name}" has no title.`, target });
    if (!e.chars.length) out.push({ level: "info", message: `${name(e.title)} has no characters.`, target });
    if (!e.threads.length) noThread++;
    for (const c of e.chars) if (!chars.has(c)) unknownChars.add(c);
    for (const t of e.threads) { usedThreads.add(t); if (!threadIds.has(t)) unknownThreads.add(t); }
  }
  for (const c of unknownChars) out.push({ level: "warning", message: `"${c}" is used by events but isn't in the character list.`, target: { kind: "char", id: c } });
  for (const t of unknownThreads) out.push({ level: "warning", message: `The thread "${t}" is used by events but doesn't exist.`, target: { kind: "thread", id: t } });
  for (const t of threads) if (!usedThreads.has(t.id)) out.push({ level: "info", message: `The thread "${t.name}" has no events yet.`, target: { kind: "thread", id: t.id } });

  // threads that go quiet for a while and come back
  for (const t of threads) {
    const at = chapters.flatMap((c, i) => (c.events.some(e => e.threads.includes(t.id)) ? [i] : []));
    for (let k = 1; k < at.length; k++) {
      const gap = at[k] - at[k - 1] - 1;
      if (gap < THREAD_GAP) continue;
      const span = gap === 1 ? `"${chapters[at[k - 1] + 1].name}"` : `"${chapters[at[k - 1] + 1].name}" – "${chapters[at[k] - 1].name}"`;
      out.push({ level: "info", message: `"${t.name}" goes quiet for ${gap} chapters (${span}) and comes back in "${chapters[at[k]].name}".`, target: { kind: "thread", id: t.id } });
    }
  }

  // named columns nothing happens in
  for (const c of chapters) {
    const covered = new Set<number>();
    for (const e of c.events) for (let i = e.col; i < e.col + (e.span ?? 1); i++) covered.add(i);
    const empty = c.columns.filter((label, i) => label.trim() && !covered.has(i));
    if (empty.length) out.push({
      level: "info", target: { kind: "chapter", id: c.id },
      message: empty.length === 1 ? `The column "${empty[0]}" in "${c.name}" has no events.` : `"${c.name}" has named columns with no events: ${empty.join(", ")}.`,
    });
  }

  if (noThread) out.push({
    level: "info", go: "thread-lanes",
    message: `${noThread === 1 ? "1 event has" : `${noThread} events have`} no thread. Click to group the lanes by thread; they're in the "No thread" lane at the bottom.`,
  });
  return out;
}

import type { RosterCharacter } from "@/shared/lib/roster";
import { allEvents } from "./model";
import type { Chapter, Thread } from "./types";

export type Target = { kind: "event" | "thread" | "char" | "chapter"; id: string };
export type Check = { level: "error" | "warning" | "info"; message: string; target?: Target };

/** A few things worth a look. Kept short on purpose: problems, not style rules. */
export function runChecks(chapters: Chapter[], roster: RosterCharacter[], threads: Thread[]): Check[] {
  const out: Check[] = [];
  const events = allEvents(chapters);
  const ids = new Set(events.map(x => x.event.id));
  const chars = new Set(roster.map(c => c.id));
  const threadIds = new Set(threads.map(t => t.id));
  const name = (t: string) => `"${t.length > 50 ? t.slice(0, 48) + "…" : t || "(untitled)"}"`;
  const unknownChars = new Set<string>(), unknownThreads = new Set<string>(), usedThreads = new Set<string>();

  for (const { chapter, event: e } of events) {
    const target = { kind: "event" as const, id: e.id };
    for (const l of e.links ?? []) if (!ids.has(l.to)) out.push({ level: "error", message: `${name(e.title)} points to an event that no longer exists.`, target });
    if (!e.title.trim()) out.push({ level: "warning", message: `An event in "${chapter.name}" has no title.`, target });
    if (!e.chars.length) out.push({ level: "info", message: `${name(e.title)} has no characters.`, target });
    for (const c of e.chars) if (!chars.has(c)) unknownChars.add(c);
    for (const t of e.threads) { usedThreads.add(t); if (!threadIds.has(t)) unknownThreads.add(t); }
  }
  for (const c of unknownChars) out.push({ level: "warning", message: `"${c}" is used by events but isn't in the character list.`, target: { kind: "char", id: c } });
  for (const t of unknownThreads) out.push({ level: "warning", message: `The thread "${t}" is used by events but doesn't exist.`, target: { kind: "thread", id: t } });
  for (const t of threads) if (!usedThreads.has(t.id)) out.push({ level: "info", message: `The thread "${t.name}" has no events yet.`, target: { kind: "thread", id: t.id } });
  return out;
}

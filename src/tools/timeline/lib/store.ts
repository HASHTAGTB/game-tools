import { ROSTER_PATH, type Roster } from "@/shared/lib/roster";
import { joinPath, listFiles, readFile, removeFile, statFile, toolDir, writeText } from "@/shared/lib/workspace";
import type { Arc, Fact } from "./types";

export const ARCS_DIR = joinPath(toolDir("timeline"), "arcs");
export const FACTS_PATH = joinPath(toolDir("timeline"), "facts.json");
export const arcPath = (id: string) => joinPath(ARCS_DIR, `${id}.json`);
export { ROSTER_PATH };

/** A file as last read or written: its text (to skip saves that change nothing) and change time (to notice when
 *  someone else changed it, e.g. a git pull). */
export type Known = { text: string; mtime: number };

export const toText = (data: unknown) => JSON.stringify(data, null, 2) + "\n";

export function normalizeArc(raw: Partial<Arc>, fallbackId: string): Arc {
  return {
    version: 1,
    id: raw.id || fallbackId,
    name: raw.name || raw.id || fallbackId,
    start: raw.start ?? { at: "2000" },
    ...(raw.end ? { end: raw.end } : {}),
    ...(raw.color ? { color: raw.color } : {}),
    ...(raw.folder ? { folder: raw.folder } : {}),
    ...(raw.notes ? { notes: raw.notes } : {}),
    events: (raw.events ?? []).filter(e => e?.id).map(e => ({ ...e, chars: e.chars ?? [], text: e.text ?? "", when: e.when ?? { from: { arc: raw.id || fallbackId } } })),
    connections: (raw.connections ?? []).filter(c => c?.from && c?.to).map(c => ({ ...c, id: c.id || `link_${c.from}_${c.to}` })),
  };
}

export function normalizeRoster(raw: Partial<Roster> | null): Roster {
  return { version: 1, characters: (raw?.characters ?? []).filter(c => c?.id).map(c => ({ ...c, name: c.name || c.id, color: c.color || "#9a8f86" })) };
}

/** Reads every arc file. Files that don't parse are reported, not dropped silently. */
export async function loadArcs() {
  const arcs: Arc[] = [];
  const known = new Map<string, Known>();
  const broken: string[] = [];
  for (const path of await listFiles(ARCS_DIR, ".json")) {
    const f = await readFile(path);
    if (!f) continue;
    try {
      const id = path.split("/").pop()!.replace(/\.json$/, "");
      arcs.push(normalizeArc(JSON.parse(f.text), id));
      known.set(path, f);
    } catch {
      broken.push(path);
    }
  }
  return { arcs, known, broken };
}

export function normalizeFacts(raw: { facts?: Partial<Fact>[] } | null): Fact[] {
  return (raw?.facts ?? []).filter(f => f?.id).map(f => ({ ...f, id: f.id!, name: f.name || f.id! }));
}

export async function loadFactsFile() {
  const f = await readFile(FACTS_PATH);
  let facts: Fact[] = [];
  if (f) try { facts = normalizeFacts(JSON.parse(f.text)); } catch { /* left alone */ }
  return { facts, known: f };
}

export async function loadRosterFile() {
  const f = await readFile(ROSTER_PATH);
  let roster = normalizeRoster(null);
  if (f) try { roster = normalizeRoster(JSON.parse(f.text)); } catch { /* reported by the caller as broken */ }
  return { roster, known: f };
}

export { readFile, removeFile, statFile, writeText, listFiles };

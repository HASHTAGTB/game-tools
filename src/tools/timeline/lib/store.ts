import { ROSTER_PATH, type Roster } from "@/shared/lib/roster";
import { joinPath, listFiles, readFile, removeFile, statFile, toolDir, writeText } from "@/shared/lib/workspace";
import type { Chapter, Filter, GroupBy, StoryEvent, Thread, View } from "./types";

export const CHAPTERS_DIR = joinPath(toolDir("timeline"), "chapters");
export const THREADS_PATH = joinPath(toolDir("timeline"), "threads.json");
export const VIEWS_PATH = joinPath(toolDir("timeline"), "views.json");
export const chapterPath = (id: string) => joinPath(CHAPTERS_DIR, `${id}.json`);
export { ROSTER_PATH };

/** A file as last read or written: its text (to skip saves that change nothing) and change time (to notice when
 *  someone else changed it, e.g. a git pull). */
export type Known = { text: string; mtime: number };

export const toText = (data: unknown) => JSON.stringify(data, null, 2) + "\n";

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function normalizeEvent(e: Partial<StoryEvent>): StoryEvent {
  return {
    id: e.id!,
    title: e.title ?? "",
    ...(e.note ? { note: e.note } : {}),
    chars: strings(e.chars),
    threads: strings(e.threads),
    col: Math.max(0, Math.floor(e.col ?? 0)),
    ...(e.span && e.span > 1 ? { span: Math.floor(e.span) } : {}),
    ...(e.links?.length ? { links: e.links.filter(l => l?.to).map(l => ({ to: l.to, ...(l.label ? { label: l.label } : {}) })) } : {}),
  };
}

export function normalizeChapter(raw: Partial<Chapter>, fallbackId: string): Chapter {
  const events = (raw.events ?? []).filter(e => e?.id).map(normalizeEvent);
  const columns = strings(raw.columns);
  // every event needs a column to stand in
  const need = Math.max(1, ...events.map(e => e.col + (e.span ?? 1)));
  while (columns.length < need) columns.push("");
  return {
    version: 2,
    id: raw.id || fallbackId,
    name: raw.name || raw.id || fallbackId,
    order: typeof raw.order === "number" ? raw.order : 0,
    ...(raw.when ? { when: raw.when } : {}),
    ...(raw.notes ? { notes: raw.notes } : {}),
    columns,
    events,
  };
}

export function normalizeThreads(raw: { threads?: Partial<Thread>[] } | null): Thread[] {
  return (raw?.threads ?? []).filter(t => t?.id).map(t => ({ id: t.id!, name: t.name || t.id!, color: t.color || "#c4956a", ...(t.notes ? { notes: t.notes } : {}) }));
}

const GROUPS: GroupBy[] = ["chars", "threads", "none"];
export function normalizeFilter(f: Partial<Filter> | null | undefined): Filter {
  return {
    groupBy: GROUPS.includes(f?.groupBy as GroupBy) ? f!.groupBy! : "chars",
    chars: strings(f?.chars),
    threads: strings(f?.threads),
    hideOthers: !!f?.hideOthers,
  };
}

export function normalizeViews(raw: { views?: Partial<View>[] } | null): View[] {
  return (raw?.views ?? []).filter(v => v?.id).map(v => ({ id: v.id!, name: v.name || v.id!, ...normalizeFilter(v) }));
}

export function normalizeRoster(raw: Partial<Roster> | null): Roster {
  return { version: 1, characters: (raw?.characters ?? []).filter(c => c?.id).map(c => ({ ...c, name: c.name || c.id, color: c.color || "#9a8f86" })) };
}

/** Reads every chapter file. Files that don't parse are reported, not dropped silently. */
export async function loadChapters() {
  const chapters: Chapter[] = [];
  const known = new Map<string, Known>();
  const broken: string[] = [];
  for (const path of await listFiles(CHAPTERS_DIR, ".json")) {
    const f = await readFile(path);
    if (!f) continue;
    try {
      chapters.push(normalizeChapter(JSON.parse(f.text), path.split("/").pop()!.replace(/\.json$/, "")));
      known.set(path, f);
    } catch {
      broken.push(path);
    }
  }
  return { chapters: sortChapters(chapters), known, broken };
}

export const sortChapters = (cs: Chapter[]) => [...cs].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

/** A shared JSON file that may not exist yet. */
export async function loadShared<T>(path: string, normalize: (raw: never) => T) {
  const f = await readFile(path);
  let data = normalize(null as never);
  if (f) try { data = normalize(JSON.parse(f.text) as never); } catch { /* left alone */ }
  return { data, known: f };
}

export { readFile, removeFile, statFile, writeText, listFiles };

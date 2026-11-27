import { DEFAULT_COLOR } from "@/shared/lib/colors";
import { normalizeRoster, ROSTER_PATH } from "@/shared/lib/roster";
import { strings } from "@/shared/lib/utils";
import { joinPath, stem } from "@/shared/lib/paths";
import { jsonText, listFiles, readJson, toolDir } from "@/shared/lib/workspace";
import type { Doc } from "./model";
import type { Chapter, Filter, GroupBy, StoryEvent, Thread, View } from "./types";

export const CHAPTERS_DIR = joinPath(toolDir("timeline"), "chapters");
export const THREADS_PATH = joinPath(toolDir("timeline"), "threads.json");
export const VIEWS_PATH = joinPath(toolDir("timeline"), "views.json");
export const chapterPath = (id: string) => joinPath(CHAPTERS_DIR, `${id}.json`);
/** The chapter id a file name stands for. */
export const chapterIdOf = stem;

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
  return (raw?.threads ?? []).filter(t => t?.id).map(t => ({ id: t.id!, name: t.name || t.id!, color: t.color || DEFAULT_COLOR, ...(t.notes ? { notes: t.notes } : {}) }));
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

export const sortChapters = <C extends Pick<Chapter, "order" | "name">>(cs: C[]) => [...cs].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

/** A chapter as other tools see it (the Scenes tool groups its scenes by them). */
export type ChapterRef = Pick<Chapter, "id" | "name" | "order">;

/** Every chapter's id, name and order, in the timeline's order. A file that doesn't parse still names a chapter (its
 *  file name). */
export async function readChapterRefs(): Promise<ChapterRef[]> {
  const paths = await listFiles(CHAPTERS_DIR, ".json");
  const raw = await Promise.all(paths.map(p => readJson<Partial<Chapter>>(p).catch(() => null)));
  return sortChapters(raw.map((c, i) => normalizeChapter(c ?? {}, chapterIdOf(paths[i]))).map(({ id, name, order }) => ({ id, name, order })));
}

// ---------------------------------------------------------------- the doc as files

export const EMPTY_DOC: Doc = { chapters: [], roster: [], threads: [], views: [] };

/** Every file the doc is made of, as path → text. */
export function docFiles(d: Doc): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of d.chapters) out.set(chapterPath(c.id), jsonText(c));
  out.set(ROSTER_PATH, jsonText({ version: 1, characters: d.roster }));
  out.set(THREADS_PATH, jsonText({ version: 1, threads: d.threads }));
  out.set(VIEWS_PATH, jsonText({ version: 1, views: d.views }));
  return out;
}

const SHARED_BLANK = docFiles(EMPTY_DOC);
/** The shared lists are written once they hold something (or their file exists). */
export const blankFile = (path: string) => SHARED_BLANK.get(path);

/** Files of the doc in the data folder (the shared ones may not exist yet). */
export const docPaths = async () => [...await listFiles(CHAPTERS_DIR, ".json"), ...SHARED_BLANK.keys()];

/** The doc with one file's contents put in (null: the file was deleted; a shared list then stays as it is, and is
 *  written again with the next edit). Throws if it doesn't parse. */
export function applyFile(d: Doc, path: string, text: string | null): Doc {
  const data = text === null ? null : JSON.parse(text);
  if (path === ROSTER_PATH) return data ? { ...d, roster: normalizeRoster(data).characters } : d;
  if (path === THREADS_PATH) return data ? { ...d, threads: normalizeThreads(data) } : d;
  if (path === VIEWS_PATH) return data ? { ...d, views: normalizeViews(data) } : d;
  const rest = d.chapters.filter(c => chapterPath(c.id) !== path);
  if (!data) return { ...d, chapters: rest };
  return { ...d, chapters: sortChapters([...rest, normalizeChapter(data, chapterIdOf(path))]) };
}

/** What a file is called in messages. */
export const fileLabel = (d: Doc, path: string) =>
  path === ROSTER_PATH ? "The character list" : path === THREADS_PATH ? "The thread list" : path === VIEWS_PATH ? "The saved views"
    : `Chapter "${d.chapters.find(c => chapterPath(c.id) === path)?.name ?? chapterIdOf(path)}"`;

/** The vault's scene files (read only): CANON/03_Story/02_Scenes/**.md except timeline.md. From each one the timeline
 *  takes its front matter (status, renpy, owner, characters), the first Ren'Py `set_date(...)` and the narrators. */
import { joinPath, listDir, readText } from "@/shared/lib/workspace";
import type { RosterCharacter } from "@/shared/lib/roster";
import { SCENES_DIR } from "./import-md";

export type Scene = {
  path: string;
  name: string;
  /** Folder below 02_Scenes ("" for loose scenes). */
  folder: string;
  status?: string;
  renpy?: string;
  owner?: string;
  /** Names from the `characters:` wikilinks, e.g. "Rin Takeda". */
  chars: string[];
  /** First set_date in the scene as a date text: "2025-04-07T07:15". */
  date?: string;
  /** Narrator variables in the order they first appear: "satoru_n". */
  narrators: string[];
};

export const STATUSES = ["idea", "outline", "draft", "revision", "final"];
export const RENPY = ["no", "basic", "full", "production"];

const unquote = (v: string) => v.trim().replace(/^["']|["']$/g, "");

/** Front matter with `key: value` and `key:` + `  - item` lists. */
export function frontmatter(text: string): Record<string, string | string[]> {
  const m = text.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out: Record<string, string | string[]> = {};
  if (!m) return out;
  let list: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && list) { (out[list] as string[]).push(unquote(item[1])); continue; }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    list = null;
    if (kv[2].trim() === "") { out[kv[1]] = []; list = kv[1]; }
    else out[kv[1]] = unquote(kv[2]);
  }
  return out;
}

export function parseScene(path: string, text: string): Scene {
  const fm = frontmatter(text);
  const str = (k: string) => (typeof fm[k] === "string" && fm[k] ? (fm[k] as string) : undefined);
  const rel = path.slice(SCENES_DIR.length + 1);
  const parts = rel.split("/");
  const d = text.match(/set_date\(\s*"(\d{4}-\d{2}-\d{2})"\s*(?:,\s*"(\d{1,2}):(\d{2})")?/);
  const narrators = [...new Set([...text.matchAll(/narrator\s*=\s*(\w+)/g)].map(m => m[1]))];
  return {
    path, name: parts[parts.length - 1].replace(/\.md$/, ""), folder: parts.slice(0, -1).join("/"),
    status: str("status"), renpy: str("renpy"), owner: str("owner"),
    chars: (Array.isArray(fm.characters) ? fm.characters : []).map(c => c.replace(/^\[\[|\]\]$/g, "").split("|")[0]),
    ...(d ? { date: d[2] ? `${d[1]}T${d[2].padStart(2, "0")}:${d[3]}` : d[1] } : {}),
    narrators,
  };
}

async function walk(dir: string, out: string[]) {
  for (const e of await listDir(dir)) {
    const p = joinPath(dir, e.name);
    if (e.kind === "directory") { if (!e.name.startsWith(".")) await walk(p, out); }
    else if (e.name.endsWith(".md") && e.name !== "timeline.md") out.push(p);
  }
}

/** Every scene file. Empty when the data folder isn't a vault (or is "This browser"). */
export async function loadScenes(): Promise<Scene[]> {
  const paths: string[] = [];
  await walk(SCENES_DIR, paths);
  const out: Scene[] = [];
  for (const p of paths.sort()) {
    const t = await readText(p);
    if (t !== null) out.push(parseScene(p, t));
  }
  return out;
}

/** The roster character a narrator variable belongs to (their `narrator`, or "<id>_n"). */
export const narratorChar = (narrator: string, roster: RosterCharacter[]) =>
  roster.find(c => (c.narrator || `${c.id}_n`) === narrator) ?? null;

/** obsidian:// link that opens a vault file. */
export const obsidianLink = (vault: string, path: string) =>
  `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path.replace(/\.md$/, ""))}`;

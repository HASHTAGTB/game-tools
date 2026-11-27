import { HEADER_LINE } from "./script";

/** The scene info at the top of a scene's .rpy: `## key: value` lines (comments to Ren'Py), read and changed one key
 *  at a time so the rest of the file stays as it was.
 *
 *  ## title: Takaya & Rin working on concept art together
 *  ## chapter: entwicklungsphase      (a timeline chapter's id; missing = no chapter)
 *  ## status: draft
 *  ## renpy: production
 */

export type SceneInfo = { title: string; chapter: string; status: string; renpy: string };
export type InfoKey = keyof SceneInfo;

/** The order keys are written in. */
const ORDER: InfoKey[] = ["title", "chapter", "status", "renpy"];

export const STATUSES = ["idea", "outline", "draft", "revision", "final"] as const;
export const RENPY_LEVELS = ["no", "basic", "full", "production"] as const;

/** What each level means (DEV/05_Technical/metadata.md). */
export const STATUS_HINT: Record<string, string> = {
  idea: "Concept only, some notes",
  outline: "Structured notes",
  draft: "Prose text, but rough or unfinished",
  revision: "Reviewed, being polished",
  final: "Done",
};
export const RENPY_HINT: Record<string, string> = {
  no: "No Ren'Py yet",
  basic: "Just correct syntax",
  full: "Pauses and other effects added",
  production: "Backgrounds, music and sprites in",
};

/** The header's lines: their keys, in file order (they're the file's first lines). */
function headerKeys(lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const m = HEADER_LINE.exec(l);
    if (!m) break;
    out.push(m[1].toLowerCase());
  }
  return out;
}

export function readInfo(text: string): SceneInfo {
  const info: SceneInfo = { title: "", chapter: "", status: "", renpy: "" };
  // line by line, only as far as the header goes (this runs on every keystroke)
  for (let at = 0; at <= text.length;) {
    const end = text.indexOf("\n", at);
    const m = HEADER_LINE.exec(text.slice(at, end < 0 ? undefined : end));
    if (!m) break;
    const k = m[1].toLowerCase() as InfoKey;
    if (k in info) info[k] = m[2].trim();
    if (end < 0) break;
    at = end + 1;
  }
  return info;
}

/** A change to `text` (positions into it) that sets `key` (an empty value takes the line out), or null if nothing
 *  changes. A missing key goes where `ORDER` puts it; a file without a header gets one, with an empty line after it. */
export function setInfo(text: string, key: InfoKey, value: string): { from: number; to: number; insert: string } | null {
  const lines = text.split("\n");
  const offset = (i: number) => lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
  const v = value.replace(/\s+/g, " ").trim();
  const written = `## ${key}: ${v}`;
  const keys = headerKeys(lines);
  const at = keys.indexOf(key);
  if (at >= 0) {
    if (!v) return { from: offset(at), to: offset(at + 1), insert: "" };
    if (lines[at] === written) return null;
    return { from: offset(at), to: offset(at) + lines[at].length, insert: written };
  }
  if (!v) return null;
  if (!keys.length) return { from: 0, to: 0, insert: written + "\n" + (lines[0]?.trim() ? "\n" : "") };
  // after the last key that comes before it, else first
  const rank = ORDER.indexOf(key);
  let i = 0;
  keys.forEach((k, j) => { const r = ORDER.indexOf(k as InfoKey); if (r >= 0 && r < rank) i = j + 1; });
  return { from: offset(i), to: offset(i), insert: written + "\n" };
}

/** `text` with `key` set (for files that aren't open in the editor). */
export function withInfo(text: string, key: InfoKey, value: string) {
  const c = setInfo(text, key, value);
  return c ? text.slice(0, c.from) + c.insert + text.slice(c.to) : text;
}

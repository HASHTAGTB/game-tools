/** Obsidian [[wikilinks]]: which file a link points at, and rewriting links after files were renamed or moved.
 *  Pure functions on path lists, so they work the same on every storage backend. */

import { fileName as lastPart, parentOf as dirOf } from "@/shared/lib/paths";

/** `!` embed, target, `#heading` / `^block`, `|alias`. */
const LINK = /(!?)\[\[([^\[\]\n|#^]*)([#^][^\[\]\n|]*)?(\|[^\[\]\n]*)?\]\]/g;

const isNote = (p: string) => /\.md$/i.test(p);
/** What a link calls a file: notes without ".md", other files with their extension. */
const linkName = (p: string) => (isNote(p) ? p.replace(/\.md$/i, "") : p);

export type Index = { files: string[]; byName: Map<string, string[]> };

export function indexFiles(files: string[]): Index {
  const byName = new Map<string, string[]>();
  for (const f of files) {
    const k = lastPart(linkName(f)).toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), f]);
  }
  return { files, byName };
}

/** The file a link target means, the way Obsidian picks it (case-insensitive): a bare name is any file of that name,
 *  preferring the linking note's folder, then the shortest path; a path is matched from the vault root, then from the
 *  note's folder, then as the end of a path. */
export function resolve(target: string, from: string, idx: Index): string | null {
  const t = target.trim().replace(/\.md$/i, "").toLowerCase();
  if (!t) return null;
  if (!t.includes("/")) {
    const hits = idx.byName.get(t) ?? [];
    if (hits.length <= 1) return hits[0] ?? null;
    const here = dirOf(from).toLowerCase();
    return hits.find(h => dirOf(h).toLowerCase() === here) ?? [...hits].sort((a, b) => a.length - b.length)[0];
  }
  const key = (f: string) => linkName(f).toLowerCase();
  const rel = [dirOf(from).toLowerCase(), t].filter(Boolean).join("/");
  return idx.files.find(f => key(f) === t) ?? idx.files.find(f => key(f) === rel)
    ?? idx.files.find(f => key(f).endsWith("/" + t)) ?? null;
}

/** `text` (the note that was at `fromOld`) with every link to a moved file pointing at its new place. A link that was a
 *  bare name stays a bare name if that name is still unique, else it becomes a path. null: nothing to change. */
export function rewriteLinks(text: string, fromOld: string, before: Index, after: Index, moves: Map<string, string>): string | null {
  let changed = false;
  const out = text.replace(LINK, (all, bang: string, target: string, sub = "", alias = "") => {
    const old = resolve(target, fromOld, before);
    const now = old && moves.get(old);
    if (!now) return all;
    const name = lastPart(linkName(now));
    const bare = !target.includes("/") && (after.byName.get(name.toLowerCase())?.length ?? 0) === 1;
    const next = `${bang}[[${bare ? name : linkName(now)}${sub}${alias}]]`;
    if (next !== all) changed = true;
    return next;
  });
  return changed ? out : null;
}

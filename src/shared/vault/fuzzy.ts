/** Fuzzy matching for the quick switcher. Each word of the query must appear as a subsequence of the note's path,
 *  the words in any order ("ch2 intro" and "intro ch2" → "Chapter 2/Scenes/Intro"). Matches at word starts, in a row, and in the note's own
 *  name score higher; shorter paths win ties. */

export type Hit = { path: string; score: number; /** indexes into the shown text (the path without .md) */ marks: number[] };

const SEP = /[/\s_\-.()]/;
const isStart = (s: string, i: number) => {
  if (i === 0) return true;
  const p = s[i - 1], c = s[i];
  return SEP.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(c)) || (/\D/.test(p) && /\d/.test(c));
};

/** The best-scoring place for `tok` in `s` (lower-cased as `low`), starting at `from` or later. */
function matchToken(s: string, low: string, tok: string, from: number): { score: number; marks: number[] } | null {
  let best: { score: number; marks: number[] } | null = null;
  for (let start = low.indexOf(tok[0], from); start !== -1; start = low.indexOf(tok[0], start + 1)) {
    const marks = [start];
    let score = isStart(s, start) ? 8 : 0, j = start;
    for (let k = 1; k < tok.length; k++) {
      const n = low.indexOf(tok[k], j + 1);
      if (n === -1) return best;   // later starts can't fit the rest either
      if (n === j + 1) score += 5;
      else score += (isStart(s, n) ? 6 : 0) - Math.min(n - j - 1, 4);
      marks.push(n);
      j = n;
    }
    if (!best || score > best.score) best = { score, marks };
  }
  return best;
}

export const shownPath = (path: string) => path.replace(/\.md$/i, "");

export function fuzzy(paths: string[], query: string, limit = 50): Hit[] {
  const toks = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const hits: Hit[] = [];
  for (const path of paths) {
    const s = shownPath(path), low = s.toLowerCase();
    const nameAt = s.lastIndexOf("/") + 1;
    let score = 0;
    const marks: number[] = [];
    let ok = true;
    for (const tok of toks) {
      const inName = matchToken(s, low, tok, nameAt);
      const m = inName ? { ...inName, score: inName.score + 10 } : matchToken(s, low, tok, 0);
      if (!m) { ok = false; break; }
      score += m.score;
      marks.push(...m.marks);
    }
    if (!ok) continue;
    const name = low.slice(nameAt), q = toks.join(" ");
    if (name === q) score += 30;
    else if (name.startsWith(q)) score += 15;
    hits.push({ path, score: score - s.length * 0.05, marks: [...new Set(marks)].sort((a, b) => a - b) });
  }
  return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}

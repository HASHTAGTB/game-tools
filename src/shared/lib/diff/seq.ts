/** Comparing sequences (lines of a file, words of a line): what stayed, what changed, and, given the version both
 *  sides started from, which changes only one side made (merged without asking) and which clash. */

/** A stretch of `a` and `b`: equal (`same`) or different (a's [a0,a1) became b's [b0,b1)). */
export type Run = { same: boolean; a0: number; a1: number; b0: number; b1: number };

/** More edits than this and the stretch counts as replaced as a whole (keeps the work and memory bounded). */
const MAX_EDITS = 4000;

/** The runs that turn `a` into `b` (Myers' diff: the fewest lines removed and added). */
export function diffSeq<T>(a: readonly T[], b: readonly T[]): Run[] {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const pairs = matches(a.slice(pre, a.length - suf), b.slice(pre, b.length - suf)).map(([x, y]) => [x + pre, y + pre] as const);

  const runs: Run[] = [];
  const push = (same: boolean, a0: number, a1: number, b0: number, b1: number) => {
    if (a0 === a1 && b0 === b1) return;
    const last = runs[runs.length - 1];
    if (last && last.same === same) { last.a1 = a1; last.b1 = b1; return; }
    runs.push({ same, a0, a1, b0, b1 });
  };
  let x = 0, y = 0;
  const all = [...Array.from({ length: pre }, (_, i) => [i, i] as const), ...pairs,
    ...Array.from({ length: suf }, (_, i) => [a.length - suf + i, b.length - suf + i] as const)];
  for (const [px, py] of all) {
    push(false, x, px, y, py);
    push(true, px, px + 1, py, py + 1);
    x = px + 1; y = py + 1;
  }
  push(false, x, a.length, y, b.length);
  return runs;
}

/** Index pairs (in order) of the elements `a` and `b` keep in common. */
function matches<T>(a: readonly T[], b: readonly T[]): [number, number][] {
  const n = a.length, m = b.length;
  if (!n || !m) return [];
  const max = n + m;
  // v[k] = furthest x on diagonal k; one slice per step kept for walking back
  const v = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];
  for (let d = 0; d <= Math.min(max, MAX_EDITS); d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v.get(k - 1)! < v.get(k + 1)!) ? v.get(k + 1)! : v.get(k - 1)! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v.set(k, x);
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  return [];   // too different: no lines in common
}

function backtrack(trace: Map<number, number>[], n: number, m: number): [number, number][] {
  const out: [number, number][] = [];
  let x = n, y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d];
    const k = x - y;
    const pk = k === -d || (k !== d && v.get(k - 1)! < v.get(k + 1)!) ? k + 1 : k - 1;
    const px = v.get(pk)!, py = px - pk;
    while (x > px && y > py) { x--; y--; out.push([x, y]); }
    x = px; y = py;
  }
  while (x > 0 && y > 0) { x--; y--; out.push([x, y]); }
  return out.reverse();
}

// ---------------------------------------------------------------- three versions

/** A stretch of a three-way merge: the same in all three, or a region one or both sides changed. `auto`: only that
 *  side changed it (or both the same way: "a"), so it's taken without asking; null: they clash. */
export type Region<T> =
  | { same: true; items: T[] }
  | { same: false; o: T[]; a: T[]; b: T[]; auto: "a" | "b" | null };

type Hunk = { o0: number; o1: number; x0: number; x1: number };
const hunks = (runs: Run[]): Hunk[] => runs.filter(r => !r.same).map(r => ({ o0: r.a0, o1: r.a1, x0: r.b0, x1: r.b1 }));

/** Two changes touch the same place: they overlap, or one inserts inside / at an end of the other. Two changes that
 *  merely sit next to each other don't. */
const touch = (p: { o0: number; o1: number }, q: { o0: number; o1: number }) =>
  (p.o0 < q.o1 && q.o0 < p.o1) || p.o0 === q.o0
  || (p.o0 === p.o1 && p.o0 >= q.o0 && p.o0 <= q.o1) || (q.o0 === q.o1 && q.o0 >= p.o0 && q.o0 <= p.o1);

/** Merge `a` and `b`, which both started from `o` (diff3). */
export function merge3<T>(o: readonly T[], a: readonly T[], b: readonly T[]): Region<T>[] {
  const ha = hunks(diffSeq(o, a)).map(h => ({ ...h, side: "a" as const }));
  const hb = hunks(diffSeq(o, b)).map(h => ({ ...h, side: "b" as const }));
  const all = [...ha, ...hb].sort((p, q) => p.o0 - q.o0 || p.o1 - q.o1);
  const out: Region<T>[] = [];
  /** Where side x is at base position p, outside its changes. */
  const at = (hs: Hunk[], p: number) => {
    let off = 0;
    for (const h of hs) if (h.o1 <= p && !(h.o0 === h.o1 && h.o0 === p)) off += (h.x1 - h.x0) - (h.o1 - h.o0);
    return p + off;
  };
  let pos = 0;
  for (let i = 0; i < all.length;) {
    const group = [all[i]];
    let o0 = all[i].o0, o1 = all[i].o1;
    for (i++; i < all.length && group.some(g => touch(g, all[i])); i++) {
      group.push(all[i]);
      o1 = Math.max(o1, all[i].o1);
    }
    if (o0 > pos) out.push({ same: true, items: o.slice(pos, o0) });
    const side = (hs: Hunk[], src: readonly T[]) => {
      const mine = group.filter(g => hs.includes(g as never));
      if (!mine.length) return src.slice(at(hs, o0), at(hs, o0) + (o1 - o0));
      const first = mine[0], last = mine[mine.length - 1];
      return src.slice(first.x0 - (first.o0 - o0), last.x1 + (o1 - last.o1));
    };
    const ra = side(ha, a), rb = side(hb, b);
    const byA = group.some(g => g.side === "a"), byB = group.some(g => g.side === "b");
    const auto = !byB ? "a" : !byA ? "b" : sameItems(ra, rb) ? "a" : null;
    out.push({ same: false, o: o.slice(o0, o1), a: ra, b: rb, auto });
    pos = o1;
  }
  if (pos < o.length) out.push({ same: true, items: o.slice(pos) });
  return out;
}

const sameItems = <T>(p: readonly T[], q: readonly T[]) => p.length === q.length && p.every((x, i) => x === q[i]);

// ---------------------------------------------------------------- words

/** A line cut into words, spaces and punctuation, so a changed word stands out rather than the whole line. */
export const words = (s: string) => s.match(/[\p{L}\p{N}_]+|\s+|./gsu) ?? [];

/** The parts of `a` and `b` as pieces: `changed` marks what the other line doesn't have. */
export type Piece = { text: string; changed: boolean };
export function wordDiff(a: string, b: string): { a: Piece[]; b: Piece[] } {
  const wa = words(a), wb = words(b);
  const runs = diffSeq(wa, wb);
  const out = { a: [] as Piece[], b: [] as Piece[] };
  for (const r of runs) {
    const ta = wa.slice(r.a0, r.a1).join(""), tb = wb.slice(r.b0, r.b1).join("");
    const changed = !r.same;
    if (ta) out.a.push({ text: ta, changed });
    if (tb) out.b.push({ text: tb, changed });
  }
  return { a: tidy(out.a), b: tidy(out.b) };
}

/** Joins neighbours of the same kind, and swallows a short unchanged gap (a space, a comma) between two changes. */
function tidy(ps: Piece[]): Piece[] {
  const out: Piece[] = [];
  ps.forEach((p, i) => {
    const gap = !p.changed && p.text.length <= 2 && ps[i - 1]?.changed && ps[i + 1]?.changed;
    const q = gap ? { ...p, changed: true } : p;
    const last = out[out.length - 1];
    if (last && last.changed === q.changed) last.text += q.text; else out.push({ ...q });
  });
  return out;
}

/** How much two lines have in common (0..1), to tell an edited line from a different one. */
export function likeness(a: string, b: string) {
  if (a === b) return 1;
  const wa = words(a), wb = words(b);
  if (!wa.length || !wb.length) return 0;
  let common = 0;
  for (const r of diffSeq(wa, wb)) if (r.same) common += wa.slice(r.a0, r.a1).join("").length;
  return (2 * common) / (a.length + b.length);
}

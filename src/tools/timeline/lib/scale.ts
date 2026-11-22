/** The horizontal scale: story hours ↔ pixels. Time that has events is drawn at `pxPerHour`; stretches with no event
 *  shrink to at most `gapPx`, so years between two arcs take a few pixels while a busy week stays wide. */

export type Segment = { h0: number; h1: number; x0: number; x1: number; dense: boolean };
export type Scale = {
  x: (hours: number) => number;
  /** Inverse of x. */
  hours: (x: number) => number;
  width: number;
  segments: Segment[];
  pxPerHour: number;
};

export const LEAD_PX = 32;
const TAIL_PX = 240;

export function buildScale(spans: { start: number; end: number }[], pxPerHour: number, gapPx = 56): Scale {
  // union of all spans; each counts as at least 1h so instant events still get room
  const sorted = spans.map(s => [s.start, Math.max(s.end, s.start + 1)] as const).sort((a, b) => a[0] - b[0]);
  const covered: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = covered[covered.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else covered.push([a, b]);
  }
  if (!covered.length) covered.push([0, 24]);

  const segments: Segment[] = [];
  let x = LEAD_PX;
  covered.forEach(([a, b], i) => {
    if (i > 0) {
      const prev = covered[i - 1][1];
      const w = Math.min((a - prev) * pxPerHour, gapPx);
      segments.push({ h0: prev, h1: a, x0: x, x1: x + w, dense: false });
      x += w;
    }
    const w = (b - a) * pxPerHour;
    segments.push({ h0: a, h1: b, x0: x, x1: x + w, dense: true });
    x += w;
  });

  const first = segments[0], last = segments[segments.length - 1];
  const find = <K extends "h" | "x">(v: number, k: K) => {
    const lo = k === "h" ? "h0" : "x0", hi = k === "h" ? "h1" : "x1";
    let a = 0, b = segments.length - 1;
    while (a < b) { const m = (a + b) >> 1; if (segments[m][hi] < v) a = m + 1; else b = m; }
    return segments[Math.max(0, Math.min(a, segments.length - 1))] ?? (v < first[lo] ? first : last);
  };

  const toX = (h: number) => {
    if (h <= first.h0) return first.x0 - (first.h0 - h) * pxPerHour;
    if (h >= last.h1) return last.x1 + (h - last.h1) * pxPerHour;
    const s = find(h, "h");
    return s.h1 === s.h0 ? s.x0 : s.x0 + ((h - s.h0) / (s.h1 - s.h0)) * (s.x1 - s.x0);
  };
  const toH = (px: number) => {
    if (px <= first.x0) return first.h0 - (first.x0 - px) / pxPerHour;
    if (px >= last.x1) return last.h1 + (px - last.x1) / pxPerHour;
    const s = find(px, "x");
    return s.x1 === s.x0 ? s.h0 : s.h0 + ((px - s.x0) / (s.x1 - s.x0)) * (s.h1 - s.h0);
  };
  return { x: toX, hours: toH, width: x + TAIL_PX, segments, pxPerHour };
}

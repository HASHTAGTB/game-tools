import { dateOf, PRECISIONS, type Precision } from "./duration";
import type { Resolved } from "./resolve";
import type { Scale } from "./scale";

export type Tick = { x: number; label: string; major: boolean; weekend?: { x0: number; x1: number } };
export type Gap = { x0: number; x1: number; label: string };

const pad = (n: number) => String(n).padStart(2, "0");
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const EPOCH = Date.UTC(2000, 0, 1);
const hoursOf = (ms: number) => (ms - EPOCH) / 3.6e6;

/** "+8 yrs", "+3 wks", "+2 d": how much time a collapsed gap stands for. */
export function gapLabel(hours: number) {
  const d = hours / 24;
  if (d >= 365) return `+${Math.round(d / 365)} yr${Math.round(d / 365) > 1 ? "s" : ""}`;
  if (d >= 60) return `+${Math.round(d / 30)} mo`;
  if (d >= 14) return `+${Math.round(d / 7)} wks`;
  if (d >= 1) return `+${Math.round(d)} d`;
  return `+${Math.round(hours)} h`;
}

/** Date ticks for the axis. Only drawn inside stretches with events, and never finer than what those events actually
 *  know: a stretch whose events are only known to the year gets a year label, not invented days. */
export function ticks(scale: Scale, res: Resolved): { ticks: Tick[]; gaps: Gap[] } {
  const spans = [...res.events.values()];
  const out: Tick[] = [];
  const gaps: Gap[] = [];
  const pxDay = 24 * scale.pxPerHour;
  const unit: Precision = pxDay >= 70 ? "hour" : pxDay >= 22 ? "day" : pxDay * 30 >= 50 ? "month" : "year";

  for (const seg of scale.segments) {
    if (!seg.dense) {
      if (seg.x1 - seg.x0 >= 24) gaps.push({ x0: seg.x0, x1: seg.x1, label: gapLabel(seg.h1 - seg.h0) });
      continue;
    }
    // finest precision known inside this stretch
    let best = 0;
    for (const s of spans) if (s.start < seg.h1 && s.end > seg.h0) best = Math.max(best, PRECISIONS.indexOf(s.precision));
    const show = PRECISIONS[Math.min(best, PRECISIONS.indexOf(unit))];
    const t0 = dateOf(seg.h0);
    const add = (ms: number, label: string, major: boolean, weekend?: boolean) => {
      const h = hoursOf(ms);
      if (h < seg.h0 - 1e-6 || h > seg.h1) return;
      const x = scale.x(h);
      out.push({ x, label, major, ...(weekend ? { weekend: { x0: x, x1: scale.x(Math.min(h + 24, seg.h1)) } } : {}) });
    };
    // always label where a stretch begins, at the precision it has
    const y = t0.getUTCFullYear(), mo = t0.getUTCMonth(), d = t0.getUTCDate();
    const startLabel = show === "year" ? String(y) : show === "month" ? `${MONTHS[mo]} ${y}` : `${WD[t0.getUTCDay()]} ${pad(d)}.${pad(mo + 1)}.${y}`;
    out.push({ x: seg.x0, label: startLabel, major: true });
    if (show === "year") {
      for (let yy = y + 1; hoursOf(Date.UTC(yy, 0, 1)) <= seg.h1; yy++) add(Date.UTC(yy, 0, 1), String(yy), true);
    } else if (show === "month") {
      for (let i = 1; hoursOf(Date.UTC(y, mo + i, 1)) <= seg.h1; i++) {
        const t = new Date(Date.UTC(y, mo + i, 1));
        add(t.getTime(), t.getUTCMonth() === 0 ? String(t.getUTCFullYear()) : MONTHS[t.getUTCMonth()], t.getUTCMonth() === 0);
      }
    } else {
      for (let i = 1; hoursOf(Date.UTC(y, mo, d + i)) <= seg.h1; i++) {
        const t = new Date(Date.UTC(y, mo, d + i));
        const wd = t.getUTCDay();
        add(t.getTime(), `${WD[wd]} ${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.`, t.getUTCDate() === 1 || wd === 1, wd === 0 || wd === 6);
        if (show === "hour") for (const hh of [6, 12, 18]) add(Date.UTC(y, mo, d + i - 1, hh), `${hh}:00`, false);
      }
      // weekend shading for the first day too
      if (t0.getUTCDay() === 0 || t0.getUTCDay() === 6) out[out.length === 0 ? 0 : out.findIndex(t => t.x === seg.x0)].weekend = { x0: seg.x0, x1: scale.x(Math.min(hoursOf(Date.UTC(y, mo, d + 1)), seg.h1)) };
    }
  }
  // drop labels that would overlap the one before
  const kept: Tick[] = [];
  for (const t of out.sort((a, b) => a.x - b.x)) {
    const last = [...kept].reverse().find(k => k.label);
    if (last && t.x - last.x < last.label.length * 6.5 + 10) {
      // labels collide: a major tick wins over a minor one, otherwise the first one stays
      if (t.major && !last.major) { last.label = ""; kept.push(t); }
      else kept.push({ ...t, label: "" });
      continue;
    }
    kept.push(t);
  }
  return { ticks: kept, gaps };
}

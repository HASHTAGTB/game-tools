/** Durations ("4h", "1d6h", "-0.5d") and in-world dates, both as hours. Story time is hours since 2000-01-01 (UTC, no
 *  time zones or DST in the story). */

const DURATION = /^(-)?(?:(\d+(?:\.\d+)?)d)?(?:(\d+(?:\.\d+)?)h)?$/;

export const isDuration = (s: string) => { const m = s.trim().match(DURATION); return !!m && (m[2] !== undefined || m[3] !== undefined); };

/** Hours in a duration; null if it isn't one. */
export function parseDuration(s: string | undefined): number | null {
  if (s === undefined) return 0;
  const t = s.trim();
  if (t === "" || t === "0") return 0;
  const m = t.match(DURATION);
  if (!m || (m[2] === undefined && m[3] === undefined)) return null;
  const h = Number(m[2] ?? 0) * 24 + Number(m[3] ?? 0);
  return m[1] ? -h : h;
}

/** Hours as the shortest duration text, rounded to the half hour: 30 → "1d6h", -36 → "-1d12h", 0 → "0h". */
export function formatDuration(hours: number): string {
  if (hours < 0) return "-" + formatDuration(-hours);
  const h = Math.round(hours * 2) / 2;
  const d = Math.floor(h / 24), r = h - d * 24;
  if (!d) return `${r}h`;
  return r ? `${d}d${r}h` : `${d}d`;
}

export type Precision = "year" | "month" | "day" | "hour";
export const PRECISIONS: Precision[] = ["year", "month", "day", "hour"];
/** The vaguer of two precisions. */
export const vaguer = (a: Precision, b: Precision) => (PRECISIONS.indexOf(a) <= PRECISIONS.indexOf(b) ? a : b);

const DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}))?)?)?$/;
const EPOCH = Date.UTC(2000, 0, 1);

/** Story hours and precision of a date text ("2025", "2025-04", "2025-04-07", "2025-04-07T10:00"); null if invalid.
 *  A vague date means its start: "2025-04" is April 1st, 0:00. */
export function parseDate(s: string): { hours: number; precision: Precision } | null {
  const m = s.trim().match(DATE);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  const ms = Date.UTC(+y, mo ? +mo - 1 : 0, d ? +d : 1, hh ? +hh : 0, mm ? +mm : 0);
  const check = new Date(ms);
  if (mo && check.getUTCMonth() !== +mo - 1) return null;   // 2025-02-30 and friends
  if ((hh && +hh > 23) || (mm && +mm > 59)) return null;
  return { hours: (ms - EPOCH) / 3.6e6, precision: hh ? "hour" : d ? "day" : mo ? "month" : "year" };
}

/** Story hours at the end of a date text: "2025-04-11" is the end of that day, "2020" the end of 2020. */
export function parseDateEnd(s: string): { hours: number; precision: Precision } | null {
  const d = parseDate(s);
  if (!d) return null;
  const t = dateOf(d.hours);
  const y = t.getUTCFullYear(), m = t.getUTCMonth(), day = t.getUTCDate();
  const next = d.precision === "year" ? Date.UTC(y + 1, 0, 1) : d.precision === "month" ? Date.UTC(y, m + 1, 1)
    : d.precision === "day" ? Date.UTC(y, m, day + 1) : t.getTime();
  return { hours: (next - EPOCH) / 3.6e6, precision: d.precision };
}

export const dateOf = (hours: number) => new Date(EPOCH + hours * 3.6e6);

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Story hours as a date at the given precision, German style like the scene files: "07.04.2025 Mo", "04.2025". */
export function formatDate(hours: number, precision: Precision): string {
  const d = dateOf(hours);
  const y = d.getUTCFullYear(), mo = pad(d.getUTCMonth() + 1), day = pad(d.getUTCDate());
  if (precision === "year") return String(y);
  if (precision === "month") return `${mo}.${y}`;
  const s = `${day}.${mo}.${y} ${WEEKDAYS[d.getUTCDay()]}`;
  return precision === "day" ? s : `${s} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** A span as dates: "2012 – 2020", "07.04.2025 Mo – 11.04.2025 Fr". The end is exclusive, so it shows the last
 *  hour/day/month/year inside the span. */
export function formatSpan(start: number, end: number, precision: Precision): string {
  const a = formatDate(start, precision);
  const b = formatDate(Math.max(start, end - 1e-6), precision);
  return a === b ? a : `${a} – ${b}`;
}

/** Story hours as a date text for a `When`'s `at`, at the given precision. */
export function toDateText(hours: number, precision: Precision): string {
  const d = dateOf(hours);
  const y = String(d.getUTCFullYear()), mo = pad(d.getUTCMonth() + 1), day = pad(d.getUTCDate());
  if (precision === "year") return y;
  if (precision === "month") return `${y}-${mo}`;
  if (precision === "day") return `${y}-${mo}-${day}`;
  return `${y}-${mo}-${day}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

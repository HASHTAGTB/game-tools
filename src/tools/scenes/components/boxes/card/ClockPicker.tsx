import { CalendarSearch, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { bandAt, clockText, parseClock, phaseAt, sunOf, useSunTable, type Band, type SunDay } from "@/shared/lib/sun";
import { cn } from "@/shared/lib/utils";
import { useSceneIndex } from "../../../state";
import { PHASE_ICON } from "./BgPicker";
import { CardRow } from "./parts";

/** The clock and date cards: a 24-hour dial coloured by the sun at Hirakata on that day (drag the hand, arrows for 5
 *  minutes, Shift for an hour), steps (+5m … next morning), and a week strip with the days that have scenes. */

const BAND_COLOR: Record<Band, string> = {
  night: "#27304b", dawn: "#7f6f9a", morning: "#e9c79d", day: "#a7c3dc", evening: "#e8975e", dusk: "#8e5a74",
};
const snap = (m: number, step = 5) => ((Math.round(m / step) * step) % 1440 + 1440) % 1440;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function since(now: number, before: number | null, sameDay: boolean) {
  if (before === null) return null;
  if (!sameDay) return `on another day than ${clockText(before)}`;
  const d = now - before, a = Math.abs(d);
  if (!d) return `same as before`;
  return `${d < 0 ? "−" : "+"}${a >= 60 ? `${Math.floor(a / 60)}h ` : ""}${a % 60 ? `${a % 60}m` : ""}`.trim() + ` since ${clockText(before)}`;
}

export function TimePicker({ time, onChange, before, date, sameDay = true, autoFocus }: {
  /** "7:21", or "" while none is set */
  time: string; onChange: (time: string) => void;
  /** the clock before this line (null: none) */
  before: string | null;
  /** the day it's on (for the sun) */
  date: string | null;
  /** `before` is on the same day (else no "+2h since") */
  sameDay?: boolean;
  autoFocus?: boolean;
}) {
  const sun = sunOf(useSunTable(), date);
  const now = parseClock(time) ?? parseClock(before) ?? 12 * 60;
  const was = parseClock(before);
  // while the hand is dragged only the dial moves; the line is written when it's let go (one undo step)
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? now;
  const set = (m: number) => onChange(clockText(snap(m)));
  const phase = phaseAt(sun, shown);
  const Icon = PHASE_ICON[phase];

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <Dial minutes={shown} was={sameDay ? was : null} sun={sun} autoFocus={autoFocus}
        onDrag={m => setDrag(snap(m))} onDrop={() => { if (drag !== null) set(drag); setDrag(null); }} onStep={d => set(now + d)} />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <span className="flex items-center gap-2 font-talk text-sm text-bone"><Icon className="h-4 w-4" />{phase[0].toUpperCase() + phase.slice(1)}</span>
        {since(shown, was, sameDay) && <span className="font-talk text-sm text-taupe">{since(shown, was, sameDay)}</span>}
        <div className="-ml-1.5 flex flex-wrap gap-0.5">
          {[[-15, "−15m"], [5, "+5m"], [15, "+15m"], [30, "+30m"], [60, "+1h"]].map(([d, l]) => (
            <Button key={l} size="sm" variant="quiet" className="tabular-nums" onClick={() => set(now + (d as number))}>{l}</Button>
          ))}
        </div>
        <SunLine sun={sun} />
      </div>
    </div>
  );
}

function Dial({ minutes, was, sun, onDrag, onDrop, onStep, autoFocus }: {
  minutes: number; was: number | null; sun: SunDay; autoFocus?: boolean;
  onDrag: (m: number) => void; onDrop: () => void; onStep: (d: number) => void;
}) {
  const R = 100, C = 120, W = 16;
  const ring = useMemo(() => Array.from({ length: 96 }, (_, i) => {
    const p = (a: number, r: number) => `${C + r * Math.sin(a)} ${C - r * Math.cos(a)}`;
    const a0 = (i / 96) * 2 * Math.PI, a1 = ((i + 1.04) / 96) * 2 * Math.PI;
    return <path key={i} d={`M${p(a0, R)}A${R} ${R} 0 0 1 ${p(a1, R)}L${p(a1, R - W)}A${R - W} ${R - W} 0 0 0 ${p(a0, R - W)}Z`} fill={BAND_COLOR[bandAt(sun, i * 15 + 7.5)]} />;
  }), [sun]);
  const at = (m: number, r: number) => { const a = (m / 1440) * 2 * Math.PI; return [C + r * Math.sin(a), C - r * Math.cos(a)] as const; };
  const [hx, hy] = at(minutes, 76);
  const arc = was !== null && minutes > was ? (() => {
    const [x0, y0] = at(was, 70), [x1, y1] = at(minutes, 70);
    return `M${x0} ${y0}A70 70 0 ${minutes - was > 720 ? 1 : 0} 1 ${x1} ${y1}`;
  })() : null;
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => { if (autoFocus) svg.current?.focus({ preventScroll: true }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const fromPointer = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    let a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
    if (a < 0) a += 2 * Math.PI;
    onDrag((a / (2 * Math.PI)) * 1440);
  };
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    onStep(d * (e.shiftKey ? 60 : 5));
  };
  return (
    <svg ref={svg} viewBox="-14 -14 268 268" className="bx-dial" role="slider" tabIndex={0}
      aria-label="Time of day" aria-valuemin={0} aria-valuemax={1439} aria-valuenow={minutes} aria-valuetext={hhmm(minutes)}
      onKeyDown={onKey}
      onPointerDown={e => { e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId); (e.currentTarget as SVGSVGElement).focus(); fromPointer(e); }}
      onPointerMove={e => { if ((e.currentTarget as Element).hasPointerCapture(e.pointerId)) fromPointer(e); }}
      onPointerUp={onDrop} onPointerCancel={onDrop}>
      {ring}
      {Array.from({ length: 24 }, (_, h) => {
        const [x1, y1] = at(h * 60, R + 4), [x2, y2] = at(h * 60, R + (h % 6 ? 8 : 12)), [tx, ty] = at(h * 60, R + 23);
        return <g key={h}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-taupe)" strokeWidth={h % 6 ? 1 : 1.6} />
          {h % 6 === 0 && <text x={tx} y={ty + 4} textAnchor="middle" fontSize="12" fill="var(--color-taupe)" fontFamily="var(--font-sans)">{h}</text>}
        </g>;
      })}
      {arc && <path d={arc} fill="none" stroke="rgb(250 245 239 / .5)" strokeWidth="6" strokeLinecap="round" />}
      {was !== null && (() => { const [x1, y1] = at(was, 58), [x2, y2] = at(was, 92); return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-bone)" strokeWidth="2" opacity=".5" />; })()}
      <line x1={C} y1={C} x2={hx} y2={hy} stroke="var(--color-paper)" strokeWidth="3" strokeLinecap="round" />
      <circle cx={hx} cy={hy} r="8" fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="3" />
      <circle cx={C} cy={C} r="4" fill="var(--color-paper)" />
      <text x={C} y={minutes > 360 && minutes < 1080 ? C - 24 : C + 40} textAnchor="middle" fontSize="24" fill="var(--color-paper)" fontFamily="var(--font-sans)" style={{ fontVariantNumeric: "tabular-nums" }}>{hhmm(minutes)}</text>
    </svg>
  );
}

function SunLine({ sun }: { sun: SunDay }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-talk text-xs text-taupe">
      <span>{sun.place ? "Hirakata:" : "No sun table, standard hours:"}</span>
      <span>dawn <b className="font-semibold text-bone">{clockText(sun.dawn)}</b></span>
      <span>sunrise <b className="font-semibold text-bone">{clockText(sun.rise)}</b></span>
      <span>sunset <b className="font-semibold text-bone">{clockText(sun.set)}</b></span>
      <span>dusk <b className="font-semibold text-bone">{clockText(sun.dusk)}</b></span>
    </span>
  );
}

// ---------------------------------------------------------------- the day

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayOf = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; };
export const addDays = (s: string, n: number) => { const d = dayOf(s) ?? new Date(); d.setDate(d.getDate() + n); return iso(d); };

/** How many scenes play on each day (their `set_date`s and dated labels), from the scene index. */
function useSceneDays() {
  const files = useSceneIndex(i => i.files);
  return useMemo(() => {
    const n = new Map<string, number>();
    for (const f of Object.values(files ?? {})) for (const d of f.uses.dates) n.set(d, (n.get(d) ?? 0) + 1);
    return n;
  }, [files]);
}

export function DayPicker({ date, onChange, before }: { date: string; onChange: (date: string) => void; before: string | null }) {
  const days = useSceneDays();
  const [week, setWeek] = useState(0);
  const base = dayOf(date) ?? dayOf(before ?? "") ?? new Date();
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((base.getDay() + 6) % 7) + week * 7);
  const list = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  const month = list[3].toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const pick = (d: string) => { setWeek(0); onChange(d); };
  const any = useRef<HTMLInputElement>(null);
  return (
    <CardRow label={month} aside={<>
      {/* any other day: the system's date picker, opened from the icon (its field would show the date once more) */}
      <input ref={any} type="date" value={date} tabIndex={-1} aria-hidden onChange={e => e.target.value && pick(e.target.value)} className="sr-only" />
      <IconButton icon={CalendarSearch} size="sm" label="Any other day" onClick={() => any.current?.showPicker()} />
    </>}>
      <div className="bx-week">
        <button type="button" className="bx-week-nav" aria-label="Week before" onClick={() => setWeek(w => w - 1)}><ChevronLeft className="h-4 w-4" /></button>
        {list.map(d => {
          const k = iso(d), n = days.get(k) ?? 0;
          return (
            <button key={k} type="button" aria-pressed={k === date} onClick={() => pick(k)} className={cn("bx-day", k === before && "bx-day-was")}
              title={`${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}: ${n ? `${n} scene${n > 1 ? "s" : ""}` : "no scenes yet"}${k === before ? " (the day before this line)" : ""}`}>
              <span className="bx-day-wd">{d.toLocaleDateString("en-GB", { weekday: "short" })}</span>
              <span className="bx-day-n">{d.getDate()}</span>
              <span className="bx-day-dots">{Array.from({ length: Math.min(n, 4) }, (_, i) => <i key={i} />)}</span>
            </button>
          );
        })}
        <button type="button" className="bx-week-nav" aria-label="Week after" onClick={() => setWeek(w => w + 1)}><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="-ml-1.5 mt-2 flex flex-wrap items-center gap-0.5">
        <Button size="sm" variant="quiet" onClick={() => pick(addDays(before ?? date, 1))}>Next day</Button>
        {before && before !== date && <Button size="sm" variant="quiet" onClick={() => pick(before)}>Same day as before</Button>}
        <span className="ml-auto font-talk text-xs text-taupe">Dots: scenes already on that day</span>
      </div>
    </CardRow>
  );
}

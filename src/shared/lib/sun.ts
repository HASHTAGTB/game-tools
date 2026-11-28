import { useEffect, useState } from "react";
import { useGame } from "./game";
import { locationVersion, readJson, TOOLS_DIR } from "./workspace";

/** When the sun rises and sets where the story happens (Hirakata), from `.game-tools/sun.json`: per day of the year
 *  (MM-DD, the same every year within two minutes) civil dawn, sunrise, solar noon, sunset and civil dusk, as "HH:MM".
 *  The scenes' clock card colours its dial with it, and the background card uses it to tell whether a time is morning,
 *  day, evening or night. Without the file, fixed hours stand in. */

export const SUN_PATH = `${TOOLS_DIR}/sun.json`;

type Day = { dawn: string; sunrise: string; noon: string; sunset: string; dusk: string };
export type SunTable = { place?: string; days: Record<string, Day> };

export type Phase = "morning" | "day" | "evening" | "night";

/** One day's times in minutes after midnight, plus where morning ends and evening starts. */
export type SunDay = { dawn: number; rise: number; set: number; dusk: number; mornEnd: number; eveStart: number; place: string | null };

const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

/** Without the table: 5:00 dawn, 5:30 sunrise, 18:00 sunset, 18:30 dusk. */
const FALLBACK: Day = { dawn: "05:00", sunrise: "05:30", noon: "12:00", sunset: "18:00", dusk: "18:30" };

/** `date` is "YYYY-MM-DD" (or anything ending in MM-DD); a date the table doesn't have uses the fallback hours. */
export function sunOf(table: SunTable | null, date: string | null): SunDay {
  const d = (date && table?.days[date.slice(-5)]) || FALLBACK;
  const dawn = toMin(d.dawn), rise = toMin(d.sunrise), set = toMin(d.sunset), dusk = toMin(d.dusk);
  return { dawn, rise, set, dusk, mornEnd: rise + 180, eveStart: set - 60, place: table && date && table.days[date.slice(-5)] ? table.place ?? null : null };
}

/** night = civil dusk → civil dawn · morning = dawn → 3 h after sunrise · day → 1 h before sunset · evening → dusk */
export function phaseAt(sun: SunDay, minutes: number): Phase {
  const m = ((minutes % 1440) + 1440) % 1440;
  return m < sun.dawn || m >= sun.dusk ? "night" : m < sun.mornEnd ? "morning" : m < sun.eveStart ? "day" : "evening";
}

/** The finer bands the dial's ring is coloured with (dawn and dusk are the twilights around sunrise and sunset). */
export type Band = "night" | "dawn" | "morning" | "day" | "evening" | "dusk";
export function bandAt(sun: SunDay, minutes: number): Band {
  const m = ((minutes % 1440) + 1440) % 1440;
  return m < sun.dawn || m >= sun.dusk ? "night" : m < sun.rise ? "dawn" : m < sun.mornEnd ? "morning" : m < sun.eveStart ? "day" : m < sun.set ? "evening" : "dusk";
}

/** "7:21" / "07:21" → minutes after midnight; null if it isn't a time. */
export function parseClock(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t?.trim() ?? "");
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}
/** minutes → "7:05" (the way the scripts write it: no leading zero on the hour) */
export const clockText = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

// ---------------------------------------------------------------- reading the table

let read: { version: number; manifest: unknown; table: Promise<SunTable | null> } | null = null;

function load(manifest: unknown) {
  // read again for another location, and when the game is reloaded (someone may have changed the file)
  if (!read || read.version !== locationVersion() || read.manifest !== manifest) {
    read = {
      version: locationVersion(), manifest,
      table: readJson<SunTable>(SUN_PATH).then(t => (t && typeof t.days === "object" ? t : null)).catch(() => null),
    };
  }
  return read.table;
}

/** The sun table, null while it's read or if there is none (sunOf then uses the fallback hours). */
export function useSunTable(): SunTable | null {
  const manifest = useGame(s => s.manifest);
  const [table, setTable] = useState<SunTable | null>(null);
  useEffect(() => {
    let live = true;
    load(manifest).then(t => live && setTable(t));
    return () => { live = false; };
  }, [manifest]);
  return table;
}

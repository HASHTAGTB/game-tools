import type { Manifest } from "@/shared/lib/game";
import type { Phase } from "@/shared/lib/sun";

/** The game's backgrounds grouped into places: `school_entrance_night_lights_on` is the place "School entrance" in its
 *  version "night · lights on". The background card shows one tile per place and switches versions in a bar.
 *
 *  A version starts at the first time word (`day`, `evening`, `noon` …) or, for names without one, at `light(s)_on/off`;
 *  everything after it are extras ("lights on", "curtain closed", "back"). Names with neither are a place of their own
 *  with one version (""). */

/** Time words in background names and the part of the day each one counts as. */
const TIME_WORDS: Record<string, Phase> = {
  dawn: "morning", morning: "morning", day: "day", daytime: "day", noon: "day", afternoon: "day",
  sunset: "evening", evening: "evening", dusk: "evening", night: "night", midnight: "night",
};

export type BgVersion = {
  /** the background's full name (what `scene` takes) */
  name: string;
  /** the part after the place ("night_lights_on"; "" for the place's plain image) */
  key: string;
  /** the time word as written ("noon"), "" if none */
  time: string;
  /** the part of the day it counts as, null without a time word */
  phase: Phase | null;
  /** the rest, readable ("lights on", "curtain closed") */
  extras: string;
};

export type Place = {
  id: string;
  label: string;
  /** "main" (directly in images/bg), the subfolder's name, or the images/ folder it's in ("cg") */
  folder: string;
  /** a `layer_` piece (the back of a layered scene) */
  layer: boolean;
  versions: BgVersion[];
};

/** Where a version starts in the name's words: the first time word, else `light(s)` + on/off. -1: no version part. */
function versionStart(words: string[]) {
  for (let i = 1; i < words.length; i++) if (TIME_WORDS[words[i]]) return i;
  for (let i = 1; i < words.length - 1; i++) if ((words[i] === "light" || words[i] === "lights") && (words[i + 1] === "on" || words[i + 1] === "off")) return i;
  return -1;
}

const readable = (words: string[]) => words.join(" ").replace(/\blight (on|off)\b/g, "lights $1");

export function splitName(name: string): { place: string; version: Omit<BgVersion, "name"> } {
  const words = name.split("_");
  const i = versionStart(words);
  if (i < 0) return { place: name, version: { key: "", time: "", phase: null, extras: "" } };
  const rest = words.slice(i);
  const time = TIME_WORDS[rest[0]] ? rest[0] : "";
  return { place: words.slice(0, i).join("_"), version: { key: rest.join("_"), time, phase: time ? TIME_WORDS[time] : null, extras: readable(time ? rest.slice(1) : rest) } };
}

/** "school_entrance" → "School entrance", "layer_in_car" → "In car" (the layer mark says the rest). */
export function placeLabel(id: string) {
  const s = id.replace(/^layer_/, "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "night · lights on", "noon", "plain" */
export const versionLabel = (v: Pick<BgVersion, "time" | "extras">) => [v.time, v.extras].filter(Boolean).join(" · ") || "plain";

/** Which filter a background's file belongs to: images/bg/x.png → "main", images/bg/noraneko/x.png → "noraneko",
 *  images/cg/x.png → "cg". */
export function folderOf(file: string | undefined) {
  const parts = (file ?? "").split("/");
  if (parts[0] !== "images" || parts.length < 3) return "main";
  if (parts[1] === "bg") return parts.length > 3 ? parts[2] : "main";
  return parts[1];
}

const ORDER: Record<string, number> = { morning: 0, day: 1, evening: 2, night: 3 };
const versionOrder = (a: BgVersion, b: BgVersion) =>
  (a.phase ? ORDER[a.phase] : -1) - (b.phase ? ORDER[b.phase] : -1) || a.time.localeCompare(b.time) || a.extras.localeCompare(b.extras);

/** Every background of the game (without "black") as places, sorted by label. A place's versions can come from different
 *  folders only if the same place name is used in two folders; it then takes the first version's folder. */
export function placesOf(m: Pick<Manifest, "backgrounds" | "imageFiles">): Place[] {
  const byId = new Map<string, Place>();
  for (const name of m.backgrounds) {
    if (name === "black") continue;
    const folder = folderOf(m.imageFiles[name]);
    const { place, version } = splitName(name);
    // the same place name in two folders stays two places
    const id = byId.has(place) && byId.get(place)!.folder !== folder ? `${folder}/${place}` : place;
    let p = byId.get(id);
    if (!p) byId.set(id, p = { id, label: placeLabel(place), folder, layer: place.startsWith("layer_"), versions: [] });
    p.versions.push({ name, ...version });
  }
  const out = [...byId.values()];
  for (const p of out) p.versions.sort(versionOrder);
  return out.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

/** The place a background name belongs to, and its version there. */
export function findVersion(places: Place[], name: string): { place: Place; version: BgVersion } | null {
  for (const place of places) {
    const version = place.versions.find(v => v.name === name);
    if (version) return { place, version };
  }
  return null;
}

/** The version of `place` closest to `like`: same time and extras, else the same time, else the same part of the day,
 *  else the first. What a tile shows and what picking a tile picks, so going from "night · lights on" to another place
 *  stays at night with the lights on where it can. */
export function closestVersion(place: Place, like: Pick<BgVersion, "time" | "phase" | "extras"> | null): BgVersion {
  const vs = place.versions;
  if (!like) return vs[0];
  return vs.find(v => v.time === like.time && v.extras === like.extras)
    ?? vs.find(v => v.time === like.time && like.time)
    ?? vs.find(v => v.phase === like.phase && like.phase)
    ?? vs[0];
}

/** The versions for one time word, and the time words a place has (in order). */
export const timesOf = (p: Place) => [...new Set(p.versions.map(v => v.time))];
export const extrasAt = (p: Place, time: string) => p.versions.filter(v => v.time === time);

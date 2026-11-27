import type { Script } from "./script";

/** What's on screen at a line of the script, worked out by playing the lines before it in order (no jumps followed):
 *  the background, who's shown where, whose point of view, the music, the date. For the preview and the checks. */

export type Sprite = { tag: string; attrs: string[]; at: string | null };

export type Stage = {
  background: string | null;
  sprites: Sprite[];
  /** the POV character (`$ narrator = x_n`) */
  pov: string | null;
  music: string | null;
  date: string | null;
  time: string | null;
  /** who said the last line (null: narration); an `extend` line goes on in their voice */
  speaker: string | null;
};

export const EMPTY_STAGE: Stage = { background: null, sprites: [], pov: null, music: null, date: null, time: null, speaker: null };

/** The stage after each line: `stages[i]` is how it looks once line i (0-based) has run. */
export function playScript(s: Script): Stage[] {
  let st: Stage = EMPTY_STAGE;
  return s.parsed.map(p => {
    if (p?.kind === "say") {
      if (p.who !== "extend" && p.who !== st.speaker) st = { ...st, speaker: p.who };
      return st;
    }
    if (p?.kind !== "stmt") return st;
    const x = p.stmt;
    switch (x.kind) {
      case "scene": st = { ...st, background: x.image, sprites: [] }; break;
      case "show": {
        const old = st.sprites.find(sp => sp.tag === x.tag);
        const next: Sprite = { tag: x.tag, attrs: x.attrs.length ? x.attrs : old?.attrs ?? [], at: x.at ?? old?.at ?? null };
        st = { ...st, sprites: old ? st.sprites.map(sp => (sp === old ? next : sp)) : [...st.sprites, next] };
        break;
      }
      case "hide": st = { ...st, sprites: st.sprites.filter(sp => sp.tag !== x.tag) }; break;
      case "pov": st = { ...st, pov: x.who }; break;
      case "play": if (x.channel === "music") st = { ...st, music: x.name }; break;
      case "stop": if (x.channel === "music") st = { ...st, music: null }; break;
      case "date": st = { ...st, date: x.date, time: x.time ?? st.time }; break;
      case "time": st = { ...st, time: x.time }; break;
    }
    return st;
  });
}

/** Where a position puts a sprite: x from 0 (left) to 1 (right), and its size (1 = the default). */
export function placeOf(at: string | null, positions: { name: string; params?: Record<string, number> }[] = []) {
  const BASE = 0.575;
  const named: Record<string, { x: number; zoom: number }> = {
    center: { x: 0.5, zoom: BASE }, left: { x: 0.3, zoom: BASE }, right: { x: 0.7, zoom: BASE }, small: { x: 0.5, zoom: 0.475 },
  };
  if (!at) return { x: 0.5, scale: 1 };
  const m = /^(\w+)\((.*)\)$/.exec(at);
  if (m) {
    const def = positions.find(p => p.name === m[1])?.params ?? { zoom: BASE, xalign: 0.5 };
    const args = Object.fromEntries(m[2].split(",").map(a => a.split("=").map(t => t.trim())).filter(a => a.length === 2).map(([k, v]) => [k, +v]));
    return { x: args.xalign ?? def.xalign ?? 0.5, scale: (args.zoom ?? def.zoom ?? BASE) / BASE };
  }
  const n = named[at];
  return n ? { x: n.x, scale: n.zoom / BASE } : { x: 0.5, scale: 1 };
}

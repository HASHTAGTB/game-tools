import type { Manifest } from "@/shared/lib/game";
import type { Script } from "./script";

/** How the preview plays a scene's transitions (`with dissolve`, `scene … with fade`, `show … with easeinright`,
 *  `with vpunch` …): what each one looks like, and which ones run when the cursor moves from one line to a later one. */

export type Side = "left" | "right" | "top" | "bottom";

/** One transition, as the preview plays it. Times in seconds. */
export type Motion =
  | { kind: "dissolve"; d: number }
  /** to a colour, hold, back out of it (the whole screen changes while it's covered) */
  | { kind: "fade"; out: number; hold: number; in: number; color: string }
  /** a sprite slides in from / out to a side (`ease…` eases, `move…` doesn't) */
  | { kind: "slide"; side: Side; d: number; ease: boolean }
  /** sprites that change place glide there (`move`, `ease`) */
  | { kind: "move"; d: number; ease: boolean }
  | { kind: "zoom"; d: number }
  | { kind: "wipe"; side: Side; d: number }
  | { kind: "punch"; axis: "x" | "y" };

const WIPE_SIDE: Record<string, Side> = { right: "right", left: "left", up: "top", down: "bottom" };

/** What a name like `dissolve` or `slow_fade` does: the game's own `define`s first (Fade(…), Dissolve(…), a dict of
 *  layers), then Ren'Py's built-ins. Unknown ones dissolve. */
export function motionOf(name: string, m: Manifest | null): Motion {
  const def = m?.transitionDefs[name];
  if (def) {
    const f = /^Fade\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:.*?color\s*=\s*"([^"]+)")?/.exec(def);
    if (f) return { kind: "fade", out: +f[1], hold: +f[2], in: +f[3], color: f[4] ?? "#000" };
    const d = /Dissolve\(\s*([\d.]+)/.exec(def);
    if (d) return { kind: "dissolve", d: +d[1] };
  }
  if (name === "fade") return { kind: "fade", out: 0.5, hold: 0, in: 0.5, color: "#000" };
  if (name === "vpunch") return { kind: "punch", axis: "y" };
  if (name === "hpunch") return { kind: "punch", axis: "x" };
  if (name === "move" || name === "ease") return { kind: "move", d: 0.5, ease: name === "ease" };
  let x = /^(ease|move)(?:in|out)(right|left|top|bottom)$/.exec(name);
  if (x) return { kind: "slide", side: x[2] as Side, d: 0.5, ease: x[1] === "ease" };
  x = /^wipe(right|left|up|down)$/.exec(name);
  if (x) return { kind: "wipe", side: WIPE_SIDE[x[1]], d: 1 };
  if (name.startsWith("zoom")) return { kind: "zoom", d: 0.5 };
  if (name === "pixellate" || name === "blinds" || name === "squares") return { kind: "dissolve", d: 1 };
  return { kind: "dissolve", d: 0.5 };
}

/** How long it takes, capped like the text crawl's pauses so the preview never stalls. */
export function lengthOf(x: Motion | null): number {
  if (!x) return 0;
  const t = x.kind === "fade" ? x.out + x.hold + x.in : x.kind === "punch" ? 0.3 : x.d;
  return Math.min(t, 2);
}

/** What changed between two lines and how it's shown: the background, sprites that came, went, changed their look or
 *  moved, a fade over all of it, a shake. A change written without a transition is in the lists with null (it just
 *  happens). `id` is different for every cue, so the preview knows to play it. */
export type Cue = {
  id: number;
  background?: Motion | null;
  enter: Record<string, Motion | null>;
  exit: Record<string, Motion | null>;
  look: Record<string, Motion | null>;
  move: Record<string, Motion | null>;
  fade: Extract<Motion, { kind: "fade" }> | null;
  punch: "x" | "y" | null;
  /** how long until it has all played (the textbox waits for it, like the game does) */
  length: number;
};

let ids = 0;

/** The transitions that play going from line `from` to line `to` (1-based, `to` after `from`): every statement after
 *  `from`, or after the last line of dialogue before `to` if that's later (a jump far down plays what leads into the
 *  line, not everything on the way), up to and including `to`, the last change to each thing winning. A bare `with x` line applies to what changed
 *  since the last line of dialogue (or the last `with`) without a transition of its own, as in Ren'Py. */
export function cueBetween(s: Script, from: number, to: number, m: Manifest | null): Cue {
  const cue: Cue = { id: ++ids, enter: {}, exit: {}, look: {}, move: {}, fade: null, punch: null, length: 0 };
  // what's on screen, so a show can tell coming on from changing look or place
  const on = new Map<string, { attrs: string[]; at: string | null }>();
  // changes waiting for a `with` line: [the list it's in, the key]
  let pending: [Record<string, Motion | null> | "bg", string][] = [];
  const motion = (w: string | undefined) => (w ? motionOf(w, m) : null);
  const apply = (x: Motion | null) => {
    if (!x) return;
    if (x.kind === "fade") cue.fade = x;
    if (x.kind === "punch") cue.punch = x.axis;
  };

  let start = from;
  for (let i = Math.min(to, s.parsed.length) - 2; i >= from; i--) if (s.parsed[i]?.kind === "say") { start = i + 1; break; }

  for (let i = 0; i < Math.min(to, s.parsed.length); i++) {
    const p = s.parsed[i];
    const live = i >= start;
    if (p?.kind === "say") { pending = []; continue; }
    if (p?.kind !== "stmt") continue;
    const x = p.stmt;
    if (x.kind === "scene") {
      if (live) {
        for (const tag of on.keys()) { cue.exit[tag] = motion(x.with); pending.push([cue.exit, tag]); }
        cue.background = motion(x.with); pending.push(["bg", ""]);
        apply(motion(x.with));
      }
      on.clear();
    } else if (x.kind === "show") {
      const old = on.get(x.tag);
      const now = { attrs: x.attrs.length ? x.attrs : old?.attrs ?? [], at: x.at ?? old?.at ?? null };
      if (live) {
        const w = motion(x.with);
        const list = !old ? cue.enter : old.at !== now.at ? cue.move : cue.look;
        list[x.tag] = w;
        if (!old) delete cue.exit[x.tag];
        if (old && old.at !== now.at && old.attrs.join(" ") !== now.attrs.join(" ")) cue.look[x.tag] = w;
        if (!x.with) pending.push([list, x.tag]);
        apply(w);
      }
      on.set(x.tag, now);
    } else if (x.kind === "hide") {
      if (live && on.has(x.tag)) {
        cue.exit[x.tag] = motion(x.with);
        delete cue.enter[x.tag];
        if (!x.with) pending.push([cue.exit, x.tag]);
        apply(motion(x.with));
      }
      on.delete(x.tag);
    } else if (x.kind === "with" && live) {
      const w = motionOf(x.with, m);
      for (const [list, key] of pending) {
        if (list === "bg") cue.background = w;
        else list[key] = w;
      }
      pending = [];
      apply(w);
    }
  }

  const all = [cue.background ?? null, ...Object.values(cue.enter), ...Object.values(cue.exit), ...Object.values(cue.look), ...Object.values(cue.move)];
  cue.length = Math.max(lengthOf(cue.fade), cue.punch ? 0.3 : 0, ...all.map(lengthOf));
  return cue;
}

/** The cue where nothing plays (moving back up, or typing). */
export const STILL: Cue = { id: 0, enter: {}, exit: {}, look: {}, move: {}, fade: null, punch: null, length: 0 };

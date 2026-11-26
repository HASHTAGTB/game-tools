import { MapMode, StateEffect, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { ArrowRight, CornerDownLeft, CalendarDays, Clock, Eye, Hourglass, Image, Music, Smartphone, Sparkles, Split, UserRound, UserRoundMinus, VolumeX, type LucideIcon } from "lucide-react";
import { characterOf, DEFAULT_COLOR, useGame, type Manifest } from "@/shared/lib/game";
import { highlight } from "./highlight";
import { inScript, parseScript, type Script, type Stmt } from "./script";
import type { Stage } from "./stage";

/** What the scene editor's CodeMirror view holds besides the text: the file, parsed, and the game's data. The box view
 *  reads both from it; the source view colours the raw text with them. */

// ---------------------------------------------------------------- state

export const setManifest = StateEffect.define<Manifest | null>();
export const manifestField = StateField.define<Manifest | null>({
  create: () => useGame.getState().manifest,
  update: (v, tr) => { for (const e of tr.effects) if (e.is(setManifest)) return e.value; return v; },
});

/** The file, parsed; kept in step with every change. */
export const scriptField = StateField.define<Script>({
  create: s => parseScript(s.doc.toString()),
  update: (v, tr) => (tr.docChanged ? parseScript(tr.newDoc.toString()) : v),
});

/** A name for every line that stays with it while lines above are added or removed (the box view's React keys:
 *  boxes below an edit keep their place instead of being built again). A line that's new, or that an edit
 *  replaced from its start, gets a new name. */
let nextLineId = 0;
export const lineIds = StateField.define<number[]>({
  create: s => Array.from({ length: s.doc.lines }, () => ++nextLineId),
  update: (ids, tr) => {
    if (!tr.docChanged) return ids;
    const old = tr.startState.doc, doc = tr.newDoc;
    const out: number[] = new Array(doc.lines).fill(0);
    for (let n = 1; n <= old.lines; n++) {
      const at = tr.changes.mapPos(old.line(n).from, -1, MapMode.TrackDel);
      if (at === null) continue;
      const m = doc.lineAt(at);
      if (m.from === at && !out[m.number - 1]) out[m.number - 1] = ids[n - 1];
    }
    for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = ++nextLineId;
    return out;
  },
});

/** A character's name and colour as the game shows them. */
export function who(m: Manifest | null, id: string) {
  if (id === "extend") return { name: "…", color: "var(--color-taupe)", known: true };
  const c = characterOf(m, id);
  return { name: c?.name ?? id, color: c?.color ?? (m ? "var(--color-coral)" : DEFAULT_COLOR), known: !m || !!c };
}

/** A name colour that reads on the ink background: colours too dark for it are mixed toward bone. Only the editor
 *  does this; the game keeps its colour. */
export function legible(color: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (l >= 0.42) return color;
  const t = 0.62 - l, bone = [217, 208, 199];
  return `rgb(${[r, g, b].map((c, i) => Math.round(c * (1 - t) + bone[i] * t)).join(", ")})`;
}

// ---------------------------------------------------------------- cards

const dateText = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${m[3]}.${m[2]}.${m[1]}` : d; };
const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/** What a card says about a statement. `before`: the stage just before it. */
export function describe(x: Stmt, before: Stage, m: Manifest | null): { ico: LucideIcon; title: string; detail: string; color: string | null } {
  const ch = (id: string) => who(m, id);
  switch (x.kind) {
    case "scene": return { ico: Image, title: "Background", detail: join(x.image, x.with), color: null };
    case "show": {
      const old = before.sprites.find(s => s.tag === x.tag);
      const c = ch(x.tag);
      const moves = x.at && old && x.at !== old.at;
      return {
        ico: UserRound, title: c.name, color: c.color,
        detail: join(!old && "comes in", x.attrs.join(" "), x.at && (moves ? `moves ${x.at}` : !old && x.at), x.with),
      };
    }
    case "hide": { const c = ch(x.tag); return { ico: UserRoundMinus, title: c.name, detail: join("leaves", x.with), color: c.color }; }
    case "with": return { ico: Sparkles, title: "Transition", detail: x.with, color: null };
    case "play": return { ico: Music, title: x.channel === "music" ? "Music" : x.channel[0].toUpperCase() + x.channel.slice(1), detail: join(x.name, x.fadein && `fades in ${+x.fadein}s`), color: null };
    case "stop": return { ico: VolumeX, title: x.channel === "music" ? "Music" : x.channel[0].toUpperCase() + x.channel.slice(1), detail: join("stops", x.fadeout && `fades out ${+x.fadeout}s`), color: null };
    case "pov": { const c = ch(x.who); return { ico: Eye, title: "Point of view", detail: c.name, color: c.color }; }
    case "date": return { ico: CalendarDays, title: "Date", detail: join(dateText(x.date), x.time), color: null };
    case "time": return { ico: Clock, title: "Time", detail: x.time, color: null };
    case "jump": return { ico: ArrowRight, title: "Continue at", detail: x.target, color: null };
    case "call": return { ico: ArrowRight, title: "Play", detail: x.target, color: null };
    case "pause": return { ico: Hourglass, title: "Pause", detail: x.seconds ? `${+x.seconds}s` : "until a click", color: null };
    case "phone": return { ico: Smartphone, title: "Phone", detail: x.action === "open" ? `opens ${x.thread ?? ""}`.trim() : x.action === "on" ? join("comes out", x.thread) : "goes away", color: null };
    case "return": return { ico: CornerDownLeft, title: "Scene ends", detail: "back to where it was started from", color: null };
    case "menu": return { ico: Split, title: "Choice", detail: "the player picks one", color: null };
  }
}

/** Statements a card can edit in place. */
export const EDITABLE = new Set<Stmt["kind"]>(["scene", "show", "hide", "with", "play", "stop", "pov", "date", "time", "jump", "call", "pause", "phone"]);

// ---------------------------------------------------------------- source view

/** Raw Ren'Py, coloured (lib/highlight.ts): speakers in their colour. The script's code block sits in a frame; lines
 *  outside the script are dimmed. */
export const sourceView = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.build(view); }
  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged || u.transactions.some(t => t.effects.some(e => e.is(setManifest)))) this.decorations = this.build(u.view);
  }
  build(view: EditorView) {
    const out: Range<Decoration>[] = [];
    const s = view.state.field(scriptField);
    const m = view.state.field(manifestField);
    const { doc } = view.state;
    // the whole script at once (a python block's state carries over lines); only visible lines get marks
    const code = s.layout.code;
    const first = code ? code.open + 1 : 1, last = code ? (code.close ?? doc.lines + 1) - 1 : 0;
    /** the frame's last line: the closing fence (or the file's end, while there's none) */
    const boxEnd = code ? code.close ?? doc.lines : 0;
    const spans = code ? highlight(s.lines.slice(first - 1, last), id => whoColor(m, id)) : [];
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const L = doc.lineAt(pos);
        pos = L.to + 1;
        if (code && L.number >= code.open && L.number <= boxEnd) {
          const cls = "cm-src-code" + (L.number === code.open ? " cm-src-code-first" : "") + (L.number === boxEnd ? " cm-src-code-last" : "");
          out.push(Decoration.line({ class: cls }).range(L.from));
        }
        if (!inScript(s.layout, L.number)) { out.push(Decoration.line({ class: "cm-src-outside" }).range(L.from)); continue; }
        for (const x of spans[L.number - first] ?? []) {
          out.push(Decoration.mark({ class: "rp-" + x.tok, attributes: x.color ? { style: `color:${x.color}` } : undefined }).range(L.from + x.from, L.from + x.to));
        }
      }
    }
    return Decoration.set(out, true);
  }
}, { decorations: v => v.decorations });

/** A speaker's colour for the highlighter (readable on ink), or null when the word isn't a character. */
export function whoColor(m: Manifest | null, id: string): string | null {
  if (id === "extend") return null;
  const w = who(m, id);
  return w.known && m ? legible(w.color) : null;
}

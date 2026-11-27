import {
  ArrowRight, CalendarDays, Clock, CornerDownLeft, Eye, Hourglass, Image, Music, Smartphone, SmilePlus, Sparkles, Split, UserRound, UserRoundMinus,
  VolumeX, type LucideIcon,
} from "lucide-react";
import { formatReact, parseReact } from "./phone";
import type { Manifest } from "@/shared/lib/game";
import { look } from "./look";
import type { Stage } from "./stage";

/** The Ren'Py statements the editor understands, one entry each: how a line reads as it and is written back, what its
 *  card says, and whether (and how) a card edits it. Anything else in a script is Ren'Py the editor shows as it is. */

export type Stmt =
  | { kind: "scene"; image: string; with?: string }
  | { kind: "show"; tag: string; attrs: string[]; at?: string; with?: string }
  | { kind: "hide"; tag: string; with?: string }
  | { kind: "with"; with: string }
  | { kind: "play"; channel: string; name: string; fadein?: string }
  | { kind: "stop"; channel: string; fadeout?: string }
  | { kind: "pov"; who: string }
  | { kind: "date"; date: string; time?: string }
  | { kind: "time"; time: string }
  | { kind: "jump"; target: string }
  | { kind: "call"; target: string }
  | { kind: "pause"; seconds?: string }
  /** the game's phone: `phone on` (with a chat: shown on it), `phone off`, `phone open sakari` */
  | { kind: "phone"; action: "on" | "off" | "open"; thread?: string }
  /** a reaction in a chat: `react rin_luck "👌"`, `react "viel Glück" "❤️" by kaishi` (`byText`: the ref is a piece of
   *  the message's text, not its id; emoji "" takes it back) */
  | { kind: "react"; ref: string; byText: boolean; emoji: string; by: string | null }
  | { kind: "return" }
  | { kind: "menu" };

export type StmtKind = Stmt["kind"];

/** What a card shows for a statement. */
export type Card = { ico: LucideIcon; title: string; detail: string; color: string | null };

type Spec<S extends { kind: StmtKind }> = {
  /** The Ren'Py keyword the line starts with, or null for a Python line (`$ narrator = …`). */
  word: string | null;
  /** The statement in a line's text (trimmed), or null if the line isn't one. */
  parse: (body: string) => S | null;
  format: (x: S) => string;
  /** What its card says; `before`: the stage just before it. */
  card: (x: S, before: Stage, m: Manifest | null) => Card;
  /** A card can edit it in place (else the card only shows it). */
  editable: boolean;
  /** Filled in enough to be written, beyond reading back as itself (a jump needs a target). */
  complete?: (x: S) => boolean;
  /** What a card that isn't written yet still needs. */
  hint?: (x: S) => string;
};

// ---------------------------------------------------------------- reading

const WORD = /^[A-Za-z_]\w*$/;

/** Split `with x` off the end of a statement's words (x a transition's name). */
function takeWith(words: string[]): string | undefined {
  const i = words.lastIndexOf("with");
  if (i < 0 || i !== words.length - 2 || !WORD.test(words[i + 1])) return undefined;
  const w = words[i + 1];
  words.splice(i);
  return w;
}

/** Split `at x` off (x may be `sprite(xalign=0.3, zoom=0.4)`, with spaces). */
function takeAt(rest: string): { rest: string; at?: string } {
  const m = /\s+at\s+(\w+(?:\([^)]*\))?)\s*(?=$|\s+with\s)/.exec(rest);
  if (!m) return { rest };
  return { rest: rest.slice(0, m.index) + rest.slice(m.index + m[0].length), at: m[1] };
}

/** `show`/`hide` and their image words (`at`, `with` taken off), or null. */
function imageWords(body: string, head: "show" | "hide") {
  const [first, ...restWords] = body.split(/\s+/);
  if (first !== head) return null;
  const { rest, at } = takeAt(" " + restWords.join(" "));
  const words = rest.trim().split(/\s+/).filter(Boolean);
  const w = takeWith(words);
  if (!words.length || !words.every(x => WORD.test(x)) || words[0] === "screen") return null;
  return { words, at, with: w };
}

const match = (re: RegExp, body: string) => re.exec(body);

// ---------------------------------------------------------------- cards

const dateText = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${m[3]}.${m[2]}.${m[1]}` : d; };
const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");
const withText = (x?: string) => (x ? ` with ${x}` : "");
const channelName = (c: string) => (c === "music" ? "Music" : c[0].toUpperCase() + c.slice(1));
const plainCard = (ico: LucideIcon, title: string, detail: string): Card => ({ ico, title, detail, color: null });

const NAMES = "names can't have spaces.";
const NUMBERS = "names can't have spaces, and times are numbers like 2.0.";

const jumpLike = <K extends "jump" | "call">(kind: K, title: string): Spec<{ kind: K; target: string }> => ({
  word: kind,
  parse: b => { const m = match(new RegExp(`^${kind}(?:\\s+(\\w+))?\\s*$`), b); return m ? { kind, target: m[1] ?? "" } : null; },
  format: x => `${kind} ${x.target}`.trimEnd(),
  card: x => plainCard(ArrowRight, title, x.target),
  editable: true,
  complete: x => x.target !== "",
  hint: () => "pick the scene it goes to.",
});

const STATEMENTS: { [K in StmtKind]: Spec<Extract<Stmt, { kind: K }>> } = {
  scene: {
    word: "scene",
    parse: b => {
      const [head, ...rest] = b.split(/\s+/);
      if (head !== "scene") return null;
      const words = [...rest];
      const w = takeWith(words);
      return words.length && words.every(x => WORD.test(x)) ? { kind: "scene", image: words.join(" "), with: w } : null;
    },
    format: x => `scene ${x.image}${withText(x.with)}`,
    card: x => plainCard(Image, "Background", join(x.image, x.with)),
    editable: true,
  },
  show: {
    word: "show",
    parse: b => { const r = imageWords(b, "show"); return r && { kind: "show", tag: r.words[0], attrs: r.words.slice(1), at: r.at, with: r.with }; },
    format: x => `show ${[x.tag, ...x.attrs].join(" ")}${x.at ? ` at ${x.at}` : ""}${withText(x.with)}`,
    card: (x, before, m) => {
      const old = before.sprites.find(s => s.tag === x.tag);
      const c = look(m, x.tag);
      const moves = x.at && old && x.at !== old.at;
      return {
        ico: UserRound, title: c.name, color: c.color,
        detail: join(!old && "comes in", x.attrs.join(" "), x.at && (moves ? `moves ${x.at}` : !old && x.at), x.with),
      };
    },
    editable: true,
    hint: x => (x.at && !/^\w+(\([^)]*\))?$/.test(x.at) ? "write the place like center or sprite(xalign=0.3)." : NAMES),
  },
  hide: {
    word: "hide",
    parse: b => { const r = imageWords(b, "hide"); return r && r.words.length === 1 && !r.at ? { kind: "hide", tag: r.words[0], with: r.with } : null; },
    format: x => `hide ${x.tag}${withText(x.with)}`,
    card: (x, _, m) => { const c = look(m, x.tag); return { ico: UserRoundMinus, title: c.name, detail: join("leaves", x.with), color: c.color }; },
    editable: true,
  },
  with: {
    word: "with",
    parse: b => { const m = match(/^with\s+(\w+)\s*$/, b); return m && { kind: "with", with: m[1] }; },
    format: x => `with ${x.with}`,
    card: x => plainCard(Sparkles, "Transition", x.with),
    editable: true,
  },
  play: {
    word: "play",
    parse: b => { const m = match(/^play\s+(\w+)\s+(\w+)(?:\s+fadein\s+([\d.]+))?\s*$/, b); return m && { kind: "play", channel: m[1], name: m[2], fadein: m[3] }; },
    format: x => `play ${x.channel} ${x.name}${x.fadein ? ` fadein ${x.fadein}` : ""}`,
    card: x => plainCard(Music, channelName(x.channel), join(x.name, x.fadein && `fades in ${+x.fadein}s`)),
    editable: true,
    hint: () => NUMBERS,
  },
  stop: {
    word: "stop",
    parse: b => { const m = match(/^stop\s+(\w+)(?:\s+fadeout\s+([\d.]+))?\s*$/, b); return m && { kind: "stop", channel: m[1], fadeout: m[2] }; },
    format: x => `stop ${x.channel}${x.fadeout ? ` fadeout ${x.fadeout}` : ""}`,
    card: x => plainCard(VolumeX, channelName(x.channel), join("stops", x.fadeout && `fades out ${+x.fadeout}s`)),
    editable: true,
    hint: () => NUMBERS,
  },
  pov: {
    word: null,
    parse: b => { const m = match(/^\$\s*narrator\s*=\s*(\w+)_n\s*$/, b); return m && { kind: "pov", who: m[1] }; },
    format: x => `$ narrator = ${x.who}_n`,
    card: (x, _, m) => { const c = look(m, x.who); return { ico: Eye, title: "Point of view", detail: c.name, color: c.color }; },
    editable: true,
  },
  date: {
    word: null,
    parse: b => { const m = match(/^\$\s*set_date\(\s*"([^"]*)"\s*(?:,\s*"([^"]*)"\s*)?\)\s*$/, b); return m && { kind: "date", date: m[1], time: m[2] }; },
    format: x => `$ set_date("${x.date}"${x.time ? `, "${x.time}"` : ""})`,
    card: x => plainCard(CalendarDays, "Date", join(dateText(x.date), x.time)),
    editable: true,
    complete: x => /^\d{4}-\d{2}-\d{2}$/.test(x.date),
    hint: () => "pick a day.",
  },
  time: {
    word: "time",
    parse: b => { const m = match(/^time\s+(\d{1,2}:\d{2})\s*$/, b); return m && { kind: "time", time: m[1] }; },
    format: x => `time ${x.time}`,
    card: x => plainCard(Clock, "Time", x.time),
    editable: true,
    hint: () => "write it like 13:12.",
  },
  jump: jumpLike("jump", "Continue at"),
  call: jumpLike("call", "Play"),
  pause: {
    word: "pause",
    parse: b => { const m = match(/^pause(?:\s+([\d.]+))?\s*$/, b); return m && { kind: "pause", seconds: m[1] }; },
    format: x => (x.seconds ? `pause ${x.seconds}` : "pause"),
    card: x => plainCard(Hourglass, "Pause", x.seconds ? `${+x.seconds}s` : "until a click"),
    editable: true,
    hint: () => NUMBERS,
  },
  phone: {
    word: "phone",
    parse: b => {
      const m = match(/^phone\s+(on|off)(?:\s+(\S.*?))?\s*$/, b);
      if (m) return { kind: "phone", action: m[1] as "on" | "off", thread: m[2] };
      const o = match(/^phone\s+open\s+(\S.*?)\s*$/, b);
      return o && { kind: "phone", action: "open", thread: o[1] };
    },
    format: x => `phone ${x.action}${x.thread ? " " + x.thread : ""}`,
    card: x => plainCard(Smartphone, "Phone", x.action === "open" ? `opens ${x.thread ?? ""}`.trim() : x.action === "on" ? join("comes out", x.thread) : "goes away"),
    editable: true,
    hint: () => "name the chat.",
  },
  react: {
    word: "react",
    parse: b => { const r = parseReact(b); return r && { kind: "react", ...r }; },
    format: x => formatReact(x),
    card: (x, _, m) => ({ ico: SmilePlus, title: "Reaction", detail: join(x.emoji || "taken back", x.by && `by ${look(m, x.by).name}`), color: null }),
    editable: false,
  },
  return: {
    word: "return",
    parse: b => (/^return\s*$/.test(b) ? { kind: "return" } : null),
    format: () => "return",
    card: () => plainCard(CornerDownLeft, "Scene ends", "back to where it was started from"),
    editable: false,
  },
  menu: {
    word: "menu",
    parse: b => (/^menu\s*:\s*$/.test(b) ? { kind: "menu" } : null),
    format: () => "menu:",
    card: () => plainCard(Split, "Choice", "the player picks one"),
    editable: false,
  },
};

const specOf = (x: Stmt) => STATEMENTS[x.kind] as unknown as Spec<Stmt>;
const SPECS = Object.values(STATEMENTS) as unknown as Spec<Stmt>[];

// ---------------------------------------------------------------- the API

/** The keywords of the statements above (a line starting with one isn't someone saying something). */
export const STATEMENT_WORDS: ReadonlySet<string> = new Set(SPECS.flatMap(s => (s.word ? [s.word] : [])));

/** The statement in a line's text (trimmed), or null. */
export function parseStmt(body: string): Stmt | null {
  for (const s of SPECS) { const x = s.parse(body); if (x) return x; }
  return null;
}

export const formatStmt = (x: Stmt) => specOf(x).format(x);

/** What a card says about a statement. `before`: the stage just before it. */
export const describe = (x: Stmt, before: Stage, m: Manifest | null) => specOf(x).card(x, before, m);

/** A card can edit it in place. */
export const isEditable = (x: Stmt) => specOf(x).editable;

/** The fields without the empty ones, in one order, to compare two statements. */
const shape = (x: Stmt) => JSON.stringify(Object.entries(x).filter(([, v]) => v !== undefined && v !== "").sort(([a], [b]) => a.localeCompare(b)));

/** The statement can be written: it reads back as itself (so a half-typed value never turns the card into a Ren'Py
 *  box or writes a broken line), and it's filled in enough. */
export function validStmt(x: Stmt) {
  const back = parseStmt(formatStmt(x));
  return !!back && shape(back) === shape(x) && (specOf(x).complete?.(x) ?? true);
}

/** What a card that isn't written yet still needs. */
export const stmtHint = (x: Stmt) => specOf(x).hint?.(x) ?? NAMES;

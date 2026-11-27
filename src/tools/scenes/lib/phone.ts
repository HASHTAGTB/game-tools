import type { Manifest } from "@/shared/lib/game";
import { unescapeText } from "./renpyText";
import type { Script } from "./script";

/** The game's phone, as far as a scene's script goes (renpy/game/core/statements.rpy, features/phone/README.md):
 *
 *    chat sakari:                        written live, message by message
 *    chat log rin & satoru yesterday:    already on the phone (date: today | yesterday | -2 | 2025-04-07)
 *        time 23:36
 *        rin "Text" (reply="rin_luck", photos=["incident_01"], typing=1.5, id="x")
 *        react rin_luck "👌" by kaishi
 *
 *  A chat is a group (`sakari`, declared in features/phone/content/chats/chats.rpy) or two people (`rin & satoru`).
 *  `reply=` / `react` point at an earlier message of the same chat: by its id, or by a piece of its text (the latest
 *  message that says it). Pure: no editor, no React. */

export type ChatTarget = { group: string } | { dm: [string, string] };
export type ChatHead = { target: ChatTarget; log: boolean; /** only for a log; null = today */ date: string | null };

const NAME = "[A-Za-z_]\\w*";
const HEAD = new RegExp(`^\\s*chat\\s+(log\\s+)?(${NAME})(?:\\s*&\\s*(${NAME}))?(?:\\s+(today|yesterday|[+-]?\\d+|\\d{4}-\\d\\d-\\d\\d))?\\s*:\\s*$`);

export function parseChatHead(line: string): ChatHead | null {
  const m = HEAD.exec(line);
  if (!m || (m[4] && !m[1])) return null;
  return { target: m[3] ? { dm: [m[2], m[3]] } : { group: m[2] }, log: !!m[1], date: m[4] && m[4] !== "today" ? m[4] : null };
}
export const formatChatHead = (h: ChatHead) => `chat ${h.log ? "log " : ""}${chatCode(h.target)}${h.log && h.date ? " " + h.date : ""}:`;

export const chatCode = (t: ChatTarget) => ("group" in t ? t.group : t.dm.join(" & "));
/** The same for both ways of writing a DM (`rin & satoru` = `satoru & rin`). */
export const chatKey = (t: ChatTarget) => ("group" in t ? t.group : [...t.dm].sort().join("&"));
export const sameChat = (a: ChatTarget, b: ChatTarget) => chatKey(a) === chatKey(b);

export const groupOf = (m: Manifest | null, id: string) => m?.chats?.find(g => g.id === id) ?? null;
/** Who's in a chat; null for a group the game doesn't declare (or while the game isn't read). */
export const membersOf = (m: Manifest | null, t: ChatTarget): string[] | null => ("group" in t ? groupOf(m, t.group)?.members ?? null : t.dm);

/** A log's date in words. */
export function dateWords(date: string | null) {
  if (!date) return "today";
  if (date === "yesterday" || date === "-1") return "yesterday";
  if (/^[+-]?\d+$/.test(date)) return +date < 0 ? `${-date} days ago` : `in ${+date} days`;
  const d = new Date(date + "T12:00");
  return isNaN(+d) ? date : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------- a message's arguments

/** What's in a message's parentheses, `(reply="x", photos=["a", "b"], typing=1.5, id="y")`, and whatever else the
 *  line has after its text (`with vpunch`), so nothing the editor doesn't know is lost when it writes it again. */
export type MsgArgs = {
  reply: string | null;
  id: string | null;
  /** null: written in a way the editor can't read (`["x"] * 3`), shown and kept as it is */
  photos: string[] | null;
  typing: number | null;
  /** the other arguments, as written (`name=value`) */
  other: string[];
  /** `photos=` as written, when `photos` is null */
  photosRaw: string | null;
  /** what comes after the parentheses */
  rest: string;
  /** the order the arguments are written in (`other` once for each of those), kept when the line is written again */
  order: ArgKey[];
};
type ArgKey = "reply" | "photos" | "typing" | "id" | "other";

const NO_ARGS: MsgArgs = { reply: null, id: null, photos: [], typing: null, other: [], photosRaw: null, rest: "", order: [] };
/** seconds: `1`, `1.5`, `.5`, `2.` */
const SECS = /^(\d+(\.\d*)?|\.\d+)$/;

/** Splits `s` at top-level commas (not in strings or brackets). */
function splitArgs(s: string) {
  const out: string[] = [];
  let depth = 0, q = false, start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === "\\") i++; else if (ch === '"') q = false; continue; }
    if (ch === '"') q = true;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map(x => x.trim()).filter(Boolean);
}
const STR = /^"((?:\\.|[^"\\])*)"$/;
const str = (v: string) => { const m = STR.exec(v.trim()); return m ? unescapeText(m[1]) : null; };
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function parseArgs(tail: string): MsgArgs {
  const t = tail.trim();
  if (!t.startsWith("(")) return { ...NO_ARGS, rest: t };
  // the closing parenthesis of the argument list
  let depth = 0, q = false, end = -1;
  for (let i = 0; i < t.length && end < 0; i++) {
    const ch = t[i];
    if (q) { if (ch === "\\") i++; else if (ch === '"') q = false; continue; }
    if (ch === '"') q = true; else if (ch === "(") depth++; else if (ch === ")" && --depth === 0) end = i;
  }
  if (end < 0) return { ...NO_ARGS, rest: t };
  const a: MsgArgs = { ...NO_ARGS, other: [], order: [], rest: t.slice(end + 1).trim() };
  for (const part of splitArgs(t.slice(1, end))) {
    const m = /^(\w+)\s*=\s*([\s\S]*)$/.exec(part);
    const k = m?.[1], v = m?.[2] ?? "";
    if (k === "reply" && str(v) !== null) { a.reply = str(v); a.order.push("reply"); }
    else if (k === "id" && str(v) !== null) { a.id = str(v); a.order.push("id"); }
    else if (k === "typing" && SECS.test(v.trim())) { a.typing = +v; a.order.push("typing"); }
    else if (k === "photos") {
      const one = str(v);
      const list = /^\[([\s\S]*)\]$/.exec(v.trim());
      const items = list ? splitArgs(list[1]).map(str) : null;
      if (one !== null) a.photos = [one];
      else if (items && items.every(x => x !== null)) a.photos = items as string[];
      else { a.photos = null; a.photosRaw = v.trim(); }
      a.order.push("photos");
    } else { a.other.push(part); a.order.push("other"); }
  }
  return a;
}

/** The arguments as written: in the order they had (new ones after, as reply, photos, typing, id), each once. */
export function formatArgs(a: MsgArgs): string {
  const one: Record<Exclude<ArgKey, "other">, () => string | null> = {
    reply: () => (a.reply !== null ? `reply=${quote(a.reply)}` : null),
    photos: () => (a.photos === null ? `photos=${a.photosRaw}` : a.photos.length ? `photos=[${a.photos.map(quote).join(", ")}]` : null),
    typing: () => (a.typing !== null ? `typing=${+a.typing.toFixed(2)}` : null),
    id: () => (a.id !== null ? `id=${quote(a.id)}` : null),
  };
  const out: string[] = [], done = new Set<ArgKey>();
  let k = 0;
  for (const key of [...a.order, "reply", "photos", "typing", "id"] as ArgKey[]) {
    if (key === "other") { if (k < a.other.length) out.push(a.other[k++]); continue; }
    if (done.has(key)) continue;
    done.add(key);
    const s = one[key]();
    if (s !== null) out.push(s);
  }
  out.push(...a.other.slice(k));
  return [out.length ? `(${out.join(", ")})` : "", a.rest].filter(Boolean).join(" ");
}

/** The arguments a message line has, changed by `f`, as the line's new tail. */
export const withArgs = (tail: string, f: (a: MsgArgs) => Partial<MsgArgs>) => { const a = parseArgs(tail); return formatArgs({ ...a, ...f(a) }); };

// ---------------------------------------------------------------- the messages in a script

/** A message on a phone: in this scene (`line`) or an earlier one (`scene`). */
export type ChatMsg = {
  chat: string;
  who: string;
  /** the text, as the player reads it */
  text: string;
  id: string | null;
  photos: string[];
  /** the time it's stamped with (the last `time` before it in its block), if any */
  time: string | null;
  line: number;
  /** filled in for messages from other scenes */
  scene?: { path: string; title: string };
};

/** A reaction in this scene. */
export type ChatReact = { chat: string; line: number; ref: string; emoji: string; by: string | null };

/** `react rin_luck "👌" by kaishi`, `react "viel Glück" ""` */
const REACT = /^react\s+(?:([A-Za-z_]\w*)|"((?:\\.|[^"\\])*)")\s+"((?:\\.|[^"\\])*)"(?:\s+by\s+([A-Za-z_]\w*))?\s*$/;
export function parseReact(body: string) {
  const m = REACT.exec(body.trim());
  return m && { ref: m[1] ?? unescapeText(m[2]), byText: m[1] === undefined, emoji: unescapeText(m[3]), by: m[4] ?? null };
}
export const formatReact = (x: { ref: string; byText: boolean; emoji: string; by: string | null }) =>
  `react ${x.byText ? quote(x.ref) : x.ref} ${quote(x.emoji)}${x.by ? " by " + x.by : ""}`;

/** A chat block in this scene: its head line `from` to its last line `to`. */
export type ChatBlock = { from: number; to: number; key: string; head: ChatHead };

/** Every chat block, message and reaction in a script, in order. */
export function chatsIn(s: Script): { msgs: ChatMsg[]; reacts: ChatReact[]; blocks: ChatBlock[] } {
  const msgs: ChatMsg[] = [], reacts: ChatReact[] = [], blocks: ChatBlock[] = [];
  let chat: { key: string; indent: number } | null = null;
  let time: string | null = null;
  s.parsed.forEach((p, i) => {
    if (!p || p.kind === "blank" || p.kind === "comment") return;
    const text = s.lines[i], n = i + 1;
    if (chat && p.indent <= chat.indent) chat = null;
    const head = !chat && p.kind === "code" ? parseChatHead(text) : null;
    if (head) { chat = { key: chatKey(head.target), indent: p.indent }; time = null; blocks.push({ from: n, to: n, key: chat.key, head }); return; }
    if (!chat) return;
    blocks[blocks.length - 1].to = n;
    if (p.kind === "stmt" && p.stmt.kind === "time") time = p.stmt.time;
    else if (p.kind === "stmt" && p.stmt.kind === "react") reacts.push({ chat: chat.key, line: n, ref: p.stmt.ref, emoji: p.stmt.emoji, by: p.stmt.by });
    else if (p.kind === "say" && p.who && p.who !== "extend") {
      const a = parseArgs(p.tail);
      msgs.push({ chat: chat.key, who: p.who, text: unescapeText(text.slice(p.from, p.to)), id: a.id, photos: a.photos ?? [], time, line: n });
    }
  });
  return { msgs, reacts, blocks };
}

/** The message `ref` points at among `prior` (oldest first): the latest one with that id, or (no id matches) the latest
 *  one whose text has it in it. */
export function resolveRef(ref: string, prior: ChatMsg[]): ChatMsg | null {
  for (let i = prior.length - 1; i >= 0; i--) if (prior[i].id === ref) return prior[i];
  if (!ref) return null;
  for (let i = prior.length - 1; i >= 0; i--) if (prior[i].text.includes(ref)) return prior[i];
  return null;
}

/** How to point at `target`: its id if it has one, else the shortest piece of its text (three words or fewer to start
 *  with) that finds it; null when neither works (a photo without caption or id). */
export function refFor(target: ChatMsg, prior: ChatMsg[]): { ref: string; byText: boolean } | null {
  if (target.id) return { ref: target.id, byText: false };
  const words = target.text.split(/\s+/).filter(Boolean);
  for (let n = Math.min(3, words.length); n <= words.length; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const piece = words.slice(i, i + n).join(" ");
      // a piece that's also some message's id would find that one instead
      if (resolveRef(piece, prior) === target) return { ref: piece, byText: true };
    }
  }
  return null;
}

/** A new id for a message: `rin_photos`, `kaishi_die`, not taken by `taken`. */
export function newId(m: ChatMsg, taken: Set<string>) {
  const word = (m.text.split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = `${m.who}_${m.photos.length && !m.text ? "photos" : word || "msg"}`;
  let id = base, k = 2;
  while (taken.has(id)) id = `${base}_${k++}`;
  return id;
}

/** What a message shows in a quote: its text, or its photos. */
export const snippet = (m: { text: string; photos: string[] }) =>
  m.text || (m.photos.length === 1 ? "Photo" : m.photos.length ? `${m.photos.length} photos` : "(empty)");

/** Everything the box view and the checks need to know about the scene's chats: this scene's messages and reactions,
 *  and those of the scenes before it (`history`, oldest first). */
export type PhoneIndex = {
  msgs: ChatMsg[];
  reacts: ChatReact[];
  blocks: ChatBlock[];
  history: ChatMsg[];
  /** false while the earlier scenes are still read: a reply or reaction that finds nothing may find something then */
  known: boolean;
};

/** The chat block line `line` is in (its head included). */
export const blockAt = (p: PhoneIndex, line: number) => p.blocks.find(b => line >= b.from && line <= b.to) ?? null;
export const msgAt = (p: PhoneIndex, line: number) => p.msgs.find(m => m.line === line) ?? null;

export function phoneIndex(s: Script, history: ChatMsg[] | null): PhoneIndex {
  return { ...chatsIn(s), history: history ?? [], known: history !== null };
}

/** The messages of `chat` said before line `line` of this scene: the earlier scenes', then this one's. */
export const priorAt = (p: PhoneIndex, chat: string, line: number) =>
  [...p.history.filter(m => m.chat === chat), ...p.msgs.filter(m => m.chat === chat && m.line < line)];

/** The reactions in this scene that land on `msg`: each person's latest one (a later reaction replaces theirs, `""`
 *  takes it back), as the phone shows them. */
export function reactsOn(p: PhoneIndex, msg: ChatMsg) {
  const latest = new Map<string, ChatReact>();
  for (const r of p.reacts) if (resolveRef(r.ref, priorAt(p, r.chat, r.line)) === msg) latest.set(r.by ?? "", r);
  return [...latest.values()].filter(r => r.emoji);
}

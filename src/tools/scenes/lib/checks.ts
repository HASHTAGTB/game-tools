import type { Manifest } from "@/shared/lib/game";
import { labelOf, labelsIn } from "./labels";
import { PAIRED, tokenize } from "./renpyText";
import { inScript, suggestLabel, type Script } from "./script";
import { chatKey, groupOf, membersOf, parseArgs, parseChatHead, phoneIndex, priorAt, resolveRef, type ChatHead, type ChatMsg, type PhoneIndex } from "./phone";
import { EMPTY_STAGE, playScript } from "./stage";
import { formatStmt } from "./statements";

/** Problems in a scene, in plain words, each on a line and with a fix where there's an obvious one. Things the game
 *  doesn't have yet (a sprite, a background) are only notes: the art often comes later. */

export type Problem = {
  /** 1-based line */
  line: number;
  /** offsets into the line (default: the whole line) */
  from?: number;
  to?: number;
  severity: "error" | "warning" | "info";
  message: string;
  fix?: { label: string; /** the line's new text (may hold several lines), or for `at: "end"` text added at the end of the file */ text: string; at?: "line" | "end" | "after" | "start";
    /** the line's text when it was checked: the fix only applies while the line still reads so */
    was?: string;
    /** instead: define a new character with this name in the game, then use their variable for the speaker at from–to */
    create?: string };
};

export type CheckContext = {
  manifest: Manifest | null;
  /** labels of the other scenes (and the game's own, from the manifest); null while they're being read */
  labels: Set<string> | null;
  /** the scene's title (its file name if it has none), for label suggestions */
  title: string;
  /** the chat messages of the scenes before this one, for replies and reactions; null while they're read */
  history?: ChatMsg[] | null;
};

/** Tags Ren'Py knows (renpy.org/doc/html/text.html). */
const KNOWN_TAGS = new Set([...PAIRED, "w", "p", "nw", "fast", "image", "space", "vspace", "outlinecolor", "alt", "noalt", "rt", "rb", "art", "done", "clear"]);

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
/** The closest of `options` to `x`, if it's close enough to be a typo. */
function closest(x: string, options: string[]) {
  let best: string | null = null, bd = Infinity;
  for (const o of options) { const dd = distance(x.toLowerCase(), o.toLowerCase()); if (dd < bd) { bd = dd; best = o; } }
  return best && bd <= Math.max(1, Math.floor(x.length / 4)) ? best : null;
}

/** A display name for a speaker typed as a variable: "frau_tanaka" → "Frau tanaka", "Test" stays. */
const speakerName = (who: string) => { const n = who.replace(/_+/g, " ").trim(); return n.charAt(0).toUpperCase() + n.slice(1); };

export function checkScene(s: Script, cx: CheckContext): Problem[] {
  const out: Problem[] = [];
  const { lines, layout, parsed } = s;
  const m = cx.manifest;

  const label = labelOf(s);
  if (!label) {
    out.push({
      line: Math.max(1, layout.first - 1), severity: "error", message: "The scene has no label, so nothing can jump to it.",
      fix: { label: `Add label ${suggestLabel(cx.title)}`, at: layout.front ? "after" : "start", text: `label ${suggestLabel(cx.title)}:` },
    });
  }

  const stages = playScript(s);
  const chars = new Map(m?.characters.map(c => [c.id, c]) ?? []);
  const positions = new Set(m?.positions.map(p => p.name) ?? []);
  const transitions = new Set(m?.transitions ?? []);
  const ownLabels = labelsIn(s);
  let povWarned = false, seenLabel = false;
  /** indent of the `chat …:` block we're in, if any, and its head */
  let chatIndent: number | null = null;
  let chat: ChatHead | null = null;
  const phone: PhoneIndex = phoneIndex(s, cx.history === undefined ? [] : cx.history);
  const chatName = (h: ChatHead) => ("group" in h.target ? groupOf(m, h.target.group)?.title ?? h.target.group : h.target.dm.map(id => chars.get(id)?.name ?? id).join(" & "));

  parsed.forEach((p, i) => {
    const n = i + 1, text = lines[i];
    if (!p || !inScript(layout, n)) return;
    const before = i > 0 ? stages[i - 1] : EMPTY_STAGE;
    const ind = "indent" in p ? p.indent : null;

    if (p.kind !== "blank" && chatIndent !== null && ind !== null && ind <= chatIndent) { chatIndent = null; chat = null; }
    if (p.kind === "code" && /^\s*chat\b/.test(text)) {
      const h = parseChatHead(text);
      if (h) { chatIndent = p.indent; chat = h; checkChatHead(out, n, h, m, chars); }
      else if (/:\s*$/.test(text)) out.push({ line: n, severity: "error", message: "The game can't read this chat line. Write it like chat sakari: or chat log rin & satoru yesterday:" });
    }

    if (p.kind === "label") { seenLabel = true; return; }
    if (p.kind !== "blank" && p.kind !== "comment" && seenLabel && ind === 0) {
      out.push({ line: n, severity: "error", message: "Lines of a scene go indented under its label.", fix: { label: "Indent it", text: "    " + text } });
    }

    switch (p.kind) {
      case "bad":
        out.push({ line: n, severity: "error", message: p.reason });
        return;
      case "say": {
        if (m && p.who && p.who !== "extend" && !chars.has(p.who)) {
          const byName = m.characters.find(c => c.name.toLowerCase() === p.who!.toLowerCase());
          const guess = byName?.id ?? closest(p.who, [...chars.keys()]);
          out.push({
            line: n, from: p.indent, to: p.indent + p.who.length, severity: "error",
            message: `The game has no character called "${p.who}".` + (guess ? ` Did you mean ${guess}?` : ""),
            fix: guess ? { label: `Use ${guess}`, text: text.slice(0, p.indent) + guess + text.slice(p.indent + p.who.length) }
              : { label: `Add ${speakerName(p.who)} to the game`, text, create: speakerName(p.who) },
          });
        }
        if (!p.who && !before.pov && !povWarned && chatIndent === null) {
          povWarned = true;
          out.push({ line: n, severity: "warning", message: "No point of view is set yet, so the narration has no textbox colour. Add a POV card before it." });
        }
        checkTags(out, n, p.from, text.slice(p.from, p.to));
        if (chat && p.who && p.who !== "extend") checkMessage(out, n, p.tail, p.who, chat, chatName(chat), m, chars, phone, cx.history !== null);
        return;
      }
      case "choice":
        checkTags(out, n, p.from, text.slice(p.from, p.to));
        return;
      case "stmt": break;
      default: return;
    }

    const x = p.stmt;
    const at = (word: string) => { const k = text.indexOf(word, p.indent); return k < 0 ? {} : { from: k, to: k + word.length }; };
    const rewrite = (next: typeof x) => text.slice(0, p.indent) + formatStmt(next);
    if ("with" in x && x.with && m && !transitions.has(x.with)) {
      const guess = closest(x.with, [...transitions]);
      out.push({
        line: n, ...at(x.with), severity: "error", message: `There's no transition called "${x.with}".` + (guess ? ` Did you mean ${guess}?` : ""),
        ...(guess && { fix: { label: `Use ${guess}`, text: rewrite({ ...x, with: guess } as typeof x) } }),
      });
    }
    switch (x.kind) {
      case "scene":
        if (m?.media && !m.backgrounds.includes(x.image)) out.push({ line: n, ...at(x.image), severity: "info", message: `The game has no background "${x.image}" yet.` });
        break;
      case "show": {
        const shown = before.sprites.some(sp => sp.tag === x.tag);
        if (!shown && !x.at) {
          out.push({
            line: n, severity: "warning", message: `${chars.get(x.tag)?.name ?? x.tag} comes on screen here: say where they stand.`,
            fix: { label: "Put them in the center", text: rewrite({ ...x, at: "center" }) },
          });
        }
        if (x.at && m) {
          const name = /^(\w+)/.exec(x.at)![1];
          if (!positions.has(name)) {
            const stripped = name.replace(/^sprite_/, "");
            const guess = positions.has(stripped) ? stripped : stripped === "default" ? "center" : closest(name, [...positions]);
            out.push({
              line: n, ...at(x.at), severity: "error", message: `There's no position called "${name}".` + (guess ? ` Did you mean ${guess}?` : ""),
              ...(guess && { fix: { label: `Use ${guess}`, text: rewrite({ ...x, at: guess }) } }),
            });
          }
        }
        if (m?.media) {
          const outfits = m.sprites[x.tag];
          const attrs = x.attrs.length ? x.attrs : before.sprites.find(sp => sp.tag === x.tag)?.attrs ?? [];
          if (!outfits) out.push({ line: n, ...at(x.tag), severity: "info", message: `The game has no sprites for ${chars.get(x.tag)?.name ?? x.tag} yet.` });
          else if (attrs.length && !(outfits[attrs[0]] ?? []).includes(attrs.slice(1).join(" "))) {
            out.push({ line: n, severity: "info", message: `There's no image "${[x.tag, ...attrs].join(" ")}" yet.` });
          }
        }
        break;
      }
      case "hide":
        if (!before.sprites.some(sp => sp.tag === x.tag)) out.push({ line: n, severity: "warning", message: `${chars.get(x.tag)?.name ?? x.tag} isn't on screen here.` });
        break;
      case "play":
        if (m?.media && x.channel === "music" && !m.music.includes(x.name)) out.push({ line: n, ...at(x.name), severity: "warning", message: `The game has no music called "${x.name}".` });
        break;
      case "pov":
        if (m && !chars.get(x.who)?.pov) out.push({ line: n, severity: "error", message: `${x.who} has no narrator variant (${x.who}_n), so the scene can't be told from their view.` });
        break;
      case "react": {
        if (!chat) { out.push({ line: n, severity: "error", message: "A reaction only works inside a chat block." }); break; }
        const who = x.by ? chars.get(x.by)?.name ?? x.by : null;
        const members = membersOf(m, chat.target);
        if (x.by && members && !members.includes(x.by)) out.push({ line: n, severity: "error", message: `${who} isn't in ${chatName(chat)}.` });
        if (cx.history !== null && !resolveRef(x.ref, priorAt(phone, chatKey(chat.target), n))) {
          out.push({ line: n, severity: "error", message: `The reaction finds no message: nothing in ${chatName(chat)} before this ${x.byText ? `says „${x.ref}“` : `is called ${x.ref}`}.` });
        }
        break;
      }
      case "jump": case "call":
        if (chatIndent !== null) out.push({ line: n, severity: "error", message: "A chat block can't jump away: end the chat first (un-indent the jump)." });
        if (!x.target) { out.push({ line: n, severity: "error", message: "Pick the scene this continues at." }); break; }
        if (cx.labels && !ownLabels.has(x.target) && !cx.labels.has(x.target)) {
          out.push({ line: n, ...at(x.target), severity: "error", message: `No scene has the label "${x.target}".` });
        }
        break;
    }
  });
  for (const p of out) if (p.fix && p.fix.at !== "end") p.fix.was = lines[p.line - 1];
  return out;
}

/** A chat's head: a group the game declares, or two people. */
function checkChatHead(out: Problem[], line: number, h: ChatHead, m: Manifest | null, chars: Map<string, unknown>) {
  if (!m) return;
  if ("dm" in h.target) {
    for (const id of h.target.dm) if (!chars.has(id)) out.push({ line, severity: "error", message: `The game has no character called "${id}".` });
    return;
  }
  if (!m.chats?.length || groupOf(m, h.target.group)) return;   // no groups read (chats.rpy missing): nothing to check against
  out.push({ line, severity: "error", message: chars.has(h.target.group)
    ? `${h.target.group} is a person, not a group: a chat with them is written as two people (${h.target.group} & …).`
    : `The phone has no group chat "${h.target.group}" (groups are declared in features/phone/content/chats/chats.rpy).` });
}

/** A message in a chat: from someone in it, with arguments the game takes, and a reply that finds its message. */
function checkMessage(out: Problem[], line: number, tail: string, who: string, h: ChatHead, name: string, m: Manifest | null,
  chars: Map<string, { name: string }>, phone: PhoneIndex, historyKnown: boolean) {
  const members = membersOf(m, h.target);
  if (members && !members.includes(who)) out.push({ line, severity: "error", message: `${chars.get(who)?.name ?? who} isn't in ${name}. End the chat block for spoken lines.` });
  const a = parseArgs(tail);
  if (a.typing && h.log) out.push({ line, severity: "warning", message: "Typing only shows in a live chat. A chat that arrived earlier ignores it." });
  const takes: Record<string, string> = { reply: "a text in quotes", id: "a name in quotes", typing: "seconds (typing=1.5)" };
  for (const o of a.other) {
    const k = /^(\w+)/.exec(o)?.[1];
    if (k && takes[k]) out.push({ line, severity: "warning", message: `The editor can't read ${o}: ${k} takes ${takes[k]}.` });
    else out.push({ line, severity: "error", message: `A message doesn't take ${k ?? o}: only reply, id, photos and typing.` });
  }
  // a comment after the line is fine
  const rest = a.rest.replace(/^#.*$|\s+#.*$/, "");
  if (rest) out.push({ line, severity: "error", message: `A message can't have "${rest}" after it.` });
  if (a.reply !== null && historyKnown && !resolveRef(a.reply, priorAt(phone, chatKey(h.target), line))) {
    out.push({ line, severity: "error", message: `The reply finds no message: nothing in ${name} before this says „${a.reply}“ or is called that.` });
  }
  if (a.photos && m?.photos && Object.keys(m.photos).length) {
    for (const ph of a.photos) if (!m.photos[ph] && !m.imageFiles[ph]) out.push({ line, severity: "info", message: `The phone has no photo "${ph}" yet.` });
  }
}

/** Unknown text tags, and paired ones left open. */
function checkTags(out: Problem[], line: number, offset: number, raw: string) {
  const open: { name: string; from: number; to: number }[] = [];
  for (const t of tokenize(raw)) {
    if (t.kind !== "tag") continue;
    const pos = { from: offset + t.from, to: offset + t.to };
    if (t.name.startsWith("#")) continue;   // {#comment}
    if (!KNOWN_TAGS.has(t.name)) { out.push({ line, ...pos, severity: "warning", message: `Ren'Py doesn't know the text tag {${t.name}}.` }); continue; }
    if (!PAIRED.has(t.name)) continue;
    if (!t.close) open.push({ name: t.name, ...pos });
    else {
      const k = open.map(o => o.name).lastIndexOf(t.name);
      if (k < 0) out.push({ line, ...pos, severity: "warning", message: `{/${t.name}} closes something that was never opened.` });
      else open.splice(k, 1);
    }
  }
  for (const o of open) out.push({ line, from: o.from, to: o.to, severity: "warning", message: `{${o.name}} is never closed with {/${o.name}}.` });
}

import type { ChangeSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Box, Place } from "./blocks";
import { lineIds, moveLineIds, scriptField } from "./editorState";
import { freeLabel, jumpsTo, labelLines, labelName } from "./labels";
import { escapeText } from "./renpyText";
import { indentOf, pad, parseLine, sayText } from "./script";
import { formatStmt, type Stmt } from "./statements";
import { formatChatHead, withArgs, type ChatHead, type MsgArgs } from "./phone";

/** What the box view does to the file. Each edit rewrites only the lines of the boxes involved, through the (hidden)
 *  CodeMirror view that holds the document, so Ctrl+Z, the checks and the source view all keep working. Functions
 *  that change where lines are return the line the cursor should go to. */

const ev = (view: EditorView, changes: ChangeSpec, userEvent: string) => view.dispatch({ changes, userEvent });
const isBlank = (view: EditorView, n: number) => n >= 1 && n <= view.state.doc.lines && !view.state.doc.line(n).text.trim();

/** Put `lines` (without the place's indent; nested lines carry their own extra indent) at `place`. Returns the line
 *  number of the first one. */
export function insertAt(view: EditorView, place: Place, lines: string[]): number {
  const L = view.state.doc.line(place.after);
  const gap = place.tight ? "" : "\n";
  const text = lines.map(l => (l ? pad(place.indent) + l : "")).join("\n");
  ev(view, { from: L.to, insert: "\n" + gap + text }, "input.box");
  return place.after + 1 + (place.tight ? 0 : 1);
}

/** Remove lines `from`–`to`, and one blank line next to them so gaps don't pile up. */
export function removeLines(view: EditorView, from: number, to: number) {
  const { doc } = view.state;
  let a = from, b = to;
  if (isBlank(view, a - 1)) a--;
  else if (isBlank(view, b + 1)) b++;
  const start = a > 1 ? doc.line(a - 1).to : doc.line(a).from;
  const end = a > 1 ? doc.line(b).to : Math.min(doc.length, doc.line(b).to + 1);
  ev(view, { from: start, to: end }, "delete.box");
}

/** The box `b` goes away. Returns the line to put the cursor on (the line before it). A choice takes its routes
 *  (their labels and lines) with it, and the label where they met goes too, so its lines join the section again. */
export function removeBox(view: EditorView, b: Box): number {
  if (b.kind === "menu") removeMenu(view, b);
  else removeLines(view, b.from, b.to);
  return Math.max(1, b.from - 1);
}

/** Lines `a`–`b` as a change that takes their line breaks too. */
const wholeLines = (view: EditorView, a: number, b: number) => {
  const { doc } = view.state;
  return { from: doc.line(a).from, to: Math.min(doc.length, doc.line(b).to + 1) };
};

function removeMenu(view: EditorView, b: Extract<Box, { kind: "menu" }>) {
  const { doc } = view.state;
  const gone: [number, number][] = [];
  let a = b.from;
  if (isBlank(view, a - 1)) a--;
  gone.push([a, b.to]);
  const routes = (m: Extract<Box, { kind: "menu" }>) => {
    for (const o of m.options) {
      if (o.route) { const r = labelLines(doc, o.route); if (r) gone.push(r); }
      for (const x of o.boxes) if (x.kind === "menu") routes(x);
    }
  };
  routes(b);
  // where the routes met: unwrapped, unless something else still jumps there
  if (b.cont) {
    const name = labelName(doc.line(b.cont).text);
    const to = name && jumpsTo(name);
    let used = false;
    if (to) for (let n = 1; n <= doc.lines && !used; n++) used = to.test(doc.line(n).text) && !gone.some(([x, y]) => n >= x && n <= y);
    if (!used) gone.push([b.cont, b.cont]);
  }
  const changes = gone
    .sort((x, y) => x[0] - y[0])
    .filter((r, i, all) => !all.slice(0, i).some(o => r[0] >= o[0] && r[1] <= o[1]))
    .map(([x, y], i) => (i === 0 && x > 1 ? { from: doc.line(x - 1).to, to: doc.line(y).to } : wholeLines(view, x, y)));
  view.dispatch({ changes, userEvent: "delete.box" });
}

/** Replace the text between a say line's quotes, as a small change (so typing undoes in sensible steps). */
export function setSayRaw(view: EditorView, line: number, raw: string) {
  const L = view.state.doc.line(line);
  const p = parseLine(L.text);
  if (p.kind !== "say" && p.kind !== "choice") return;
  const old = L.text.slice(p.from, p.to);
  if (old === raw) return;
  let s = 0;
  while (s < old.length && s < raw.length && old[s] === raw[s]) s++;
  let e = 0;
  while (e < old.length - s && e < raw.length - s && old[old.length - 1 - e] === raw[raw.length - 1 - e]) e++;
  ev(view, { from: L.from + p.from + s, to: L.from + p.to - e, insert: raw.slice(s, raw.length - e) }, "input.type");
}

export function setSpeaker(view: EditorView, line: number, who: string | null) {
  const L = view.state.doc.line(line);
  const p = parseLine(L.text);
  if (p.kind !== "say") return;
  ev(view, { from: L.from + p.indent, to: L.from + p.from, insert: (who ? who + " " : "") + '"' }, "input.speaker");
}

/** Enter in a box: `before` stays on the line (with its tail), `after` starts a new line below for the same speaker.
 *  Returns the new line. */
export function splitSay(view: EditorView, b: Extract<Box, { kind: "say" }>, before: string, after: string, tight: boolean): number {
  const L = view.state.doc.line(b.from);
  const first = pad(b.indent) + sayText(b.who, before, b.tail);
  const second = pad(b.indent) + sayText(b.who, after);
  ev(view, { from: L.from, to: L.to, insert: first + "\n" + (tight ? "" : "\n") + second }, "input.box");
  return b.from + 1 + (tight ? 0 : 1);
}

/** Backspace at the start of `b`: its text goes to the end of `prev` (with a space between words), and the line
 *  goes. Only for the same speaker, and only when `b` has nothing after its text (`with vpunch`, `(reply=…)`) that
 *  would be lost. Returns whether a space was put in, or null if the lines weren't joined. */
export function joinSays(view: EditorView, prev: Extract<Box, { kind: "say" }>, b: Extract<Box, { kind: "say" }>): boolean | null {
  if (prev.who !== b.who || b.tail) return null;
  const { doc } = view.state;
  const P = doc.line(prev.from), L = doc.line(b.from);
  const pp = parseLine(P.text);
  if (pp.kind !== "say") return null;
  const end = P.from + pp.to;
  const gap = /\S$/.test(prev.raw) && /^\S/.test(b.raw);
  view.dispatch({
    changes: [{ from: end, insert: (gap ? " " : "") + b.raw }, { from: P.to, to: L.to }],
    userEvent: "delete.join",
  });
  return gap;
}

export function setStmt(view: EditorView, line: number, stmt: Stmt) {
  const L = view.state.doc.line(line);
  const text = pad(indentOf(L.text)) + formatStmt(stmt);
  if (text !== L.text) ev(view, { from: L.from, to: L.to, insert: text }, "input.stmt");
}

export function setNote(view: EditorView, line: number, text: string) {
  const L = view.state.doc.line(line);
  const next = pad(indentOf(L.text)) + "# " + text.replace(/\n/g, " ");
  if (next !== L.text) ev(view, { from: L.from, to: L.to, insert: next }, "input.type");
}

/** Lines `from`–`to` replaced by `text` (dedented by `indent`; written back with it). */
export function setRaw(view: EditorView, from: number, to: number, indent: number, text: string) {
  const { doc } = view.state;
  const next = text.split("\n").map(l => (l.trim() ? pad(indent) + l : "")).join("\n");
  const a = doc.line(from).from, b = doc.line(to).to;
  const old = doc.sliceString(a, b);
  if (old === next) return;
  // only what changed, so the lines around the caret keep their names (lineIds) and undo stays small
  let p = 0;
  while (p < old.length && p < next.length && old[p] === next[p]) p++;
  let e = 0;
  while (e < old.length - p && e < next.length - p && old[old.length - 1 - e] === next[next.length - 1 - e]) e++;
  ev(view, { from: a + p, to: b - e, insert: next.slice(p, next.length - e) }, "input.type");
}
/** The lines `from`–`to` as a raw box edits them: without their shared indent. */
export function rawText(view: EditorView, from: number, to: number, indent: number) {
  const out: string[] = [];
  for (let n = from; n <= to; n++) { const t = view.state.doc.line(n).text; out.push(t.slice(Math.min(indent, indentOf(t)))); }
  return out.join("\n");
}

/** Swap `b` with its neighbour `other` (the one just above or below it in the same list). */
export function swapBoxes(view: EditorView, a: Box, b: Box) {
  const [first, second] = a.from < b.from ? [a, b] : [b, a];
  const { doc } = view.state;
  const firstText = doc.sliceString(doc.line(first.from).from, doc.line(first.to).to);
  const between = doc.sliceString(doc.line(first.to).to, doc.line(second.from).from);
  const secondText = doc.sliceString(doc.line(second.from).from, doc.line(second.to).to);
  // the lines keep their names where they go
  const ids = view.state.field(lineIds), names = (from: number, to: number) => ids.slice(from - 1, to);
  const moved = [...names(second.from, second.to), ...names(first.to + 1, second.from - 1), ...names(first.from, first.to)];
  view.dispatch({
    changes: { from: doc.line(first.from).from, to: doc.line(second.to).to, insert: secondText + between + firstText },
    effects: moveLineIds.of({ at: first.from, ids: moved }), userEvent: "move.box",
  });
}

// ---------------------------------------------------------------- choices

/** Ren'Py text for an option's button. */
export const optionLine = (text: string, cond = "") => `"${escapeText(text)}"${cond ? " " + cond : ""}:`;

/** A new choice at scene level, with two routes as labels of this file that meet again under a third. The rest of
 *  the section continues under that third label, so nothing after the choice changes. */
export function insertChoice(view: EditorView, place: Place, base: string, taken: Set<string>): number {
  const o1 = freeLabel("opt", base, taken), o2 = freeLabel("opt", base, taken), con = freeLabel("con", base, taken);
  const L = view.state.doc.line(place.after);
  const lines = [
    pad(place.indent) + "menu:",
    pad(place.indent + 4) + optionLine("Option 1"),
    pad(place.indent + 8) + `jump ${o1}`,
    pad(place.indent + 4) + optionLine("Option 2"),
    pad(place.indent + 8) + `jump ${o2}`,
    "",
    `label ${o1}:`,
    `    jump ${con}`,
    "",
    `label ${o2}:`,
    `    jump ${con}`,
    "",
    `label ${con}:`,
  ];
  ev(view, { from: L.to, insert: "\n" + (place.tight ? "" : "\n") + lines.join("\n") }, "input.box");
  return place.after + 1 + (place.tight ? 0 : 1);
}

/** Another option for a choice whose options are routes (labels) or plain blocks. */
export function addOption(view: EditorView, menu: Extract<Box, { kind: "menu" }>, base: string, taken: Set<string>) {
  const last = menu.options[menu.options.length - 1];
  const ind = last ? last.indent : menu.indent + 4;
  const n = menu.options.length + 1;
  const { doc } = view.state;
  const end = doc.line(menu.to);
  const routed = menu.options.find(o => o.route && o.hiddenJump);
  if (routed && menu.cont) {
    const label = freeLabel("opt", base, taken);
    const conName = labelName(doc.line(menu.cont).text) ?? "";
    const C = doc.line(menu.cont);
    view.dispatch({
      changes: [
        { from: end.to, insert: `\n${pad(ind)}${optionLine(`Option ${n}`)}\n${pad(ind + 4)}jump ${label}` },
        { from: C.from, insert: `label ${label}:\n    jump ${conName}\n\n` },
      ],
      userEvent: "input.box",
    });
    return;
  }
  ev(view, { from: end.to, insert: `\n${pad(ind)}${optionLine(`Option ${n}`)}\n${pad(ind + 4)}pass` }, "input.box");
}

/** An option that jumps straight to where the routes meet gets a route of its own (a new label that jumps on to the
 *  meeting point), so lines can go in it. */
export function routeOption(view: EditorView, menu: Extract<Box, { kind: "menu" }>, index: number, base: string, taken: Set<string>) {
  const o = menu.options[index];
  if (!menu.cont || !o.boxes[0]) return;
  const { doc } = view.state;
  const label = freeLabel("opt", base, taken);
  const J = doc.line(o.boxes[0].from), C = doc.line(menu.cont);
  const conName = labelName(C.text) ?? "";
  const ind = indentOf(J.text);
  view.dispatch({
    changes: [
      { from: J.from, to: J.to, insert: `${pad(ind)}jump ${label}` },
      { from: C.from, insert: `label ${label}:\n    jump ${conName}\n\n` },
    ],
    userEvent: "input.box",
  });
}

export function setOptionText(view: EditorView, line: number, text: string) {
  setSayRaw(view, line, escapeText(text));
}

/** An option goes, with its route label if it has one (the route's lines go too). */
export function removeOption(view: EditorView, menu: Extract<Box, { kind: "menu" }>, index: number) {
  const o = menu.options[index];
  const { doc } = view.state;
  const changes: ChangeSpec[] = [];
  const optEnd = index + 1 < menu.options.length ? menu.options[index + 1].line - 1 : menu.to;
  changes.push({ from: doc.line(o.line - 1).to, to: doc.line(optEnd).to });
  if (o.route) {
    // the route label's lines, up to the next label
    const r = labelLines(doc, o.route);
    if (r) changes.push(wholeLines(view, ...r));
  }
  view.dispatch({ changes, userEvent: "delete.box" });
}

// ---------------------------------------------------------------- the scene's label

/** Rename the scene's label (the first one). */
export function setLabel(view: EditorView, name: string) {
  const at = view.state.field(scriptField).parsed.findIndex(p => p?.kind === "label");
  if (at < 0 || !/^\w+$/.test(name)) return;
  const L = view.state.doc.line(at + 1);
  const m = /^(\s*label\s+)(\w+)/.exec(L.text)!;
  if (m[2] !== name) ev(view, { from: L.from + m[1].length, to: L.from + m[0].length, insert: name }, "input.info");
}

// ---------------------------------------------------------------- the phone

/** A message's tail (what follows its text: `(reply="x", photos=[…])`), changed by `f` (see `withArgs`). */
export function setMsgArgs(view: EditorView, line: number, f: (a: MsgArgs) => Partial<MsgArgs>) {
  const L = view.state.doc.line(line);
  const p = parseLine(L.text);
  if (p.kind !== "say") return;
  const tail = withArgs(p.tail, f);
  const next = L.text.slice(0, p.to + 1) + (tail ? " " + tail : "");
  if (next !== L.text) ev(view, { from: L.from, to: L.to, insert: next }, "input.args");
}

export function setChatHead(view: EditorView, line: number, head: ChatHead) {
  const L = view.state.doc.line(line);
  const next = pad(indentOf(L.text)) + formatChatHead(head);
  if (next !== L.text) ev(view, { from: L.from, to: L.to, insert: next }, "input.stmt");
}

/** A `react` line right after line `after` (same indent). Returns its line. */
export function insertReact(view: EditorView, after: number, react: Extract<Stmt, { kind: "react" }>) {
  const indent = indentOf(view.state.doc.line(after).text);
  return insertAt(view, { after, indent, tight: true, level: false, chat: true }, [formatStmt(react)]);
}

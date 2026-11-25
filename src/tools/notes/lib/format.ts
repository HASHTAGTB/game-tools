import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type ChangeSpec, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { create } from "zustand";

/** @lezer/common isn't a direct dependency; take its node type from the tree. */
type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]>;

/** The style toggles in the path bar: inline marks (bold, italic, …) and line styles (headings, lists, quote). They
 *  write plain Obsidian Markdown, and toggle off what's already there. With nothing selected they act on the word
 *  under the cursor. */

export type InlineStyle = "bold" | "italic" | "strike" | "highlight" | "code" | "wikilink";
export type ListStyle = "bullet" | "ordered" | "task";

export type Active = {
  inline: InlineStyle[];
  /** 0 = not a heading */
  heading: number;
  list: ListStyle | null;
  quote: boolean;
};
const NONE: Active = { inline: [], heading: 0, list: null, quote: false };

// ---------------------------------------------------------------- the editor the buttons talk to

/** The open editor and the styles at its cursor. The Editor component registers itself; the buttons read from here. */
export const useFormat = create<{ view: EditorView | null; active: Active }>(() => ({ view: null, active: NONE }));

let shown = "";
export function publish(view: EditorView | null) {
  const active = view ? activeAt(view.state) : NONE;
  const key = JSON.stringify(active);
  if (key === shown && useFormat.getState().view === view) return;
  shown = key;
  useFormat.setState({ view, active });
}

/** Keeps `useFormat.active` in step with the cursor. */
export const formatTracker = EditorView.updateListener.of(u => {
  if (u.docChanged || u.selectionSet || syntaxTree(u.startState) !== syntaxTree(u.state)) publish(u.view);
});

// ---------------------------------------------------------------- inline marks

type Spec = { node: string; mark: string };
const SPECS: Record<Exclude<InlineStyle, "wikilink">, Spec> = {
  bold: { node: "StrongEmphasis", mark: "**" },
  italic: { node: "Emphasis", mark: "*" },
  strike: { node: "Strikethrough", mark: "~~" },
  highlight: { node: "Highlight", mark: "==" },
  code: { node: "InlineCode", mark: "`" },
};

const WIKILINK = /\[\[([^\[\]\n|]+)(?:\|([^\[\]\n]*))?\]\]/g;

/** The innermost `name` node around from…to. */
function around(state: EditorState, from: number, to: number, name: string): SyntaxNode | null {
  for (const side of [1, -1] as const) {
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(from, side); n; n = n.parent) {
      if (n.name === name && n.from <= from && n.to >= to) return n;
    }
  }
  return null;
}

/** The node's opening and closing marks. */
function marksOf(n: SyntaxNode) {
  const first = n.firstChild, last = n.lastChild;
  return first && last && first !== last ? { open: first, close: last } : null;
}

/** A wikilink around from…to on its line. */
function wikiAround(state: EditorState, from: number, to: number) {
  const line = state.doc.lineAt(from);
  if (state.doc.lineAt(to).number !== line.number) return null;
  for (const m of line.text.matchAll(WIKILINK)) {
    const s = line.from + m.index, e = s + m[0].length;
    // what stays when it's unlinked: the alias if it has one, else the target
    if (s <= from && e >= to) return { from: s, to: e, textFrom: m[2] !== undefined ? s + 3 + m[1].length : s + 2 };
  }
  return null;
}

/** The selection cut at line ends with the spaces at its edges left out (`** word**` isn't bold). */
function segments(state: EditorState, from: number, to: number) {
  const out: { from: number; to: number }[] = [];
  for (let l = state.doc.lineAt(from); ; l = state.doc.line(l.number + 1)) {
    let a = Math.max(from, l.from), b = Math.min(to, l.to);
    while (a < b && /\s/.test(state.sliceDoc(a, a + 1))) a++;
    while (b > a && /\s/.test(state.sliceDoc(b - 1, b))) b--;
    if (b > a) out.push({ from: a, to: b });
    if (l.to >= to || l.number === state.doc.lines) break;
  }
  return out;
}

/** Where to close a run before the selection: back past spaces and other styles' marks (`**one *two*` → `**one** *two*`). */
const MARKUP = /[\s*_~=`]/;
const skipBack = (state: EditorState, pos: number, min: number) => {
  while (pos > min && MARKUP.test(state.sliceDoc(pos - 1, pos))) pos--;
  return pos;
};
const skipFwd = (state: EditorState, pos: number, max: number) => {
  while (pos < max && MARKUP.test(state.sliceDoc(pos, pos + 1))) pos++;
  return pos;
};

/** Toggle an inline style on every selection (or the word under each cursor). */
export const toggleInline = (style: InlineStyle) => (view: EditorView) => {
  const { state } = view;
  const tr = state.changeByRange(r => {
    // nothing selected: the word under the cursor, or a pair of empty marks to type into
    let { from, to } = r;
    if (r.empty) {
      const word = state.wordAt(r.head);
      if (word) ({ from, to } = word);
      else return emptyCursor(state, r.head, style);
    }

    const segs = segments(state, from, to);
    if (!segs.length) return { range: r };
    const changes: ChangeSpec[] = [];

    if (style === "wikilink") {
      const links = segs.map(s => wikiAround(state, s.from, s.to));
      if (links.every(Boolean)) {
        const seen = new Set<number>();
        for (const l of links) if (!seen.has(l!.from)) { seen.add(l!.from); changes.push({ from: l!.from, to: l!.textFrom }, { from: l!.to - 2, to: l!.to }); }
      } else {
        for (const s of segs) changes.push({ from: s.from, insert: "[[" }, { from: s.to, insert: "]]" });
      }
    } else {
      const spec = SPECS[style];
      const nodes = segs.map(s => around(state, s.from, s.to, spec.node));
      if (nodes.every(Boolean)) segs.forEach((s, i) => unstyle(state, nodes[i]!, s, changes));
      else segs.forEach((s, i) => { if (!nodes[i]) restyle(state, spec, s, changes); });
    }

    const cs = state.changes(changes);
    if (r.empty) return { changes, range: EditorSelection.cursor(cs.mapPos(r.head, r.head === segs[0].from ? 1 : -1)) };
    const a = cs.mapPos(r.from, 1), b = cs.mapPos(r.to, -1);
    return { changes, range: r.anchor <= r.head ? EditorSelection.range(a, Math.max(a, b)) : EditorSelection.range(Math.max(a, b), a) };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input.format" }));
  return true;
};

/** Wrap one segment, folding any same-style runs inside it into the new one (`a **b** c` → `**a b c**`). */
function restyle(state: EditorState, spec: Spec, s: { from: number; to: number }, out: ChangeSpec[]) {
  syntaxTree(state).iterate({
    from: s.from, to: s.to,
    enter: n => {
      if (n.name !== spec.node || n.from < s.from || n.to > s.to) return;
      const m = marksOf(n.node);
      if (m) out.push({ from: m.open.from, to: m.open.to }, { from: m.close.from, to: m.close.to });
      return false;
    },
  });
  out.push({ from: s.from, insert: spec.mark }, { from: s.to, insert: spec.mark });
}

/** Take a style off one segment. Only that part loses it: `**one two three**` with `two` selected becomes
 *  `**one** two **three**`. */
function unstyle(state: EditorState, node: SyntaxNode, s: { from: number; to: number }, out: ChangeSpec[]) {
  const m = marksOf(node);
  if (!m) return;
  const mark = state.sliceDoc(m.open.from, m.open.to);
  const inFrom = m.open.to, inTo = m.close.from;
  // only other markup between the run's edge and the selection (`***foo***`): the selection reaches that edge
  if (s.from <= inFrom || skipBack(state, s.from, inFrom) === inFrom) out.push({ from: m.open.from, to: m.open.to });
  else out.push({ from: skipBack(state, s.from, inFrom), insert: mark });
  if (s.to >= inTo || skipFwd(state, s.to, inTo) === inTo) out.push({ from: m.close.from, to: m.close.to });
  else out.push({ from: skipFwd(state, s.to, inTo), insert: mark });
}

/** A cursor between words: drop a pair of empty marks (`**|**`) there, or take an empty pair away again. */
function emptyCursor(state: EditorState, pos: number, style: InlineStyle) {
  const [open, close] = style === "wikilink" ? ["[[", "]]"] : [SPECS[style].mark, SPECS[style].mark];
  if (state.sliceDoc(pos - open.length, pos) === open && state.sliceDoc(pos, pos + close.length) === close) {
    return {
      changes: { from: pos - open.length, to: pos + close.length },
      range: EditorSelection.cursor(pos - open.length),
    };
  }
  // inside a styled run but not on a word (after a space, say): take the whole run's style off
  const node = style !== "wikilink" && around(state, pos, pos, SPECS[style].node);
  const m = node && marksOf(node);
  if (m && pos >= m.open.to && pos <= m.close.from) {
    const changes = [{ from: m.open.from, to: m.open.to }, { from: m.close.from, to: m.close.to }];
    return { changes, range: EditorSelection.cursor(state.changes(changes).mapPos(pos)) };
  }
  return { changes: { from: pos, insert: open + close }, range: EditorSelection.cursor(pos + open.length) };
}

// ---------------------------------------------------------------- line styles

/** What starts a line: indent and quote marks, then a heading's `#`s or a list marker (with its task box). */
const PREFIX = /^([ \t]*(?:>[ \t]?)*)(?:(#{1,6})(?:[ \t]+|$)|([-*+]|\d+[.)])(?:[ \t]+(\[[ xX]\])(?=[ \t]|$))?(?:[ \t]+|$))?/;

function parseLine(text: string) {
  const m = PREFIX.exec(text)!;
  const list: ListStyle | null = m[4] ? "task" : m[3] ? (/\d/.test(m[3]) ? "ordered" : "bullet") : null;
  return { lead: m[1], end: m[0].length, heading: m[2]?.length ?? 0, list, quote: m[1].includes(">"), number: m[3] ? parseInt(m[3]) : NaN };
}

/** The lines the selections touch (blank ones only when that's all there is, so a list can start on an empty line). */
function selectedLines(state: EditorState) {
  const seen = new Set<number>(), out = [];
  for (const r of state.selection.ranges) {
    for (let l = state.doc.lineAt(r.from); ; l = state.doc.line(l.number + 1)) {
      if (!seen.has(l.number)) { seen.add(l.number); out.push(l); }
      if (l.to >= r.to || l.number === state.doc.lines) break;
    }
  }
  const filled = out.filter(l => l.text.trim());
  return filled.length ? filled : out;
}

function applyLines(view: EditorView, changes: ChangeSpec[]) {
  const { state } = view;
  const cs = state.changes(changes);
  // a cursor at the start of the line ends up after the new marker, ready to type; a selection takes the markers in,
  // so it still covers whole lines for the next toggle
  const selection = EditorSelection.create(state.selection.ranges.map(r => r.empty
    ? EditorSelection.cursor(cs.mapPos(r.head, 1))
    : EditorSelection.range(cs.mapPos(r.anchor, r.anchor < r.head ? -1 : 1), cs.mapPos(r.head, r.head < r.anchor ? -1 : 1))),
  state.selection.mainIndex);
  view.dispatch({ changes: cs, selection, scrollIntoView: true, userEvent: "input.format" });
  return true;
}

/** Make the lines headings of `level` (0 = plain text). A list marker on the line goes. */
export const setHeading = (level: number) => (view: EditorView) => {
  const changes = selectedLines(view.state).map(l => {
    const p = parseLine(l.text);
    return { from: l.from + p.lead.length, to: l.from + p.end, insert: level ? "#".repeat(level) + " " : "" };
  });
  return applyLines(view, changes);
};

/** Turn the lines into a list of `kind`, or back into plain lines if they all are one already. */
export const toggleList = (kind: ListStyle) => (view: EditorView) => {
  const { state } = view;
  const lines = selectedLines(state);
  const parsed = lines.map(l => parseLine(l.text));
  const off = parsed.every(p => p.list === kind);
  let n = 1;
  if (kind === "ordered" && lines[0].number > 1) {
    const prev = parseLine(state.doc.line(lines[0].number - 1).text);
    if (prev.list === "ordered" && prev.lead === parsed[0].lead) n = prev.number + 1;
  }
  const changes = lines.map((l, i) => {
    const p = parsed[i];
    const insert = off ? "" : kind === "bullet" ? "- " : kind === "task" ? "- [ ] " : `${n++}. `;
    return { from: l.from + p.lead.length, to: l.from + p.end, insert };
  });
  return applyLines(view, changes);
};

/** Quote the lines, or take one level of quoting off if they all are quoted already. */
export const toggleQuote = (view: EditorView) => {
  const lines = selectedLines(view.state);
  const off = lines.every(l => parseLine(l.text).quote);
  const changes = lines.map(l => {
    if (!off) return { from: l.from, insert: "> " };
    const at = l.text.indexOf(">");
    return { from: l.from + at, to: l.from + at + (l.text[at + 1] === " " ? 2 : 1) };
  });
  return applyLines(view, changes);
};

// ---------------------------------------------------------------- what's on at the cursor

function activeAt(state: EditorState): Active {
  const r = state.selection.main;
  const word = r.empty ? state.wordAt(r.head) : null;
  const seg = word ?? (r.empty ? r : segments(state, r.from, r.to)[0] ?? r);
  const inline = (Object.keys(SPECS) as (keyof typeof SPECS)[]).filter(k => around(state, seg.from, seg.to, SPECS[k].node));
  const out: InlineStyle[] = inline;
  if (wikiAround(state, seg.from, seg.to)) out.push("wikilink");
  const p = parseLine(state.doc.lineAt(r.head).text);
  return { inline: out, heading: p.heading, list: p.list, quote: p.quote };
}

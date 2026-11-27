import { jumpsTo } from "./labels";
import { parseChatHead, type ChatHead } from "./phone";
import { inScript, type Line, type Script } from "./script";
import type { Stmt } from "./statements";

/** The script as boxes, for the box view. Pure: reads the parsed lines, writes nothing.
 *
 *  Every box knows its lines in the file (`from`–`to`, 1-based, children included), so editing a box only rewrites
 *  those lines and everything else in the file stays exactly as it was. Nesting comes from Ren'Py's indentation, but
 *  is shown by frames (a choice, a chat), never by indenting text.
 *
 *  Choices: a `menu:` whose options each `jump` to a label in this file shows those labels' lines as its options'
 *  tabs. If the routes all end with a jump to one more label of this file (`con_…`), that label's lines continue
 *  right after the choice (only if every option gets there). Labels nothing pulls in this way are shown as their own sections at the end. */

export type Box =
  | { kind: "say"; from: number; to: number; indent: number; who: string | null; raw: string; tail: string }
  | { kind: "note"; from: number; to: number; indent: number; text: string }
  | { kind: "stmt"; from: number; to: number; indent: number; stmt: Stmt }
  | { kind: "menu"; from: number; to: number; indent: number; caption: Box[]; options: MenuOption[];
      /** the label line all routes continue at (its lines follow the choice), or null */
      cont: number | null }
  | { kind: "chat"; from: number; to: number; indent: number; head: ChatHead; items: Box[]; body: Place }
  /** anything else, with its indented lines: shown and edited as Ren'Py. `as`: what the editor would draw instead,
   *  when it's Ren'Py only because it was asked to be (see `buildTree`'s `raw`) */
  | { kind: "raw"; from: number; to: number; indent: number; bad: string | null; /** its lines, as in the file */ src: string;
      as: Exclude<Box["kind"], "raw"> | null };

export type MenuOption = {
  line: number;
  indent: number;
  /** the button text, as written between the quotes */
  raw: string;
  /** `if met_rin`, kept as it is */
  cond: string;
  /** what the option does: its own lines, or the lines of the label it jumps to */
  boxes: Box[];
  /** where a new box at the start of `boxes` goes, and how the boxes after it are laid out (`tight` aside) */
  start: Place;
  /** boxes after the first: a blank line between them? */
  tight: boolean;
  /** the label this option's route is (null: its lines sit under the option) */
  route: string | null;
  /** the route's last line is the jump to where all routes meet (hidden, new lines go above it) */
  hiddenJump: number | null;
};

/** Where a new line goes: after line `after`, with `indent`. `tight`: no blank line in between (inside a chat, a
 *  menu option, or right under a label). `level`: a choice may go here (scene level, not inside a block). */
export type Place = { after: number; indent: number; tight: boolean; level: boolean; chat: boolean };

export type Section = { name: string; line: number; boxes: Box[]; place: Place; /** some line jumps or calls here */ reached?: boolean };

export type Tree = {
  /** lines before the first label (usually notes) */
  pre: Box[];
  /** the scene's own label and what it shows, routes and joins already pulled in */
  scene: Section | null;
  /** labels nothing pulled in */
  extra: Section[];
  /** the block exists but holds nothing yet */
  empty: boolean;
};

type N = { n: number; p: Exclude<Line, { kind: "blank" }>; kids: N[]; last: number };

const lineIndent = (p: Line) => ("indent" in p ? p.indent : 0);

/** The script's lines as a tree by indentation. A comment belongs with the line after it (its own indent is often
 *  off), so it never ends a block. */
function nest(s: Script): N[] {
  const { parsed, layout } = s;
  const first = layout.first, end = parsed.length;
  const eff: number[] = [];
  let next = 0;
  for (let n = end; n >= first; n--) {
    const p = parsed[n - 1];
    if (!p || p.kind === "blank") continue;
    if (p.kind === "comment") eff[n] = Math.max(next, 0);
    else { eff[n] = lineIndent(p); next = eff[n]; }
  }
  // (a comment after the last real line gets 0: it ends up in the last label, see buildTree)
  const out: N[] = [];
  const stack: { node: N; indent: number }[] = [];
  for (let n = first; n <= end; n++) {
    const p = parsed[n - 1];
    if (!p || p.kind === "blank") continue;
    const ind = eff[n];
    while (stack.length && ind <= stack[stack.length - 1].indent) stack.pop();
    const node: N = { n, p, kids: [], last: n };
    if (stack.length) stack[stack.length - 1].node.kids.push(node); else out.push(node);
    for (const s of stack) s.node.last = n;
    stack.push({ node, indent: ind });
  }
  return out;
}

/** The lines (first line of a box) to show as Ren'Py though they could be drawn otherwise. */
type Raw = ReadonlySet<number>;

function toBoxes(nodes: N[], s: Script, r: Raw): Box[] {
  const out: Box[] = [];
  for (const node of nodes) {
    // `pass` only keeps an empty block valid: nothing to show (unless it's a new Ren'Py box, not written yet)
    if (node.p.kind === "code" && !node.kids.length && s.lines[node.n - 1].trim() === "pass" && !r.has(node.n)) continue;
    out.push(toBox(node, s, r));
  }
  return out;
}

function toBox(node: N, s: Script, r: Raw): Box {
  const b = drawn(node, s, r);
  if (!r.has(node.n) || b.kind === "raw") return b;
  return { ...rawOf(node, s), as: b.kind };
}

const rawOf = ({ n, p, last }: N, s: Script): Extract<Box, { kind: "raw" }> =>
  ({ kind: "raw", from: n, to: last, indent: lineIndent(p), bad: p.kind === "bad" ? p.reason : null, src: s.lines.slice(n - 1, last).join("\n"), as: null });

function drawn(node: N, s: Script, r: Raw): Box {
  const { n, p, kids, last } = node;
  const text = s.lines[n - 1];
  const indent = lineIndent(p);
  const raw = () => rawOf(node, s);
  switch (p.kind) {
    case "say":
      if (kids.length) return raw();
      return { kind: "say", from: n, to: n, indent, who: p.who, raw: text.slice(p.from, p.to), tail: p.tail };
    case "comment":
      return { kind: "note", from: n, to: last, indent, text: text.slice(p.from) };
    case "stmt":
      if (p.stmt.kind === "menu") return menuBox(node, s, r);
      if (kids.length) return raw();
      return { kind: "stmt", from: n, to: n, indent, stmt: p.stmt };
    case "code": {
      const head = parseChatHead(text);
      if (head && kids.length) {
        const items = toBoxes(kids, s, r);
        const ind = lineIndent(kids[0].p);
        return { kind: "chat", from: n, to: last, indent, head, items,
          body: { after: n, indent: ind, tight: true, level: false, chat: true } };
      }
      return raw();
    }
    default:
      return raw();
  }
}

function menuBox(node: N, s: Script, r: Raw): Box {
  const caption: Box[] = [];
  const options: MenuOption[] = [];
  for (const k of node.kids) {
    if (k.p.kind === "choice") {
      const text = s.lines[k.n - 1];
      const after = text.slice(k.p.to + 1).replace(/\s*#.*$/, "").trim().replace(/:$/, "").trim();
      const boxes = toBoxes(k.kids, s, r);
      const ind = k.kids.length ? lineIndent(k.kids[0].p) : k.p.indent + 4;
      options.push({
        line: k.n, indent: k.p.indent, raw: text.slice(k.p.from, k.p.to), cond: after, boxes, route: null, hiddenJump: null,
        start: { after: k.n, indent: ind, tight: true, level: false, chat: false }, tight: true,
      });
    } else caption.push(toBox(k, s, r));   // the menu's caption line, or anything else under it
  }
  return { kind: "menu", from: node.n, to: node.last, indent: lineIndent(node.p), caption, options, cont: null };
}

/** The place right after `b`, in a list laid out like `list`. A choice whose routes meet again continues at that label. */
export function placeAfter(b: Box, list: Omit<Place, "after">): Place {
  return { ...list, after: b.kind === "menu" && b.cont ? b.cont : b.to };
}

/** `raw`: lines whose box is shown as Ren'Py even if the editor could draw it (a choice shown so keeps its routes as
 *  the labels they are). */
export function buildTree(s: Script, raw: ReadonlySet<number> = new Set()): Tree {
  const r = raw;
  const top = nest(s);
  const pre: Box[] = [];
  const sections: (Section & { order: number })[] = [];
  let i = 0;
  for (; i < top.length && top[i].p.kind !== "label"; i++) pre.push(toBox(top[i], s, r));
  for (; i < top.length; i++) {
    const node = top[i];
    if (node.p.kind === "label") {
      const ind = node.kids.length ? lineIndent(node.kids[0].p) : 4;
      sections.push({
        name: node.p.name, line: node.n, order: sections.length, boxes: toBoxes(node.kids, s, r),
        place: { after: node.n, indent: ind, tight: true, level: true, chat: false },
      });
    } else if (sections.length) sections[sections.length - 1].boxes.push(toBox(node, s, r));
    else pre.push(toBox(node, s, r));
  }
  const empty = !s.parsed.some((p, k) => p && p.kind !== "blank" && inScript(s.layout, k + 1));
  if (!sections.length) return { pre, scene: null, extra: [], empty };

  const byName = new Map(sections.map(x => [x.name, x]));
  const used = new Set<string>([sections[0].name]);

  const resolve = (list: Box[]) => {
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (b.kind !== "menu") continue;
      // which options jump to a label of this file, and where those labels go at their end
      const targetOf = (o: MenuOption) => {
        const only = o.boxes.length === 1 ? o.boxes[0] : null;
        const t = only?.kind === "stmt" && only.stmt.kind === "jump" ? only.stmt.target : null;
        const sec = t ? byName.get(t) : undefined;
        return sec && !used.has(sec.name) ? sec : null;
      };
      const endOf = (sec: Section) => { const l = sec.boxes[sec.boxes.length - 1]; return l?.kind === "stmt" && l.stmt.kind === "jump" && byName.has(l.stmt.target) ? l.stmt.target : null; };
      const ends = new Set(b.options.map(targetOf).flatMap(sec => (sec && endOf(sec) ? [endOf(sec)!] : [])));
      const meets = new Set<string>();
      let routed = 0;
      /** every option ends up at a meeting point: its route jumps there at its end, or it jumps there right away */
      let allMeet = true;
      for (const o of b.options) {
        const sec = targetOf(o);
        // an option that jumps straight to where the others meet isn't a route: it just goes on
        if (!sec || ends.has(sec.name)) {
          if (sec) meets.add(sec.name); else allMeet = false;
          resolve(o.boxes);
          continue;
        }
        used.add(sec.name);
        routed++;
        o.route = sec.name;
        let boxes = sec.boxes;
        const end = endOf(sec);
        if (end) { meets.add(end); o.hiddenJump = boxes[boxes.length - 1].from; boxes = boxes.slice(0, -1); }
        else allMeet = false;
        o.boxes = boxes;
        o.start = sec.place;
        o.tight = false;
        resolve(o.boxes);
      }
      // the meeting point's lines show after the choice only if every option really goes on there
      if (routed && allMeet && meets.size === 1) {
        const con = byName.get([...meets][0])!;
        if (!used.has(con.name)) {
          used.add(con.name);
          b.cont = con.line;
          list.splice(k + 1, 0, ...con.boxes);
        }
      }
    }
  };

  const scene = sections[0];
  resolve(scene.boxes);
  const extra = sections.filter(x => !used.has(x.name));
  for (const x of extra) resolve(x.boxes);
  for (const x of extra) {
    const to = jumpsTo(x.name);
    x.reached = s.lines.some((l, k) => inScript(s.layout, k + 1) && to.test(l));
  }
  return { pre, scene, extra, empty };
}

/** Every box of the tree, nested ones included, in the order they're shown. */
export function* allBoxes(list: Box[]): Generator<Box> {
  for (const b of list) {
    yield b;
    if (b.kind === "menu") { yield* allBoxes(b.caption); for (const o of b.options) yield* allBoxes(o.boxes); }
    if (b.kind === "chat") yield* allBoxes(b.items);
  }
}

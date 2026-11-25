import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

/** Live Preview, the way Obsidian does it: the Markdown stays in the document untouched, but its markup (`#`, `**`,
 *  `[[ ]]`, `> `, `- [ ]` …) is hidden or drawn as what it means, except where the cursor is, so it can still be edited.
 *  Only decorations: the text on disk never changes. In source mode the same plugin only marks the links, so
 *  Ctrl+click follows them there too.
 *
 *  Links carry `data-link` (the target) and `data-kind` ("wiki" | "url"); rendered ones also get `cm-live-link`, which
 *  a plain click follows. */

const WIKILINK = /!?\[\[([^\[\]\n|]+)(\|[^\[\]\n]*)?\]\]/g;

/** Typed arrows drawn as arrows. Not `<=` (less or equal), and not the ends of HTML comments (`<!--`, `-->`). */
const ARROW = /<->|<=>|(?<![-=<])->|<-(?![->])|(?<![=<])=>/g;
const ARROWS: Record<string, { glyph: string; path: string }> = {
  "->": { glyph: "→", path: "M2 6H17M12 1.5L17 6L12 10.5" },
  "<-": { glyph: "←", path: "M18 6H3M8 1.5L3 6L8 10.5" },
  "<->": { glyph: "↔", path: "M3 6H17M7 2L3 6L7 10M13 2L17 6L13 10" },
  "=>": { glyph: "⇒", path: "M2 4H15M2 8H15M11 1L17 6L11 11" },
  "<=>": { glyph: "⇔", path: "M5 4H15M5 8H15M7 1L2 6L7 11M13 1L18 6L13 11" },
};
/** Drawn, not a font glyph: the app's fonts have no arrows, and the fallbacks differ in size from machine to machine. */
function arrowEl(typed: string) {
  const { glyph, path } = ARROWS[typed];
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 20 12");
  svg.setAttribute("class", "cm-arrow");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", glyph);
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
}
/** Plain text with its arrows drawn (table cells). */
function appendText(parent: HTMLElement, text: string) {
  let at = 0;
  for (const m of text.matchAll(ARROW)) {
    if (m.index > at) parent.append(text.slice(at, m.index));
    parent.append(arrowEl(m[0]));
    at = m.index + m[0].length;
  }
  if (at < text.length) parent.append(text.slice(at));
}

const hidden = Decoration.replace({});
const codeLine = Decoration.line({ class: "cm-codeblock" });
const quoteLine = Decoration.line({ class: "cm-quote" });
const frontLine = Decoration.line({ class: "cm-frontmatter" });
const headingLine = [1, 2, 3, 4, 5, 6].map(n => Decoration.line({ class: `cm-h cm-h${n}` }));
const inlineCode = Decoration.mark({ class: "cm-inline-code" });
const taskDone = Decoration.mark({ class: "cm-task-done" });
const link = (target: string, kind: "wiki" | "url", live: boolean) => Decoration.mark({
  class: kind === "wiki" ? (live ? "cm-wikilink cm-live-link" : "cm-wikilink") : (live ? "cm-md-link cm-live-link" : "cm-md-link"),
  attributes: { "data-link": target, "data-kind": kind },
});

class Bullet extends WidgetType {
  eq() { return true; }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-bullet";
    s.textContent = "•";
    return s;
  }
}
const bullet = Decoration.replace({ widget: new Bullet() });

class Rule extends WidgetType {
  eq() { return true; }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-hr";
    return s;
  }
}
const rule = Decoration.replace({ widget: new Rule() });

/** `[ ]` / `[x]` as a checkbox; clicking it flips the character in the text. */
class Check extends WidgetType {
  constructor(readonly done: boolean) { super(); }
  eq(o: Check) { return o.done === this.done; }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.done;
    box.className = "cm-task";
    box.setAttribute("aria-label", this.done ? "Done" : "To do");
    box.addEventListener("mousedown", e => e.preventDefault());   // keep the cursor where it is
    box.addEventListener("click", e => {
      e.preventDefault();
      const at = view.posAtDOM(box);
      if (!/^\[[ xX]\]$/.test(view.state.sliceDoc(at, at + 3))) return;
      view.dispatch({ changes: { from: at + 1, to: at + 2, insert: this.done ? " " : "x" }, userEvent: "input" });
    });
    return box;
  }
  ignoreEvent() { return true; }
}
const checks = [new Check(false), new Check(true)].map(widget => Decoration.replace({ widget }));

class Arrow extends WidgetType {
  constructor(readonly typed: string) { super(); }
  eq(o: Arrow) { return o.typed === this.typed; }
  toDOM() { return arrowEl(this.typed) as unknown as HTMLElement; }
}
const arrows = Object.fromEntries(Object.keys(ARROWS).map(k => [k, Decoration.replace({ widget: new Arrow(k) })]));

function build(view: EditorView, live: boolean): DecorationSet {
  const state: EditorState = view.state;
  const { doc } = state;
  const out: Range<Decoration>[] = [];
  const code: [number, number][] = [];
  const front: [number, number][] = [];

  // the markup shows wherever a cursor or selection touches it (and only while the editor has focus)
  const sel = state.selection.ranges;
  const touches = (from: number, to: number) => view.hasFocus && sel.some(r => r.from <= to && r.to >= from);
  const lineTouched = (from: number, to: number) => touches(doc.lineAt(from).from, doc.lineAt(to).to);
  // replacements from a view plugin can't cross a line break
  const hide = (from: number, to: number) => {
    if (to > from && doc.lineAt(from).number === doc.lineAt(to).number) out.push(hidden.range(from, to));
  };
  const lines = (from: number, to: number, deco: Decoration) => {
    for (let l = doc.lineAt(from); ; l = doc.line(l.number + 1)) {
      out.push(deco.range(l.from));
      if (l.to >= to || l.number === doc.lines) break;
    }
  };
  const spaceAt = (pos: number) => (doc.sliceString(pos, pos + 1) === " " ? 1 : 0);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter: n => {
        const name = n.name;
        if (name === "FencedCode" || name === "CodeBlock") {
          code.push([n.from, n.to]);
          if (live) lines(n.from, n.to, codeLine);
          return false;
        }
        if (name === "InlineCode") {
          code.push([n.from, n.to]);
          if (live) {
            out.push(inlineCode.range(n.from, n.to));
            if (!touches(n.from, n.to)) for (const m of n.node.getChildren("CodeMark")) hide(m.from, m.to);
          }
          return false;
        }
        if (name === "Frontmatter") {
          front.push([n.from, n.to]);
          if (live) lines(n.from, n.to, frontLine);
          return false;
        }
        if (name === "Link") {
          const marks = n.node.getChildren("LinkMark");
          if (marks.length < 2) return;
          const url = n.node.getChild("URL");
          const textFrom = marks[0].to, textTo = marks[1].from;
          const shown = live && !touches(n.from, n.to);
          if (url && textTo > textFrom) out.push(link(doc.sliceString(url.from, url.to), "url", shown).range(textFrom, textTo));
          if (shown) { hide(n.from, textFrom); hide(textTo, n.to); }
          return;
        }
        if (!live) return;

        const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
        if (heading) {
          out.push(headingLine[+heading[1] - 1].range(doc.lineAt(n.from).from));
          if (!lineTouched(n.from, n.to)) {
            for (const m of n.node.getChildren("HeaderMark")) {
              if (name.startsWith("Setext")) hide(m.from, m.to);
              else if (m.from === n.from) hide(m.from, m.to + spaceAt(m.to));
              else hide(m.from - (doc.sliceString(m.from - 1, m.from) === " " ? 1 : 0), m.to);   // closing #s
            }
          }
          return false;
        }
        switch (name) {
          case "Emphasis": case "StrongEmphasis": case "Strikethrough": case "Highlight":
            if (!touches(n.from, n.to)) {
              const mark = name === "Strikethrough" ? "StrikethroughMark" : name === "Highlight" ? "HighlightMark" : "EmphasisMark";
              for (const m of n.node.getChildren(mark)) hide(m.from, m.to);
            }
            return;
          case "Blockquote":
            lines(n.from, n.to, quoteLine);
            return;
          case "QuoteMark":
            if (!lineTouched(n.from, n.to)) hide(n.from, n.to + spaceAt(n.to));
            return;
          case "ListMark": {
            const item = n.node.parent;
            const task = item?.getChild("Task");
            const marker = task?.getChild("TaskMarker");
            if (task && marker) {
              const done = /x/i.test(doc.sliceString(marker.from, marker.to));
              if (!touches(n.from, marker.to)) {
                hide(n.from, marker.from);
                out.push(checks[+done].range(marker.from, marker.to));
              }
              const rest = Math.min(task.to, doc.lineAt(marker.to).to);
              const textFrom = marker.to + spaceAt(marker.to);
              if (done && rest > textFrom) out.push(taskDone.range(textFrom, rest));
            } else if (item?.parent?.name === "BulletList" && !touches(n.from, n.to)) {
              out.push(bullet.range(n.from, n.to));
            }
            return;
          }
          case "HorizontalRule":
            if (!lineTouched(n.from, n.to)) out.push(rule.range(n.from, n.to));
            return;
          case "Escape":
            if (!touches(n.from, n.to)) hide(n.from, n.from + 1);
            return;
        }
      },
    });

    // [[wikilinks]] aren't Markdown, so the parser doesn't know them: find them in the text, outside code
    const text = doc.sliceString(from, to);
    for (const m of text.matchAll(WIKILINK)) {
      const s = from + m.index, e = s + m[0].length;
      if (code.some(([a, b]) => s < b && e > a)) continue;
      const bang = m[0].startsWith("!") ? 1 : 0;
      const alias = m[2] && m[2].length > 1 ? m[2] : null;
      const shown = live && !touches(s, e) && !front.some(([a, b]) => s < b && e > a);
      if (!shown) { out.push(link(m[1], "wiki", false).range(s, e)); continue; }
      const textFrom = alias ? s + bang + 2 + m[1].length + 1 : s + bang + 2;
      hide(s, textFrom);
      out.push(link(m[1], "wiki", true).range(textFrom, e - 2));
      hide(e - 2, e);
    }

    if (!live) continue;
    for (const m of text.matchAll(ARROW)) {
      const s = from + m.index, e = s + m[0].length;
      if (touches(s, e) || [...code, ...front].some(([a, b]) => s < b && e > a)) continue;
      out.push(arrows[m[0]].range(s, e));
    }
  }
  return Decoration.set(out, true);
}

export const markdownView = (live: boolean) => ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = build(view, live); }
  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
      this.decorations = build(u.view, live);
    }
  }
}, { decorations: v => v.decorations });

// ---------------------------------------------------------------- table cells

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(~~[^~]+~~)|(==[^=]+==)|(!?\[\[[^\[\]]+\]\])|(\[[^\]]+\]\([^)\s]+\))/g;

/** A table cell's Markdown as DOM: bold, italic, strike, highlight, code, links and arrows (one level, no nesting — enough for
 *  a cell). */
export function renderInline(parent: HTMLElement, text: string) {
  const add = (tag: string, cls: string, content: string, attrs?: Record<string, string>) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = content;
    for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, v);
    parent.append(el);
  };
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) appendText(parent, text.slice(at, m.index));
    const [all, code, strong, em, strike, mark, wiki, md] = m;
    if (code) add("code", "cm-inline-code", code.slice(1, -1));
    else if (strong) add("strong", "", strong.slice(2, -2));
    else if (em) add("em", "", em.slice(1, -1));
    else if (strike) add("s", "cm-strike", strike.slice(2, -2));
    else if (mark) add("mark", "cm-highlight", mark.slice(2, -2));
    else if (wiki) {
      const [target, alias] = wiki.replace(/^!?\[\[|\]\]$/g, "").split("|");
      add("span", "cm-wikilink cm-live-link", alias || target, { "data-link": target, "data-kind": "wiki" });
    } else if (md) {
      const [, label, url] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(md)!;
      add("span", "cm-md-link cm-live-link", label, { "data-link": url, "data-kind": "url" });
    } else parent.append(all);
    at = m.index + all.length;
  }
  if (at < text.length) appendText(parent, text.slice(at));
}

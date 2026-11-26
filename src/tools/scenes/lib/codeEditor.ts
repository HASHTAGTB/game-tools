import { indentLess, indentMore, insertNewlineAndIndent, redo, undo } from "@codemirror/commands";
import { indentService, indentUnit } from "@codemirror/language";
import { StateEffect, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { Manifest } from "@/shared/lib/game";
import { baseTheme, MONO } from "@/shared/vault/editorTheme";
import { highlight, type Span } from "./highlight";
import { whoColor } from "./look";
import { indentOf } from "./script";

/** What a Ren'Py box's own small CodeMirror editor needs: colours, Enter keeps the indent, Tab. It looks like the
 *  source view (same font, caret and selection). */

const UNIT = 4;

/** A coloured span (lib/highlight.ts) as a CodeMirror mark: the source view and the Ren'Py boxes look the same. */
export const spanMark = (x: Span) => Decoration.mark({ class: "rp-" + x.tok, attributes: x.color ? { style: `color:${x.color}` } : undefined });

// ---------------------------------------------------------------- a Ren'Py box's editor

/** The game's data changed: colour the speakers again. */
export const recolour = StateEffect.define<null>();

/** Ren'Py colours (lib/highlight.ts) over the whole text. */
export function rawColours(manifest: () => Manifest | null): Extension {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.transactions.some(t => t.effects.some(e => e.is(recolour)))) this.decorations = this.build(u.view);
    }
    build(view: EditorView) {
      const { doc } = view.state, m = manifest();
      const lines = doc.toString().split("\n");
      const spans = highlight(lines, id => whoColor(m, id));
      const out: Range<Decoration>[] = [];
      spans.forEach((row, i) => {
        const at = doc.line(i + 1).from;
        for (const x of row) out.push(spanMark(x).range(at + x.from, at + x.to));
      });
      return Decoration.set(out, true);
    }
  }, { decorations: v => v.decorations });
}

/** A new line keeps the indent of the one before, one level more after a `:`. */
export const rawIndent: Extension = [
  indentUnit.of(" ".repeat(UNIT)),
  indentService.of((cx, pos) => {
    const L = cx.state.doc.lineAt(pos);
    const before = L.text.slice(0, pos - L.from);
    return indentOf(L.text) + (/:\s*(#.*)?$/.test(before) ? UNIT : 0);
  }),
];

/** Tab: four spaces (or the selected lines one level in); Shift+Tab: one level out. */
export const tabKeys = [
  {
    key: "Tab", run: (v: EditorView) => {
      const r = v.state.selection.main;
      if (!r.empty && v.state.doc.lineAt(r.from).number !== v.state.doc.lineAt(r.to).number) return indentMore(v);
      v.dispatch(v.state.replaceSelection(" ".repeat(UNIT)), { userEvent: "input.type" });
      return true;
    },
  },
  { key: "Shift-Tab", run: indentLess },
];

export const newline = insertNewlineAndIndent;

/** Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y in a box's own field: the file's history (the hidden view's), not the field's. */
export const fileHistoryKeys = (view: () => EditorView) => [
  { key: "Mod-z", run: () => (undo(view()), true), shift: () => (redo(view()), true) },
  { key: "Mod-y", run: () => (redo(view()), true) },
];

/** The same for a plain field's keydown. True if it was one of them. */
export function fileHistoryKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault(): void }, view: EditorView) {
  const k = e.key.toLowerCase();
  if (!(e.ctrlKey || e.metaKey) || (k !== "z" && k !== "y")) return false;
  e.preventDefault();
  if (k === "y" || e.shiftKey) redo(view); else undo(view);
  return true;
}

/** The source view's look (caret, selection) at the box's size. Long lines wrap (the box never scrolls sideways). */
export const rawTheme = [EditorView.lineWrapping, baseTheme, EditorView.theme({
  "&": { fontSize: "13px" },
  ".cm-scroller": { fontFamily: MONO, lineHeight: "1.65", overflowX: "hidden" },
  ".cm-content": { padding: "0" },
}, { dark: true })];

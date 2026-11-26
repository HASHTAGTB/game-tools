import { indentLess, indentMore, insertNewlineAndIndent } from "@codemirror/commands";
import { indentService, indentUnit } from "@codemirror/language";
import { StateEffect, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { Manifest } from "@/shared/lib/game";
import { MONO } from "@/shared/vault/editorTheme";
import { highlight } from "./highlight";
import { whoColor } from "./scriptView";

/** What a Ren'Py box's own small CodeMirror editor needs: colours, Enter keeps the indent, Tab. It looks like the
 *  source view (same font, caret and selection). */

const UNIT = 4;
const leading = (t: string) => t.length - t.trimStart().length;

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
        for (const x of row) out.push(Decoration.mark({ class: "rp-" + x.tok, attributes: x.color ? { style: `color:${x.color}` } : undefined }).range(at + x.from, at + x.to));
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
    return leading(L.text) + (/:\s*(#.*)?$/.test(before) ? UNIT : 0);
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

/** Long lines wrap (the box never scrolls sideways). */
export const rawTheme = [EditorView.lineWrapping, EditorView.theme({
  "&": { color: "var(--color-bone)", backgroundColor: "transparent", fontSize: "13px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: MONO, lineHeight: "1.65", overflowX: "hidden" },
  ".cm-content": { padding: "0", caretColor: "var(--color-caramel)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--color-caramel)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "color-mix(in srgb, var(--color-caramel) 30%, transparent) !important" },
  ".cm-placeholder": { color: "var(--color-taupe)", fontStyle: "italic" },
}, { dark: true })];

import type { Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { spanMark } from "./codeEditor";
import { manifestField, scriptField, setManifest } from "./editorState";
import { highlight } from "./highlight";
import { whoColor } from "./look";
import { inScript } from "./script";

/** The source view: the raw file, its Ren'Py coloured (lib/highlight.ts), speakers in their colour. The script's code
 *  block sits in a frame; lines outside the script are dimmed. */
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
        for (const x of spans[L.number - first] ?? []) out.push(spanMark(x).range(L.from + x.from, L.from + x.to));
      }
    }
    return Decoration.set(out, true);
  }
}, { decorations: v => v.decorations });

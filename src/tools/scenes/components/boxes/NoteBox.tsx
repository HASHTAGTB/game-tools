import { StickyNote } from "lucide-react";
import { defaultKeymap } from "@codemirror/commands";
import { Annotation, EditorState, Prec } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/shared/lib/utils";
import type { Box } from "../../lib/blocks";
import { newline, rawColours, rawIndent, rawTheme, recolour, tabKeys } from "../../lib/codeEditor";
import { rawText, redoBox, removeBox, setNote, setRaw, undoBox } from "../../lib/ops";
import { focusLine, isRaw, markRaw } from "../../lib/ui";
import { follow, problemsOf, useAutosize, useBox, type ListLayout } from "./context";
import { Acts, addAfter, Problems, useMoves } from "./List";

type Props<K extends Box["kind"]> = { box: Extract<Box, { kind: K }>; prev: Box | null; next: Box | null; layout: ListLayout };

/** Undo and redo go to the file's history, not the field's. */
function history(e: KeyboardEvent, view: Parameters<typeof undoBox>[0]) {
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && (k === "z" || k === "y")) { e.preventDefault(); (k === "y" || e.shiftKey ? redoBox : undoBox)(view); return true; }
  return false;
}

/** A note for the team (`# …`): the game ignores it. */
export function NoteBox({ box: b, prev, next, layout }: Props<"note">) {
  const { view } = useBox();
  const ref = useRef<HTMLTextAreaElement>(null);
  const moves = useMoves(b, prev, next);
  useAutosize(ref, b.text);
  const lone = b.from === b.to;
  return (
    <div className="bx-box bx-note" data-line={b.from} data-from={b.from} data-to={b.to}>
      <StickyNote strokeWidth={2.25} />
      <textarea ref={ref} rows={1} value={b.text} data-text placeholder="A note for the team (the game ignores it)" spellCheck
        readOnly={!lone} title={lone ? undefined : "A note of several lines: edit it in the source view (Ctrl+E)"}
        onFocus={() => follow(view, b.from)}
        onChange={e => setNote(view, b.from, e.target.value)}
        onKeyDown={e => {
          if (history(e, view)) return;
          const el = e.currentTarget;
          if (e.key === "Enter") { e.preventDefault(); if (e.ctrlKey || e.metaKey) addAfter(el, b, layout); return; }
          if (e.key === "Backspace" && !el.value) { e.preventDefault(); const n = removeBox(view, b); focusLine(prev ? prev.from : n); return; }
          if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); (e.key === "ArrowUp" ? moves.up : moves.down)?.(); }
        }} />
      <Acts box={b} prev={prev} next={next} />
    </div>
  );
}

/** Ren'Py as it is: what the box view doesn't draw (python, screens, statements it doesn't know), a box asked to be
 *  shown so, or a new one from the Add menu. Its own small CodeMirror editor, coloured like the source view (same look). A new box holds `pass` until something is typed (so the script stays valid); it shows empty.
 *
 *  The editor keeps its own text and writes it to the file as it changes; the file gets it tidied (lines of only
 *  spaces empty, no blank lines at the end), so an Enter on the last line, or a fresh indent, stays in the box until
 *  something is typed there. Only a change from elsewhere (undo, the source view) replaces the box's text. */
export function RawBox({ box: b, prev, next }: Props<"raw">) {
  const c = useBox();
  const host = useRef<HTMLDivElement>(null);
  const cm = useRef<EditorView | null>(null);
  const file = rawText(c.view, b.from, b.to, b.indent);
  const fresh = file === "pass" && isRaw(c.view, b.from);
  const text = fresh ? "" : file;
  // the lines this box has in the file: from what was drawn, or what it just wrote (before it's drawn again)
  const span = useRef({ from: b.from, to: b.to, drawn: `${b.from}:${b.to}` });
  if (span.current.drawn !== `${b.from}:${b.to}`) span.current = { from: b.from, to: b.to, drawn: `${b.from}:${b.to}` };
  const live = useRef({ c, b, prev });
  live.current = { c, b, prev };

  useEffect(() => {
    const write = (v: string) => {
      const { c, b } = live.current, s = span.current;
      const out = tidy(v) || "pass";
      setRaw(c.view, s.from, s.to, b.indent, out);
      s.to = s.from + out.split("\n").length - 1;
      markRaw(c.view, s.from, true);
    };
    const keys = keymap.of([
      { key: "Mod-z", run: () => (undoBox(live.current.c.view), true), shift: () => (redoBox(live.current.c.view), true) },
      { key: "Mod-y", run: () => (redoBox(live.current.c.view), true) },
      { key: "Enter", run: newline },
      ...tabKeys,
      {
        key: "Backspace", run: () => {
          if (v.state.doc.length) return false;
          const { c, b, prev } = live.current;
          markRaw(c.view, b.from, false);
          const n = removeBox(c.view, b);
          focusLine(prev ? prev.from : n);
          return true;
        },
      },
    ]);
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        extensions: [
          Prec.high(keys), keymap.of(defaultKeymap), drawSelection(), rawIndent, rawColours(() => live.current.c.manifest),
          rawTheme,
          placeholder(fresh ? "Ren'Py, as you'd write it in the game" : ""),
          EditorView.contentAttributes.of({ "data-text": "", "aria-label": "Ren'Py", spellcheck: "false" }),
          EditorView.updateListener.of(u => {
            if (u.focusChanged && u.view.hasFocus) follow(live.current.c.view, live.current.b.from);
            if (u.docChanged && !u.transactions.some(t => t.annotation(fromFile))) write(u.state.doc.toString());
          }),
        ],
      }),
    });
    cm.current = v;
    return () => { v.destroy(); cm.current = null; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // the file changed from elsewhere: take its text (the caret stays where it was, as far as it can)
  useEffect(() => {
    const v = cm.current;
    if (!v || tidy(v.state.doc.toString()) === text) return;
    const head = Math.min(v.state.selection.main.head, text.length);
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: head }, annotations: fromFile.of(true) });
  }, [text]);
  useEffect(() => { cm.current?.dispatch({ effects: recolour.of(null) }); }, [c.manifest]);

  return (
    <div className={cn("bx-box bx-raw", b.bad && "bx-bad")} data-line={b.from} data-from={b.from} data-to={b.to}>
      <span className="bx-who" title={b.as ? "Shown as Ren'Py (only here, until you switch it back)" : "Ren'Py the editor shows as it is"}>Ren'Py</span>
      <div ref={host} className="bx-code" />
      <Problems list={problemsOf(c, b)} />
      <Acts box={b} prev={prev} next={next} />
    </div>
  );
}

/** A change the box takes from the file (not one to write back). */
const fromFile = Annotation.define<boolean>();

/** The box's text as the file keeps it: lines of only spaces empty, no blank lines at the end. */
const tidy = (v: string) => v.split("\n").map(l => (l.trim() ? l : "")).join("\n").replace(/\n+$/, "");

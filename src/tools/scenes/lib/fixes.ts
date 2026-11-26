import { forceLinting, type Diagnostic } from "@codemirror/lint";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Problem } from "./checks";

/** Putting a problem's fix in the file: from the lint tooltip, under a box, or the checks list. */

/** A problem's place and fix, for CodeMirror's lint. */
export function toDiagnostic(state: EditorState, p: Problem): Diagnostic {
  const L = state.doc.line(Math.min(p.line, state.doc.lines));
  const from = L.from + (p.from ?? 0), to = L.from + (p.to ?? L.length);
  return {
    from, to, severity: p.severity, message: p.message,
    actions: p.fix ? [{ name: p.fix.label, apply: view => applyFix(view, p) }] : undefined,
  };
}

/** The problem's line is still what was checked (the checks run a moment after typing, so line numbers can be old). */
const fresh = (view: EditorView, p: Problem) => {
  const { doc } = view.state;
  return p.line >= 1 && p.line <= doc.lines && (p.fix?.was === undefined || doc.line(p.line).text === p.fix.was);
};

export function applyFix(view: EditorView, p: Problem) {
  if (!p.fix) return;
  const at = p.fix.at ?? "line";
  if (at !== "end" && !fresh(view, p)) { forceLinting(view); return; }
  const { doc } = view.state;
  const L = doc.line(p.line);
  const change = at === "line" ? { from: L.from, to: L.to, insert: p.fix.text }
    : at === "after" ? { from: L.to, insert: "\n" + p.fix.text }
    : { from: doc.length, insert: (doc.length && !doc.sliceString(doc.length - 1).endsWith("\n") ? "\n" : "") + p.fix.text };
  view.dispatch({ changes: change, userEvent: "input.fix" });
  view.focus();
}

/** Every problem's line fix at once (one undo step). */
export function applyFixes(view: EditorView, problems: Problem[]) {
  const { doc } = view.state;
  const seen = new Set<number>();
  const changes = problems.filter(p => p.fix && (p.fix.at ?? "line") === "line" && fresh(view, p) && !seen.has(p.line) && seen.add(p.line))
    .map(p => { const L = doc.line(p.line); return { from: L.from, to: L.to, insert: p.fix!.text }; });
  if (changes.length) view.dispatch({ changes, userEvent: "input.fix" });
  else forceLinting(view);
  view.focus();
}

/** The worst problem of a list, for a card's outline. */
export const worst = (list: Problem[]) =>
  list.some(p => p.severity === "error") ? "error" : list.some(p => p.severity === "warning") ? "warning" : list.length ? "info" : null;

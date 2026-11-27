import { forceLinting, type Diagnostic } from "@codemirror/lint";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createCharacter } from "@/shared/lib/game";
import { errorMessage } from "@/shared/lib/utils";
import { useScenes } from "../state";
import type { Fix, Problem } from "./checks";

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

/** The problem's line is still what was checked. */
const fresh = (view: EditorView, p: Problem) => {
  const { doc } = view.state;
  return p.line >= 1 && p.line <= doc.lines && (!p.fix || !("was" in p.fix) || doc.line(p.line).text === p.fix.was);
};

/** A line fix: one of those "fix all" puts in together. */
export const isLineFix = (p: Problem): p is Problem & { fix: Extract<Fix, { kind: "line" }> } => p.fix?.kind === "line";

export function applyFix(view: EditorView, p: Problem) {
  const fix = p.fix;
  if (!fix) return;
  if (!fresh(view, p)) { forceLinting(view); return; }
  if (fix.kind === "speaker") { void addSpeaker(view, p, fix.name); return; }
  const L = view.state.doc.line(p.line);
  const change = fix.kind === "line" ? { from: L.from, to: L.to, insert: fix.text }
    : fix.kind === "after" ? { from: L.to, insert: "\n" + fix.text }
    : { from: 0, insert: fix.text + "\n" };
  view.dispatch({ changes: change, userEvent: "input.fix" });
  view.focus();
}

/** Define the speaker the line names, then name them by their new variable there (it may differ: "Test" → test). */
async function addSpeaker(view: EditorView, p: Problem, name: string) {
  try {
    const id = await createCharacter(name);
    const { doc } = view.state;
    if (fresh(view, p) && p.from !== undefined && p.to !== undefined) {
      const L = doc.line(p.line);
      if (doc.sliceString(L.from + p.from, L.from + p.to) !== id) {
        view.dispatch({ changes: { from: L.from + p.from, to: L.from + p.to, insert: id }, userEvent: "input.fix" });
      }
    }
    forceLinting(view);
  } catch (e) { useScenes.getState().setError("Could not add the character: " + errorMessage(e)); }
}

/** Every problem's line fix at once (one undo step). */
export function applyFixes(view: EditorView, problems: Problem[]) {
  const { doc } = view.state;
  const seen = new Set<number>();
  const changes = problems.filter(isLineFix).filter(p => fresh(view, p) && !seen.has(p.line) && seen.add(p.line))
    .map(p => { const L = doc.line(p.line); return { from: L.from, to: L.to, insert: p.fix.text }; });
  if (changes.length) view.dispatch({ changes, userEvent: "input.fix" });
  else forceLinting(view);
  view.focus();
}

/** The worst problem of a list, for a card's outline. */
export const worst = (list: Problem[]) =>
  list.some(p => p.severity === "error") ? "error" : list.some(p => p.severity === "warning") ? "warning" : list.length ? "info" : null;

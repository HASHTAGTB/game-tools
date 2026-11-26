import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { forceLinting, linter, type Diagnostic } from "@codemirror/lint";
import { search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { useGame } from "@/shared/lib/game";
import { AnchoredMenuHost } from "@/shared/ui/anchored-menu";
import { editorTheme, MONO } from "@/shared/vault/editorTheme";
import type { Mode } from "@/shared/vault/store";
import { checkScene, type CheckContext, type Problem } from "../lib/checks";
import { lineIds, manifestField, scriptField, setManifest, sourceView } from "../lib/scriptView";
import { useSceneUi } from "../lib/ui";
import { BoxView } from "./boxes/BoxView";
import { MarkPopup } from "./boxes/TextTools";
import "./highlight.css";

/** The scene editor. The file lives in a CodeMirror view (undo, the checks, the source view all work on it); the
 *  script view draws it as boxes on top (BoxView) and keeps the view hidden. Either way the file stays plain Ren'Py
 *  in Markdown. Problems are checked as you type. */

const sourceTheme = EditorView.theme({
  "&": { fontSize: "14.5px" },
  ".cm-scroller": { fontFamily: MONO, lineHeight: "1.65" },
  "& .cm-content": { color: "var(--color-bone)" },
  ".cm-src-outside": { color: "var(--color-taupe)" },
  ".cm-prob::before": { display: "none" },
  // the script's code block, fences included, in a frame
  ".cm-line.cm-src-code": { padding: "0 14px", backgroundColor: "color-mix(in srgb, var(--color-ink-2) 60%, transparent)", borderInline: "1px solid var(--color-ink-line)" },
  ".cm-line.cm-src-code-first": { borderTop: "1px solid var(--color-ink-line)", borderTopLeftRadius: "var(--radius-lg)", borderTopRightRadius: "var(--radius-lg)", paddingTop: "6px" },
  ".cm-line.cm-src-code-last": { borderBottom: "1px solid var(--color-ink-line)", borderBottomLeftRadius: "var(--radius-lg)", borderBottomRightRadius: "var(--radius-lg)", paddingBottom: "6px" },
});

const lintTheme = EditorView.theme({
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--color-coral)", textUnderlineOffset: "4px" },
  ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy var(--color-butter)", textUnderlineOffset: "4px" },
  ".cm-lintRange-info": { backgroundImage: "none" },
  ".cm-tooltip": { border: "1px solid var(--color-ink-line)", borderRadius: "10px", backgroundColor: "var(--color-ink-3)", color: "var(--color-paper)", boxShadow: "0 14px 34px rgba(0,0,0,.5)", overflow: "hidden" },
  ".cm-tooltip-lint": { padding: "4px", fontFamily: "var(--font-talk)", fontSize: "14px", maxWidth: "26rem" },
  ".cm-diagnostic": { borderLeft: "none", padding: "6px 10px", whiteSpace: "normal" },
  ".cm-diagnostic-error, .cm-diagnostic-warning, .cm-diagnostic-info": { borderLeft: "none" },
  ".cm-diagnosticAction": { backgroundColor: "var(--color-paper)", color: "var(--color-ink)", borderRadius: "6px", padding: "2px 10px", marginLeft: "0", marginTop: "6px", display: "block", fontFamily: "var(--font-sans)", fontWeight: "600" },
  ".cm-diagnosticSource": { display: "none" },
});

// ---------------------------------------------------------------- checks

/** What the checks need besides the text; the page sets it. */
export const checkContext: { current: Omit<CheckContext, "manifest"> } = { current: { labels: null, fileName: "" } };

/** A problem's place and fix, for CodeMirror's lint. */
export function toDiagnostic(state: EditorState, p: Problem): Diagnostic {
  const L = state.doc.line(Math.min(p.line, state.doc.lines));
  const from = L.from + (p.from ?? 0), to = L.from + (p.to ?? L.length);
  return {
    from, to, severity: p.severity, message: p.message,
    actions: p.fix ? [{ name: p.fix.label, apply: (view) => applyFix(view, p) }] : undefined,
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

const checks = linter(view => {
  const problems = checkScene(view.state.field(scriptField), { ...checkContext.current, manifest: view.state.field(manifestField) });
  useSceneUi.setState({ problems });
  return problems.map(p => toDiagnostic(view.state, p));
}, { delay: 350 });

// ---------------------------------------------------------------- the editor

const MODES: Record<Mode, Extension> = {
  live: [],
  source: [sourceView, sourceTheme, keymap.of([{ key: "Tab", run: v => { v.dispatch(v.state.replaceSelection("    ")); return true; } }])],
};
const modeSlot = new Compartment();

type Props = {
  path: string;
  text: string;
  rev: number;
  mode: Mode;
  /** labels of the other scenes and the game, for checking jumps (null while they're read) */
  labels: Set<string> | null;
  fileName: string;
  onChange: (text: string) => void;
};

const states = new Map<string, EditorState>();

export function Editor({ path, text, rev, mode, labels, fileName, onChange }: Props) {
  checkContext.current = { labels, fileName };
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const modeNow = useRef(mode);
  modeNow.current = mode;
  const current = useRef(path);
  const manifest = useGame(s => s.manifest);

  const extensions = useRef<Extension[]>([
    history(),
    drawSelection(),
    search({ top: true }),
    EditorView.lineWrapping,
    manifestField,
    scriptField,
    lineIds,
    modeSlot.of(MODES[mode]),
    editorTheme,
    lintTheme,
    checks,
    keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap]),
    EditorView.updateListener.of(u => {
      if (u.docChanged) change.current(u.state.doc.toString());
      if (u.docChanged || u.selectionSet || u.focusChanged) {
        const line = u.state.doc.lineAt(u.state.selection.main.head).number;
        const was = useSceneUi.getState();
        useSceneUi.setState({
          script: u.state.field(scriptField), line, head: u.state.selection.main.head,
          moved: line !== was.line ? was.moved + 1 : was.moved,
        });
      }
    }),
  ]).current;

  useEffect(() => {
    const v = new EditorView({ parent: host.current! });
    view.current = v;
    return () => {
      states.set(current.current, v.state);
      v.destroy();
      view.current = null;
      useSceneUi.setState({ view: null, script: null, menu: null, focus: null, openCard: null, problems: [] });
    };
  }, []);

  // another scene, or this one reloaded: keep the outgoing state (undo, cursor), load the incoming one
  useEffect(() => {
    const v = view.current!;
    if (current.current !== path) states.set(current.current, v.state);
    current.current = path;
    const cached = states.get(path);
    v.setState(cached && cached.doc.toString() === text ? cached : EditorState.create({ doc: text, extensions }));
    v.dispatch({ effects: [modeSlot.reconfigure(MODES[modeNow.current]), setManifest.of(useGame.getState().manifest)] });
    const s = v.state;
    useSceneUi.setState({ view: v, script: s.field(scriptField), line: s.doc.lineAt(s.selection.main.head).number, head: s.selection.main.head, menu: null, focus: null, openCard: null, tabs: {}, rawIds: new Set() });
    if (modeNow.current === "source") v.focus();
  }, [path, rev]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: modeSlot.reconfigure(MODES[mode]), scrollIntoView: mode === "source" });
    if (mode === "source") v.focus();
    useSceneUi.setState({ menu: null, openCard: null });
  }, [mode]);
  useEffect(() => { view.current?.dispatch({ effects: setManifest.of(manifest) }); }, [manifest]);
  useEffect(() => { if (view.current) forceLinting(view.current); }, [labels, manifest, fileName]);

  const shown = useSceneUi(s => s.view);
  return (
    <>
      <div ref={host} className="h-full min-h-0" hidden={mode === "live"} />
      {mode === "live" && shown && <BoxView view={shown} />}
      <AnchoredMenuHost />
      <MarkPopup />
    </>
  );
}

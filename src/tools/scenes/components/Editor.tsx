import { useEffect, useRef } from "react";
import { forceLinting, linter } from "@codemirror/lint";
import { Compartment, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useGame } from "@/shared/lib/game";
import { AnchoredMenuHost } from "@/shared/ui/anchored-menu";
import { MONO } from "@/shared/vault/editorTheme";
import { useDocEditor } from "@/shared/vault/useDocEditor";
import type { Mode } from "@/shared/vault/store";
import { checkScene } from "../lib/checks";
import { tabKeys } from "../lib/codeEditor";
import { checkInputField, lineIds, manifestField, scriptField, setCheckInput, setManifest } from "../lib/editorState";
import { toDiagnostic } from "../lib/fixes";
import { sourceView } from "../lib/sourceView";
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

const checks = linter(view => {
  const problems = checkScene(view.state.field(scriptField), { ...view.state.field(checkInputField), manifest: view.state.field(manifestField) });
  useSceneUi.setState({ problems });
  return problems.map(p => toDiagnostic(view.state, p));
}, { delay: 350 });

// ---------------------------------------------------------------- the editor

const MODES: Record<Mode, Extension> = {
  live: [],
  source: [sourceView, sourceTheme, keymap.of(tabKeys)],
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

export function Editor({ path, text, rev, mode, labels, fileName, onChange }: Props) {
  const modeNow = useRef(mode);
  modeNow.current = mode;
  const checkInput = useRef({ labels, fileName });
  checkInput.current = { labels, fileName };
  const manifest = useGame(s => s.manifest);

  const { host, view } = useDocEditor({
    tool: "scenes", path, text, rev, onChange,
    extensions: [
      manifestField,
      scriptField,
      lineIds,
      checkInputField,
      modeSlot.of(MODES[mode]),
      lintTheme,
      checks,
      EditorView.updateListener.of(u => {
        if (u.docChanged || u.selectionSet || u.focusChanged) {
          const line = u.state.doc.lineAt(u.state.selection.main.head).number;
          const was = useSceneUi.getState();
          useSceneUi.setState({ script: u.state.field(scriptField), line, moved: line !== was.line ? was.moved + 1 : was.moved });
        }
      }),
    ],
    onLoad: v => {
      v.dispatch({ effects: [modeSlot.reconfigure(MODES[modeNow.current]), setManifest.of(useGame.getState().manifest), setCheckInput.of(checkInput.current)] });
      const s = v.state;
      useSceneUi.setState({ view: v, script: s.field(scriptField), line: s.doc.lineAt(s.selection.main.head).number, menu: null, focus: null, openCard: null, tabs: {}, rawIds: new Set() });
      if (modeNow.current === "source") v.focus();
    },
    onClose: () => useSceneUi.setState({ view: null, script: null, menu: null, focus: null, openCard: null, problems: [] }),
  });

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: modeSlot.reconfigure(MODES[mode]), scrollIntoView: mode === "source" });
    if (mode === "source") v.focus();
    useSceneUi.setState({ menu: null, openCard: null });
  }, [mode, view]);
  useEffect(() => { view.current?.dispatch({ effects: setManifest.of(manifest) }); }, [manifest, view]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: setCheckInput.of({ labels, fileName }) });
    forceLinting(v);
  }, [labels, manifest, fileName, view]);

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

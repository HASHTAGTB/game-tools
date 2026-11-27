import { useEffect, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { forceLinting, linter } from "@codemirror/lint";
import { Compartment, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, type ViewUpdate } from "@codemirror/view";
import { useGame } from "@/shared/lib/game";
import { AnchoredMenuHost } from "@/shared/ui/anchored-menu";
import { calm, unfold } from "@/shared/ui/flair";
import { MONO } from "@/shared/vault/editorTheme";
import { useDocEditor } from "@/shared/vault/useDocEditor";
import type { Mode } from "@/shared/vault/store";
import { checkScene } from "../lib/checks";
import type { ChatMsg } from "../lib/phone";
import { tabKeys } from "../lib/codeEditor";
import { checkInputField, lineIds, manifestField, scriptField, setCheckInput, setManifest } from "../lib/editorState";
import { toDiagnostic } from "../lib/fixes";
import { sourceView } from "../lib/sourceView";
import { useSceneUi } from "../lib/ui";
import { swapFromBoxes, swapFromSource, type Swap } from "../lib/viewSwap";
import { useScenes } from "../state";
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

// ---------------------------------------------------------------- the script, to the box view

/** Hand the parsed script and the cursor's line to the box view, the preview and the header. */
function showScript(s: EditorState) {
  const line = s.doc.lineAt(s.selection.main.head).number;
  const was = useSceneUi.getState();
  useSceneUi.setState({ script: s.field(scriptField), line, moved: line !== was.line ? was.moved + 1 : was.moved });
}

/** Plain typing inside one line (the box you're in already shows it): no lines come or go, the cursor stays on it. */
function typedInLine(u: ViewUpdate) {
  if (!u.transactions.every(tr => tr.isUserEvent("input.type") || tr.isUserEvent("delete"))) return false;
  const old = u.startState.doc, doc = u.state.doc;
  if (old.lines !== doc.lines) return false;
  let one = true, at = -1;
  u.changes.iterChangedRanges((fromA, toA) => {
    const n = old.lineAt(fromA).number;
    if (old.lineAt(toA).number !== n || (at >= 0 && at !== n)) one = false;
    at = n;
  });
  return one && doc.lineAt(u.state.selection.main.head).number === at;
}

/** While you type, the rest of the page (every other box, the preview) catches up once you pause: drawing all the
 *  boxes again on every key is what made typing in a long scene stutter. Anything else (Enter, a join, undo, a click,
 *  a menu) brings it up to date first, so what it reads is the file as it is now. */
const showLater = (() => {
  let timer = 0, view: EditorView | null = null;
  const flush = () => {
    if (!view) return;
    const v = view;
    cancel();
    flushSync(() => showScript(v.state));
  };
  const cancel = () => { window.clearTimeout(timer); view = null; };
  return {
    schedule: (v: EditorView) => { window.clearTimeout(timer); view = v; timer = window.setTimeout(flush, TYPING_PAUSE); },
    cancel,
    flush,
  };
})();
const TYPING_PAUSE = 300;

/** A key that isn't plain text (Enter, Backspace, arrows, Tab, shortcuts) or any click: the boxes' handlers read their
 *  box, so it has to be the current one. */
function flushBeforeActing(e: Event) {
  if (e instanceof KeyboardEvent) {
    if (e.isComposing || e.key === "Shift" || e.key === "Dead") return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) return;
    if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.metaKey && !e.altKey && !atBoxEdge(e)) return;
  }
  showLater.flush();
}

/** Backspace at the start of a box's text, Delete at its end: that joins or removes boxes. Elsewhere it only deletes
 *  a letter (or a selection) inside the box. */
function atBoxEdge(e: KeyboardEvent) {
  const el = (e.target as Element | null)?.closest?.("[data-text][contenteditable]");
  const sel = getSelection();
  if (!el || !sel?.rangeCount) return true;
  const r = sel.getRangeAt(0), rest = document.createRange();
  rest.selectNodeContents(el);
  if (e.key === "Backspace") rest.setEnd(r.startContainer, r.startOffset);
  else rest.setStart(r.endContainer, r.endOffset);
  return !rest.toString().replace(/[\u200b-\u200d\u2060\ufeff]/g, "");
}

// ---------------------------------------------------------------- the editor

const MODES: Record<Mode, Extension> = {
  live: [],
  source: [sourceView, sourceTheme, keymap.of(tabKeys)],
};
const modeSlot = new Compartment();

/** The open scene (from the Scenes store). */
type Props = {
  mode: Mode;
  /** labels of the other scenes and the game, for checking jumps (null while they're read) */
  labels: Set<string> | null;
  /** the scene's title, for the label the checks suggest */
  title: string;
  /** the chat messages of the scenes before this one, for checking replies (null while they're read) */
  history: ChatMsg[] | null;
};

export function Editor({ mode, labels, title, history }: Props) {
  const modeNow = useRef(mode);
  modeNow.current = mode;
  const checkInput = useRef({ labels, title, history });
  checkInput.current = { labels, title, history };
  const manifest = useGame(s => s.manifest);

  const { host, view } = useDocEditor({
    tool: "scenes", store: useScenes,
    extensions: [
      manifestField,
      scriptField,
      lineIds,
      checkInputField,
      modeSlot.of(MODES[mode]),
      lintTheme,
      checks,
      EditorView.updateListener.of(u => {
        if (!u.docChanged && !u.selectionSet && !u.focusChanged) return;
        if (u.docChanged && typedInLine(u)) return showLater.schedule(u.view);
        showLater.cancel();
        showScript(u.state);
      }),
    ],
    onLoad: (v, followed) => {
      showLater.cancel();
      v.dispatch({ effects: [modeSlot.reconfigure(MODES[modeNow.current]), setManifest.of(useGame.getState().manifest), setCheckInput.of(checkInput.current)] });
      const s = v.state;
      // moved or renamed: still the scene that's open, so the box view stays where it is (no title card, no rebuild)
      if (followed) return useSceneUi.setState({ view: v, script: s.field(scriptField), line: s.doc.lineAt(s.selection.main.head).number });
      useSceneUi.setState(u => ({ view: v, opened: useScenes.getState().path, loaded: u.loaded + 1, script: s.field(scriptField), line: s.doc.lineAt(s.selection.main.head).number, menu: null, focus: null, openCard: null, tabs: {}, rawIds: new Set() }));
      if (modeNow.current === "source") v.focus();
    },
    onClose: () => { showLater.cancel(); useSceneUi.setState({ view: null, script: null, menu: null, focus: null, openCard: null, problems: [] }); },
  });
  useEffect(() => {
    window.addEventListener("keydown", flushBeforeActing, true);
    window.addEventListener("pointerdown", flushBeforeActing, true);
    return () => { window.removeEventListener("keydown", flushBeforeActing, true); window.removeEventListener("pointerdown", flushBeforeActing, true); };
  }, []);

  // Switching views: the line your eyes were on (the cursor's, else the top one) is measured in the old view while it's
  // still there (this render, before React replaces it) and comes up at the same height in the new one, which unfolds
  // from it. The box view does its part when it mounts (`swap`).
  const shownMode = useRef(mode);
  const swap = useRef<Swap | null>(null);
  if (shownMode.current !== mode) {
    const was = shownMode.current, v = view.current, loaded = useSceneUi.getState().loaded;
    const page = host.current?.parentElement?.querySelector<HTMLElement>(".bx-page");
    swap.current = !v ? null : was === "source" ? swapFromSource(v, loaded) : page ? swapFromBoxes(page, v, loaded) : null;
    shownMode.current = mode;
  }
  useLayoutEffect(() => {
    const v = view.current;
    if (!v) return;
    const sw = mode === "source" ? swap.current : null;
    swap.current = null;
    const reconfigure = modeSlot.reconfigure(MODES[mode]);
    if (sw && sw.loaded === useSceneUi.getState().loaded) {
      const line = v.state.doc.line(Math.min(sw.line, v.state.doc.lines));
      const margin = Math.max(0, sw.y - v.scrollDOM.getBoundingClientRect().top);
      v.dispatch({ effects: [reconfigure, EditorView.scrollIntoView(line.from, { y: "start", yMargin: margin })] });
      if (!calm()) {
        // CodeMirror scrolls (and draws the lines there) in its next frame: keep the text hidden until then
        const veil = v.contentDOM.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1000 });
        requestAnimationFrame(() => { unfold(v.contentDOM.querySelectorAll(".cm-line"), sw.y); veil.cancel(); });
      }
    } else v.dispatch({ effects: reconfigure, scrollIntoView: mode === "source" });
    if (mode === "source") v.focus();   // CodeMirror focuses without scrolling
    useSceneUi.setState({ menu: null, openCard: null });
  }, [mode, view]);
  useEffect(() => { view.current?.dispatch({ effects: setManifest.of(manifest) }); }, [manifest, view]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: setCheckInput.of({ labels, title, history }) });
    forceLinting(v);
  }, [labels, manifest, title, history, view]);

  const shown = useSceneUi(s => s.view);
  return (
    <>
      <div ref={host} className="h-full min-h-0" hidden={mode === "live"} />
      {mode === "live" && shown && <BoxView view={shown} swap={swap.current} history={history} />}
      <AnchoredMenuHost />
      <MarkPopup />
    </>
  );
}

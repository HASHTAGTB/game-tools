import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { editorTheme } from "./editorTheme";

/** Each tool's editor states by file, kept while the tool is closed too: undo and the cursor survive switching files
 *  and tools (not a reload of the page). */
const kept = new Map<string, Map<string, EditorState>>();

type Options = {
  /** Whose states these are ("notes", "scenes"). */
  tool: string;
  path: string;
  text: string;
  /** Changes when `text` was replaced from outside (opened, reloaded): the editor then takes it. */
  rev: number;
  /** The tool's own extensions, before the shared ones (so its keys come first). Read once. */
  extensions: Extension[];
  onChange: (text: string) => void;
  /** A file was put in (another one, or this one reloaded). */
  onLoad?: (view: EditorView) => void;
  /** The editor goes away. */
  onClose?: () => void;
};

/** The CodeMirror editor for a vault store's open file (Notes, Scenes): history, selection, search, wrapping, the
 *  app's theme and the usual keys, plus the tool's own `extensions`. Opening another file keeps the outgoing one's
 *  state for later. Put `host` on the element it lives in. */
export function useDocEditor(o: Options) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const live = useRef(o);
  live.current = o;
  const current = useRef(o.path);
  const states = kept.get(o.tool) ?? kept.set(o.tool, new Map()).get(o.tool)!;

  const extensions = useRef<Extension[]>([
    o.extensions,
    history(),
    drawSelection(),
    search({ top: true }),
    EditorView.lineWrapping,
    editorTheme,
    keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap]),
    EditorView.updateListener.of(u => { if (u.docChanged) live.current.onChange(u.state.doc.toString()); }),
  ]).current;

  useEffect(() => {
    const v = new EditorView({ parent: host.current! });
    view.current = v;
    return () => {
      states.set(current.current, v.state);
      v.destroy();
      view.current = null;
      live.current.onClose?.();
    };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // another file, or this one reloaded: keep the outgoing state (undo, cursor), load the incoming one
  useEffect(() => {
    const v = view.current!;
    if (current.current !== o.path) states.set(current.current, v.state);
    current.current = o.path;
    const cached = states.get(o.path);
    v.setState(cached && cached.doc.toString() === o.text ? cached : EditorState.create({ doc: o.text, extensions }));
    live.current.onLoad?.(v);
  }, [o.path, o.rev]);   // eslint-disable-line react-hooks/exhaustive-deps

  return { host, view };
}

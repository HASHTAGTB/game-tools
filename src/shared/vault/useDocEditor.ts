import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { editorTheme } from "./editorTheme";
import type { VaultStore } from "./store";

/** Each tool's editor states by file, kept while the tool is closed too: undo and the cursor survive switching files
 *  and tools (not a reload of the page). */
const kept = new Map<string, Map<string, EditorState>>();

type Options = {
  /** Whose states these are ("notes", "scenes"). */
  tool: string;
  /** The store whose open file this edits: the editor takes its text when `path` or `rev` changes (opened,
   *  reloaded) and hands every edit to `type`. */
  store: VaultStore;
  /** The tool's own extensions, before the shared ones (so its keys come first). Read once. */
  extensions: Extension[];
  /** A file was put in (another one, or this one reloaded). `followed`: it's the same file, moved or renamed. */
  onLoad?: (view: EditorView, followed: boolean) => void;
  /** The editor goes away. */
  onClose?: () => void;
};

/** The CodeMirror editor for a vault store's open file (Notes, Scenes): history, selection, search, wrapping, the
 *  app's theme and the usual keys, plus the tool's own `extensions`. Opening another file keeps the outgoing one's
 *  state for later. Put `host` on the element it lives in. */
export function useDocEditor(o: Options) {
  const path = o.store(s => s.path);
  const rev = o.store(s => s.rev);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const live = useRef(o);
  live.current = o;
  const current = useRef(path);
  const states = kept.get(o.tool) ?? kept.set(o.tool, new Map()).get(o.tool)!;

  const extensions = useRef<Extension[]>([
    o.extensions,
    history(),
    drawSelection(),
    search({ top: true }),
    EditorView.lineWrapping,
    editorTheme,
    keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap]),
    EditorView.updateListener.of(u => { if (u.docChanged) o.store.getState().type(u.state.doc.toString()); }),
  ]).current;

  useEffect(() => {
    const v = new EditorView({ parent: host.current! });
    view.current = v;
    return () => {
      if (current.current) states.set(current.current, v.state);
      v.destroy();
      view.current = null;
      live.current.onClose?.();
    };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // another file, or this one reloaded: keep the outgoing state (undo, cursor), load the incoming one
  useEffect(() => {
    const v = view.current!;
    if (!path) return;   // closed: the page takes the editor away
    const { text, moved } = o.store.getState();
    const was = current.current;
    // the open file was moved or renamed: the same document under a new name, so it keeps its state
    const followed = !!was && was !== path && moved?.from === was && moved.to === path;
    if (was && was !== path && !followed) states.set(was, v.state);
    current.current = path;
    // the same file again (reloaded, reverted): what's in the editor is the newest state of it, a kept one is older
    const cached = followed || was === path ? v.state : states.get(path);
    states.delete(path);
    if (cached?.doc.toString() !== text) v.setState(EditorState.create({ doc: text, extensions }));
    else if (cached !== v.state) v.setState(cached);
    live.current.onLoad?.(v, followed);
  }, [path, rev]);   // eslint-disable-line react-hooks/exhaustive-deps

  return { host, view };
}

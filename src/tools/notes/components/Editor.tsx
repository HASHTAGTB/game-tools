import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { defineLanguageFacet, HighlightStyle, Language, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder } from "@codemirror/view";
import { styleTags, tags as t } from "@lezer/highlight";
import type { MarkdownConfig, MarkdownParser } from "@lezer/markdown";
import { markdownView } from "../lib/livePreview";
import { liveTables } from "../lib/tableEditor";
import { TableMenuHost } from "./TableMenu";
import type { Mode } from "../state";

/** Markdown editor (CodeMirror 6, the editor Obsidian is built on), in Live Preview or Source mode. Either way the text
 *  stays exactly as written, so the notes keep working in Obsidian. One editor state per note, so undo history survives
 *  switching notes. */

const MONO = "ui-monospace, 'JetBrains Mono', 'Cascadia Code', monospace";

/** Live Preview: headings, bold and the like look like what they mean (sizes come from the line classes). */
const liveStyle = HighlightStyle.define([
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], fontFamily: "var(--font-sans)", color: "var(--color-paper)" },
  { tag: t.strong, fontWeight: "800", color: "var(--color-paper)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--color-taupe)" },
  { tag: [t.processingInstruction, t.punctuation, t.contentSeparator], color: "var(--color-taupe)" },
  { tag: t.url, color: "var(--color-taupe)" },
  { tag: t.monospace, fontFamily: MONO, fontSize: ".9em", color: "var(--color-butter)" },
  { tag: [t.meta, t.comment], color: "var(--color-taupe)" },
]);

/** Source: the raw text, one size, one font; colour only tells the parts apart and the markup stays quiet. */
const sourceStyle = HighlightStyle.define([
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], color: "var(--color-paper)", fontWeight: "700" },
  { tag: t.strong, color: "var(--color-paper)", fontWeight: "700" },
  { tag: t.emphasis, color: "var(--color-paper)" },
  { tag: [t.processingInstruction, t.punctuation, t.contentSeparator], color: "var(--color-taupe)" },
  { tag: t.link, color: "var(--color-caramel)" },
  { tag: t.url, color: "var(--color-taupe)" },
  { tag: t.monospace, color: "var(--color-butter)" },
  { tag: [t.meta, t.comment], color: "var(--color-taupe)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", color: "var(--color-bone)", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { overflow: "auto" },
  // the app turns font synthesis off and ships no italic Nunito: let the browser slant it here, or *italic* won't show
  ".cm-content": { maxWidth: "46rem", margin: "0 auto", padding: "40px 32px 40vh", caretColor: "var(--color-caramel)", fontSynthesis: "style" },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--color-caramel)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "color-mix(in srgb, var(--color-caramel) 30%, transparent) !important" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--color-butter) 18%, transparent)" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--color-butter) 30%, transparent)", borderRadius: "2px" },
  ".cm-searchMatch-selected": { backgroundColor: "color-mix(in srgb, var(--color-coral) 45%, transparent)" },
  ".cm-placeholder": { color: "var(--color-taupe)", fontStyle: "italic" },
  ".cm-wikilink, .cm-md-link": { color: "var(--color-caramel)" },
  ".cm-live-link": { cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px", textDecorationColor: "color-mix(in srgb, var(--color-caramel) 50%, transparent)" },
  ".cm-live-link:hover": { textDecorationColor: "var(--color-caramel)" },
  ".cm-panels": { backgroundColor: "var(--color-ink-2)", color: "var(--color-paper)", borderColor: "var(--color-ink-line)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--color-ink-line)" },
  ".cm-search": { fontFamily: "var(--font-talk)", fontSize: "14px", padding: "6px 12px" },
  ".cm-search input, .cm-search button, .cm-search label": { fontFamily: "inherit", fontSize: "inherit" },
  ".cm-textfield": { backgroundColor: "var(--color-ink)", border: "2px solid var(--color-ink-line)", borderRadius: "6px", color: "var(--color-paper)" },
  ".cm-button": { backgroundImage: "none", backgroundColor: "var(--color-ink-3)", border: "none", borderRadius: "6px", color: "var(--color-paper)" },
}, { dark: true });

const liveTheme = EditorView.theme({
  "&": { fontSize: "16px" },
  ".cm-scroller": { fontFamily: "var(--font-talk)", lineHeight: "1.7" },
  ".cm-h": { fontFamily: "var(--font-sans)", lineHeight: "1.3", color: "var(--color-paper)" },
  ".cm-h1": { fontSize: "1.9em", paddingTop: ".5em" },
  ".cm-h2": { fontSize: "1.55em", paddingTop: ".4em" },
  ".cm-h3": { fontSize: "1.3em", paddingTop: ".3em" },
  ".cm-h4, .cm-h5, .cm-h6": { fontSize: "1.1em", paddingTop: ".2em" },
  ".cm-quote": { borderLeft: "3px solid var(--color-ink-line)", paddingLeft: "16px !important", color: "var(--color-bone)", fontStyle: "italic" },
  // the background lives on a pseudo-element pushed below the (behind-text) selection layer, so selections stay visible
  ".cm-codeblock": { position: "relative", fontFamily: MONO, fontSize: ".88em", padding: "0 16px !important" },
  ".cm-codeblock::before": { content: '""', position: "absolute", inset: "0", zIndex: "-50", backgroundColor: "var(--color-ink-2)", pointerEvents: "none" },
  ".cm-inline-code": { backgroundColor: "var(--color-ink-2)", borderRadius: "4px", padding: "1px 4px" },
  ".cm-frontmatter": { fontFamily: MONO, fontSize: ".82em", color: "var(--color-taupe)" },
  ".cm-bullet": { color: "var(--color-caramel)", fontWeight: "800" },
  ".cm-task": { width: "1em", height: "1em", margin: "0 .15em 0 0", verticalAlign: "-.12em", accentColor: "var(--color-caramel)", cursor: "pointer" },
  ".cm-task-done": { color: "var(--color-taupe)", textDecoration: "line-through" },
  ".cm-arrow": { display: "inline-block", width: "1.05em", height: ".65em", verticalAlign: ".05em", margin: "0 .08em", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" },
  ".cm-table": { borderCollapse: "collapse", fontSize: ".95em", lineHeight: "1.5" },
  ".cm-table th, .cm-table td": { border: "1px solid var(--color-ink-line)", padding: "4px 12px", verticalAlign: "top", cursor: "text" },
  ".cm-table th": { fontFamily: "var(--font-sans)", fontWeight: "600", color: "var(--color-paper)", textAlign: "left", backgroundColor: "var(--color-ink-2)" },
  ".cm-table strong": { fontWeight: "800", color: "var(--color-paper)" },
  ".cm-table .cm-strike": { color: "var(--color-taupe)" },
  // the table editor: handles in a bar above and a column to the left, + bars right and below
  // handles hang in the left margin, so the table lines up with the text
  ".cm-tg": { overflowX: "auto", padding: "0 0 .2em", marginLeft: "-20px" },
  ".cm-tg-inner": { position: "relative", display: "inline-block", padding: "0 22px 22px 0", verticalAlign: "top" },
  ".cm-table td.cm-tg-h": { border: "none", padding: "0", width: "20px", verticalAlign: "middle", cursor: "default" },
  ".cm-tg-colbar td.cm-tg-h": { height: "18px", width: "auto", textAlign: "center" },
  ".cm-tg-grip": { all: "unset", display: "inline-grid", placeItems: "center", width: "18px", height: "18px", borderRadius: "4px", color: "var(--color-taupe)", cursor: "grab", opacity: "0", transition: "opacity .12s, background-color .12s, color .12s" },
  ".cm-tg-grip svg": { width: "12px", height: "12px", fill: "currentColor" },
  ".cm-tg-grip:hover, .cm-tg-grip:focus-visible": { backgroundColor: "var(--color-ink-3)", color: "var(--color-paper)", opacity: "1" },
  "tr:hover > td > .cm-tg-rowgrip, .cm-tg-colgrip.cm-tg-show, .cm-tg-inner:hover .cm-tg-corner": { opacity: "1" },
  ".cm-tg-add": { all: "unset", position: "absolute", display: "grid", placeItems: "center", borderRadius: "4px", color: "var(--color-taupe)", cursor: "pointer", opacity: "0", transition: "opacity .12s, background-color .12s, color .12s" },
  ".cm-tg-add svg": { width: "12px", height: "12px", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round" },
  ".cm-tg-inner:hover .cm-tg-add": { opacity: ".6" },
  ".cm-tg-inner .cm-tg-add:hover": { opacity: "1", backgroundColor: "var(--color-ink-3)", color: "var(--color-paper)" },
  ".cm-tg-addcol": { top: "18px", bottom: "22px", right: "2px", width: "16px" },
  ".cm-tg-addrow": { left: "20px", right: "22px", bottom: "2px", height: "16px" },
  ".cm-table .cm-tg-active": { outline: "2px solid var(--color-caramel)", outlineOffset: "-2px", backgroundColor: "color-mix(in srgb, var(--color-caramel) 8%, transparent)" },
  ".cm-tg-input": { all: "unset", fieldSizing: "content", minWidth: "100%", font: "inherit", color: "var(--color-paper)", caretColor: "var(--color-caramel)" },
  ".cm-tg-dragging": { opacity: ".45" },
  ".cm-tg-drop-before > td:not(.cm-tg-h)": { boxShadow: "inset 0 2px 0 var(--color-caramel)" },
  ".cm-tg-drop-after > td:not(.cm-tg-h)": { boxShadow: "inset 0 -2px 0 var(--color-caramel)" },
  ".cm-table .cm-tg-drop-left": { boxShadow: "inset 2px 0 0 var(--color-caramel)" },
  ".cm-table .cm-tg-drop-right": { boxShadow: "inset -2px 0 0 var(--color-caramel)" },
  ".cm-hr": { display: "inline-block", width: "100%", verticalAlign: "middle", borderTop: "2px solid var(--color-ink-line)" },
});

const sourceTheme = EditorView.theme({
  "&": { fontSize: "14.5px" },
  ".cm-scroller": { fontFamily: MONO, lineHeight: "1.65" },
});

/** YAML frontmatter (`---` lines at the very top). Plain Markdown would read its closing `---` as a heading underline. */
const frontmatter: MarkdownConfig = {
  defineNodes: [{ name: "Frontmatter", block: true }],
  props: [styleTags({ Frontmatter: t.meta })],
  parseBlock: [{
    name: "Frontmatter",
    before: "HorizontalRule",
    parse(cx, line) {
      if (cx.lineStart !== 0 || line.text.trimEnd() !== "---") return false;
      const from = cx.lineStart;
      while (cx.nextLine()) {
        if (line.text.trimEnd() === "---") {
          const to = cx.lineStart + line.text.length;
          cx.nextLine();
          cx.addElement(cx.elt("Frontmatter", from, to));
          return true;
        }
      }
      cx.addElement(cx.elt("Frontmatter", from, cx.lineStart));
      return true;
    },
  }],
};

/** GitHub-flavoured Markdown plus frontmatter. Built here instead of with `markdown()`, which also loads HTML, CSS and
 *  JavaScript support for HTML inside notes (~350 KB) that the vault doesn't need. */
const notesMarkdown = new Language(defineLanguageFacet(), (markdownLanguage.parser as MarkdownParser).configure([frontmatter]), [], "markdown");

const MODES: Record<Mode, Extension> = {
  live: [syntaxHighlighting(liveStyle), markdownView(true), liveTables, liveTheme],
  source: [syntaxHighlighting(sourceStyle), markdownView(false), sourceTheme],
};
const modeSlot = new Compartment();

/** A Markdown link to somewhere else (https:, mailto:, …), not to a note in the vault. */
/** Has a scheme, so it isn't a note in the vault. */
const external = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url);
/** Only these open: notes can come from other people's commits, and a javascript: link would run on this page. */
const safeUrl = (url: string) => /^(https?|mailto):/i.test(url.trim());

/** Ctrl+B / Ctrl+I: wrap the selection in `mark`, or take it off again. */
const wrap = (mark: string) => (view: EditorView) => {
  const { state } = view;
  view.dispatch(state.changeByRange(r => {
    const n = mark.length;
    const before = state.sliceDoc(r.from - n, r.from), after = state.sliceDoc(r.to, r.to + n);
    if (before === mark && after === mark) {
      return { changes: [{ from: r.from - n, to: r.from }, { from: r.to, to: r.to + n }], range: EditorSelection.range(r.from - n, r.to - n) };
    }
    return { changes: [{ from: r.from, insert: mark }, { from: r.to, insert: mark }], range: EditorSelection.range(r.from + n, r.to + n) };
  }));
  return true;
};

type Props = {
  path: string;
  text: string;
  /** Changes when `text` was replaced from outside (opened, reloaded): the editor then takes it. */
  rev: number;
  mode: Mode;
  onChange: (text: string) => void;
  /** A link was followed: a wikilink target or a relative Markdown link (external URLs open in a new tab here). */
  onOpenLink: (target: string) => void;
};

const states = new Map<string, EditorState>();

export function Editor({ path, text, rev, mode, onChange, onOpenLink }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const follow = useRef(onOpenLink);
  follow.current = onOpenLink;
  const modeNow = useRef(mode);
  modeNow.current = mode;
  const current = useRef(path);

  const extensions = useRef<Extension[]>([
    history(),
    drawSelection(),
    search({ top: true }),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    notesMarkdown,
    modeSlot.of(MODES[mode]),
    theme,
    placeholder("Start writing…"),
    keymap.of([
      { key: "Mod-b", run: wrap("**") },
      { key: "Mod-i", run: wrap("*") },
      ...markdownKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab,
    ]),
    // rendered links open on a click; any link (also in Source mode) on Ctrl/Cmd+click
    EditorView.domEventHandlers({
      mousedown: e => {
        const el = e.button === 0 && (e.target as HTMLElement).closest?.("[data-link]");
        if (!el || !(e.ctrlKey || e.metaKey || el.classList.contains("cm-live-link"))) return false;
        e.preventDefault();
        const target = el.getAttribute("data-link")!;
        if (el.getAttribute("data-kind") === "wiki") follow.current(target);
        else if (external(target)) { if (safeUrl(target)) window.open(target.trim(), "_blank", "noopener"); }
        else { try { follow.current(decodeURIComponent(target)); } catch { follow.current(target); } }
        return true;
      },
    }),
    EditorView.updateListener.of(u => { if (u.docChanged) change.current(u.state.doc.toString()); }),
  ]).current;

  useEffect(() => {
    const v = new EditorView({ parent: host.current! });
    view.current = v;
    return () => { states.set(current.current, v.state); v.destroy(); view.current = null; };
  }, []);

  // a different note, or this one reloaded: keep the outgoing note's state (undo, cursor), load the incoming one
  useEffect(() => {
    const v = view.current!;
    if (current.current !== path) states.set(current.current, v.state);
    current.current = path;
    const cached = states.get(path);
    v.setState(cached && cached.doc.toString() === text ? cached : EditorState.create({ doc: text, extensions }));
    v.dispatch({ effects: modeSlot.reconfigure(MODES[modeNow.current]) });   // a kept state may be in the other mode
    v.focus();
  }, [path, rev]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { view.current?.dispatch({ effects: modeSlot.reconfigure(MODES[mode]) }); }, [mode]);

  return <><div ref={host} className="h-full min-h-0" /><TableMenuHost /></>;
}

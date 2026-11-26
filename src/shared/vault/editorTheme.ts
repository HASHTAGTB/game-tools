import { EditorView } from "@codemirror/view";

/** What every vault editor (Notes, Scenes) shares: the app's colours for text, cursor, selection and search. */

export const MONO = "ui-monospace, 'JetBrains Mono', 'Cascadia Code', monospace";

export const editorTheme = EditorView.theme({
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

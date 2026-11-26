# Scenes tool: cleanup plan

Every feature stays. These steps only remove duplication, keep one source of truth for each thing, and clear out dead code.
Paths are relative to `src/tools/scenes` unless noted otherwise.

## 1. Bugs found along the way

- [ ] **`{` escaping mismatch.** `escapeText` (lib/script.ts) does not double `{`; `esc` (lib/richtext.ts) does. Text pasted
      through `pastedLines` (lib/cast.ts) or typed as an option's button text (`setOptionText` in lib/ops.ts) that contains
      `{` turns into a text tag. Fixed by the codec in 2.2.
- [ ] **POV in the header only sees the first `$ narrator =` line** (components/SceneHeader.tsx `povLine`). With several
      POV changes in one scene, the header shows and edits only the first. Show the POV in force at the focused line, or
      label the field "Starts as".

## 2. One source of truth

### 2.1 Statement kinds: one registry
Today one statement kind is spread across about 10 places: `Stmt` type, `parseStmt`, `formatStmt` (lib/script.ts), `describe` and `EDITABLE`
(lib/scriptView.ts), `defaults`, `Fields`, `validStmt` (components/boxes/fields.tsx), `hint` (StageCard.tsx), the Add
menu tiles (BoxMenus.tsx), `playScript` (lib/stage.ts) and checks.ts.
- [ ] Add `lib/statements.ts` with one entry per kind: `{ parse, format, valid, hint, describe (icon, title, detail), editable, defaults, tile }`.
      `Fields` can stay a switch in fields.tsx, but should read its options from the registry.
- [ ] `validStmt` should check by round trip (`parseStmt(formatStmt(x))` gives back an equal `x`) instead of a second
      grammar that has to match the parser by hand.

### 2.2 Ren'Py text: one codec
- [ ] Add `lib/renpyText.ts`: `escape` (`\`, `"`, `{{`, `[[`, `\n`), `unescape`, `tokenize`. Use it from script.ts
      (`escapeText`/`unescapeText`), richtext.ts (`esc`, `fromDOM`) and textTags.ts.
- [ ] highlight.ts `string()` should get tag and variable spans from the same `tokenize`, not its own scan.
- [ ] Speed: one `factorOf(value)` used by richtext.ts and by `beatsOf` in textTags.ts (today the cps maths is
      written twice).

### 2.3 Labels: one module
Label extraction exists 5 times: `labelsIn` (blocks.ts), `ownLabels` (checks.ts), `factsOf` (state.ts), `labelOf` (script.ts), plus the
regexes in ops.ts (×3), ChoiceBox.tsx and SceneHeader.tsx.
- [ ] Add `lib/labels.ts`: `LABEL_LINE` regex, `labelsIn(script)`, `labelOf(script)`, `labelName(lineText)`,
      `labelLines(doc, name)`, and `jumpsTo(name)` (the regex in blocks.ts `reached` and ops.ts `removeMenu`).
- [ ] One "known labels" selector (scene index + `manifest.labels`) used by both Scenes.tsx (checks) and fields.tsx
      (the jump field's datalist).

### 2.4 Chat header
- [ ] One `CHAT_HEAD` regex plus `chatHeader(thread, log)`, used by blocks.ts `CHAT`, BoxMenus.tsx `CHAT_HEAD`,
      checks.ts and ChatBox.tsx `header`.

### 2.5 The document's copies
The hidden CodeMirror doc is the truth. Each copy below has its own sync effect:
- [ ] Vault store `text`: fine, it's needed for saving, but document that it's write-only from the editor.
- [ ] `useSceneUi.script`: read it from `view.state.field(scriptField)` through a selector instead of copying it on every update,
      or keep the copy but don't let anything else write it.
- [ ] Option button text (ChoiceBox `v`), chat name (ChatBox `name`), label input (SceneHeader `LabelInput`): switch to
      uncontrolled inputs (`defaultValue` + `key` on the file value, written on input). That drops the
      "don't overwrite while focused" effects.
- [ ] RawBox's own CodeMirror doc: keep it, but put the sync (`fromFile` annotation, `tidy`, `span` ref) in one small hook
      with a comment saying why it can't be uncontrolled.

### 2.6 POV: one write path
- [ ] The header picker, the POV card and the Add tile each write `$ narrator = x_n` their own way. Add one
      `setPov(view, line | "start", who)` in ops.ts and use it from all three (all three UIs stay).

### 2.7 Characters across tools (`src/shared`)
- [ ] Decide who owns characters: the manifest (`renpy.json`, written by HTAWAGE's export) or the roster (`characters.json`,
      which the Timeline also edits and saves). Suggested: the manifest owns name and colour; the Timeline's roster editor
      shows those read-only and only adds characters the game doesn't have yet.
- [ ] One `DEFAULT_COLOR` (game.ts has `#c4956a`, prompt-builder/lib/cast.ts repeats it, shared/lib/roster.ts uses `#9a8f86`).
- [ ] prompt-builder/lib/cast.ts `CAST`: a hardcoded copy of the game's colours. Generate it from the manifest, or at
      least mark it clearly as the no-manifest fallback.
- [ ] One "note name → character id" helper (`noteCharacterId`) for every tool that maps vault character notes to ids.
- [ ] Name collision: `castOf` means different things in scenes (lib/cast.ts) and timeline. Rename one (e.g. `sceneCast`).

### 2.8 Problems display
Problems show in 4 places (lint tooltips, under boxes, the Checks list, card outlines). Keep all 4, but share:
- [ ] One `DOT` severity map and one `ProblemRow` component (Preview.tsx `Problems` and List.tsx `Problems` both define them).
- [ ] Move `applyFix` / `applyFixes` / `toDiagnostic` from components/Editor.tsx to `lib/fixes.ts`. Preview, List and BoxView
      import them from a component today.

## 3. Shared helpers instead of copies

- [ ] `indentOf(text)` once (script.ts, blocks.ts with another signature, codeEditor.ts `leading`, 4 inline copies in ops.ts and
      SceneHeader.tsx). `pad` once (script.ts, ops.ts).
- [ ] Merge `sayLine` (script.ts) and `sayText` (ops.ts).
- [ ] One `historyKeys(view)` helper for Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, used by SayBox, NoteBox (`history()`) and RawBox's keymap.
      Drop the one-line `undoBox` / `redoBox` wrappers.
- [ ] One Ren'Py highlight decoration builder: `sourceView` (scriptView.ts) and `rawColours` (codeEditor.ts) both map
      `highlight()` spans to `Decoration.mark`. Share `spanDecorations(lines, offsetOf, manifest)`.
- [ ] Caret and selection theme: `rawTheme` (codeEditor.ts) repeats `editorTheme` (shared/vault/editorTheme.ts). Split
      editorTheme into a base theme (caret, selection, placeholder) and the page layout, and reuse the base.
- [ ] "Tab = 4 spaces": Editor.tsx `MODES.source` and codeEditor.ts `tabKeys`. Use `tabKeys` for both.
- [ ] The filled pause icon exists twice (an SVG string in richtext.ts `ICON.pause`, a component in TextTools.tsx). Keep one
      path definition and build both from it.
- [ ] The marks' actions (pause, click, `{p}`, italic, bold, speed) are defined in both `TextBar` and `BRACE_ITEMS`. Make one
      action list; both the top bar and the `{` menu render from it (both stay).
- [ ] Name/colour helpers: `characterOf` → `who` → `legible` → `whoColor` / `speaker`. Put them in one place
      (`lib/look.ts`) with one entry point `look(manifest, id) → { name, color, legible, known }`.
- [ ] Optional: the three chooser widgets (`Pick` in SceneHeader, `Chips` in fields, `Picker` in BoxMenus) could share
      their item rendering. Low priority, since they look different on purpose.

## 4. File layout

- [ ] Split lib/scriptView.ts: CodeMirror state fields (`scriptField`, `manifestField`, `lineIds`) stay; `who` / `legible` /
      `whoColor` go to `lib/look.ts`; `describe` / `EDITABLE` go to the statement registry; `sourceView` goes next to the
      source view (e.g. `lib/sourceView.ts`).
- [ ] Module-level mutable globals: `checkContext.current` (Editor.tsx), `pending` / `loading` / `loadedFor` (state.ts).
      Put checkContext in `useSceneUi` (or a CodeMirror facet), and the index bookkeeping inside the store.
- [ ] Rename the preview's `SayBox` (Preview.tsx) to `TextboxPreview`, so it isn't confused with boxes/SayBox.tsx.

## 5. Dead and stale code

- [ ] `useSceneUi.head`: written in Editor.tsx, never read. Remove it.
- [ ] `plainText` (textTags.ts) and `indentAfter` (script.ts): unused. Remove them.
- [ ] `useHot`'s comment (boxes/context.ts) says buttons only mount on hover; `Acts` are always rendered now (CSS hover).
      Update the comment: it now only drives which box the top bar acts on.
- [ ] The comment on `BoxCtx.cast` and similar: check that every comment still matches after the steps above.

## 6. Performance (feature unchanged)

- [ ] Scene index (state.ts): reads every scene file up front, one request each on GitHub. Keep it, but load it lazily,
      the first time something needs it (jump check, jump field, owner field), or cache facts per file by mtime / sha.

## Suggested order

1 (bugs) → 5 (dead code) → 3 (helpers) → 2.2 / 2.3 / 2.4 (codec, labels, chat) → 2.1 (registry) → 2.5 / 2.6 → 4 → 2.7 → 2.8 → 6.
Check typing, Enter/Backspace, choices and the source view after each step: the 500-box perf rule (memo keys by
`lineIds`) has to stay intact.

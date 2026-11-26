# Scenes tool: cleanup plan

Every feature stays. Most of the plan is done (one statement registry in `lib/statements.ts`, one Ren'Py text codec in
`lib/renpyText.ts`, labels in `lib/labels.ts`, looks in `lib/look.ts`, fixes in `lib/fixes.ts`, the check input in
the editor state, the shared editor lifecycle in `shared/vault/useDocEditor.ts`). What's left:

- [ ] **Scene index loads up front** (state.ts `useSceneIndex`): every scene file is read when the tool opens, one
      request each on GitHub. Load it lazily (the first jump check or jump field), or cache labels per file by mtime/sha.
- [ ] **RawBox's own CodeMirror doc** (components/boxes/NoteBox.tsx): the one box that can't take the file's text
      directly (an Enter on the last line must stay in the box until something is typed). Could move into a small
      `useRawEditor` hook if it grows.
- [ ] Optional: the three chooser widgets (`Pick` in SceneHeader, `Chips` in fields, `Picker` in BoxMenus) could share
      their item rendering. Low priority, since they look different on purpose.

Check typing, Enter/Backspace, choices and the source view after each step: the 500-box perf rule (memo keys by
`lineIds`) has to stay intact.

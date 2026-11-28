# Scenes tool: open stage cards (build plan)

The new open view of stage cards (background, sprites, music, clock/date, and the shared base under every card).
Picked from https://claude.ai/artifact/PEoR7FTE9PfwCbqtcSjpT3 on 2026-11-28. Nothing is removed: "other…" for
typed names, Ctrl+Z, the morph from pill to card, writes as soon as the statement is valid, and Esc/Done all stay.

## Status (2026-11-28)

Built and checked in the browser on a vault copy: steps 1–6 and the large view (expand button). Every open card uses
the shared parts (`components/boxes/card/`): `CardRow`, `TransitionStrip`, `Hint`, `NewName`, `UseTyped`, `CardFoot`
(keys), the "← was" part in the head, type-to-filter + arrow keys (`card/keys.ts`) and the Preview peek (`peekAt` in `lib/ui.ts`).
Opening the background card takes ~30 ms (the grid draws 48 tiles, then a chunk per frame).

Rework after the user's review (2026-11-28):
- One choice control: `shared/ui/segmented.tsx` (lg frame + md items, concentric corners, the picked one on a thumb
  that slides like the chat box's Live/Earlier). Transitions, positions, folders, outfits, fades, pause, phone use it.
  People are the shared `Chip`, actions the shared `Button`. Gone: `bx-tr`, the swatches, `FolderChip`, `bx-who-chip`,
  fields.tsx's own `Chips`.
- Transition chips have no swatch: hovering one plays the card's line with it in the Preview (`Peek` `{ line, with }`,
  `cueWith` in lib/motion.ts, `usePlayedPeek` in Preview.tsx).
- No "other…" inputs: a name the lists don't have is typed in the picker's search ("Use "x"", or Enter) or in a "+"
  (`NewName`: new character, outfit, pose, transform, transition, fade). Both write on Enter, never per key (that was
  the lag). New outfits and poses show dashed until the game has files.
- The open card doesn't repeat its value: no `code` beside row labels, no file name under the portrait or in the
  version bar, the date only in the head and the week strip (the system date picker sits behind a calendar icon).
- Music list scrolls (`.bx-scroll`, shared with the places grid) and has a listening volume (`shared/ui/slider.tsx`,
  kept in localStorage).

Not done yet:
- [ ] A new show card's first outfit = the one the character last wore in the chapter (step 1.7 has the data,
      `defaults()` in fields.tsx doesn't use it yet).
- [ ] GitHub mode not tried (no token here): thumbnails from `.game-tools/thumbs`, "thumbnail missing", no peek
      without a thumbnail.
- [ ] Golden harness run (the parse and ops code wasn't changed; `lib/stage.ts` only gained `usesIn`).
- [ ] The small cards (pause, phone, jump, POV, hide, `with`) still use the old chips inside the new frame.

## What was picked

- **Base:** the card opens in place at full script-column width. Every card has the same parts: a head (new value ←
  old value, with expand / source / delete on hover), one main picker, a one-click hint, segmented small settings, a
  transition strip, and a foot (keys, "not written yet", problems, Done). Hovering an option shows it in the real
  Preview column, and leaving puts it back. The expand button turns the same card into a large sheet.
- **Background:** place grid. The 1,806 files group into about 400 places (`place_time_variant`). The shelves "in
  this scene" and "earlier in this chapter" come first, then "All places", which scrolls on its own. A version bar
  switches time and extras (lights, curtain, …). Folder filters: All, main (files directly in `images/bg/`),
  uncle_mugen, noraneko. `layer_` pieces show, with a layers mark. The time hint shows only when that place has a
  version for the current part of the day, and applies it in one click.
- **Sprites:** portrait layout with face crops. Faces are cut from the sprite with a face box per character (an
  optional override per pose), saved in `.game-tools/sprites.json`. Pose tiles sit above the faces, you can type to
  filter, and 1–9 picks a face. Position is a row of icon buttons like the transitions (no mini stage).
- **Music:** track list with listen, how often the game uses each track, `not_used/` dimmed, fade as segmented.
- **Clock/date:** 24-hour dial with the ring coloured by the real sun phases of the chosen day (Hirakata), the arc
  since the time before, ± step chips, "Next morning 7:00". The date is a week strip with dots on days that have
  scenes, plus "Next day" and "Same day as before".

## Step 0: things outside this repo (user)

- Rename `rin_casual_confused_blush.webp` → `rin_casual_confused-blush.webp` and fix
  `scenes/scene_kaishi_rin_classroom.rpy:124` (`show rin casual confused-blush with expr_change`). Run Ren'Py lint.
  Rule from now on: the words of one expression are joined with `-`; everything after the expression is the pose.
- Cut out the Takaya/Izuya sprites under the same file names.
- Thumbnails (spec below). The tool works without them (see "Thumbnails" in step 1).

### Thumbnail spec (for the generator)

- Path: `.game-tools/thumbs/` + the path under `renpy/game/assets/`, extension → `.avif`
  (`images/bg/uncle_mugen/foo.jpg` → `.game-tools/thumbs/images/bg/uncle_mugen/foo.avif`).
- Backgrounds and CGs: fit inside 480×270. Sprites: fit inside 512×800, keeping alpha (faces are cropped from these
  in the browser, so changing a face box never needs new thumbnails).
- `.game-tools/thumbs/index.json`:
  `{ "version": 1, "files": { "images/bg/x.png": { "thumb": "images/bg/x.avif", "w": 480, "h": 270, "src_w": 1920, "src_h": 1080, "sha256": "…" } } }`
  `thumb` is the source of truth for the path, so the extension isn't hard-coded in the tool. `src_w`/`src_h` are
  the original's size: the Preview sizes a hovered sprite by it (without them a hovered face only shows on the
  portrait, not in the Preview). `sha256` is the original's hash (= its Git LFS oid).
- Plain git (not LFS; `.gitattributes` only covers `renpy/game/assets/**`). Write only thumbnails whose original's
  hash changed, and keep the output deterministic, so a re-run doesn't add a second copy to the history.

## Step 1: data (no UI yet)

1. **Sprite names → expression + pose** (`shared/lib/gameFiles.ts` `parseMedia`, `Manifest`): `sprites` becomes
   `tag → outfit → { expr, pose, file }[]`. `expr` is the 3rd part, and `pose` is the rest joined with spaces, the way
   Ren'Py splits it (`arms_crossed` → attributes `arms crossed`). Bump `MANIFEST_VERSION` to 3. Update the users:
   `fields.tsx` `defaults`/`Fields`, `lib/checks.ts`, `Preview.tsx` `spriteFile`, and the Show card summary.
2. **Audio files in the manifest:** `audioFiles: name → path` (like `imageFiles`, so the card can play a track) and
   `musicUnused: string[]` (the `not_used/` tracks, which the list shows dimmed; `music` keeps its meaning).
3. **Places** (`lib/bgPlaces.ts`, pure): background names → `Place { id, label, folder, layer, versions: { name,
   time, extras }[] }`. The time is the first of morning/day/evening/night after the place part, and the extras are
   the rest ("lights on", "curtain closed"); `layer_…_back` keeps `back` as an extra. The folder comes from
   `imageFiles` (`images/bg/<sub>/…`; directly in `bg/` = main). Add it to the golden harness: every background
   must land in exactly one place, and `fileName(place, version)` must round-trip.
4. **Sun** (`shared/lib/sun.ts`): reads `.game-tools/sun.json` once per location. `phaseOf(date, minutes)`: night =
   civil dusk → civil dawn, morning = dawn → sunrise + 3 h, day → sunset − 1 h, evening → civil dusk.
   `sunOf(date)` is for the ring and the sun line. If the file is missing, fall back to fixed hours.
5. **Thumbnails** (`shared/lib/thumbs.ts`, next to `assetUrl.ts`): reads `index.json` (re-read when the game is
   reloaded). `useThumb(rel)` returns the thumbnail via `readBytes`; on GitHub that's already cached by blob sha,
   so no extra cache. With no thumbnail: the server, folder and browser backends fall back to
   `useAssetImage(rel)`, and GitHub returns `{ missing: true }` (the tile shows "thumbnail missing"; the real image
   loads only in the Preview after a pick). Images load only when a tile scrolls into view (IntersectionObserver),
   at most 6 requests at once, and object URLs are kept in an LRU of about 300.
6. **Face boxes** (`lib/spriteFaces.ts`): `.game-tools/sprites.json`
   `{ version: 1, faces: { "rin": {x,y,w}, "rin/arms crossed": {x,y,w} } }`. The values are fractions of the
   image, and the box is square in pixels. It syncs through `fileSync`, like the timeline's files (conflicts,
   outside changes; GitHub = staged until Save). Characters with no box get a default (`x .36, y .06, w .28`).
7. **What each scene uses** (`state.ts` `SceneEntry`): add `uses: { backgrounds: string[]; music: string[];
   looks: Record<tag, string[]>; dates: string[] }`, taken from the parse the index already does. It feeds the
   chapter shelf ("earlier in this chapter", newest first), the track use counts, the last outfit a character wore
   in the chapter (the first value of a new Show card), and the week-strip dots (scene label `sc_YYYY_MM_DD…`
   plus `set_date` statements).

## Step 2: the base (`components/boxes/card/`)

- `CardShell`: head (icon, title, value, `← was` from `stageBefore`, hover acts: expand, Ren'Py source = the
  existing raw toggle, delete), body, `CardFoot` (key hints with `[Key]` markup like `GestureList`, "not written
  yet", problems, Done). `StageCard`/`CardForm` keep their write logic (`setStmt` once valid) and `useMorph`.
  **Motion code isn't touched** ([[perf-keep-animations]]). If opening stutters with 400 tiles, the grid renders
  right after the morph ends (that changes content, not motion).
- `Segmented` in `shared/ui/segmented.tsx` (missing values dashed), used by every small setting.
- `TransitionStrip`: the game's transitions first (as now). Each chip has a 30×18 swatch that plays on hover
  (dissolve / slow dissolve / fade through black for `Fade` defs / wipes / none). Swatch kinds come from
  `transitionDefs`. Reduced motion = still swatch.
- `Hint`: one line, an icon, one button. Rendered only when there's something to say.
- **Peek:** `useSceneUi.peek: Partial<Stage> | null`. Hovering an option sets it (after 60 ms, so moving across the
  grid doesn't flicker); leaving, picking or closing clears it. `Preview` lays it over the stage at the cursor,
  with no cue animation. In GitHub mode a background with no thumbnail doesn't peek.
- **Keyboard** (`useGridNav`): a printable key focuses the card's search, arrows move in the grid, Enter picks, Tab
  goes to the next row, Esc closes (as now).
- **Expand:** the same card body in a sheet over the editor and Preview (popover surface rules from
  [[ui-design-direction]]). It has its own large preview, which reuses the Preview's `StageView` with the peek
  applied.
- Port the small cards (pause, phone, jump/call, POV, stop, hide, `with`) onto the shell first, with the same
  fields as now. That proves the shell before the big pickers go in.

## Step 3: background card

Search (`SearchField`) + folder chips with counts → shelves (this scene, earlier in chapter) → "All places" grid
(own scroll, about 22rem high) → hint → version bar (time seg, extras seg, file name in mono) → transition strip.
Each tile shows the version closest to the current pick's time and extras (the picked place shows the picked
version), with dots for the times it has. Names used in the script with no file stay dashed, and "other…" stays
for typing a name. "black" is its own first tile. The hint uses `phaseOf(stage.date, stage.time)` at the card's
line.

## Step 4: clock and date

- `Dial` (SVG): 1440 min per turn, midnight at the top, 5-min snap, drag with pointer capture, arrows ±5 min, Shift
  ±1 h. The ring segments come from `sunOf(date)`, and the arc runs from the time before (from `stageBefore`). The
  phase name and "+2h 10m since 19:20" sit beside it, with the steps (−15m, +5m, +15m, +30m, +1h, next morning
  7:00) and the sun line.
- `WeekStrip`: the week of the date, ‹ › for other weeks, dots = scenes that day (step 1.7), the day before marked,
  "Next day", "Same day as before".
- `time` card = dial. `date` card (`$ set_date(d, t?)`) = week strip + dial behind a "with a time" switch (no time =
  the argument is left out, as now).

## Step 5: music card

Track list: play/pause (one shared `<audio>`, object URL from `readBytes(audioFiles[name])`, stopped when the card
closes), name, "playing before this" on the track from `stageBefore`, use count (step 1.7), length (from the audio
element's metadata), and `not_used/` rows dimmed at the end. A thin progress line instead of the mock's waveform
(a real waveform needs every file decoded; it can come later). Fade-in segmented: no / 1s / 2s / 4s / other. The
stop card gets the same fade-out row.

## Step 6: sprite card (Show; the Hide card stays who + transition)

Who chips (face-crop avatars, "on stage", dashed with no files) → two columns: the portrait (thumbnail of the
current file, swapped on hover) with the file name and "Adjust face box" | outfit segmented (missing dashed) → pose
tiles (small full-body, "13 faces") → face grid for that pose (type to filter, 1–9, "other…" for a typed
expression) → position buttons (`manifest.positions` without params, plus "stays (left)" when already on stage) →
transition strip. Face crops are a CSS background on the thumbnail, or on the real image when there's no
thumbnail, using the box from step 1.6. "Adjust face box": a square on the portrait you drag and resize by its
corner, with a "Only this pose" switch, written to `sprites.json`.

## Step 7: check

- `pnpm typecheck`, the golden harness over every vault scene (the parse/ops output must not change; places
  round-trip), and a CDP smoke run on a vault copy ([[refactor-testing]]): open each card kind, pick by mouse and by
  keyboard, hover peek and restore, Ctrl+Z after a pick, the GitHub fallback (no `thumbs/`), and the 500-box script
  (typing speed unchanged with a card open).
- Ren'Py lint after the sprite rename.

## Later (from the options page, not in this build)

Favourites in `.game-tools`; a scene picker for jump/call grouped by chapter; a chat picker for the phone card; the
pause slider shared with the speed popup; pill summaries that show the change; a "placeholder" note for missing
files; moods for tracks (there's no data for them yet).

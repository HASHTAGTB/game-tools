# game-tools

Browser app (React + Base UI + Motion + Tailwind, served by Vite) with tools for the visual novel:

* **Prompt Builder**: build Danbooru-tag character prompts. Pick a variation per category, switch extras on or off, and copy the finished prompt into any UI.
* **Timeline**: the story's chronology. One lane per character, arcs on top, connections between events, scene files, checks and who-knows-what.

```
pnpm install
pnpm dev              # → http://localhost:7871
pnpm typecheck
```

The Vite server also runs a small file API (`server/api.ts`), so tool data is saved as plain JSON files on disk.

## Code layout

```
src/app/        router (TanStack Router, hash URLs) and the tool list (tools.ts)
src/shared/     UI kit (Base UI + Motion + Tailwind) and helpers every tool uses
src/tools/<id>/ one folder per tool: its page, components, lib and Zustand store (state.ts)
server/         local file API, only in `pnpm dev`
```

To add a tool, add it to `TOOLS` in `src/app/tools.ts` and give it a `toolRoute(...)` in `src/app/router.tsx`. Each tool's code is loaded only when it's opened. Mark a tool `needsServer` if it can't work on GitHub Pages; it then shows a notice there instead.

Storage: tools read and write through `src/shared/lib/workspace.ts` (`readJson`, `writeJson`, `listFiles`, …) with paths relative to the data folder, and keep their own files under `toolDir("<tool>")` (`.game-tools/<tool>/`). Other paths (the vault's scene files) are only read. The data folder panel is `WorkspaceLocation` in `src/shared/ui/`.

UI kit (`src/shared/ui/`): `Section` (title over a colored rule, actions that appear on hover), `IconButton` (icon only, so it always takes a `label` for its tooltip), `Tooltip`, `Popover`, `Confirm`, `Switch`, `CollapsiblePanel`, `SearchField` and `Toasts`.

Animation: import `m`, `AnimatePresence` and the `spring`/`fade`/`pop` presets from `src/shared/ui/motion.ts` (not `motion.*` from `motion/react`; the app runs LazyMotion in strict mode and loads Motion's features in their own chunk). Simple hover and color changes stay CSS transitions.

The theme colors are CSS variables (`--color-caramel` etc., see `@theme` in `src/index.css`), so canvas code can read them too.

## Data folder

All tools share one data folder, normally the story vault. Each tool keeps its files in the vault's `.game-tools/<tool>/` folder: Obsidian hides dot-folders, but git syncs it like everything else. The Prompt Builder stores one `<id>.json` per character in `.game-tools/prompt-builder/`, saved automatically. (Older versions kept them in `CANON/01_Characters/`; the first load moves them over.)

With `pnpm dev`, change the folder under **Data folder** at the bottom left: type a path or click **Browse…** to pick one in your system's folder dialog (zenity or kdialog on Linux). The setting lives in `config.json` (`root`; `GAME_TOOLS_CONFIG=<file>` points a second server at another config). The default is `./characters`. ⟳ reloads from disk (e.g. after `git pull`).

## GitHub Pages

`.github/workflows/pages.yml` builds a static version on every push to `main` and publishes it to `https://<user>.github.io/<repo>/`. That version has no file API, so **Data folder** offers:

* **The story folder**: you pick the vault once. Chromium browsers only (Chrome, Edge, Brave…). After a browser restart, click **Allow folder access** once.
* **This browser**: IndexedDB, works everywhere, but without the vault's own files (scenes). Clearing site data deletes it, so use **Export** now and then.

Switching to a place that has no tool data yet copies the current data there; otherwise its data is loaded.

**Export** downloads a character as `<id>.json`. **Import** reads such files (or old all-in-one exports); a character with the same id is replaced.

Build the static version locally with `VITE_STATIC=1 BASE=/<repo>/ pnpm build`.

## Timeline

Files (in the data folder):

```
.game-tools/characters.json        the cast, shared by all tools: id, name, color, birthday, narrator variable
.game-tools/timeline/arcs/<id>.json  one arc: its start, events and the connections that start in it
.game-tools/timeline/facts.json    facts characters can know (secrets, news) for "who knows what"
```

One file per arc keeps git merges small when several people edit at once. The tool saves on its own, looks for changes on disk every few seconds (e.g. after a git pull) and reloads them. If you had unsaved changes in the same file it asks: **Load theirs** or **Keep mine**.

**Time.** Every event and arc has a *when*, which is one of:

* **Date**: a fixed in-world date. Its format is its precision: `2025`, `2025-04`, `2025-04-07` or `2025-04-07T10:00`.
* **After** an event or arc, plus a gap (`4h`, `2d`, `1d6h`).
* **With** an event or arc: its start plus an offset (negative is earlier).

So a plan can start vague ("2 days after X") and be pinned to dates later; everything timed from it moves along. Events last 12h unless set. Dashed borders mean the time is only known to the month or year, or not tied to a date at all. The scale is not linear: time with events is drawn at the zoom level, empty stretches shrink to a hatched gap with a "+3 wks" label.

**Using it.** Double-click a lane to add an event. Drag an event to move it in time, onto another lane to give it to that character, its right edge to change its length, and its dot onto another event to connect them. Ctrl+scroll zooms, Ctrl+Z / Ctrl+Shift+Z undo and redo, Del deletes. Hidden and collapsed lanes and the zoom are remembered per browser only.

**Scenes.** With a vault as data folder, events link to scene files in `CANON/03_Story/02_Scenes/`. The tool reads (never writes) their front matter (`status`, `renpy`, `owner`, `characters`), the first `set_date(...)` and the `narrator = …` lines, and shows them as badges, POV and date ("Use this date" pins the event to it). An arc's panel lists its folder's scenes and can add one as an event. Scenes no event points at are listed when nothing is selected.

**Checks** (toolbar): broken references and cycles, a character in two events at once (where both are known to the day), events before their arc, connections leading back in time, scene dates that don't match, scenes told by someone not on the event, and characters acting on a fact before they learn it.

**Who knows what.** An event can say which facts its characters *find out* there and which they *act on*. Select a fact to see who learns it when; the events that learn it are ringed green, those acting on it yellow.

**Importing the old timeline** (once, from the vault's `timeline.md` files):

```
node scripts/import-timeline.ts ~/doc/VN --out /tmp/look   # look at the result first
node scripts/import-timeline.ts ~/doc/VN                   # write into the vault's .game-tools
```

It keeps the old layout rules (each line follows the previous one of that character, `+gap`, `(length)`, `while:`/`offset:`), pins arcs whose name says when they happen (the `PINS` table in the script), fixes known broken `prev:` links (`FIXES`), folds empty spacer lines into gaps, and prints what it did.

## Prompt Builder model

| | |
|---|---|
| **General** | tags that are always in the prompt |
| **Categories** | pick-one groups (Outfit, Expression, Pose, Hairstyle, … add your own). The selected tab goes into the prompt; ⃠ leaves the category out |
| **Toggles** | on/off extras (accessories, props…). Any number can be on |
| **Negative** | optional, copied separately |

Prompt order: General → categories (top to bottom) → toggles. Duplicate tags are dropped; `(smile:1.2)` and `smile` count as the same tag, and the first one wins.

Tags are stored as raw prompt text: `(cute face:1.2)` keeps its weight, and `// necklace` means the tag is switched off.

## Editing tags

* Type a tag and press Enter or `,`. Autocomplete searches the bundled Danbooru tag list (`public/data/tags.json`, see Tag data below). Pasting a comma list adds every tag.
* **Click** a tag to switch it off or on. **Ctrl+scroll** changes its weight in steps of 0.05; click the weight badge to reset it to 1. **Double-click** edits the tag. ✕ removes it.
* **Drag** tags within a list or between lists to move them; hold Ctrl to copy instead. You can also drop onto a preset tab or a toggle row, and drag tags in from the tag browser.
* While dragging, two boxes appear: drop on **Search on Danbooru** or **Search on Google** to look the tag up. If the browser blocks the new tab, a link is shown instead (or allow pop-ups for localhost).
* The right column searches all Danbooru tags and browses tag groups (Appearance / Expression / Pose / Clothing). A click adds or removes the tag in the tag list you last clicked.
* Ctrl+Shift+C copies the prompt.

## Tag data

```
python3 scripts/build_tags.py ../character-generator/danbooru.csv [--refresh]
```
This builds `public/data/tags.json` (search) from a Danbooru tag CSV (`tag,category,posts,"aliases"`) and `public/data/tag_groups.json` from Danbooru's tag-group wiki pages. The wiki pages are cached in `scripts/wiki_cache/`; add more groups in `SECTIONS`.

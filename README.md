# game-tools

Browser app (React + Base UI + Motion + Tailwind, served by Vite) with tools for the visual novel:

* **Prompt Builder**: build Danbooru-tag character prompts. Pick a variation per category, switch extras on or off, and copy the finished prompt into any UI.
* **Timeline**: the story's chronology. Chapters of ordered columns, events on character or thread lanes, storylines (threads), saved views and arrows between events.

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
* **GitHub**: the vault's repository (`HASHTAGTB/game`, branch `main`, fixed in `REPO` in `src/shared/lib/github.ts`) through GitHub's API, from any browser and any machine. Paste a [fine-grained token](https://github.com/settings/personal-access-tokens/new) for only that repository with **Contents: Read and write**. Fine-grained tokens only reach repositories of your own account (or an organization you're in), so if GitHub doesn't offer `HASHTAGTB` as the owner, use a [classic token](https://github.com/settings/tokens/new?scopes=repo&description=game-tools) with the `repo` scope instead (it reaches all your repos). The token stays in that browser; **Disconnect** on shared computers.

  Nothing is pushed on its own: edits wait in the browser (they survive reloads and going offline) until **Save to GitHub** above **Data folder**, or Ctrl+S, pushes them as one commit to the branch. The panel lists the changed files, takes a commit message and can discard everything. If someone pushed a different version of a file you changed in the meantime, saving stops and asks: **Keep mine and save** or **Take theirs**. Changes others push show up within ~15 s (or click ⟳). Local clones need a `git pull` before editing. Code: `src/shared/lib/github.ts`.

Until one of them is set up (or after **Stop using it** / **Disconnect**), edits are only kept in this browser (IndexedDB), without the vault's own files (scenes); clearing site data deletes them. It isn't offered as a choice of its own.

Switching to a place that has no tool data yet copies the current data there; otherwise its data is loaded.

**Export** downloads a character as `<id>.json`. **Import** reads such files (or old all-in-one exports); a character with the same id is replaced.

Build the static version locally with `VITE_STATIC=1 BASE=/<repo>/ pnpm build`.

## Timeline

Files (in the data folder):

```
.game-tools/characters.json                 the cast, shared by all tools: id, name, color
.game-tools/timeline/chapters/<id>.json     one chapter: name, order, "when" label, column labels, its events
.game-tools/timeline/threads.json           storylines that run across chapters: id, name, color, notes
.game-tools/timeline/views.json             saved views (focus + lane grouping), shared by everyone
```

One file per chapter keeps git merges small when several people edit at once. The tool saves on its own, looks for changes on disk every few seconds (e.g. after a git pull) and reloads them. If you had unsaved changes in the same file it asks: **Load theirs** or **Keep mine**.

**Model.** Time is order, not maths. **Chapters** are stretches of story time, left to right (moving one only renumbers its `order`). Each chapter is a row of **columns**; events in the same column happen at the same time, and an event can span several. Dates are only labels: the chapter's `when` ("07. – 11.04.2025") and the column labels ("Mo", "after school"). An **event** has a title, an optional note, the characters who do something important in it (it shows on each of their lanes), its threads, and arrows (`links`) to other events in any chapter. **Threads** are storylines across chapters ("Love", "Kaishis Zerfall").

**Lanes and focus.** The lanes are grouped by character, by thread, or form a single lane (toolbar). Clicking characters and threads in the sidebar focuses on them: everything else is dimmed, or hidden with **Hide the rest** (then empty columns and chapters fold away). **Save as view** stores the focus for everyone; views are listed at the top of the sidebar. The current focus, zoom and folded chapters are remembered per browser only.

**Using it.** Double-click a lane to add an event (it gets that lane's character or thread, plus whatever is focused). Drag an event to another column or lane, its right edge to make it span more columns, its dot onto another event to draw an arrow. Click a column label to rename it; hover it to insert a column after it or remove it while empty. Ctrl+scroll changes the column width, Ctrl+Z / Ctrl+Shift+Z undo and redo, Del deletes the selected event.

**Checks** (toolbar): arrows to deleted events, untitled events, events without characters, unknown character or thread ids, threads without events.

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

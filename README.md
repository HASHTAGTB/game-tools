# prompt-builder

Browser app (React + Base UI + Motion + Tailwind, served by Vite) for building Danbooru-tag character prompts. Pick a variation per category, switch extras on or off, and copy the finished prompt into any UI.

```
pnpm install
pnpm dev              # → http://localhost:7871
pnpm typecheck
```

The Vite server also runs a small file API (`server/api.ts`), so characters are saved as plain JSON files on disk.

## Code layout

```
src/app/        router (TanStack Router, hash URLs) and the tool list (tools.ts)
src/shared/     UI kit (Base UI + Motion + Tailwind) and helpers every tool uses
src/tools/<id>/ one folder per tool: its page, components, lib and Zustand store (state.ts)
server/         local file API, only in `pnpm dev`
```

To add a tool, add it to `TOOLS` in `src/app/tools.ts` and give it a `toolRoute(...)` in `src/app/router.tsx`. Each tool's code is loaded only when it's opened. Mark a tool `needsServer` if it can't work on GitHub Pages; it then shows a notice there instead.

UI kit (`src/shared/ui/`): `Section` (title over a colored rule, actions that appear on hover), `IconButton` (icon only, so it always takes a `label` for its tooltip), `Tooltip`, `Popover`, `Confirm`, `Switch`, `CollapsiblePanel`, `SearchField` and `Toasts`.

Animation: import `m`, `AnimatePresence` and the `spring`/`fade`/`pop` presets from `src/shared/ui/motion.ts` (not `motion.*` from `motion/react`; the app runs LazyMotion in strict mode and loads Motion's features in their own chunk). Simple hover and color changes stay CSS transitions.

The theme colors are CSS variables (`--color-caramel` etc., see `@theme` in `src/index.css`), so canvas code can read them too.

## Save location

With `pnpm dev`, characters are stored as one `<id>.json` file each, saved automatically. The default folder is `./characters`. Change it under **Save location** at the bottom left: type a path or click **Browse…** to pick one in your system's folder dialog (zenity or kdialog on Linux). The setting lives in `config.json`. If the new folder is empty, the current characters are copied there; otherwise its characters are loaded. Point it at a folder you keep in git. ⟳ reloads from disk (e.g. after `git pull`).

## GitHub Pages

`.github/workflows/pages.yml` builds a static version on every push to `main` and publishes it to `https://<user>.github.io/<repo>/`. That version has no file API, so **Save location** offers:

* **This browser**: IndexedDB, works everywhere. Clearing site data deletes it, so use **Export** now and then.
* **A folder on disk**: you pick a folder once and it holds one `<id>.json` per character, like the dev server's folder. Chromium browsers only (Chrome, Edge, Brave…). After a browser restart, click **Allow folder access** once.

**Export** downloads every character as one JSON file. **Import** reads that file or single `<id>.json` files; a character with the same id is replaced.

Build the static version locally with `VITE_STATIC=1 BASE=/<repo>/ pnpm build`.

## Model

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

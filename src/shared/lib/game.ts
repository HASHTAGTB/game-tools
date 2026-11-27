import { create } from "zustand";
import { DEFAULT_COLOR } from "./colors";
import { addCharacter, readGame } from "./gameFiles";
import { locationVersion } from "./workspace";

/** What the game defines, read live from the Ren'Py project in the vault (gameFiles.ts). */

export type GameCharacter = {
  /** the variable in the script (`rin`) */
  id: string;
  /** what the name box shows ("Rin", "Mama") */
  name: string;
  /** name colour */
  color: string | null;
  /** textbox colour (POV characters) */
  box?: string;
  /** textbox pattern ("rin") */
  pattern?: string | null;
  /** the pattern's asset name in the game ("gui/patterns/rin_icon") */
  patternAsset?: string;
  /** the pattern tile made from the icon in the game's assets/ (a data URL), when this backend can read it */
  patternUrl?: string;
  /** has a narrator variant (`rin_n`), so the scene can be told from their point of view */
  pov: boolean;
  /** section in characters.rpy ("Main characters", "Satorus Familie") */
  group: string;
};

export type Manifest = {
  version: 1;
  characters: GameCharacter[];
  /** false when renpy/game/assets/ is missing or empty: sprites, backgrounds and music are then unknown, not absent */
  media: boolean;
  /** tag → outfit → expressions ("rin" → "casual" → ["happy", "confused blush"]) */
  sprites: Record<string, Record<string, string[]>>;
  backgrounds: string[];
  /** image name → its file in assets/ ("rin casual happy" → "images/char/rin/rin_casual_happy.webp") */
  imageFiles: Record<string, string>;
  music: string[];
  transitions: string[];
  /** the game's own transitions (`define`s in core/transitions.rpy): name → what it's defined as ("Fade(1.5, 0, 0.5)") */
  transitionDefs?: Record<string, string>;
  positions: { name: string; params?: Record<string, number> }[];
  labels: string[];
  /** the phone's group chats (features/phone/content/chats/chats.rpy); DMs need no declaration */
  chats?: { id: string; title: string; members: string[] }[];
  /** photos for the phone (assets/features/photos/): name → file in assets/ ("incident_01" → "features/photos/incident/incident_01.webp") */
  photos?: Record<string, string>;
};

export type GameState = {
  manifest: Manifest | null;
  /** false until the first load finished or a cached copy was found (then `manifest` null means there is none) */
  loaded: boolean;
  /** Read the game files again (every .rpy for its labels, the assets' names: a few hundred requests). */
  load: () => Promise<void>;
  /** `load`, unless the last read is from this location and less than `STALE_MS` old. What a tool calls when it opens,
   *  so switching between tools doesn't read the whole game each time (Reload reads it right away). */
  fresh: () => Promise<void>;
};

let loading: Promise<void> | null = null;
/** When the last read finished, and for which location (`locationVersion`). */
let readAt = -Infinity, readFor = -1;
const STALE_MS = 30_000;

/** The last game data read, kept in this browser so colours and patterns are there right away on the next start; a
 *  fresh read replaces it moments later. */
const CACHE_KEY = "game-tools:game";
function fromCache(): { manifest: Manifest; text: string } | null {
  try {
    const text = localStorage.getItem(CACHE_KEY);
    if (!text) return null;
    const m = JSON.parse(text);
    return m?.version === 1 && Array.isArray(m.characters) && m.imageFiles ? { manifest: m, text } : null;
  } catch { return null; }
}
function toCache(text: string | null) {
  try {
    if (text) localStorage.setItem(CACHE_KEY, text);
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* storage full or blocked: just no head start next time */ }
}

const start = fromCache();
/** What the store holds now, as JSON: a read that finds the same leaves the store alone (no re-render). */
let current = start?.text ?? null;

export const useGame = create<GameState>()((set, get) => ({
  manifest: start?.manifest ?? null,
  loaded: !!start,
  load: () => {
    const version = locationVersion();
    return loading ??= readGame()
      .then(manifest => {
        const text = manifest && JSON.stringify(manifest);
        if (text !== current) { current = text; toCache(text); set({ manifest }); }
        readAt = Date.now();
        readFor = version;
        set({ loaded: true });
      }, () => set({ loaded: true }))
      .finally(() => { loading = null; });
  },
  fresh: () => (readFor === locationVersion() && Date.now() - readAt < STALE_MS ? Promise.resolve() : get().load()),
}));

/** Define a new nameless speaker in the game (end of core/characters.rpy, grey, never POV) and read the game again, so
 *  every tool knows them right away. Returns their variable ("Kecker Schüler" → kecker_schueler). */
export async function createCharacter(name: string) {
  const id = await addCharacter(name);
  await loading?.catch(() => {}); // a read that started before the write has the old file
  await useGame.getState().load();
  return id;
}

export const characterOf = (m: Manifest | null, id: string | null | undefined) =>
  (id && m?.characters.find(c => c.id === id)) || null;

/** The textbox look of a character: their colour and pattern (the narrator's box takes the POV character's). */
export function boxLook(m: Manifest | null, id: string | null | undefined) {
  const c = characterOf(m, id);
  return {
    color: c?.box ?? c?.color ?? DEFAULT_COLOR,
    // the game's own image where it could be read, else the copy bundled with the tools
    pattern: c?.patternUrl ?? (c?.pattern ? `${import.meta.env.BASE_URL}patterns/${c.pattern}.png` : undefined),
  };
}

/** The game character a name is about: its first word ("Rin Takeda", "rin_casual" → rin). */
export const characterIdIn = (name: string) => name.trim().split(/[\s_-]+/)[0].toLowerCase();

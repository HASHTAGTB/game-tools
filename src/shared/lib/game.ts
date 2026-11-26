import { create } from "zustand";
import { listDir, readJson, TOOLS_DIR } from "./workspace";

/** What the game (HTAWAGE) defines, as its `tools/export_manifest.py` writes it into the vault:
 *  `.game-tools/renpy.json`. Re-run that script after adding characters, sprites, backgrounds or music. */

export type GameCharacter = {
  /** the variable in the script (`rin`) */
  id: string;
  /** what the name box shows ("Rin", "Mama") */
  name: string;
  /** name colour */
  color: string | null;
  /** textbox colour (POV characters) */
  box?: string;
  /** textbox pattern (public/patterns/<pattern>.png) */
  pattern?: string | null;
  /** has a narrator variant (`rin_n`), so the scene can be told from their point of view */
  pov: boolean;
  /** section in characters.rpy ("Main characters", "Satorus Familie") */
  group: string;
};

export type Manifest = {
  version: 1;
  generated: string;
  characters: GameCharacter[];
  /** tag → outfit → expressions ("rin" → "casual" → ["happy", "confused blush"]) */
  sprites: Record<string, Record<string, string[]>>;
  backgrounds: string[];
  music: string[];
  transitions: string[];
  positions: { name: string; params?: Record<string, number> }[];
  labels: string[];
};

export const MANIFEST_PATH = `${TOOLS_DIR}/renpy.json`;

/** Used until the manifest is there, and for characters it doesn't know: the GUI accent. */
export const DEFAULT_COLOR = "#c4956a";

export type GameState = {
  manifest: Manifest | null;
  /** false until the first load finished (then `manifest` null means there is none) */
  loaded: boolean;
  load: () => Promise<void>;
};

export const useGame = create<GameState>()((set) => ({
  manifest: null,
  loaded: false,
  load: async () => {
    try {
      const m = await readJson<Manifest>(MANIFEST_PATH);
      set({ manifest: m && m.version === 1 ? m : null, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));

export const characterOf = (m: Manifest | null, id: string | null | undefined) =>
  (id && m?.characters.find(c => c.id === id)) || null;

/** The textbox look of a character: their colour and pattern (the narrator's box takes the POV character's). */
export function boxLook(m: Manifest | null, id: string | null | undefined) {
  const c = characterOf(m, id);
  return {
    color: c?.box ?? c?.color ?? DEFAULT_COLOR,
    pattern: c?.pattern ? `${import.meta.env.BASE_URL}patterns/${c.pattern}.png` : undefined,
  };
}

/** The character notes in the vault (folders count: "Rin Takeda/" holds her notes), for a scene's `characters`. */
export const CHARACTER_DIRS = ["CANON/01_Characters/01_Main", "CANON/01_Characters/02_Supporting"];
export async function characterNotes(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of CHARACTER_DIRS) {
    for (const e of await listDir(dir).catch(() => [])) {
      if (e.name.startsWith(".")) continue;
      if (e.kind === "directory") out.push(e.name);
      else if (/\.md$/i.test(e.name)) out.push(e.name.replace(/\.md$/i, ""));
    }
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

/** The game character a character note is about: its first name ("Rin Takeda" → rin). */
export const noteCharacterId = (note: string) => note.trim().split(/\s+/)[0].toLowerCase();

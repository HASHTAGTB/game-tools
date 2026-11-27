import { UNKNOWN_COLOR } from "./colors";
import type { GameCharacter } from "./game";
import { TOOLS_DIR } from "./workspace";

/** The story's cast, shared by every tool: `.game-tools/characters.json`. */
export type RosterCharacter = {
  id: string;
  name: string;
  /** Hex color for lanes, cards and links. */
  color: string;
};

export type Roster = { version: 1; characters: RosterCharacter[] };

export const ROSTER_PATH = `${TOOLS_DIR}/characters.json`;

/** The roster as read from its file (null: none yet), with missing names and colours filled in. */
export function normalizeRoster(raw: Partial<Roster> | null): Roster {
  return {
    version: 1,
    characters: (raw?.characters ?? []).filter(c => c?.id).map(c => ({ ...c, name: c.name || c.id, color: c.color || UNKNOWN_COLOR })),
  };
}

/** The roster every tool shows: the file's characters in its order, those the game defines with the game's textbox (or
 *  name) colour, then the game's POV characters the file lacks. Nothing of this is written back: the file only needs
 *  characters that aren't in the game, plus names and order. `game` marks a colour that comes from the game. */
export function withGame(file: RosterCharacter[], game: GameCharacter[] | undefined): (RosterCharacter & { game?: boolean })[] {
  if (!game?.length) return file;
  const byId = new Map(game.map(c => [c.id, c]));
  const colorOf = (c: GameCharacter) => c.box ?? c.color;
  const out = file.map(r => {
    const g = byId.get(r.id), color = g && colorOf(g);
    return color ? { ...r, color, game: true } : r;
  });
  const have = new Set(file.map(r => r.id));
  for (const c of game) if (c.pov && !have.has(c.id)) out.push({ id: c.id, name: c.name, color: colorOf(c) ?? UNKNOWN_COLOR, game: true });
  return out;
}

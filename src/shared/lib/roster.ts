import { UNKNOWN_COLOR } from "./colors";
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

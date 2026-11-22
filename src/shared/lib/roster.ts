import { readJson, TOOLS_DIR, writeJson } from "./workspace";

/** The story's cast, shared by every tool: `.game-tools/characters.json`. */
export type RosterCharacter = {
  id: string;
  name: string;
  /** Hex color for lanes, cards and links. */
  color: string;
};

export type Roster = { version: 1; characters: RosterCharacter[] };

export const ROSTER_PATH = `${TOOLS_DIR}/characters.json`;

export async function loadRoster(): Promise<Roster> {
  const r = await readJson<Partial<Roster>>(ROSTER_PATH);
  return { version: 1, characters: (r?.characters ?? []).filter(c => c?.id).map(c => ({ ...c, name: c.name || c.id, color: c.color || "#9a8f86" })) };
}

export const saveRoster = (r: Roster) => writeJson(ROSTER_PATH, r);

import { readJson, TOOLS_DIR, writeJson } from "./workspace";

/** The story's cast, shared by every tool: `.game-tools/characters.json`. */
export type RosterCharacter = {
  id: string;
  name: string;
  /** Hex color for lanes, cards and links. */
  color: string;
  /** In-world birthday, "2007-11-30" (or "11-30" if only the day is known). */
  birthday?: string;
  /** Ren'Py narrator variable used when the scene is told from this character's view, e.g. "satoru_n". */
  narrator?: string;
};

export type Roster = { version: 1; characters: RosterCharacter[] };

export const ROSTER_PATH = `${TOOLS_DIR}/characters.json`;

export async function loadRoster(): Promise<Roster> {
  const r = await readJson<Partial<Roster>>(ROSTER_PATH);
  return { version: 1, characters: (r?.characters ?? []).filter(c => c?.id).map(c => ({ ...c, name: c.name || c.id, color: c.color || "#9a8f86" })) };
}

export const saveRoster = (r: Roster) => writeJson(ROSTER_PATH, r);

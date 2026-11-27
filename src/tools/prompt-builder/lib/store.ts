import { download } from "@/shared/lib/utils";
import { fileName, joinPath, stem } from "@/shared/lib/paths";
import { jsonText, listFiles, readText, removeFile, toolDir, writeText } from "@/shared/lib/workspace";
import type { Category, Character, Toggle } from "./types";

/** Characters are one `<id>.json` each in the workspace's `.game-tools/prompt-builder/` folder; the file name is the id. */
const DIR = toolDir("prompt-builder");
export const charPath = (id: string) => joinPath(DIR, `${id}.json`);
export const listCharacterFiles = () => listFiles(DIR, ".json");

/** Where character files lived before the shared tools folder: the vault's character notes folder, or the root of an
 *  old dev-server folder. Files found there are moved into DIR once. */
const LEGACY_DIRS = ["CANON/01_Characters", ""];

export const toJson = (c: Character) => jsonText(c);
const looksLikeCharacter = (c: unknown): c is Partial<Character> =>
  !!c && typeof c === "object" && !Array.isArray(c) && ("base" in c || "categories" in c);

/** Fill in missing fields so older / hand-edited files still load. */
export function normalize(raw: Partial<Character>): Character {
  return {
    version: 1,
    id: raw.id ?? "unnamed",
    name: raw.name ?? raw.id ?? "Unnamed",
    base: raw.base ?? [],
    categories: (raw.categories ?? []).map((c: Partial<Category>) => ({
      id: c.id ?? "category", name: c.name ?? "Category", presets: c.presets ?? [], selected: c.selected ?? null,
    })),
    toggles: (raw.toggles ?? []).map((t: Partial<Toggle>) => ({ id: t.id ?? "toggle", name: t.name ?? "Toggle", tags: t.tags ?? [], on: !!t.on })),
    negative: raw.negative ?? "",
    notes: raw.notes ?? "",
  };
}

async function readChars(paths: string[]) {
  const out: [string, Partial<Character>][] = [];
  for (const p of paths) {
    try {
      const c = JSON.parse((await readText(p)) ?? "null");
      if (looksLikeCharacter(c)) out.push([p, c]);
    } catch (err) {
      console.warn(`[prompt-builder] skipping ${p}: ${err}`);
    }
  }
  return out;
}

/** The character in a file (its id is the file name), or null if it isn't one. Throws if it isn't JSON. */
export function parseCharacter(path: string, text: string): Character | null {
  const c = JSON.parse(text);
  return looksLikeCharacter(c) ? normalize({ ...c, id: stem(path) }) : null;
}

/** The characters with one file's text put in (null: the file was deleted); null if the file isn't a character.
 *  Throws if it isn't JSON. */
export function applyCharacterFile(chars: Character[], path: string, text: string | null): Character[] | null {
  const others = chars.filter(c => charPath(c.id) !== path);
  if (text === null) return others;
  const c = parseCharacter(path, text);
  return c && [...others, c];
}

/** Move character files from the first legacy folder that has any, if the tools folder has none yet. */
export async function migrateLegacy() {
  if ((await listCharacterFiles()).length) return;
  for (const dir of LEGACY_DIRS) {
    const found = await readChars(await listFiles(dir, ".json"));
    if (!found.length) continue;
    for (const [path, c] of found) {
      await writeText(joinPath(DIR, fileName(path)), toJson(normalize(c)));
      await removeFile(path);
    }
    return;
  }
}

// ---------------------------------------------------------------- import / export

/** Downloads one character as <id>.json, the same format as a file in the tools folder. */
export const exportCharacter = (c: Character) => download(`${c.id}.json`, toJson(c), "application/json");

/** Reads <id>.json character files (and old all-in-one exports, which hold an array). */
export async function readImport(files: FileList | File[]): Promise<Character[]> {
  const out: Character[] = [];
  for (const f of Array.from(files)) {
    let data: unknown;
    try { data = JSON.parse(await f.text()); } catch { throw new Error(`${f.name} is not valid JSON`); }
    for (const c of Array.isArray(data) ? data : [data]) {
      if (!looksLikeCharacter(c)) throw new Error(`${f.name} does not look like a character file`);
      out.push(normalize(c));
    }
  }
  return out;
}

// ----------------------------------------------------------------

export function newCharacter(name: string, id: string): Character {
  return {
    version: 1, id, name, base: ["1girl", "solo"],
    categories: [
      { id: "outfit", name: "Outfit", presets: [], selected: null },
      { id: "expression", name: "Expression", presets: [], selected: null },
      { id: "pose", name: "Pose", presets: [], selected: null },
    ],
    toggles: [], negative: "", notes: "",
  };
}

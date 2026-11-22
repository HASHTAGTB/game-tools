import { joinPath, listFiles, readText, removeFile, toolDir, writeText } from "@/shared/lib/workspace";
import type { Category, Character, Toggle } from "./types";

/** Characters are one `<id>.json` each in the workspace's `.game-tools/prompt-builder/` folder. */
const DIR = toolDir("prompt-builder");

/** Where character files lived before the shared tools folder: the vault's character notes folder, or the root of an
 *  old dev-server folder. Files found there are moved into DIR once. */
const LEGACY_DIRS = ["CANON/01_Characters", ""];

const fileName = (id: string) => `${id}.json`;
const toJson = (c: Character) => JSON.stringify(c, null, 2) + "\n";
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

/** Move character files from the first legacy folder that has any. Returns how many were moved. */
async function migrateLegacy() {
  for (const dir of LEGACY_DIRS) {
    const found = await readChars(await listFiles(dir, ".json"));
    if (!found.length) continue;
    for (const [path, c] of found) {
      await writeText(joinPath(DIR, path.split("/").pop()!), toJson(normalize(c)));
      await removeFile(path);
    }
    return found.length;
  }
  return 0;
}

export async function listCharacters(): Promise<Character[]> {
  let found = await readChars(await listFiles(DIR, ".json"));
  if (!found.length && await migrateLegacy()) found = await readChars(await listFiles(DIR, ".json"));
  return found.map(([, c]) => normalize(c)).sort((a, b) => a.name.localeCompare(b.name));
}

export const saveCharacter = async (c: Character) => void (await writeText(joinPath(DIR, fileName(c.id)), toJson(c)));

export const deleteCharacter = (id: string) => removeFile(joinPath(DIR, fileName(id)));

// ---------------------------------------------------------------- import / export

/** Downloads one character as <id>.json, the same format as a file in the tools folder. */
export function exportCharacter(c: Character) {
  const blob = new Blob([toJson(c)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: fileName(c.id) });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

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

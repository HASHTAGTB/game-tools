import { GAME_DIR } from "@/shared/vault/places";
import { assetUrl } from "./assetUrl";
import { joinPath, readText, walkFiles, writeText } from "./workspace";
import type { GameCharacter, Manifest } from "./game";

/** Reads what the game defines straight from the Ren'Py project in the vault (`renpy/game`), on whichever backend the
 *  tools use:
 *
 *    characters    every `define x = Character(...)` in core/characters.rpy, with the name colour, the textbox colour
 *                  and pattern from core/gui/say.rpy and whether there is a narrator variant (x_n, so x can be POV)
 *    sprites       assets/images/char/<tag>/<tag>_<outfit>_<expression...>.<ext>  →  {tag: {outfit: [expression]}}
 *    backgrounds   the other files in assets/images (named after the file)
 *    music         assets/audio, without not_used/
 *    transitions   Ren'Py's own plus the `define`s in core/transitions.rpy
 *    positions     the `transform`s in core/transitions.rpy
 *    labels        every label outside scenes/ and dev/ (the Scenes tool reads those itself)
 *
 *  Only file names are needed from assets/, so it works on GitHub too (LFS only changes the contents). The images
 *  themselves are read on demand (assetUrl.ts). */

const ASSETS = `${GAME_DIR}/assets`;
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const AUDIO_EXT = new Set([".mp3", ".ogg", ".opus", ".wav", ".flac"]);
/** Folders under renpy/game that hold no game code of interest (or the Scenes tool's own files). */
const SKIP_CODE = new Set(["scenes", "dev", "assets", "cache", "saves", "tl", "libs"]);

// Ren'Py's built-in transitions (renpy/common/00definitions.rpy), the ones a scene would use
const BUILTIN_TRANSITIONS = [
  "dissolve", "fade", "pixellate", "move", "ease",
  "moveinright", "moveinleft", "moveintop", "moveinbottom",
  "moveoutright", "moveoutleft", "moveouttop", "moveoutbottom",
  "easeinright", "easeinleft", "easeintop", "easeinbottom",
  "easeoutright", "easeoutleft", "easeouttop", "easeoutbottom",
  "zoomin", "zoomout", "zoominout", "vpunch", "hpunch",
  "blinds", "squares", "wipeleft", "wiperight", "wipeup", "wipedown",
  "slideleft", "slideright", "slideup", "slidedown",
  "pushright", "pushleft", "pushup", "pushdown", "irisin", "irisout",
];

const ext = (name: string) => { const i = name.lastIndexOf("."); return i > 0 ? name.slice(i).toLowerCase() : ""; };
const stem = (name: string) => { const i = name.lastIndexOf("."); return i > 0 ? name.slice(0, i) : name; };
const baseName = (path: string) => path.split("/").pop()!;

/** Text of a game file with Unix line endings (Windows checkouts have \r\n); "" if it doesn't exist. */
const gameText = async (rel: string) => ((await readText(joinPath(GAME_DIR, rel)).catch(() => null)) ?? "").replace(/\r\n?/g, "\n");

/** Every file under `dir`, as paths relative to it; `skip`: folders (relative to it) not to look into. */
async function walk(dir: string, skip?: Set<string>): Promise<string[]> {
  const rel = (p: string) => p.slice(dir.length + 1);
  const files = await walkFiles(dir, p => !!skip?.has(rel(p))).catch(() => []);
  return files.map(rel);
}

/** The line without a trailing # comment (outside strings). */
function stripComment(line: string) {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) { if (ch === quote && line[i - 1] !== "\\") quote = null; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#") return line.slice(0, i);
  }
  return line;
}

export function parseCharacters(charactersRpy: string, sayRpy: string): GameCharacter[] {
  const boxes = new Map<string, { box: string; pattern: string | null; patternAsset?: string }>();
  // style rin_window is say_window:\n    background make_textbox_bg("#c97ec8cc", asset("gui/patterns/rin_icon"))
  const box = /^style (\w+)_window is say_window:\n\s+background make_textbox_bg\("(#[0-9a-fA-F]{6})[0-9a-fA-F]{0,2}"(?:,\s*(?:asset\()?"([^"]+)")?/gm;
  for (const m of sayRpy.matchAll(box)) {
    const asset = m[3];
    boxes.set(m[1], {
      box: m[2].toLowerCase(),
      pattern: asset ? stem(baseName(asset)).replace(/_icon$/, "") : null,
      ...(asset && { patternAsset: asset }),
    });
  }

  const out: GameCharacter[] = [], narrators = new Set<string>();
  let group = "";
  for (const raw of charactersRpy.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#")) {
      const head = line.replace(/^[#\s]+/, "").trim();
      // section headers ("# Main characters"), not commented-out code or notes about it
      if (head && !/^(define|Verwendung|Dann|Variable)/.test(head) && !head.includes("=")) group = head;
      continue;
    }
    const m = /^define (\w+)\s*=\s*Character\((None|"[^"]*")(.*)\)\s*$/.exec(stripComment(line).trim());
    if (!m) continue;
    const [, id, name, rest] = m;
    if (name === "None") { narrators.add(id); continue; }
    const color = /color\s*=\s*"(#[0-9a-fA-F]{6})/.exec(rest);
    out.push({ id, name: name.slice(1, -1), color: color ? color[1].toLowerCase() : null, group, pov: false, ...boxes.get(id) });
  }
  for (const c of out) c.pov = narrators.has(`${c.id}_n`);
  return out;
}

export function parseTransitions(transitionsRpy: string) {
  const defs = [...transitionsRpy.matchAll(/^\s*define (\w+)\s*=\s*(.*?)\s*$/gm)];
  const defined = defs.map(m => m[1]);
  const transitionDefs = Object.fromEntries(defs.map(m => [m[1], m[2]]));
  const positions: Manifest["positions"] = [];
  for (const m of transitionsRpy.matchAll(/^transform (\w+)(?:\(([^)]*)\))?:/gm)) {
    const params: Record<string, number> = {};
    for (const p of (m[2] ?? "").split(",")) {
      const i = p.indexOf("=");
      if (i >= 0) params[p.slice(0, i).trim()] = Number(p.slice(i + 1));
    }
    positions.push({ name: m[1], ...(Object.keys(params).length && { params }) });
  }
  return { transitions: [...defined, ...BUILTIN_TRANSITIONS.filter(t => !defined.includes(t))], transitionDefs, positions };
}

export const parseLabels = (rpy: string) =>
  [...rpy.matchAll(/^\s*label (\w+)\s*(?:\(.*\))?:/gm)].map(m => m[1]).filter(l => !l.startsWith("_"));

/** Media file names (paths relative to assets/) → sprites, backgrounds, music, and the file of each image name. */
export function parseMedia(files: string[]) {
  const image = files.filter(f => f.startsWith("images/") && IMAGE_EXT.has(ext(f)) && !stem(baseName(f)).includes("."));
  const sprites: Manifest["sprites"] = {};
  const names = [...new Set(image.filter(f => f.split("/").includes("char")).map(f => stem(baseName(f)).toLowerCase().replace(/_/g, " ")))].sort();
  for (const n of names) {
    const [tag, outfit, ...expr] = n.split(/\s+/);
    if (!expr.length) continue;
    ((sprites[tag] ??= {})[outfit] ??= []).push(expr.join(" "));
  }
  const backgrounds = [...new Set(["black", ...image.filter(f => !f.split("/").includes("char")).map(f => stem(baseName(f)).toLowerCase())])].sort();
  // the name Ren'Py gives each image: sprites with spaces ("rin casual happy"), backgrounds as the file is named
  const imageFiles: Record<string, string> = {};
  for (const f of image) {
    const n = stem(baseName(f)).toLowerCase();
    imageFiles[f.split("/").includes("char") ? n.replace(/_/g, " ") : n] ??= f;
  }
  const music = [...new Set(files.filter(f => f.startsWith("audio/") && AUDIO_EXT.has(ext(f)) && !f.split("/").includes("not_used"))
    .map(f => stem(baseName(f))))].sort();
  return { sprites, backgrounds, music, imageFiles };
}

/** Everything the tools want to know about the game; null if the vault has no game (no core/characters.rpy). */
export async function readGame(): Promise<Manifest | null> {
  const [charactersRpy, sayRpy, transitionsRpy, media, code] = await Promise.all([
    gameText("core/characters.rpy"), gameText("core/gui/say.rpy"), gameText("core/transitions.rpy"),
    walk(ASSETS), walk(GAME_DIR, SKIP_CODE).then(fs => fs.filter(f => f.endsWith(".rpy"))),
  ]);
  if (!charactersRpy) return null;
  const labels = new Set((await Promise.all(code.map(gameText))).flatMap(parseLabels));
  const characters = parseCharacters(charactersRpy, sayRpy);
  await loadPatterns(characters, media);
  return {
    version: 1,
    characters,
    media: media.length > 0,
    ...parseMedia(media),
    ...parseTransitions(transitionsRpy),
    labels: [...labels].sort(),
  };
}

// ---------------------------------------------------------------- new characters

/** Where characters made in the tools go: the nameless speakers at the end of characters.rpy, grey and never POV. */
const NEW_SECTION = "Namenlose / noch unbekannte Sprecher";
const NEW_COLOR = "#b8a99a";
/** Names Ren'Py (or Python) already uses for something else. */
const RESERVED = new Set([
  "narrator", "extend", "centered", "vcentered", "nvl", "adv", "name_only", "config", "gui", "style", "store", "renpy",
  "persistent", "_", "and", "as", "if", "in", "is", "not", "or", "for", "from", "import", "pass", "return", "while", "with",
  "def", "del", "class", "global", "lambda", "try", "yield", "None", "True", "False",
]);

/** The variable for a speaker's name, like the hand-written ones: "Kecker Schüler" → kecker_schueler. */
export function characterVar(name: string) {
  const id = name.trim().toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return !id ? "sprecher" : /^\d/.test(id) ? `sprecher_${id}` : id;
}

/** characters.rpy with a new nameless speaker defined (after the last one), and its variable (free, never taken). */
export function withCharacter(rpy: string, name: string): { text: string; id: string } {
  const lines = rpy.split("\n");
  const taken = new Set([...rpy.matchAll(/^\s*#?\s*define\s+(\w+)/gm)].map(m => m[1]));
  const base = characterVar(name);
  let id = base;
  for (let k = 2; taken.has(id) || RESERVED.has(id); k++) id = `${base}_${k}`;

  const head = lines.findIndex(l => /^#/.test(l) && l.includes(NEW_SECTION.split(" ")[0]));
  let after = -1;
  if (head >= 0) {
    for (let i = head + 1; i < lines.length; i++) {
      if (/^#\s*(?!define)\S/.test(lines[i]) && lines[i - 1].trim() === "") break; // the next section
      if (/^define\s/.test(lines[i])) after = i;
    }
  }
  // line up with the define above it, as the file does
  const prev = after >= 0 ? lines[after] : "";
  const eq = prev.indexOf(" = Character(");
  const arg = prev.indexOf("color=");
  const quoted = `"${name.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')}",`;
  let def = `define ${id}`;
  if (eq > def.length) def = def.padEnd(eq);
  def += " = Character(";
  def = (arg > def.length + quoted.length ? (def + quoted).padEnd(arg) : def + quoted + " ") + `color="${NEW_COLOR}")`;

  if (after >= 0) lines.splice(after + 1, 0, def);
  else {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push("", `# ${NEW_SECTION}`, def, "");
  }
  return { text: lines.join("\n"), id };
}

/** Define a new nameless speaker in the game; returns its variable. */
export async function addCharacter(name: string) {
  const path = joinPath(GAME_DIR, "core/characters.rpy");
  const rpy = await readText(path);
  if (rpy === null) throw new Error("The game has no core/characters.rpy.");
  const { text, id } = withCharacter(rpy.replace(/\r\n?/g, "\n"), name);
  await writeText(path, text);
  return id;
}

// ---------------------------------------------------------------- textbox patterns

/** Tiles made so far, by the icon's object URL (a new URL = the icon changed). */
const tiles = new Map<string, Promise<string | null>>();

/** Give each character with a textbox pattern a tile made from its icon in assets/ (`patternUrl`, a data URL so it can
 *  be cached with the rest). Where the icon can't be read (browser storage has no game files, a checkout without Git
 *  LFS only pointers) `boxLook` falls back to public/patterns. */
async function loadPatterns(chars: GameCharacter[], media: string[]) {
  await Promise.all(chars.map(async c => {
    if (!c.patternAsset) return;
    const file = media.find(f => stem(f) === c.patternAsset && IMAGE_EXT.has(ext(f)));
    const icon = file && await assetUrl(file);
    if (!icon) return;
    if (!tiles.has(icon)) tiles.set(icon, tileOf(icon).catch(() => null));
    const tile = await tiles.get(icon);
    if (tile) c.patternUrl = tile;
  }));
}

/** The tile the textbox CSS repeats (index.css `.say-box`, 120×72): the icon at 30px in a staggered grid with room
 *  around it, like the game's `_make_icon_pattern` (and the copies in public/patterns). */
const TILE = { w: 120, h: 72, icon: 30 };
async function tileOf(iconUrl: string) {
  const img = await createImageBitmap(await (await fetch(iconUrl)).blob());
  const canvas = document.createElement("canvas");
  canvas.width = TILE.w;
  canvas.height = TILE.h;
  const g = canvas.getContext("2d")!;
  const { w, h, icon: s } = TILE;
  for (const [x, y] of [[0, 0], [w / 2, 0], [w / 4, h / 2], [w * 3 / 4, h / 2]]) g.drawImage(img, x, y, s, s);
  img.close();
  return canvas.toDataURL("image/png");
}

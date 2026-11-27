/** Paths in the data folder: relative to it, "/" between the parts ("renpy/game/scenes/sc_x.rpy"). */

export const joinPath = (...parts: string[]) => parts.filter(Boolean).join("/");

/** The folder a path is in ("" at the top). */
export const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

/** The last part of a path, with its extension ("a/b/rin.png" → "rin.png"). */
export const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** A file's extension, lowercased with its dot (".png"); "" if it has none. A leading dot (".gitignore") isn't one. */
export function extOf(path: string) {
  const name = fileName(path), i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i).toLowerCase() : "";
}

/** The path without its file's extension ("gui/patterns/rin_icon.png" → "gui/patterns/rin_icon"). */
export const withoutExt = (path: string) => path.slice(0, path.length - extOf(path).length);

/** The file's name without its extension ("a/b/rin.png" → "rin"). */
export const stem = (path: string) => withoutExt(fileName(path));

/** `path` is `dir` itself or inside it. */
export const isUnder = (path: string, dir: string) => path === dir || path.startsWith(dir + "/");

/** `path` with the folder `from` (or the file itself) replaced by `to`. */
export const rebase = (path: string, from: string, to: string) => (isUnder(path, from) ? to + path.slice(from.length) : path);

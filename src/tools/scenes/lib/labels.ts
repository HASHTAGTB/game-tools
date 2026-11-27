import type { Text } from "@codemirror/state";
import type { Script } from "./script";

/** Labels: the names scenes jump to. A scene file starts with its own label; choices add more (`opt_…` for a route,
 *  `con_…` where the routes meet again). */

/** The label a line starts (`label sc_x:` → sc_x), or null. */
export const labelName = (line: string) => /^\s*label\s+(\w+)/.exec(line)?.[1] ?? null;

/** Every label in the script. */
export const labelsIn = (s: Script) => new Set(s.parsed.flatMap(p => (p?.kind === "label" ? [p.name] : [])));

/** The label the scene starts with. */
export function labelOf(s: Script) {
  for (const p of s.parsed) if (p?.kind === "label") return p.name;
  return null;
}

/** A line that jumps to or calls `name` (outside a comment). */
export const jumpsTo = (name: string) => new RegExp(`^[^#]*\\b(jump|call)\\s+${name}\\b`);

/** The lines of label `name` in `doc`: its label line up to the next label or the end of the file, or null. */
export function labelLines(doc: Text, name: string): [number, number] | null {
  let n = 1;
  while (n <= doc.lines && labelName(doc.line(n).text) !== name) n++;
  if (n > doc.lines) return null;
  let e = n + 1;
  while (e <= doc.lines && !/^label\s/.test(doc.line(e).text)) e++;
  return [n, e - 1];
}

/** A new label `<kind>_<base>_<k>` not in `taken` (which it's added to). */
export function freeLabel(kind: "opt" | "con", base: string, taken: Set<string>) {
  let k = 1;
  while (taken.has(`${kind}_${base}_${k}`)) k++;
  const name = `${kind}_${base}_${k}`;
  taken.add(name);
  return name;
}

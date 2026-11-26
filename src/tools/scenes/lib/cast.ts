import type { EditorState } from "@codemirror/state";
import { characterIdIn, characterOf, type Manifest } from "@/shared/lib/game";
import { manifestField, scriptField } from "./editorState";
import { readInfo } from "./frontmatter";
import { escapeText } from "./renpyText";
import { pad, parseLine, sayText } from "./script";

/** Who's in a scene, names someone typed, and pasted text turned into script lines. */

// ---------------------------------------------------------------- the cast

/** Who can speak in this scene, for Tab and the speaker menu: the scene's characters (from its info) and everyone
 *  who already speaks in it, in order of first appearance. */
export function sceneCast(state: EditorState): string[] {
  const s = state.field(scriptField);
  const m = state.field(manifestField);
  const out: string[] = [];
  const add = (id: string) => { if (!out.includes(id)) out.push(id); };
  for (const note of readInfo(state.doc.toString())?.characters ?? []) {
    const id = characterIdIn(note);
    if (!m || characterOf(m, id)) add(id);
  }
  for (const p of s.parsed) if (p?.kind === "say" && p.who && p.who !== "extend") add(p.who);
  return out;
}

/** A name someone typed ("Rin", "rin", "Mama") as a character id, if the game has them. */
export function resolveName(name: string, m: Manifest | null, cast: string[]): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  if (cast.includes(n)) return n;
  if (!m) return null;
  const c = m.characters.find(c => c.id === n) ?? m.characters.find(c => c.name.toLowerCase() === n);
  return c?.id ?? null;
}

// ---------------------------------------------------------------- paste

/** Pasted text as script lines: Ren'Py stays as it is (re-indented), prose becomes narration, and "Rin: Hallo" Rin's line. */
export function pastedLines(text: string, indent: number, m: Manifest | null, cast: string[]): string[] {
  const raw = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const filled = raw.filter(l => l.trim());
  const renpy = filled.filter(l => { const k = parseLine(l).kind; return k === "say" || k === "stmt" || k === "label" || k === "choice"; }).length;
  if (filled.length && renpy / filled.length >= 0.6) {
    const common = Math.min(...filled.map(l => l.length - l.trimStart().length));
    return raw.map(l => (l.trim() ? " ".repeat(indent) + l.slice(common) : ""));
  }
  const unquote = (s: string) => s.trim().replace(/^[„“”"«»‚‘']+|[„“”"«»‚‘']+$/g, "");
  return raw.map(l => {
    const line = l.trim();
    if (!line) return "";
    const said = /^([\p{L}][\p{L}\d_ .'-]{0,30}?)\s*:\s*(.+)$/u.exec(line);
    const id = said && resolveName(said[1], m, cast);
    return pad(indent) + sayText(id, escapeText(id ? unquote(said![2]) : line));
  });
}

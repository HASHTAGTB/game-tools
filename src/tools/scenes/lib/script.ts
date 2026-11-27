import { asciiIdent } from "@/shared/lib/utils";
import { parseStmt, STATEMENT_WORDS, type Stmt } from "./statements";

/** Reading and writing the Ren'Py in a scene file, one line at a time. Pure: no editor, no React.
 *
 *  A scene file is the game's own .rpy: a few `## key: value` lines at the top (lib/header.ts: title, chapter,
 *  status), then the script (a `label`, then its lines indented under it). Only the statements the team uses are
 *  understood; anything else is `code` and stays editable as it is. */

export type Line =
  | { kind: "blank" }
  /** dialogue (`who` set) or narration. `from`/`to`: the text between the quotes, as offsets into the line.
   *  `tail`: anything after the closing quote (`(reply="x")`, `with vpunch`). */
  | { kind: "say"; indent: number; who: string | null; from: number; to: number; tail: string }
  /** a menu choice: `"Text":` */
  | { kind: "choice"; indent: number; from: number; to: number }
  /** `# note`; `from`: where the note's text starts */
  | { kind: "comment"; indent: number; from: number }
  | { kind: "label"; indent: number; name: string }
  | { kind: "stmt"; indent: number; stmt: Stmt }
  /** anything else in the script (chat blocks, python, statements not known here) */
  | { kind: "code"; indent: number }
  /** a line with a string that doesn't close, or other broken quoting */
  | { kind: "bad"; indent: number; reason: string };

/** Where things are in the file, as line numbers (1-based, like CodeMirror's). */
export type Layout = {
  /** the `## key: value` lines at the top, or null */
  front: { from: number; to: number } | null;
  /** the script's first line: everything from here to the end */
  first: number;
};

/** A header line: `## title: Prolog`. */
export const HEADER_LINE = /^##\s*([A-Za-z_][\w-]*)\s*:(.*)$/;

export function layoutOf(lines: string[]): Layout {
  let n = 0;
  while (n < lines.length && HEADER_LINE.test(lines[n])) n++;
  return { front: n ? { from: 1, to: n } : null, first: n + 1 };
}

/** Is line `n` (1-based) Ren'Py script (not the header)? */
export const inScript = (l: Layout, n: number) => n >= l.first;

// ---------------------------------------------------------------- strings

/** The end of the string starting with the quote at `at` (the index of the closing quote), or -1. */
function stringEnd(s: string, at: number): number {
  for (let i = at + 1; i < s.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s[i] === '"') return i;
  }
  return -1;
}

// ---------------------------------------------------------------- lines

export const indentOf = (s: string) => s.length - s.trimStart().length;
export const pad = (n: number) => " ".repeat(n);

/** Words a say line can't start with: the statements the editor knows, and Ren'Py's other block and line keywords. */
const KEYWORDS = new Set([...STATEMENT_WORDS, "label", "if", "elif", "while", "python", "init", "define", "default", "voice"]);

export function parseLine(text: string): Line {
  const t = text.trim();
  if (!t) return { kind: "blank" };
  const indent = indentOf(text);
  if (t.startsWith("#")) return { kind: "comment", indent, from: indent + (/^#\s?/.exec(t)![0].length) };
  let m: RegExpExecArray | null;
  if ((m = /^label\s+(\w+)\s*(\([^)]*\))?\s*:\s*$/.exec(t))) return { kind: "label", indent, name: m[1] };

  // `who "text" tail`, `"text" tail` or a choice `"text":`
  m = /^(?:([A-Za-z_]\w*)\s+)?"/.exec(t);
  if (m && !KEYWORDS.has(m[1] ?? "")) {
    const q = indent + m[0].length - 1;
    const end = stringEnd(text, q);
    if (end < 0) return { kind: "bad", indent, reason: "This line's text has no closing quote." };
    const tail = text.slice(end + 1).trim();
    // a trailing `# comment` is fine
    const args = tail.replace(/\s*#[^"]*$/, "");
    if (!m[1] && /^(if\s.*)?:$/.test(args)) return { kind: "choice", indent, from: q + 1, to: end };
    if (args && !/^(\(.*\)|with\s+\w+|\(.*\)\s*with\s+\w+)$/.test(args) || args.includes('"') && !args.startsWith("(")) {
      return { kind: "bad", indent, reason: "There's something after this line's text that Ren'Py won't understand. A quote inside the text needs a \\ before it." };
    }
    return { kind: "say", indent, who: m[1] ?? null, from: q + 1, to: end, tail };
  }

  const stmt = parseStmt(t);
  if (stmt) return { kind: "stmt", indent, stmt };
  return { kind: "code", indent };
}

// ---------------------------------------------------------------- writing

/** `who "raw" tail`, without the indent (`raw`: the text as it goes between the quotes). */
export const sayText = (who: string | null, raw = "", tail = "") => `${who ? who + " " : ""}"${raw}"${tail ? " " + tail : ""}`;

// ---------------------------------------------------------------- the whole script

/** Every line of the file, parsed (the header: null). */
export function parseScript(text: string) {
  const lines = text.split("\n");
  const layout = layoutOf(lines);
  const parsed = lines.map((l, i) => (inScript(layout, i + 1) ? parseLine(l) : null));
  return { lines, layout, parsed };
}
export type Script = ReturnType<typeof parseScript>;

// ---------------------------------------------------------------- names

const WEEKDAYS: Record<string, string> = { mo: "mon", di: "tue", mi: "wed", do: "thu", fr: "fri", sa: "sat", so: "sun" };

/** The label a scene's title calls for: `04.04.2025 Fr` → sc_2025_04_04_fri, otherwise scene_<the name>. */
export function suggestLabel(title: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})\s*(\p{L}{2})?/u.exec(title.trim());
  if (m) return `sc_${m[3]}_${m[2]}_${m[1]}${m[4] && WEEKDAYS[m[4].toLowerCase()] ? "_" + WEEKDAYS[m[4].toLowerCase()] : ""}`;
  return "scene_" + (asciiIdent(title) || "untitled");
}

/** A new scene file. */
export const sceneTemplate = (title: string, label = suggestLabel(title)) =>
  `## title: ${title}
## status: idea
## renpy: basic

label ${label}:
    ""
`;

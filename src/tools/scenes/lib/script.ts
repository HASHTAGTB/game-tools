import { parseStmt, type Stmt } from "./statements";

/** Reading and writing the Ren'Py in a scene file, one line at a time. Pure: no editor, no React.
 *
 *  A scene file is Markdown: YAML frontmatter, then one ```python block that holds the script (a `label`, then its
 *  lines indented under it). Text outside the block (notes, to-dos) is left alone. Only the statements the team uses
 *  are understood; anything else is `code` and stays editable as it is. */

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
  /** the frontmatter's `---` lines, or null */
  front: { from: number; to: number } | null;
  /** the ```python block: the fence lines (`close` null if it never closes) */
  code: { open: number; close: number | null } | null;
};

export function layoutOf(lines: string[]): Layout {
  let front: Layout["front"] = null;
  let i = 0;
  if (lines[0]?.trimEnd() === "---") {
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trimEnd() === "---") { front = { from: 1, to: j + 1 }; i = j + 1; break; }
    }
  }
  let code: Layout["code"] = null;
  for (; i < lines.length; i++) {
    if (/^```\s*(python|renpy)?\s*$/i.test(lines[i]) && !code) {
      code = { open: i + 1, close: null };
      for (let j = i + 1; j < lines.length; j++) {
        if (/^```\s*$/.test(lines[j])) { code.close = j + 1; break; }
      }
      break;
    }
  }
  return { front, code };
}

/** Is line `n` (1-based) Ren'Py script? Without a code block, nothing is. */
export const inScript = (l: Layout, n: number) => !!l.code && n > l.code.open && (l.code.close === null || n < l.code.close);

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

/** A chat on the phone: `chat sakari:` (written live) or `chat log sakari:` (already there when the phone opens). */
const CHAT_HEAD = /^\s*chat\s+(log\s+)?(.+?)\s*:\s*$/;
export function chatHead(line: string): { thread: string; log: boolean } | null {
  const m = CHAT_HEAD.exec(line);
  return m && { thread: m[2], log: !!m[1] };
}
export const formatChatHead = (thread: string, log: boolean) => `chat ${log ? "log " : ""}${thread}:`;

export function parseLine(text: string): Line {
  const t = text.trim();
  if (!t) return { kind: "blank" };
  const indent = indentOf(text);
  if (t.startsWith("#")) return { kind: "comment", indent, from: indent + (/^#\s?/.exec(t)![0].length) };
  let m: RegExpExecArray | null;
  if ((m = /^label\s+(\w+)\s*(\([^)]*\))?\s*:\s*$/.exec(t))) return { kind: "label", indent, name: m[1] };

  // `who "text" tail`, `"text" tail` or a choice `"text":`
  m = /^(?:([A-Za-z_]\w*)\s+)?"/.exec(t);
  if (m && !["scene", "show", "hide", "play", "jump", "call", "with", "menu", "label", "if", "elif", "while", "python", "init", "define", "default", "voice"].includes(m[1] ?? "")) {
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

/** Every line of the file, parsed (outside the code block: null). */
export function parseScript(text: string) {
  const lines = text.split("\n");
  const layout = layoutOf(lines);
  const parsed = lines.map((l, i) => (inScript(layout, i + 1) ? parseLine(l) : null));
  return { lines, layout, parsed };
}
export type Script = ReturnType<typeof parseScript>;

/** The ```python block's lines, as a .rpy file. */
export function exportRpy(text: string): string {
  const { lines, layout } = parseScript(text);
  if (!layout.code) return "";
  const end = layout.code.close ?? lines.length + 1;
  return lines.slice(layout.code.open, end - 1).join("\n").replace(/\s+$/, "") + "\n";
}

// ---------------------------------------------------------------- names

const WEEKDAYS: Record<string, string> = { mo: "mon", di: "tue", mi: "wed", do: "thu", fr: "fri", sa: "sat", so: "sun" };

/** The label a scene file's name calls for: `04.04.2025 Fr` → sc_2025_04_04_fri, otherwise scene_<the name>. */
export function suggestLabel(fileName: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})\s*(\p{L}{2})?/u.exec(fileName.trim());
  if (m) return `sc_${m[3]}_${m[2]}_${m[1]}${m[4] && WEEKDAYS[m[4].toLowerCase()] ? "_" + WEEKDAYS[m[4].toLowerCase()] : ""}`;
  const slug = fileName.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return "scene_" + (slug || "untitled");
}

/** A new scene file. */
export const sceneTemplate = (name: string) => `---
tags:
  - scene
status: idea
renpy: basic
owner:
characters:
---
\`\`\`python
label ${suggestLabel(name)}:
    ""
\`\`\`
`;

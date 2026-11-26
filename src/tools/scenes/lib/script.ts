/** Reading and writing the Ren'Py in a scene file, one line at a time. Pure: no editor, no React.
 *
 *  A scene file is Markdown: YAML frontmatter, then one ```python block that holds the script (a `label`, then its
 *  lines indented under it). Text outside the block (notes, to-dos) is left alone. Only the statements the team uses
 *  are understood; anything else is `code` and stays editable as it is. */

export type Stmt =
  | { kind: "scene"; image: string; with?: string }
  | { kind: "show"; tag: string; attrs: string[]; at?: string; with?: string }
  | { kind: "hide"; tag: string; with?: string }
  | { kind: "with"; with: string }
  | { kind: "play"; channel: string; name: string; fadein?: string }
  | { kind: "stop"; channel: string; fadeout?: string }
  | { kind: "pov"; who: string }
  | { kind: "date"; date: string; time?: string }
  | { kind: "time"; time: string }
  | { kind: "jump"; target: string }
  | { kind: "call"; target: string }
  | { kind: "pause"; seconds?: string }
  /** the game's phone: `phone on` (with a chat: shown on it), `phone off`, `phone open sakari` */
  | { kind: "phone"; action: "on" | "off" | "open"; thread?: string }
  | { kind: "return" }
  | { kind: "menu" };

export type StmtKind = Stmt["kind"];

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

/** Text as it goes between quotes: `"` and `\` escaped, `[` doubled (Ren'Py reads `[x]` as a variable). */
export const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\[/g, "[[");
/** The other way: what a string's text means. */
export const unescapeText = (s: string) => s.replace(/\\(.)|\[\[/g, (_, c) => c ?? "[");

// ---------------------------------------------------------------- lines

const WORD = /^[A-Za-z_]\w*$/;
const indentOf = (s: string) => s.length - s.trimStart().length;

/** Split `with x` off the end of a statement's words. */
function takeWith(words: string[]): string | undefined {
  const i = words.lastIndexOf("with");
  if (i < 0 || i !== words.length - 2) return undefined;
  const w = words[i + 1];
  words.splice(i);
  return w;
}

/** Split `at x` off (x may be `sprite(xalign=0.3, zoom=0.4)`, with spaces). */
function takeAt(rest: string): { rest: string; at?: string } {
  const m = /\s+at\s+(\w+(?:\([^)]*\))?)\s*(?=$|\s+with\s)/.exec(rest);
  if (!m) return { rest };
  return { rest: rest.slice(0, m.index) + rest.slice(m.index + m[0].length), at: m[1] };
}

function parseStmt(body: string): Stmt | null {
  let m: RegExpExecArray | null;
  if ((m = /^\$\s*narrator\s*=\s*(\w+)_n\s*$/.exec(body))) return { kind: "pov", who: m[1] };
  if ((m = /^\$\s*set_date\(\s*"([^"]*)"\s*(?:,\s*"([^"]*)"\s*)?\)\s*$/.exec(body))) return { kind: "date", date: m[1], time: m[2] };
  if ((m = /^time\s+(\d{1,2}:\d{2})\s*$/.exec(body))) return { kind: "time", time: m[1] };
  if ((m = /^(jump|call)(?:\s+(\w+))?\s*$/.exec(body))) return { kind: m[1] as "jump" | "call", target: m[2] ?? "" };
  if (/^menu\s*:\s*$/.test(body)) return { kind: "menu" };
  if ((m = /^phone\s+(on|off)(?:\s+(\S.*?))?\s*$/.exec(body))) return { kind: "phone", action: m[1] as "on" | "off", thread: m[2] };
  if (/^return\s*$/.test(body)) return { kind: "return" };
  if ((m = /^phone\s+open\s+(\S.*?)\s*$/.exec(body))) return { kind: "phone", action: "open", thread: m[1] };
  if ((m = /^pause(?:\s+([\d.]+))?\s*$/.exec(body))) return { kind: "pause", seconds: m[1] };
  if ((m = /^with\s+(\w+)\s*$/.exec(body))) return { kind: "with", with: m[1] };
  if ((m = /^play\s+(\w+)\s+(\w+)(?:\s+fadein\s+([\d.]+))?\s*$/.exec(body))) return { kind: "play", channel: m[1], name: m[2], fadein: m[3] };
  if ((m = /^stop\s+(\w+)(?:\s+fadeout\s+([\d.]+))?\s*$/.exec(body))) return { kind: "stop", channel: m[1], fadeout: m[2] };

  const [head, ...restWords] = body.split(/\s+/);
  if (head === "scene") {
    const words = [...restWords];
    const w = takeWith(words);
    if (!words.length || !words.every(x => WORD.test(x))) return null;
    return { kind: "scene", image: words.join(" "), with: w };
  }
  if (head === "show" || head === "hide") {
    const { rest, at } = takeAt(" " + restWords.join(" "));
    const words = rest.trim().split(/\s+/).filter(Boolean);
    const w = takeWith(words);
    if (!words.length || !words.every(x => WORD.test(x)) || words[0] === "screen") return null;
    if (head === "hide") return words.length === 1 && !at ? { kind: "hide", tag: words[0], with: w } : null;
    return { kind: "show", tag: words[0], attrs: words.slice(1), at, with: w };
  }
  return null;
}

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

const pad = (n: number) => " ".repeat(n);

export function formatStmt(s: Stmt): string {
  const w = (x?: string) => (x ? ` with ${x}` : "");
  switch (s.kind) {
    case "scene": return `scene ${s.image}${w(s.with)}`;
    case "show": return `show ${[s.tag, ...s.attrs].join(" ")}${s.at ? ` at ${s.at}` : ""}${w(s.with)}`;
    case "hide": return `hide ${s.tag}${w(s.with)}`;
    case "with": return `with ${s.with}`;
    case "play": return `play ${s.channel} ${s.name}${s.fadein ? ` fadein ${s.fadein}` : ""}`;
    case "stop": return `stop ${s.channel}${s.fadeout ? ` fadeout ${s.fadeout}` : ""}`;
    case "pov": return `$ narrator = ${s.who}_n`;
    case "date": return `$ set_date("${s.date}"${s.time ? `, "${s.time}"` : ""})`;
    case "time": return `time ${s.time}`;
    case "jump": case "call": return `${s.kind} ${s.target}`.trimEnd();
    case "pause": return s.seconds ? `pause ${s.seconds}` : "pause";
    case "phone": return `phone ${s.action}${s.thread ? " " + s.thread : ""}`;
    case "return": return "return";
    case "menu": return "menu:";
  }
}

export const sayLine = (indent: number, who: string | null, text = "", tail = "") =>
  `${pad(indent)}${who ? who + " " : ""}"${text}"${tail ? " " + tail : ""}`;

/** The indent of a script line written below line `n` (index into `lines`): like the line above, one step deeper
 *  after a line that opens a block (`menu:`, `chat x:`, a choice). */
export function indentAfter(lines: string[], n: number, layout: Layout): number {
  for (let i = n; i >= 0; i--) {
    if (!inScript(layout, i + 1)) break;
    const s = lines[i];
    if (!s.trim()) continue;
    const ind = indentOf(s);
    return s.trimEnd().endsWith(":") && !s.trim().startsWith("#") ? ind + 4 : ind;
  }
  return 4;
}

// ---------------------------------------------------------------- the whole script

/** Every line of the file, parsed (outside the code block: null). */
export function parseScript(text: string) {
  const lines = text.split("\n");
  const layout = layoutOf(lines);
  const parsed = lines.map((l, i) => (inScript(layout, i + 1) ? parseLine(l) : null));
  return { lines, layout, parsed };
}
export type Script = ReturnType<typeof parseScript>;

/** The label the scene starts with. */
export const labelOf = (s: Script) => {
  for (const p of s.parsed) if (p?.kind === "label") return p.name;
  return null;
};

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

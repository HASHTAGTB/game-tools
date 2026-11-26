/** Ren'Py syntax colouring, for the raw boxes and the source view. Pure: lines in, coloured spans out.
 *
 *  Works line by line, the way Ren'Py reads a script: a line starts with a statement (`show`, `jump`, `$`, a speaker
 *  …) and its words mean something by position (`show` is followed by image words until `at`/`with`/`as`). Lines
 *  under `python:` and after `$` are Python. Strings show their text tags (`{w=0.3}`) and interpolations (`[name]`). */

export type Tok =
  /** a statement (`show`, `label`, `$`) / a word inside one (`at`, `with`, `fadein`) */
  | "kw" | "kw2"
  /** a label name after `label`/`jump`/`call` */
  | "name"
  /** image words after `scene`/`show`/`hide` */
  | "img"
  | "str" | "tag" | "var" | "esc" | "num" | "com" | "op"
  /** the speaker of a line (coloured like the character) */
  | "who";

export type Span = { from: number; to: number; tok: Tok; color?: string };

/** Statements a Ren'Py line can start with (the game's own included: `pov` via $, `time`, `phone`, `chat`). */
const STMT = new Set([
  "label", "jump", "call", "return", "pass", "menu", "scene", "show", "hide", "with", "play", "stop", "queue", "pause",
  "define", "default", "image", "init", "python", "screen", "transform", "style", "translate", "window", "nvl", "voice",
  "camera", "if", "elif", "else", "while", "for", "time", "phone", "chat", "extend", "layeredimage", "testcase",
  "use", "add", "text", "textbutton", "button", "imagebutton", "vbox", "hbox", "frame", "fixed", "grid", "key", "on",
  "action", "parallel", "block", "contains", "choice", "repeat", "linear", "ease", "easein", "easeout", "pause",
]);
/** Words that mean something inside a statement. */
const CLAUSE = new Set([
  "at", "with", "as", "if", "behind", "onlayer", "zorder", "expression", "fadein", "fadeout", "loop", "noloop", "if_changed",
  "from", "in", "not", "and", "or", "is", "log", "on", "off", "open", "early", "hide", "screen", "nopredict", "volume",
]);
const IMAGE_STMT = new Set(["scene", "show", "hide"]);
const LABEL_STMT = new Set(["label", "jump", "call"]);
const PY_KW = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else", "except", "False",
  "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass",
  "raise", "return", "True", "try", "while", "with", "yield",
]);

/** `whoColor(id)`: a speaker's colour, or null when the word isn't a character (then it's not coloured as one). */
export function highlight(lines: string[], whoColor: (id: string) => string | null): Span[][] {
  /** the indent of the `python:` line whose block we're in, or -1 */
  let py = -1;
  return lines.map(text => {
    const t = text.trimStart();
    const ind = text.length - t.length;
    if (!t) return [];
    if (py >= 0 && ind <= py) py = -1;
    if (py >= 0) return line(text, ind, "py", whoColor);
    const out = line(text, ind, "renpy", whoColor);
    if (/(^|\s)python(\s+\w+)?\s*:\s*(#.*)?$/.test(t)) py = ind;
    return out;
  });
}

const isWord = (c: string) => /[A-Za-z0-9_]/.test(c);

function line(text: string, start: number, mode: "renpy" | "py", whoColor: (id: string) => string | null): Span[] {
  const out: Span[] = [];
  const push = (from: number, to: number, tok: Tok, color?: string) => { if (to > from) out.push({ from, to, tok, color }); };
  let i = start;
  /** words seen so far on this line (Ren'Py mode), to tell what a word means by its place */
  let n = 0;
  let head = "";
  let images = false;
  let py = mode === "py";

  while (i < text.length) {
    const c = text[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === "#") { push(i, text.length, "com"); break; }
    if (c === '"' || c === "'" || c === "`") { i = string(text, i, push); n++; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(text[i + 1] ?? ""))) {
      const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(text.slice(i))!;
      push(i, i + m[0].length, "num"); i += m[0].length; n++; continue;
    }
    if (isWord(c)) {
      let j = i;
      while (j < text.length && isWord(text[j])) j++;
      const w = text.slice(i, j);
      const after = text.slice(j).trimStart();
      if (py) {
        if (PY_KW.has(w)) push(i, j, "kw2");
      } else if (n === 0) {
        if (STMT.has(w) && !(after.startsWith("=") && !after.startsWith("=="))) {
          push(i, j, "kw"); head = w;
          images = IMAGE_STMT.has(w);
          // the rest of these is a Python expression
          if (["if", "elif", "while", "for", "define", "default"].includes(w)) py = w !== "define" && w !== "default";
        } else if (after.startsWith('"') || after.startsWith("'")) {
          const col = whoColor(w);
          push(i, j, "who", col ?? undefined);
        }
      } else if (images && !CLAUSE.has(w)) {
        push(i, j, "img");
      } else if ((head === "play" || head === "queue") && n >= 2 && !CLAUSE.has(w)) {
        push(i, j, "img");
      } else if (LABEL_STMT.has(head) && n === 1 && w !== "expression" && w !== "screen") {
        push(i, j, "name");
      } else if (CLAUSE.has(w) || (head === "init" && (w === "python" || w === "offset"))) {
        push(i, j, "kw2");
        if (images && w !== "expression") images = false;
      }
      // `define x = …`, `default x = …`: Python after the =
      if ((head === "define" || head === "default") && after.startsWith("=")) py = true;
      i = j; n++; continue;
    }
    if (c === "$" && n === 0 && !py) { push(i, i + 1, "kw"); py = true; i++; n++; continue; }
    if (/[:=()[\]{},+\-*/<>!%.|&]/.test(c)) {
      push(i, i + 1, "op");
      // `show x at y:` — after the colon only an ATL block can follow
      if (c === "(" && images) images = false;
      i++; continue;
    }
    i++;
  }
  return out;
}

/** A string from the quote at `at`, with its tags, interpolations and escapes; returns where it ends. */
function string(text: string, at: number, push: (from: number, to: number, tok: Tok) => void): number {
  const q = text[at];
  const triple = text.startsWith(q.repeat(3), at);
  const close = triple ? q.repeat(3) : q;
  let i = at + close.length;
  let run = at;
  const flush = (to: number) => { push(run, to, "str"); };
  while (i < text.length) {
    if (text.startsWith(close, i)) { i += close.length; flush(i); return i; }
    const c = text[i];
    if (c === "\\" && i + 1 < text.length) { flush(i); push(i, i + 2, "esc"); i += 2; run = i; continue; }
    if ((c === "{" || c === "[") && text[i + 1] === c) { i += 2; continue; }   // `{{` / `[[`: a plain brace
    if (c === "{" || c === "[") {
      const end = text.indexOf(c === "{" ? "}" : "]", i);
      if (end > 0) { flush(i); push(i, end + 1, c === "{" ? "tag" : "var"); i = end + 1; run = i; continue; }
    }
    i++;
  }
  flush(text.length);
  return text.length;
}

/** The text of a line as Ren'Py reads it: plain text, text tags (`{w=0.5}`, `{i}…{/i}`) and escapes (`\"`). Offsets
 *  are into the raw text between the quotes. */

export type Tok =
  | { kind: "text"; from: number; to: number; text: string }
  /** `\"`, `\n`, `{{`, `[[`: what it stands for in `text` */
  | { kind: "escape"; from: number; to: number; text: string }
  /** `[name]`: a variable Ren'Py fills in; `text` is it as written */
  | { kind: "var"; from: number; to: number; text: string }
  | { kind: "tag"; from: number; to: number; name: string; value: string | null; close: boolean };

export function tokenize(raw: string): Tok[] {
  const out: Tok[] = [];
  let run = "", runFrom = 0;
  const flush = (at: number) => { if (run) out.push({ kind: "text", from: runFrom, to: at, text: run }); run = ""; };
  for (let i = 0; i < raw.length;) {
    const c = raw[i];
    if (c === "\\" && i + 1 < raw.length) {
      flush(i);
      const n = raw[i + 1];
      out.push({ kind: "escape", from: i, to: i + 2, text: n === "n" ? "\n" : n });
      i += 2; runFrom = i; continue;
    }
    if ((c === "{" || c === "[") && raw[i + 1] === c) {
      flush(i);
      out.push({ kind: "escape", from: i, to: i + 2, text: c });
      i += 2; runFrom = i; continue;
    }
    if (c === "[") {
      const end = raw.indexOf("]", i);
      if (end > i) {
        flush(i);
        out.push({ kind: "var", from: i, to: end + 1, text: raw.slice(i, end + 1) });
        i = end + 1; runFrom = i; continue;
      }
    }
    if (c === "{") {
      const end = raw.indexOf("}", i);
      if (end > i) {
        flush(i);
        const body = raw.slice(i + 1, end);
        const close = body.startsWith("/");
        const [name, ...v] = (close ? body.slice(1) : body).split("=");
        out.push({ kind: "tag", from: i, to: end + 1, name: name.trim(), value: v.length ? v.join("=") : null, close });
        i = end + 1; runFrom = i; continue;
      }
    }
    if (!run) runFrom = i;
    run += c;
    i++;
  }
  flush(raw.length);
  return out;
}

/** Tags that come in pairs, `{i}…{/i}`. */
export const PAIRED = new Set(["i", "b", "u", "s", "cps", "color", "size", "alpha", "font", "k", "a", "plain"]);

/** The text as the player reads it (tags dropped). */
export const plainText = (raw: string) => tokenize(raw).map(t => (t.kind === "tag" ? "" : t.text)).join("");

// ---------------------------------------------------------------- the text crawl

export type Style = { i: boolean; b: boolean; u: boolean; s: boolean };
/** What the preview writes out, in order: characters (with their style and speed) and pauses (seconds; `click`: the
 *  player has to click, shown as a short pause). */
export type Beat =
  | { kind: "char"; ch: string; style: Style; cps: number }
  | { kind: "pause"; seconds: number; click: boolean };

/** Characters per second at Ren'Py's default text speed setting. */
export const BASE_CPS = 40;

export function beatsOf(raw: string): Beat[] {
  const out: Beat[] = [];
  const style: Style = { i: false, b: false, u: false, s: false };
  const speeds: number[] = [];
  const cps = () => speeds.reduce((a, f) => a * f, BASE_CPS);
  for (const t of tokenize(raw)) {
    if (t.kind !== "tag") {
      for (const ch of t.text) out.push({ kind: "char", ch, style: { ...style }, cps: cps() });
      continue;
    }
    const { name, value, close } = t;
    if (name in style) { style[name as keyof Style] = !close; continue; }
    if (name === "cps") {
      if (close) speeds.pop();
      else if (value?.startsWith("*")) speeds.push(+value.slice(1) || 1);
      else if (value) speeds.push((+value || BASE_CPS) / BASE_CPS);
      continue;
    }
    if (name === "w") out.push({ kind: "pause", seconds: value ? +value || 0.5 : 0.6, click: !value });
    else if (name === "p") {
      out.push({ kind: "pause", seconds: value ? +value || 0.6 : 0.6, click: !value });
      out.push({ kind: "char", ch: "\n", style: { ...style }, cps: cps() });
    }
  }
  return out;
}

/** A Markdown (GFM) table as data, and back. Cells hold their text as the reader sees it: `\|` in the file is `|` here
 *  and gets escaped again on the way out. Pure functions, no DOM. */

export type Align = "left" | "center" | "right" | null;

export type Table = {
  /** What starts every line, for tables inside a quote (`> `) or indented. */
  prefix: string;
  header: string[];
  align: Align[];
  rows: string[][];
};

/** A row's cells: split on `|`, but not on `\|` or inside `code` or [[links|alias]] (Obsidian writes `[[a\|b]]` in
 *  tables, but a bare `|` in a link shouldn't split the cell either). */
export function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  const out: string[] = [];
  let cur = "", tick = false, link = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "\\" && t[i + 1] === "|") { cur += "|"; i++; continue; }
    // a backtick opens code only if another one closes it (GFM): a stray ` in "it`s" is plain text
    if (c === "`" && (tick || t.indexOf("`", i + 1) !== -1)) tick = !tick;
    else if (!tick && t.startsWith("[[", i)) link++;
    else if (!tick && link && t.startsWith("]]", i)) link--;
    if (c === "|" && !tick && !link) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

const PREFIX = /^[ \t]*(?:>[ \t]?)*/;

export function parseTable(source: string): Table {
  const lines = source.split("\n");
  const prefix = PREFIX.exec(lines[0])![0];
  const strip = (l: string) => (l.startsWith(prefix) ? l.slice(prefix.length) : l.replace(PREFIX, ""));
  const [head, delim = "", ...body] = lines.map(strip);
  const header = splitRow(head);
  const n = header.length;
  const align = fit(splitRow(delim).map((d): Align =>
    d.startsWith(":") && d.endsWith(":") && d.length > 1 ? "center" : d.endsWith(":") ? "right" : d.startsWith(":") ? "left" : null), n, null);
  const rows = body.filter(l => l.trim()).map(l => fit(splitRow(l), n, ""));
  return { prefix, header, align, rows };
}

/** `xs` cut or filled to `n` items (extra cells in a row are ignored by Markdown anyway). */
function fit<T>(xs: T[], n: number, fill: T): T[] {
  return xs.length >= n ? xs.slice(0, n) : [...xs, ...Array<T>(n - xs.length).fill(fill)];
}

/** Columns a string takes in a monospace font: CJK and emoji count double, so the pipes still line up. */
function width(s: string) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    w += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) ? 2 : 1;
  }
  return w;
}

const escape = (s: string) => s.replace(/\\?\|/g, "\\|");

/** The table as Markdown with its pipes lined up, each cell padded the way its column is aligned. */
export function formatTable(t: Table): string {
  const cols = t.header.length;
  const all = [t.header, ...t.rows].map(r => r.map(escape));
  const w = Array.from({ length: cols }, (_, c) => Math.max(3, ...all.map(r => width(r[c] ?? ""))));
  const pad = (s: string, c: number) => {
    const gap = w[c] - width(s);
    if (t.align[c] === "right") return " ".repeat(gap) + s;
    if (t.align[c] === "center") return " ".repeat(gap >> 1) + s + " ".repeat(gap - (gap >> 1));
    return s + " ".repeat(gap);
  };
  const line = (r: string[]) => t.prefix + "| " + r.map(pad).join(" | ") + " |";
  const rule = t.prefix + "| " + w.map((n, c) => {
    const a = t.align[c];
    return a === "center" ? ":" + "-".repeat(n - 2) + ":" : a === "right" ? "-".repeat(n - 1) + ":" : a === "left" ? ":" + "-".repeat(n - 1) : "-".repeat(n);
  }).join(" | ") + " |";
  return [line(all[0]), rule, ...all.slice(1).map(line)].join("\n");
}

// ---------------------------------------------------------------- edits (each returns a new table)

const move = <T>(xs: T[], from: number, to: number) => {
  const out = [...xs];
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
};

/** Row -1 is the header, 0… the body rows. */
export function setCell(t: Table, row: number, col: number, text: string): Table {
  if (row < 0) return { ...t, header: t.header.map((h, c) => (c === col ? text : h)) };
  return { ...t, rows: t.rows.map((r, i) => (i === row ? r.map((x, c) => (c === col ? text : x)) : r)) };
}
export const cellText = (t: Table, row: number, col: number) => (row < 0 ? t.header[col] : t.rows[row]?.[col]) ?? "";

export const insertRow = (t: Table, at: number): Table =>
  ({ ...t, rows: [...t.rows.slice(0, at), Array<string>(t.header.length).fill(""), ...t.rows.slice(at)] });
export const deleteRow = (t: Table, at: number): Table => ({ ...t, rows: t.rows.filter((_, i) => i !== at) });
export const moveRow = (t: Table, from: number, to: number): Table => ({ ...t, rows: move(t.rows, from, to) });

const eachRow = (t: Table, f: <T>(r: T[], fill: T) => T[]): Table =>
  ({ ...t, header: f(t.header, ""), align: f(t.align, null as Align), rows: t.rows.map(r => f(r, "")) });
export const insertCol = (t: Table, at: number) => eachRow(t, (r, fill) => [...r.slice(0, at), fill, ...r.slice(at)]);
export const deleteCol = (t: Table, at: number) => eachRow(t, r => r.filter((_, i) => i !== at));
export const moveCol = (t: Table, from: number, to: number) => eachRow(t, r => move(r, from, to));
export const alignCol = (t: Table, at: number, a: Align): Table => ({ ...t, align: t.align.map((x, i) => (i === at ? a : x)) });

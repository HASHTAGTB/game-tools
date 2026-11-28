import { buildJson, diffJson, ORDER, pathKey, type JChange, type JPath, type Json, type Maybe } from "./json";
import { diffSeq, merge3 } from "./seq";

/** One file in two (or, for a merge, three) versions, cut into the changes a person picks a side for. Text files go
 *  by lines; the tools' JSON by meaning (json.ts), shown as readable "Field: value" lines rather than JSON. */

/** A file's text, or null: it doesn't exist on that side. */
export type Version = string | null;
/** `a` and `b`: the two sides (before / now, or mine / theirs). `o`: what both started from, for a merge. `binary`:
 *  an image or other file that can only be taken whole (its texts only need to tell if it's there). */
export type FileCompare = { path: string; a: Version; b: Version; o?: Version; binary?: boolean };

export type Pick = "a" | "b" | "both";

/** One change: what it shows on each side, and where in the file it is. */
export type Chunk = {
  id: string;
  kind: "lines" | "value" | "order" | "file";
  a: string[]; b: string[];
  /** What it was before either side changed it (merges). */
  o?: string[];
  /** Where in the file ("Event “Mia meets Leo” › Title"); text changes have their line numbers instead. */
  where?: string;
  /** Line number (1-based) on each side, for text. */
  line?: { a: number; b: number };
  /** Merges: the side taken without asking (only it changed this); null: both changed it, someone has to pick. */
  auto?: "a" | "b" | null;
  /** Both sides can be kept (lines one after the other; two lists joined). */
  canBoth: boolean;
};
export type Part = { same: string[]; line: number } | { chunk: Chunk };

export type FileDiff = {
  path: string;
  title: string;
  /** The folder or tool it's in. */
  place: string;
  kind: "text" | "json" | "binary";
  status: "added" | "deleted" | "changed";
  merge: boolean;
  parts: Part[];
  chunks: Chunk[];
  /** The file's text with these picks (missing: `b`, or the side a merge took); null: no file. */
  build: (picks: Map<string, Pick>) => Version;
};

/** Id → name of everything the tools give an id (characters, threads, events, presets), to show names, not ids.
 *  The first name found for an id stays (the shared roster comes first in the tools' folder). */
export type Names = Map<string, string>;

export function indexNames(values: unknown[], into: Names = new Map()) {
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const name = o.name ?? o.title;
    if (typeof o.id === "string" && typeof name === "string" && name && !into.has(o.id)) into.set(o.id, name);
    Object.values(o).forEach(walk);
  };
  values.forEach(walk);
  return into;
}

const parse = (t: Version): Maybe => {
  if (t === null) return undefined;
  try { return JSON.parse(t) as Json; } catch { return undefined; }
};
const lines = (t: Version) => (t === null ? [] : t.split("\n"));
const isJsonPath = (p: string) => p.toLowerCase().endsWith(".json");

export function compareFile(f: FileCompare, names: Names): FileDiff {
  const merge = f.o !== undefined;
  const status = f.a === null ? "added" : f.b === null ? "deleted" : "changed";
  const { title, place } = fileTitle(f.path, parse(f.b ?? f.a));
  const base = { path: f.path, title, place, status, merge } as const;

  const ja = parse(f.a), jb = parse(f.b), jo = merge ? parse(f.o!) : undefined;
  const asJson = !f.binary && isJsonPath(f.path) && (f.a === null || ja !== undefined) && (f.b === null || jb !== undefined)
    && (!merge || f.o === null || jo !== undefined);
  const kind = f.binary ? "binary" : asJson ? "json" : "text";

  // one side has no file: the whole file is the change (a merge where the other side changed or deleted it too)
  if (f.a === null || f.b === null || f.binary) {
    const show = (t: Version, j: Maybe) => t === null ? [] : f.binary ? ["(file)"] : asJson ? readable(j, names) : lines(t);
    const auto = merge ? autoSide(f.o!, f.a, f.b) : undefined;
    const chunk: Chunk = { id: "file", kind: "file", a: show(f.a, ja), b: show(f.b, jb), canBoth: false, ...(merge ? { auto, o: show(f.o!, jo) } : {}) };
    return { ...base, kind, parts: [{ chunk }], chunks: [chunk], build: p => pickOf(p, chunk) === "a" ? f.a : f.b };
  }

  if (asJson) return { ...base, kind, ...jsonParts(f, ja, jb, jo, names) };
  return { ...base, kind, ...textParts(f) };
}

/** Which side a merge takes for the whole file (only one changed it), null if both did, differently. */
function autoSide(o: Version, a: Version, b: Version): "a" | "b" | null {
  if (a === b || o === b) return "a";
  if (o === a) return "b";
  return null;
}

/** The side a change gets: picked, else what a merge took, else `b` (now). Undefined: a clash nobody picked yet. */
export function pickOf(picks: Map<string, Pick>, c: Chunk): Pick | undefined {
  return picks.get(c.id) ?? (c.auto === undefined ? "b" : c.auto ?? undefined);
}

function textParts(f: FileCompare) {
  const la = lines(f.a), lb = lines(f.b);
  const parts: Part[] = [];
  const chunks: Chunk[] = [];
  let lineA = 1, lineB = 1;
  if (f.o === undefined) {
    for (const r of diffSeq(la, lb)) {
      if (r.same) parts.push({ same: la.slice(r.a0, r.a1), line: lineB });
      else {
        const c: Chunk = { id: `t${chunks.length}`, kind: "lines", a: la.slice(r.a0, r.a1), b: lb.slice(r.b0, r.b1), line: { a: lineA, b: lineB }, canBoth: r.a1 > r.a0 && r.b1 > r.b0 };
        chunks.push(c);
        parts.push({ chunk: c });
      }
      lineA += r.a1 - r.a0; lineB += r.b1 - r.b0;
    }
  } else {
    for (const r of merge3(lines(f.o), la, lb)) {
      if (r.same || (r.a.join("\n") === r.b.join("\n"))) {
        const items = r.same ? r.items : r.a;
        parts.push({ same: items, line: lineB });
        lineA += items.length; lineB += items.length;
        continue;
      }
      const c: Chunk = { id: `t${chunks.length}`, kind: "lines", a: r.a, b: r.b, o: r.o, auto: r.auto, line: { a: lineA, b: lineB }, canBoth: r.a.length > 0 && r.b.length > 0 };
      chunks.push(c);
      parts.push({ chunk: c });
      lineA += r.a.length; lineB += r.b.length;
    }
  }
  const build = (picks: Map<string, Pick>): Version => {
    const out: string[] = [];
    for (const p of parts) {
      if ("same" in p) { out.push(...p.same); continue; }
      const pick = pickOf(picks, p.chunk) ?? "a";
      if (pick !== "b") out.push(...p.chunk.a);
      if (pick !== "a") out.push(...p.chunk.b);
    }
    return out.join("\n");
  };
  return { parts, chunks, build };
}

function jsonParts(f: FileCompare, ja: Maybe, jb: Maybe, jo: Maybe, names: Names) {
  const merge = f.o !== undefined;
  const changes = diffJson(ja, jb, merge, jo);
  // things are named as they were before (the base, else side a), so a renamed event is found by its old name
  const docs = [jo, ja, jb];
  const chunks = changes.map((c): Chunk => toChunk(c, docs, names));
  const build = (picks: Map<string, Pick>): Version => {
    const resolved = new Map(chunks.map(c => [c.id, pickOf(picks, c) ?? "a"] as const));
    const vals = [...resolved.values()];
    if (vals.every(v => v === "b")) return f.b;
    if (vals.every(v => v === "a")) return f.a;
    return JSON.stringify(buildJson(ja, jb, resolved), null, 2) + "\n";
  };
  return { parts: chunks.map(chunk => ({ chunk })), chunks, build };
}

function toChunk(c: JChange, docs: Maybe[], names: Names): Chunk {
  const id = pathKey(c.path);
  const merge = c.auto !== undefined;
  if (c.order) {
    const show = (l: string[]) => l.map((x, i) => `${i + 1}. ${names.get(x) ?? x}`);
    return {
      id, kind: "order", where: `${where(c.path.slice(0, -1), docs, names)} · order`, a: show(c.order.a), b: show(c.order.b),
      canBoth: false, ...(merge ? { auto: c.auto, o: show(c.order.o ?? []) } : {}),
    };
  }
  const canBoth = Array.isArray(c.a) && Array.isArray(c.b) && [...c.a, ...c.b].every(x => typeof x !== "object" || x === null);
  return {
    id, kind: "value", where: where(c.path, docs, names), a: readable(c.a, names), b: readable(c.b, names), canBoth,
    ...(merge ? { auto: c.auto, o: readable(c.o, names) } : {}),
  };
}

// ---------------------------------------------------------------- showing JSON as words

const LABELS: Record<string, string> = {
  chars: "Characters", col: "Column", span: "Columns wide", links: "Arrows", to: "To", note: "Note", notes: "Notes",
  when: "When", order: "Position", base: "Base tags", negative: "Negative prompt", toggles: "Toggles", presets: "Presets",
  categories: "Categories", selected: "Selected", tags: "Tags", on: "On", columns: "Column labels", color: "Colour",
  threads: "Threads", events: "Events", characters: "Characters", views: "Views", groupBy: "Grouped by",
  hideOthers: "Hide the others", name: "Name", title: "Title", label: "Label",
};
const SINGULAR: Record<string, string> = {
  events: "Event", threads: "Thread", characters: "Character", categories: "Category", presets: "Preset", toggles: "Toggle",
  views: "View", chapters: "Chapter", links: "Arrow",
};
/** "hideOthers" → "Hide others" for keys without a label. */
export const label = (k: string) => LABELS[k] ?? (k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/^./, c => c.toUpperCase()));
const titleOf = (v: Maybe): string | undefined => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const t = v.name ?? v.title ?? v.id;
  return typeof t === "string" ? t : undefined;
};

/** "Event “Mia meets Leo” › Title" for a path. */
function where(path: JPath, docs: Maybe[], names: Names) {
  const out: string[] = [];
  let at: Maybe[] = docs;
  let parentKey = "";
  for (const seg of path) {
    if (seg === ORDER) break;
    if (seg.startsWith("#")) {
      const id = seg.slice(1);
      at = at.map(d => (Array.isArray(d) ? d.find(x => titleOf(x) !== undefined && (x as { id?: string }).id === id) : undefined));
      const t = at.map(titleOf).find(Boolean) ?? names.get(id) ?? id;
      // the list's own name is replaced by the item's: "Events › Event “…”" says it twice
      if (out[out.length - 1] === label(parentKey)) out.pop();
      out.push(`${SINGULAR[parentKey] ?? "Item"} “${t}”`);
    } else {
      at = at.map(d => (d && typeof d === "object" && !Array.isArray(d) ? d[seg] : undefined));
      out.push(label(seg));
      parentKey = seg;
    }
  }
  return out.join(" › ") || "The whole file";
}

const SKIP = new Set(["id", "version"]);
/** A name for an id-looking string, else the string. */
const named = (s: string, names: Names) => (/\s/.test(s) ? s : names.get(s) ?? s);

/** A value as lines a person reads: "Title: …", lists as "a, b, c", nested things indented. */
export function readable(v: Maybe, names: Names, indent = ""): string[] {
  if (v === undefined) return [];
  if (v === null) return [indent + "—"];
  if (typeof v === "boolean") return [indent + (v ? "yes" : "no")];
  if (typeof v === "number") return [indent + String(v)];
  if (typeof v === "string") return v.split("\n").map(l => indent + named(l, names));
  if (Array.isArray(v)) {
    if (!v.length) return [indent + "(none)"];
    if (v.every(x => typeof x !== "object" || x === null)) return [indent + v.map(x => (typeof x === "string" ? named(x, names) : String(x))).join(", ")];
    return v.flatMap(x => {
      const t = titleOf(x);
      if (t !== undefined && typeof x === "object" && x && !Array.isArray(x) && typeof x.id === "string") {
        return [indent + "• " + t, ...readable(withoutTitle(x), names, indent + "   ")];
      }
      const [first = "", ...rest] = readable(x, names, indent + "   ");
      return [indent + "• " + first.trimStart(), ...rest];
    });
  }
  return Object.entries(v).filter(([k]) => !SKIP.has(k)).flatMap(([k, x]) => {
    const inline = typeof x !== "object" || x === null || (Array.isArray(x) && x.every(y => typeof y !== "object" || y === null));
    const shown = readable(x, names, indent + "   ");
    if (inline && shown.length === 1) return [`${indent}${label(k)}: ${shown[0].trimStart()}`];
    return [`${indent}${label(k)}:`, ...shown];
  });
}

const withoutTitle = (x: { [k: string]: Json }) => {
  const { name: _n, title: _t, ...rest } = x;
  return rest;
};

// ---------------------------------------------------------------- what a file is called

const TOOL_NAMES: Record<string, string> = { timeline: "Timeline", "prompt-builder": "Prompt Builder" };

/** A file's name for people: "Prolog" in "Timeline · chapters", "Rin" in "CANON/01_Characters". */
export function fileTitle(path: string, doc?: Maybe): { title: string; place: string } {
  const parts = path.split("/");
  const file = parts[parts.length - 1].replace(/\.(json|md|rpy|txt|canvas)$/i, "");
  const docName = titleOf(doc);
  if (parts[0] === ".game-tools") {
    const tool = parts.length > 2 ? TOOL_NAMES[parts[1]] ?? label(parts[1]) : "Shared";
    const sub = parts.slice(2, -1).map(label).join(" · ");
    return { title: docName ?? label(file), place: sub ? `${tool} · ${sub}` : tool };
  }
  return { title: file, place: parts.slice(0, -1).join("/") || "Top folder" };
}

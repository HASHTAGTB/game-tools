/** One-time import of the old vault timeline (02_Scenes/<Arc>/timeline.md + 03_Timeline/config.md) into arcs and a
 *  roster. Pure functions with relative imports only, so scripts/import-timeline.ts can run them in plain Node.
 *
 *  Old layout rules this keeps: inside an arc each character's lines follow one another, a line starting at the
 *  previous line's end plus its "+spacing", lasting its "(length)" or 12h. The first line starts at the arc's start.
 *  Main arcs chained `prev:` end to start with a 2h gap; a `while:` arc started at its anchor's start plus `offset:`. */
import type { RosterCharacter } from "../../../shared/lib/roster.ts";
import { formatDuration, isDuration, parseDuration } from "./duration.ts";
import { DEFAULT_LENGTH, type Arc, type Connection, type StoryEvent, type When } from "./types.ts";

export type SourceFile = { folder: string; text: string };
/** A fixed date for an arc whose name or id already says when it happens. Replaces its old `prev:` link. */
export type Pin = { start?: string; end?: string };

export const SCENES_DIR = "CANON/03_Story/02_Scenes";
/** The old generator's gap between main-chain arcs (config.md `group_gap`). */
const CHAIN_GAP = "2h";

// ---------------------------------------------------------------- small YAML subset

const unquote = (v: string) => {
  const t = v.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) return t.slice(1, -1).replace(/''/g, "'");
  return t;
};

export function splitFrontmatter(text: string): { front: Record<string, string>; body: string } {
  const m = text.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { front: {}, body: text };
  const front: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*?)\s*(?:#.*)?$/);
    if (kv && kv[2] !== "") front[kv[1]] = unquote(kv[2]);
  }
  return { front, body: m[2] };
}

const OBSIDIAN_COLORS: Record<string, string> = {
  "0": "#9a8f86", "1": "#fb464c", "2": "#e9973f", "3": "#e0de71", "4": "#44cf6e", "5": "#53dfdd", "6": "#a882ff",
};

/** The `characters:` list of the old config.md. Obsidian's numbered canvas colors become hex. */
export function parseConfigCharacters(text: string): RosterCharacter[] {
  const out: RosterCharacter[] = [];
  let inList = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^characters:\s*$/.test(line)) { inList = true; continue; }
    if (!inList) continue;
    if (/^\S/.test(line) && !line.startsWith("-")) break;
    const item = line.match(/^-\s+(\w+):\s*(.*)$/) ?? line.match(/^\s+(\w+):\s*(.*)$/);
    if (!item) continue;
    if (line.startsWith("-")) out.push({ id: "", name: "", color: "" });
    const c = out[out.length - 1];
    const v = unquote(item[2]);
    if (item[1] === "id") c.id = v;
    if (item[1] === "label") c.name = v;
    if (item[1] === "color") c.color = OBSIDIAN_COLORS[v] ?? v;
  }
  return out.filter(c => c.id);
}

// ---------------------------------------------------------------- timeline.md body

type Line = { spacing?: string; length?: string; tag?: string; text: string };
type Body = { sections: { label: string; lines: Line[] }[]; connections: { from: string; to: string; label?: string }[]; errors: string[] };

const DUR = /-?\d+(?:\.\d+)?d(?:\d+(?:\.\d+)?h)?|-?\d+(?:\.\d+)?h/;
const full = (re: RegExp) => new RegExp(`^(?:${re.source})$`);

function parseLine(line: string): Line {
  let rest = line;
  const out: Line = { text: "" };
  let m = rest.match(/^\+(\S+)(?:\s+|$)/);
  if (m && full(DUR).test(m[1])) { out.spacing = m[1]; rest = rest.slice(m[0].length); }
  m = rest.match(/^\((\S+)\)(?:\s+|$)/);
  if (m && full(DUR).test(m[1])) { out.length = m[1]; rest = rest.slice(m[0].length); }
  m = rest.match(/\[([\w.-]+)\]\s*$/);
  if (m) { out.tag = m[1]; rest = rest.slice(0, m.index).trimEnd(); }
  out.text = rest;
  return out;
}

export function parseBody(body: string): Body {
  const res: Body = { sections: [], connections: [], errors: [] };
  let mode: "none" | "char" | "conn" = "none";
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^#\s+(.+?)\s*$/);
    if (h) {
      if (h[1].toLowerCase() === "connections") mode = "conn";
      else { mode = "char"; res.sections.push({ label: h[1], lines: [] }); }
      continue;
    }
    if (mode === "char") res.sections[res.sections.length - 1].lines.push(parseLine(line));
    else if (mode === "conn") {
      const c = line.match(/^(\S+?)(?:@\w+)?\s*(?:->|→)\s*(\S+?)(?:@\w+)?(?:\s*:\s*(.*))?$/);
      if (c) res.connections.push({ from: c[1], to: c[2], ...(c[3] ? { label: c[3] } : {}) });
      else res.errors.push(`unrecognised connection line: ${line}`);
    }
  }
  return res;
}

// ---------------------------------------------------------------- ids

/** Lowercase ASCII slug: "Frühe Kindheit" → "fruehe-kindheit". */
export function slug(s: string) {
  return s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "arc";
}

/** 8 hex chars from text (FNV-1a), so ids for untagged lines stay the same if the import runs again. */
function hash8(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function unique(base: string, taken: Set<string>) {
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  taken.add(id);
  return id;
}

// ---------------------------------------------------------------- the import

export type ImportResult = { arcs: Arc[]; roster: RosterCharacter[]; report: string[] };

/** `fixes` maps a broken old `prev:`/`while:` id to the id it was meant to be. */
export function importTimeline(files: SourceFile[], roster: RosterCharacter[], pins: Record<string, Pin>, fixes: Record<string, string>): ImportResult {
  const report: string[] = [];
  const cast = roster.map(c => ({ ...c }));
  const charByLabel = new Map(cast.map(c => [c.name.toLowerCase(), c.id]));
  const charId = (label: string) => {
    const known = charByLabel.get(label.toLowerCase());
    if (known) return known;
    const id = label.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).join("_") || "char";
    cast.push({ id, name: label, color: OBSIDIAN_COLORS["0"] });
    charByLabel.set(label.toLowerCase(), id);
    report.push(`New character "${label}" (not in config.md), added to the roster as "${id}".`);
    return id;
  };

  const parsed = files.map(f => ({ ...f, ...splitFrontmatter(f.text) }));
  const arcIds = new Set<string>();
  const newArcId = new Map<string, string>();   // old period id → new arc id
  for (const p of parsed) {
    const id = unique(slug(p.folder), arcIds);
    if (p.front.id) {
      if (newArcId.has(p.front.id)) report.push(`Two arcs used the old id "${p.front.id}"; links to it go to the first one.`);
      else newArcId.set(p.front.id, id);
    } else report.push(`${p.folder}/timeline.md has no id:`);
    (p as any).arcId = id;
  }
  const arcRef = (old: string, from: string) => {
    const fixed = fixes[old];
    if (fixed && newArcId.has(fixed) && !newArcId.has(old)) {
      report.push(`${from}: fixed the broken link "${old}" → "${fixed}".`);
      return newArcId.get(fixed)!;
    }
    const id = newArcId.get(old);
    if (!id) report.push(`${from}: links to "${old}", which no arc has. Left unresolved.`);
    return id ?? old;
  };

  const eventIds = new Set<string>();
  const linkIds = new Set<string>();
  const arcs: Arc[] = [];
  for (const p of parsed) {
    const arcId: string = (p as any).arcId;
    const where = `${p.folder}/timeline.md`;
    const body = parseBody(p.body);
    for (const e of body.errors) report.push(`${where}: ${e}`);

    // where the arc starts
    let start: When;
    let end: When | undefined;
    const pin = pins[p.folder];
    if (pin?.end) end = { at: pin.end };
    if (pin?.start) {
      start = { at: pin.start };
    } else if (p.front.while) {
      start = { from: { arc: arcRef(p.front.while, where) }, ...(p.front.offset ? { offset: p.front.offset } : {}) };
    } else if (p.front.prev) {
      start = { after: { arc: arcRef(p.front.prev, where) }, gap: CHAIN_GAP };
    } else {
      start = { at: "2000" };
      report.push(`${where}: start of the chain without a date; set to 2000. Give it a pin.`);
    }
    if (p.front.offset && !isDuration(p.front.offset) && p.front.while) report.push(`${where}: offset "${p.front.offset}" is not a duration.`);
    if (p.front.linked_file) report.push(`${where}: linked_file "${p.front.linked_file}" was dropped (no file cards any more).`);

    const events: StoryEvent[] = [];
    let spacers = 0;
    for (const sec of body.sections) {
      const ch = charId(sec.label);
      let prev: string | null = null;
      // A line with no text (only "+2d" or "(4h)") just pushed later lines along. It becomes part of the next gap.
      let carry = 0;
      sec.lines.forEach((l, i) => {
        if (!l.text.trim() && !l.tag) {
          carry += (parseDuration(l.spacing) ?? 0) + (parseDuration(l.length ?? DEFAULT_LENGTH) ?? 0);
          spacers++;
          return;
        }
        if (carry) { l = { ...l, spacing: formatDuration((parseDuration(l.spacing) ?? 0) + carry) }; carry = 0; }
        if (l.tag && eventIds.has(l.tag)) report.push(`${where}: the tag [${l.tag}] is used twice; the second one got a new id.`);
        const id = l.tag && !eventIds.has(l.tag) ? (eventIds.add(l.tag), l.tag) : unique(`${ch}_${hash8(`${arcId}|${ch}|${i}|${l.text}`)}`, eventIds);
        const when: When = prev
          ? { after: { event: prev }, ...(l.spacing ? { gap: l.spacing } : {}) }
          : { from: { arc: arcId }, ...(l.spacing ? { offset: l.spacing } : {}) };
        events.push({ id, chars: [ch], text: l.text, when, ...(l.length ? { length: l.length } : {}) });
        prev = id;
      });
    }

    if (spacers) report.push(`${where}: ${spacers} empty spacer line${spacers > 1 ? "s" : ""} folded into the following gaps.`);
    const connections: Connection[] = [];
    for (const c of body.connections) {
      if (connections.some(x => x.from === c.from && x.to === c.to && (x.label ?? "") === (c.label ?? ""))) {
        report.push(`${where}: the connection ${c.from} → ${c.to} is there twice (only the @side differed); kept one.`);
        continue;
      }
      connections.push({ id: unique(`link_${hash8(`${c.from}->${c.to}`)}`, linkIds), from: c.from, to: c.to, ...(c.label ? { label: c.label } : {}) });
    }

    arcs.push({
      version: 1, id: arcId, name: p.folder, start, ...(end ? { end } : {}),
      ...(p.front.color ? { color: OBSIDIAN_COLORS[p.front.color] ?? p.front.color } : {}),
      folder: `${SCENES_DIR}/${p.folder}`, events, connections,
    });
  }

  // connections may point at tags from other arcs; check they all exist now
  for (const a of arcs) for (const c of a.connections) for (const end of [c.from, c.to]) {
    if (!eventIds.has(end)) report.push(`${a.name}: connection ${c.from} → ${c.to} points at [${end}], which no line has.`);
  }
  return { arcs, roster: cast, report };
}

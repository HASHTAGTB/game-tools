import type { Character, ListKey } from "./types";
import { isOff, stripOff } from "./tag";
import { DEFAULT_COLOR } from "@/shared/lib/colors";

/** Comparison key for a prompt tag: "(Cute_Face:1.2)" -> "cute face", "hat \(symbol\)" -> "hat (symbol)". */
export function tagKey(raw: string) {
  let s = stripOff(raw).trim().toLowerCase();
  for (let i = 0; i < 5; i++) {
    const m = s.match(/^\((.*?)(?::\s*[\d.]+)?\)$/);
    if (!m || s.startsWith("\\(")) break;
    s = m[1].trim();
  }
  s = s.replace(/\\/g, "");
  if (s.length > 3) s = s.replace(/_/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Split pasted text into tags (commas / newlines). */
export const splitTags = (text: string) =>
  text.split(/[,\n]/).map(t => t.trim()).filter(Boolean);

export type Segment = { tag: string; source: string; color: number };

/** Prompt in order: base, each category's selected preset, enabled toggles. Duplicates keep their first place. */
export function promptSegments(c: Character): Segment[] {
  const out: Segment[] = [];
  const seen = new Set<string>();
  const push = (tags: string[], source: string, color: number) => {
    for (const tag of tags) {
      if (isOff(tag)) continue;
      const k = tagKey(tag);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ tag: tag.trim(), source, color });
    }
  };
  push(c.base, "General", 0);
  c.categories.forEach((cat, i) => {
    const p = cat.presets.find(p => p.id === cat.selected);
    if (p) push(p.tags, `${cat.name}: ${p.name}`, i + 1);
  });
  for (const t of c.toggles) if (t.on) push(t.tags, t.name, -1);
  return out;
}

export const buildPrompt = (c: Character) => promptSegments(c).map(s => s.tag).join(", ");

/** Returns the (mutable) tag array a ListKey points at, or null if it no longer exists. */
export function listFor(c: Character, key: ListKey): string[] | null {
  if (key.kind === "base") return c.base;
  if (key.kind === "toggle") return c.toggles.find(t => t.id === key.id)?.tags ?? null;
  return c.categories.find(x => x.id === key.cat)?.presets.find(p => p.id === key.preset)?.tags ?? null;
}

export function listLabel(c: Character, key: ListKey): string {
  if (key.kind === "base") return "General";
  if (key.kind === "toggle") return c.toggles.find(t => t.id === key.id)?.name ?? "?";
  const cat = c.categories.find(x => x.id === key.cat);
  return `${cat?.name ?? "?"}: ${cat?.presets.find(p => p.id === key.preset)?.name ?? "?"}`;
}

export const sameKey = (a: ListKey, b: ListKey) => JSON.stringify(a) === JSON.stringify(b);

/** Hex color per segment color index (-1 = toggle, 0 = general, 1.. = categories), from the game's cast palette. */
const PALETTE = ["#7ec8e3", "#e3d07e", "#8ce3a0", "#e38c7e", "#7e9be3", "#e37eb8", "#7ec8b0"];
export const segColor = (i: number) => (i < 0 ? DEFAULT_COLOR : i === 0 ? "#d9d0c7" : PALETTE[(i - 1) % PALETTE.length]);

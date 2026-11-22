/** A single stored tag string: optional "// " prefix (temporarily off) and optional "(text:weight)". */
export type ParsedTag = { text: string; weight: number; off: boolean };

const OFF = "//";

export function parseTag(raw: string): ParsedTag {
  let s = raw.trim();
  let off = false;
  if (s.startsWith(OFF)) { off = true; s = s.slice(OFF.length).trim(); }
  const m = !s.startsWith("\\(") ? s.match(/^\((.+):\s*(-?\d*\.?\d+)\)$/) : null;
  if (m) return { text: m[1].trim(), weight: parseFloat(m[2]), off };
  return { text: s, weight: 1, off };
}

export function formatTag({ text, weight, off }: ParsedTag): string {
  const w = Math.round(weight * 100) / 100;
  const body = w === 1 ? text : `(${text}:${w})`;
  return off ? `${OFF} ${body}` : body;
}

export const isOff = (raw: string) => raw.trim().startsWith(OFF);
export const stripOff = (raw: string) => (isOff(raw) ? raw.trim().slice(OFF.length).trim() : raw);

export const setWeight = (raw: string, weight: number) =>
  formatTag({ ...parseTag(raw), weight: Math.min(2, Math.max(0, weight)) });
export const toggleOff = (raw: string) => { const p = parseTag(raw); return formatTag({ ...p, off: !p.off }); };

/** Plain tag name for searching elsewhere: "(hat \(symbol\):1.2)" -> "hat (symbol)". */
export const searchName = (raw: string) => parseTag(raw).text.replace(/\\/g, "").trim();

/** Danbooru spelling of a tag: "long hair" -> "long_hair" (short emoticon tags like "^ ^" keep their spaces). */
export const danbooruTag = (raw: string) => {
  const t = searchName(raw);
  return t.length > 3 ? t.replace(/ /g, "_") : t;
};
export const danbooruUrl = (raw: string) => `https://danbooru.donmai.us/posts?tags=${encodeURIComponent(danbooruTag(raw))}`;
export const googleUrl = (raw: string) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchName(raw))}`;

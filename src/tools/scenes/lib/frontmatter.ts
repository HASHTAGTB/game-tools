/** The scene info at the top of a scene file (YAML frontmatter), read and changed one key at a time so everything
 *  else in it (and its formatting) stays as it was. Only the shapes the vault uses: `key: value`, `key: [a, b]` and
 *  `key:` followed by `  - item` lines. */

export type SceneInfo = {
  status: string;
  renpy: string;
  owner: string;
  /** Note names from the `[[links]]` ("Rin Takeda") */
  characters: string[];
};

export const STATUSES = ["idea", "outline", "draft", "revision", "final"] as const;
export const RENPY_LEVELS = ["no", "basic", "full", "production"] as const;

/** What each level means (DEV/05_Technical/metadata.md). */
export const STATUS_HINT: Record<string, string> = {
  idea: "Concept only, some notes",
  outline: "Structured notes",
  draft: "Prose text, but rough or unfinished",
  revision: "Reviewed, being polished",
  final: "Done",
};
export const RENPY_HINT: Record<string, string> = {
  no: "No Ren'Py yet",
  basic: "Just correct syntax",
  full: "Pauses and other effects added",
  production: "Backgrounds, music and sprites in",
};

type Block = { key: string; from: number; to: number };

/** The frontmatter's line range in `lines` (the `---` lines included), or null. */
function range(lines: string[]) {
  if (lines[0]?.trimEnd() !== "---") return null;
  for (let i = 1; i < lines.length; i++) if (lines[i].trimEnd() === "---") return { from: 0, to: i };
  return null;
}

/** Each key's lines (its `- item` lines included), as indexes into `lines`. */
function blocks(lines: string[], r: { from: number; to: number }): Block[] {
  const out: Block[] = [];
  for (let i = r.from + 1; i < r.to; i++) {
    const m = /^([A-Za-z_][\w-]*):/.exec(lines[i]);
    if (m) out.push({ key: m[1], from: i, to: i + 1 });
    else if (out.length && /^\s/.test(lines[i])) out[out.length - 1].to = i + 1;
  }
  return out;
}

const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
const linkName = (s: string) => unquote(s).replace(/^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/, "$1").trim();

function valueOf(lines: string[], b: Block): string | string[] {
  const inline = lines[b.from].slice(b.key.length + 1).trim();
  if (inline.startsWith("[")) return inline.replace(/^\[|\]$/g, "").split(",").map(unquote).filter(Boolean);
  if (inline) return unquote(inline);
  const items = lines.slice(b.from + 1, b.to).map(l => /^\s*-\s*(.*)$/.exec(l)?.[1]).filter((x): x is string => x !== undefined);
  return items.length ? items.map(unquote).filter(Boolean) : "";
}

export function readInfo(text: string): SceneInfo | null {
  const lines = text.split("\n");
  const r = range(lines);
  if (!r) return null;
  const get = (k: string) => { const b = blocks(lines, r).find(x => x.key === k); return b ? valueOf(lines, b) : ""; };
  const str = (v: string | string[]) => (Array.isArray(v) ? v.join(", ") : v);
  const chars = get("characters");
  return {
    status: str(get("status")),
    renpy: str(get("renpy")),
    owner: str(get("owner")),
    characters: (Array.isArray(chars) ? chars : chars ? [chars] : []).map(linkName),
  };
}

/** A change to `text` (positions into it) that sets `key`, or null if nothing changes. Lists are written as `- "[[x]]"`
 *  lines; an empty value leaves `key:`. Adds the key (or the whole frontmatter) if it's missing. */
export function setInfo(text: string, key: keyof SceneInfo, value: string | string[]): { from: number; to: number; insert: string } | null {
  const lines = text.split("\n");
  const offset = (i: number) => lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
  const written = Array.isArray(value)
    ? `${key}:${value.map(v => `\n  - "[[${v}]]"`).join("")}`
    : `${key}:${value ? " " + value : ""}`;
  const r = range(lines);
  if (!r) {
    const fresh = ["---", "tags:", "  - scene", "status:", "renpy:", "owner:", "characters:", "---"]
      .map(l => (l.startsWith(key + ":") ? written : l)).join("\n") + "\n";
    return { from: 0, to: 0, insert: fresh };
  }
  const b = blocks(lines, r).find(x => x.key === key);
  if (!b) {
    const at = offset(r.to);
    return { from: at, to: at, insert: written + "\n" };
  }
  const from = offset(b.from), to = offset(b.to) - 1;
  if (text.slice(from, to) === written) return null;
  return { from, to, insert: written };
}

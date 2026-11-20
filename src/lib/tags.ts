import { tagKey } from "./prompt";

/** Danbooru tag -> prompt text: underscores become spaces (except short emoticons like ^_^), parentheses escaped. */
export const toPromptText = (tag: string) =>
  (tag.length > 3 ? tag.replace(/_/g, " ") : tag).replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export type TagEntry = { t: string; n: number; a?: string };
export type GroupTag = { t: string; n: number };
export type TagGroups = {
  sections: { id: string; label: string; group: string; subsections: { title: string; tags: GroupTag[] }[] }[];
};

export type TagDb = {
  list: TagEntry[];
  /** tagKey(prompt text) -> post count */
  count: Map<string, number>;
  groups: TagGroups;
};

let loading: Promise<TagDb> | null = null;

export function loadTagDb(): Promise<TagDb> {
  loading ??= (async () => {
    const [rows, groups] = await Promise.all([
      fetch(import.meta.env.BASE_URL + "data/tags.json").then(r => r.json()) as Promise<[string, number, string?][]>,
      fetch(import.meta.env.BASE_URL + "data/tag_groups.json").then(r => r.json()) as Promise<TagGroups>,
    ]);
    const list = rows.map(([t, n, a]) => ({ t, n, a }));
    const count = new Map<string, number>();
    for (const e of list) count.set(tagKey(e.t), e.n);
    for (const s of groups.sections) for (const sub of s.subsections) for (const g of sub.tags) {
      const k = tagKey(g.t);
      if (!count.has(k)) count.set(k, g.n);
    }
    return { list, count, groups };
  })();
  return loading;
}

/** Prefix matches first (by popularity), then substring matches, then alias matches. */
export function searchTags(db: TagDb, query: string, limit = 10): (TagEntry & { alias?: boolean })[] {
  const q = query.trim().toLowerCase().replace(/\\/g, "").replace(/\s+/g, "_");
  if (q.length < 2) return [];
  const pre: TagEntry[] = [], sub: TagEntry[] = [], ali: (TagEntry & { alias: boolean })[] = [];
  for (const e of db.list) {
    if (e.t.startsWith(q)) {
      pre.push(e);
      if (pre.length >= limit) break;
    } else if (sub.length < limit && e.t.includes(q)) sub.push(e);
    else if (ali.length < limit && e.a && e.a.split(",").some(a => a.startsWith(q))) ali.push({ ...e, alias: true });
  }
  return [...pre, ...sub, ...ali].slice(0, limit);
}

export const RARE = 500;

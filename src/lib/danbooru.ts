/** Danbooru post search for the image panel. The API sends `Access-Control-Allow-Origin: *`, so the browser calls it directly. */
import { danbooruTag } from "./tag";
import { STATIC } from "./store";

export type Rating = "g" | "s" | "q" | "e";
export const RATINGS: { id: Rating; label: string }[] = [
  { id: "g", label: "General" },
  { id: "s", label: "Sensitive" },
  { id: "q", label: "Questionable" },
  { id: "e", label: "Explicit" },
];
export type Sort = "new" | "score";

export type Post = {
  id: number;
  thumb: string;   // 360px square-bounded
  small: string;   // 180px fallback
  large: string;   // ~850px sample (or the file itself when small)
  video: boolean;
  width: number;
  height: number;
};

export const PAGE_SIZE = 40;
/** The CDN can refuse images embedded on other sites, so in dev they go through the local server (see server/api.ts).
 *  The static build loads them directly, or through VITE_IMG_PROXY (e.g. worker/img-proxy.js) when that is set. */
const PROXY = STATIC ? import.meta.env.VITE_IMG_PROXY : "/api/img";
const viaProxy = (u: string) => (PROXY ? `${PROXY}?u=${encodeURIComponent(u)}` : u);
const FIELDS = "id,preview_file_url,large_file_url,image_width,image_height";

/** Anonymous searches allow 2 tags; rating:* is free, so "tag rating:g,s order:score" fits.
 *  order:score can time out on very large tags; then retry newest-first and say so via `fellBack`. */
export async function searchPosts(tag: string, ratings: Rating[], sort: Sort, page: number, signal: AbortSignal) {
  const base = [danbooruTag(tag)];
  if (ratings.length && ratings.length < 4) base.push(`rating:${ratings.join(",")}`);
  const get = async (q: string[]) => {
    const url = `https://danbooru.donmai.us/posts.json?limit=${PAGE_SIZE}&page=${page}&only=${FIELDS}&tags=${encodeURIComponent(q.join(" "))}`;
    const res = await fetch(url, { signal });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) throw new Error(data?.message ?? `Danbooru answered ${res.status}`);
    return data as any[];
  };
  let fellBack = false;
  let raw: any[];
  if (sort === "score") {
    try {
      raw = await get([...base, "order:score"]);
    } catch (e) {
      if (signal.aborted) throw e;
      raw = await get(base);
      fellBack = true;
    }
  } else {
    raw = await get(base);
  }
  // posts without URLs are hidden from anonymous users (banned / gold-only)
  const posts: Post[] = raw.filter(p => p.preview_file_url && p.large_file_url).map(p => ({
    id: p.id,
    small: viaProxy(p.preview_file_url),
    thumb: viaProxy(p.preview_file_url.replace("/180x180/", "/360x360/")),
    large: viaProxy(p.large_file_url),
    video: /\.(mp4|webm)$/.test(p.large_file_url),  // ugoira (zip) comes as a webm sample
    width: p.image_width,
    height: p.image_height,
  }));
  return { posts, more: raw.length === PAGE_SIZE, fellBack };
}

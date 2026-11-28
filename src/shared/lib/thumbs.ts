import { useEffect, useRef, useState, type RefObject } from "react";
import { isLfsPointer, type AssetImage } from "./assetUrl";
import { useGame } from "./game";
import { joinPath } from "./paths";
import { GAME_DIR } from "./places";
import { getLocation, locationVersion, readBytes, readJson, TOOLS_DIR } from "./workspace";

/** Small images of the game's media for pickers (the background grid, sprite faces), so a list of 1,800 backgrounds
 *  doesn't read 1,800 full images. Made outside the tools into `.game-tools/thumbs/`, listed in its `index.json`:
 *
 *    { "version": 1, "files": { "images/bg/x.png": { "thumb": "images/bg/x.avif", "w": 480, "h": 270,
 *                                                    "src_w": 1920, "src_h": 1080, "sha256": "…" } } }
 *
 *  Keys are paths inside renpy/game/assets/; `thumb` is the thumbnail's path inside .game-tools/thumbs/ (so its format
 *  isn't fixed here). With no thumbnail for a file: the dev server, a picked folder and browser storage shrink the real
 *  image here (kept for this session only); on GitHub that would download every full image through Git LFS, so the
 *  thumbnail counts as missing there. */

export const THUMBS_DIR = `${TOOLS_DIR}/thumbs`;
type IndexFile = { version: number; files: Record<string, { thumb: string; w?: number; h?: number; src_w?: number; src_h?: number; sha256?: string }> };

/** A thumbnail, and the size of the image it stands for when known (the preview sizes sprites by it). */
export type ThumbImage = AssetImage & { src?: { w: number; h: number } };

export type Thumb = {
  /** the image, null while it's read or when there is none */
  img: ThumbImage | null;
  pending: boolean;
  /** there's no thumbnail and this backend doesn't make one (GitHub), or the file can't be read */
  missing: boolean;
};

// ---------------------------------------------------------------- the index and the backend

type Setup = { index: IndexFile["files"]; github: boolean };
let setup: { version: number; manifest: unknown; p: Promise<Setup> } | null = null;

function loadSetup(manifest: unknown): Promise<Setup> {
  if (!setup || setup.version !== locationVersion() || setup.manifest !== manifest) {
    const version = locationVersion();
    setup = {
      version, manifest,
      p: Promise.all([
        readJson<IndexFile>(joinPath(THUMBS_DIR, "index.json")).catch(() => null),
        getLocation().then(l => l.kind === "github").catch(() => false),
      ]).then(([idx, github]) => ({ index: idx && typeof idx.files === "object" ? idx.files : {}, github })),
    };
    // a new index may point at other files: forget what was read for the old one
    clear();
  }
  return setup.p;
}

// ---------------------------------------------------------------- reading, at most a few at a time

const MAX_AT_ONCE = 6;
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(run: () => Promise<T>): Promise<T> {
  if (running >= MAX_AT_ONCE) await new Promise<void>(r => waiting.push(r));
  running++;
  try { return await run(); } finally { running--; waiting.shift()?.(); }
}

/** Kept by asset path; the oldest are let go once there are more than LIMIT (their object URLs revoked). Enough for
 *  every image the game has (thumbnails are a few KB each: ~2,000 are ~10 MB), so scrolling back never reads again;
 *  the limit only stops a huge folder from growing without end. */
const LIMIT = 6000;
const cache = new Map<string, { img: Promise<ThumbImage | null>; done?: ThumbImage | null }>();

function clear() {
  for (const e of cache.values()) e.img.then(i => i && URL.revokeObjectURL(i.url));
  cache.clear();
}

function remember(rel: string, img: Promise<ThumbImage | null>) {
  const e: { img: Promise<ThumbImage | null>; done?: ThumbImage | null } = { img };
  img.then(v => { e.done = v; });
  cache.set(rel, e);
  while (cache.size > LIMIT) {
    const [oldest, old] = cache.entries().next().value!;
    cache.delete(oldest);
    // after whatever shows it has moved on
    old.img.then(i => i && setTimeout(() => URL.revokeObjectURL(i.url), 10_000));
  }
  return e;
}

async function decode(blob: Blob): Promise<ThumbImage | null> {
  const url = URL.createObjectURL(blob);
  const el = new Image();
  el.src = url;
  try { await el.decode(); } catch { URL.revokeObjectURL(url); return null; }
  return { url, w: el.naturalWidth, h: el.naturalHeight };
}

/** The real image made small here: fits inside 480×270, or 512×800 for tall ones (sprites). */
async function shrink(blob: Blob): Promise<ThumbImage | null> {
  try {
    const full = await createImageBitmap(blob);
    const [bw, bh] = full.height > full.width ? [512, 800] : [480, 270];
    const k = Math.min(1, bw / full.width, bh / full.height);
    const w = Math.max(1, Math.round(full.width * k)), h = Math.max(1, Math.round(full.height * k));
    full.close();
    const small = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext("2d")!.drawImage(small, 0, 0);
    small.close();
    const out = await canvas.convertToBlob({ type: "image/webp", quality: 0.8 });
    return { url: URL.createObjectURL(out), w, h, src: { w: Math.round(w / k), h: Math.round(h / k) } };
  } catch {
    return decode(blob);
  }
}

function thumbOf(rel: string, s: Setup): Promise<ThumbImage | null> | null {
  const known = cache.get(rel);
  if (known) { cache.delete(rel); cache.set(rel, known); return known.img; }   // most recently used last
  const entry = s.index[rel];
  if (entry) return remember(rel, limited(async () => {
    const b = await readBytes(joinPath(THUMBS_DIR, entry.thumb)).catch(() => null);
    const img = b && !(await isLfsPointer(b)) ? await decode(b) : null;
    return img && entry.src_w && entry.src_h ? { ...img, src: { w: entry.src_w, h: entry.src_h } } : img;
  })).img;
  if (s.github) return null;
  return remember(rel, limited(async () => {
    const b = await readBytes(joinPath(GAME_DIR, "assets", rel)).catch(() => null);
    return b && !(await isLfsPointer(b)) ? shrink(b) : null;
  })).img;
}

/** The thumbnail of `rel` (a path inside assets/). Pass null until it's needed (not scrolled into view yet). */
export function useThumb(rel: string | null | undefined): Thumb {
  const manifest = useGame(s => s.manifest);
  const [state, setState] = useState<{ rel: string; img: ThumbImage | null; missing: boolean } | null>(null);
  useEffect(() => {
    if (!rel) return;
    let live = true;
    loadSetup(manifest).then(s => {
      const p = thumbOf(rel, s);
      if (!p) { if (live) setState({ rel, img: null, missing: true }); return; }
      p.then(img => live && setState({ rel, img, missing: !img }));
    });
    return () => { live = false; };
  }, [rel, manifest]);
  if (!rel) return { img: null, pending: false, missing: false };
  if (state?.rel === rel) return { img: state.img, pending: false, missing: state.missing };
  const done = cache.get(rel)?.done;
  return done === undefined ? { img: null, pending: true, missing: false } : { img: done, pending: false, missing: !done };
}

/** True once `ref`'s element has come near the visible part of its scroll area (and stays true). */
export function useSeen(ref: RefObject<Element | null>, margin = "200px"): boolean {
  const [seen, setSeen] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { done.current = true; setSeen(true); io.disconnect(); }
    }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return seen;
}

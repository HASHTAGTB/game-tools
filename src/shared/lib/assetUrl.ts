import { useEffect, useState } from "react";
import { GAME_DIR } from "./places";
import { joinPath } from "./paths";
import { readBytes, statFile } from "./workspace";

/** Images from the game's assets/ as object URLs, on whichever backend can give their bytes (dev server, picked
 *  folder, GitHub incl. Git LFS). Browser storage has no game files: there everything is null.
 *
 *  Kept by path and change time, so an image is read once and read again only after it changed. An image counts as
 *  there once it's decoded, with its size known, so whatever shows it can draw it right away (no empty frame, no
 *  stand-in while it loads). */

const ASSETS = `${GAME_DIR}/assets`;

/** A decoded image: its object URL and natural size. */
export type AssetImage = { url: string; w: number; h: number };
type Entry = { mtime: number | null; img: Promise<AssetImage | null>; done?: AssetImage | null };
const cache = new Map<string, Entry>();

/** A checkout without Git LFS has small pointer text files instead of the media. */
export const isLfsPointer = async (b: Blob) => b.size < 1024 && (await b.slice(0, 40).text()).startsWith("version https://git-lfs");

async function decode(url: string): Promise<AssetImage> {
  const el = new Image();
  el.src = url;
  await el.decode().catch(() => {});
  return { url, w: el.naturalWidth, h: el.naturalHeight };
}

function read(rel: string, mtime: number | null): Entry {
  const e: Entry = {
    mtime,
    img: readBytes(joinPath(ASSETS, rel))
      .then(async b => (b && !(await isLfsPointer(b)) ? decode(URL.createObjectURL(b)) : null))
      .catch(() => null),
  };
  e.img.then(v => { e.done = v; });
  return e;
}

/** The image `rel` (path inside assets/, with extension), decoded; null if it can't be read. */
export async function assetImage(rel: string): Promise<AssetImage | null> {
  const mtime = await statFile(joinPath(ASSETS, rel)).catch(() => null);
  const known = cache.get(rel);
  if (known && known.mtime === mtime) return known.img;
  const e = read(rel, mtime);
  cache.set(rel, e);
  known?.img.then(u => u && setTimeout(() => URL.revokeObjectURL(u.url), 10_000));   // after anything showing it moved on
  return e.img;
}

/** Object URL of `rel`, null if it can't be read. */
export const assetUrl = async (rel: string) => (await assetImage(rel))?.url ?? null;

/** Starts reading images not read yet, so they are there by the time something shows them. */
export function preloadAssets(rels: Iterable<string>) {
  for (const rel of rels) if (!cache.has(rel)) assetImage(rel);
}

/** `assetImage` for a component. `img` is what's known now (from the cache when it was read before), `pending` says
 *  it's still being read (`img` is then null, but that doesn't mean there is none). `version` re-checks the file
 *  (pass the game manifest, so a reload of the game notices changed images). */
export function useAssetImage(rel: string | null | undefined, version?: unknown): { img: AssetImage | null; pending: boolean } {
  const [state, setState] = useState<{ rel: string; img: AssetImage | null } | null>(null);
  useEffect(() => {
    if (!rel) return;
    let live = true;
    assetImage(rel).then(img => live && setState(s => (s?.rel === rel && s.img === img ? s : { rel, img })));
    return () => { live = false; };
  }, [rel, version]);
  if (!rel) return { img: null, pending: false };
  if (state?.rel === rel) return { img: state.img, pending: false };
  const done = cache.get(rel)?.done;
  return done === undefined ? { img: null, pending: true } : { img: done, pending: false };
}

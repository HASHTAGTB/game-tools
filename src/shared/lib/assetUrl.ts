import { useEffect, useState } from "react";
import { GAME_DIR } from "@/shared/vault/places";
import { joinPath, readBytes, statFile } from "./workspace";

/** Images from the game's assets/ as object URLs, on whichever backend can give their bytes (dev server, picked
 *  folder, GitHub incl. Git LFS). Browser storage has no game files: there everything is null.
 *
 *  Kept by path and change time, so an image is read once and read again only after it changed. */

const ASSETS = `${GAME_DIR}/assets`;
const urls = new Map<string, { mtime: number | null; url: Promise<string | null> }>();

/** A checkout without Git LFS has small pointer text files instead of the media. */
export const isLfsPointer = async (b: Blob) => b.size < 1024 && (await b.slice(0, 40).text()).startsWith("version https://git-lfs");

/** Object URL of `rel` (path inside assets/, with extension), null if it can't be read. */
export async function assetUrl(rel: string): Promise<string | null> {
  const path = joinPath(ASSETS, rel);
  const mtime = await statFile(path).catch(() => null);
  const known = urls.get(rel);
  if (known && known.mtime === mtime) return known.url;
  const url = readBytes(path)
    .then(async b => (b && !(await isLfsPointer(b)) ? URL.createObjectURL(b) : null))
    .catch(() => null);
  urls.set(rel, { mtime, url });
  known?.url.then(u => u && setTimeout(() => URL.revokeObjectURL(u), 10_000));   // after anything showing it moved on
  return url;
}

/** `assetUrl` for a component: null while loading or when there is no image. `version` re-checks the file (pass the
 *  game manifest, so a reload of the game notices changed images). */
export function useAssetUrl(rel: string | null | undefined, version?: unknown): string | null {
  const [state, setState] = useState<{ rel: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!rel) return;
    let live = true;
    assetUrl(rel).then(url => live && setState({ rel, url }));
    return () => { live = false; };
  }, [rel, version]);
  return rel && state?.rel === rel ? state.url : null;
}

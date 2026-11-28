import { create } from "zustand";
import { openDb, req } from "./idb";
import { limiter } from "./toolState";
import { getLocation, readFile, TOOLS_DIR, walkFiles, type Location } from "./workspace";

/** A checkpoint: every text file of the data folder as it was at one moment, kept in this browser (IndexedDB), one per
 *  data folder. "See changes" compares it with now, and any change can be put back the way it was.
 *  For the folder, dev-server and browser storage; on GitHub the last saved commit plays this part. */

export type Snapshot = { at: number; files: Record<string, string> };

/** The files a checkpoint keeps: what the tools and people edit as text (not images, not Ren'Py's compiled files). */
export const isTextFile = (path: string) => /\.(md|rpy|json|txt|canvas)$/i.test(path);
/** Folders Ren'Py writes on its own (compiled cache, save games): their changes aren't anyone's edits. */
const skip = (path: string) => /(^|\/)(cache|saves|node_modules)$/.test(path) && path.includes("renpy/");

const readLimit = limiter(12);

/** Every text file in the data folder now (the tools' own `.game-tools` folder too). */
export async function currentTexts(): Promise<Map<string, string>> {
  const paths = [...await walkFiles("", skip), ...await walkFiles(TOOLS_DIR).catch(() => [])].filter(isTextFile);
  const texts = await Promise.all([...new Set(paths)].map(p => readLimit(() => readFile(p).then(f => [p, f?.text] as const))));
  return new Map(texts.flatMap(([p, t]) => (t === undefined ? [] : [[p, t] as [string, string]])));
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () => dbp ??= openDb("game-tools-checkpoint", d => d.createObjectStore("kv"));
const keyOf = (loc: Location) => `${loc.kind}:${loc.label}`;

async function kv<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return req(fn((await db()).transaction("kv", mode).objectStore("kv")));
}

export async function readCheckpoint(): Promise<Snapshot | null> {
  const loc = await getLocation();
  return (await kv<Snapshot | undefined>("readonly", s => s.get(keyOf(loc)))) ?? null;
}

/** When the checkpoint of the data folder in use was set, for the sidebar. */
export const useCheckpoint = create<{ at: number | null; key: string | null; load: () => Promise<void>; set: () => Promise<void> }>()((set) => ({
  at: null, key: null,
  load: async () => {
    const loc = await getLocation();
    if (!loc.ready) return set({ at: null, key: null });
    const snap = await kv<Snapshot | undefined>("readonly", s => s.get(keyOf(loc)));
    set({ at: snap?.at ?? null, key: keyOf(loc) });
  },
  /** Make now the checkpoint (the tool's edits must be written out first). */
  set: async () => {
    const loc = await getLocation();
    const files = Object.fromEntries(await currentTexts());
    const snap: Snapshot = { at: Date.now(), files };
    await kv("readwrite", s => s.put(snap, keyOf(loc)));
    set({ at: snap.at, key: keyOf(loc) });
  },
}));

/** "3 min ago", "yesterday, 14:02", "12.11., 09:30". */
export function ago(at: number, now = Date.now()) {
  const min = Math.round((now - at) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const time = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = (t: number) => new Date(t).toDateString();
  if (day(at) === day(now)) return `today, ${time}`;
  if (day(at) === day(now - 86_400_000)) return `yesterday, ${time}`;
  return `${new Date(at).toLocaleDateString([], { day: "2-digit", month: "2-digit" })}, ${time}`;
}

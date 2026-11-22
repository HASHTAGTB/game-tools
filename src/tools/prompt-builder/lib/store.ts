import { folderSupported, STATIC } from "@/shared/lib/env";
import type { Category, Character, Toggle } from "./types";

/** Where characters live.
 *  - server:  the Vite file API (`pnpm dev`), a folder path on this machine
 *  - browser: IndexedDB in this browser, with JSON import/export
 *  - folder:  a folder picked with the File System Access API (Chromium only), one <id>.json per character
 *  The static build (GitHub Pages) has no server, so it offers browser and folder. */
export type Backend = "server" | "browser" | "folder";
export type Location = { kind: Backend; label: string; ready: boolean };

// ---------------------------------------------------------------- server (Vite file API)

async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    // lets a save started while the tab closes still reach the server (bodies up to 64 KB)
    keepalive: document.visibilityState === "hidden",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? r.statusText);
  return data as T;
}

// ---------------------------------------------------------------- IndexedDB (characters + settings)

const DB_NAME = "prompt-builder";
let dbp: Promise<IDBDatabase> | null = null;
function idb() {
  return dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("characters", { keyPath: "id" });
      req.result.createObjectStore("settings");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const getSetting = <T>(key: string) => tx<T | undefined>("settings", "readonly", s => s.get(key));
const setSetting = (key: string, v: unknown) => tx("settings", "readwrite", s => s.put(v, key));

// ---------------------------------------------------------------- File System Access API (not in TS's DOM lib yet)

type Perm = "granted" | "denied" | "prompt";
type FileHandle = { getFile(): Promise<File>; createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> };
type DirHandle = {
  kind: "directory"; name: string;
  values(): AsyncIterable<{ kind: "file" | "directory"; name: string }>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FileHandle>;
  removeEntry(name: string): Promise<void>;
  queryPermission(o: { mode: "readwrite" }): Promise<Perm>;
  requestPermission(o: { mode: "readwrite" }): Promise<Perm>;
};

let dir: DirHandle | null = null;
const permitted = async (d: DirHandle) => (await d.queryPermission({ mode: "readwrite" })) === "granted";

// ---------------------------------------------------------------- active backend

let kind: Backend | null = null;
async function backend(): Promise<Backend> {
  if (kind) return kind;
  if (!STATIC) return (kind = "server");
  const saved = await getSetting<Backend>("backend");
  if (saved === "folder" && folderSupported) {
    dir = (await getSetting<DirHandle>("dir")) ?? null;
    if (dir) return (kind = "folder");
  }
  return (kind = "browser");
}

const fileName = (id: string) => `${id}.json`;
const toJson = (c: Character) => JSON.stringify(c, null, 2) + "\n";

/** Fill in missing fields so older / hand-edited files still load. */
export function normalize(raw: Partial<Character>): Character {
  return {
    version: 1,
    id: raw.id ?? "unnamed",
    name: raw.name ?? raw.id ?? "Unnamed",
    base: raw.base ?? [],
    categories: (raw.categories ?? []).map((c: Partial<Category>) => ({
      id: c.id ?? "category", name: c.name ?? "Category", presets: c.presets ?? [], selected: c.selected ?? null,
    })),
    toggles: (raw.toggles ?? []).map((t: Partial<Toggle>) => ({ id: t.id ?? "toggle", name: t.name ?? "Toggle", tags: t.tags ?? [], on: !!t.on })),
    negative: raw.negative ?? "",
    notes: raw.notes ?? "",
  };
}

async function readAll(k: Backend): Promise<Partial<Character>[]> {
  if (k === "server") return api("GET", "/api/characters");
  if (k === "browser") return tx("characters", "readonly", s => s.getAll());
  if (!dir || !(await permitted(dir))) throw new NeedsPermission();
  const out: Partial<Character>[] = [];
  for await (const e of dir.values()) {
    if (e.kind !== "file" || !e.name.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(await (await (await dir.getFileHandle(e.name)).getFile()).text()));
    } catch (err) {
      console.warn(`[prompt-builder] skipping ${e.name}: ${err}`);
    }
  }
  return out;
}

async function write(k: Backend, c: Character) {
  if (k === "server") return void (await api("PUT", `/api/characters/${encodeURIComponent(c.id)}`, c));
  if (k === "browser") return void (await tx("characters", "readwrite", s => s.put(c)));
  if (!dir) throw new NeedsPermission();
  const w = await (await dir.getFileHandle(fileName(c.id), { create: true })).createWritable();
  await w.write(toJson(c));
  await w.close();
}

/** Thrown while a picked folder is remembered but the browser wants the user to allow access again. */
export class NeedsPermission extends Error {
  constructor() { super("The browser needs permission to use the save folder again."); }
}

export async function listCharacters(): Promise<Character[]> {
  const raw = await readAll(await backend());
  return raw.map(normalize).sort((a, b) => a.name.localeCompare(b.name));
}

export const saveCharacter = async (c: Character) => write(await backend(), c);

export async function deleteCharacter(id: string) {
  const k = await backend();
  if (k === "server") return void (await api("DELETE", `/api/characters/${encodeURIComponent(id)}`));
  if (k === "browser") return void (await tx("characters", "readwrite", s => s.delete(id)));
  await dir?.removeEntry(fileName(id)).catch(e => { if (e?.name !== "NotFoundError") throw e; });
}

export async function getLocation(): Promise<Location> {
  const k = await backend();
  if (k === "server") return { kind: k, label: (await api<{ dataDir: string }>("GET", "/api/config")).dataDir, ready: true };
  if (k === "browser") return { kind: k, label: "This browser", ready: true };
  return { kind: k, label: `Folder: ${dir!.name}`, ready: await permitted(dir!) };
}

/** Ask again for access to the remembered folder. Must run from a click. */
export async function reconnectFolder() {
  if (!dir || (await dir.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("Permission was not given.");
}

/** Opens the native folder dialog on the machine running `pnpm dev`; null if it was closed. */
export const pickDataDir = async () => (await api<{ dataDir: string | null }>("POST", "/api/pick-folder")).dataDir;

export const setDataDir = (dataDir: string) => api<{ dataDir: string; copied: number }>("POST", "/api/config", { dataDir });

/** Switch to browser storage or a newly picked folder (the picker must open from a click).
 *  Same rule as the server's folder change: an empty target gets the current characters, otherwise its own are loaded. */
export async function switchTo(target: "browser" | "folder"): Promise<{ label: string; copied: number } | null> {
  let picked: DirHandle | null = null;
  if (target === "folder") {
    try {
      picked = await (window as any).showDirectoryPicker({ id: "prompt-builder", mode: "readwrite" });
    } catch (e: any) {
      if (e?.name === "AbortError") return null;   // picker closed
      throw e;
    }
  }
  const from = await backend();
  const current = await readAll(from).catch(() => [] as Partial<Character>[]);
  kind = target;
  if (picked) dir = picked;
  const existing = await readAll(target);
  let copied = 0;
  if (!existing.length) for (const c of current) { await write(target, normalize(c)); copied++; }
  await setSetting("backend", target);
  if (picked) await setSetting("dir", picked);
  return { label: target === "folder" ? `Folder: ${picked!.name}` : "This browser", copied };
}

// ---------------------------------------------------------------- import / export

/** Downloads one character as <id>.json, the same format as a file in a save folder. */
export function exportCharacter(c: Character) {
  const blob = new Blob([JSON.stringify(c, null, 2) + "\n"], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: fileName(c.id) });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Reads <id>.json character files (and old all-in-one exports, which hold an array). */
export async function readImport(files: FileList | File[]): Promise<Character[]> {
  const out: Character[] = [];
  for (const f of Array.from(files)) {
    let data: unknown;
    try { data = JSON.parse(await f.text()); } catch { throw new Error(`${f.name} is not valid JSON`); }
    for (const c of Array.isArray(data) ? data : [data]) {
      if (!c || typeof c !== "object" || (!("base" in c) && !("categories" in c))) throw new Error(`${f.name} does not look like a character file`);
      out.push(normalize(c as Partial<Character>));
    }
  }
  return out;
}

// ----------------------------------------------------------------

export function newCharacter(name: string, id: string): Character {
  return {
    version: 1, id, name, base: ["1girl", "solo"],
    categories: [
      { id: "outfit", name: "Outfit", presets: [], selected: null },
      { id: "expression", name: "Expression", presets: [], selected: null },
      { id: "pose", name: "Pose", presets: [], selected: null },
    ],
    toggles: [], negative: "", notes: "",
  };
}

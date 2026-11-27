import { folderSupported, STATIC } from "./env";
import { connect, getConfig, github, refresh as refreshGitHub, REPO } from "./github";
import { openDb, req } from "./idb";
import { joinPath } from "./paths";

/** The one folder every tool works in, normally the story vault. Paths are relative to it and use "/".
 *  Tool data lives under `.game-tools/<tool>/` (Obsidian ignores dot-folders; git still syncs it). Other paths, like the
 *  vault's scene files, are only read.
 *
 *  Backends:
 *  - server:  the Vite file API (`pnpm dev`), a folder path on this machine
 *  - folder:  a folder picked with the File System Access API (Chromium only)
 *  - browser: IndexedDB in this browser, a small file store with the same paths (no vault files to read). Not offered
 *             as a choice: it's what the static build uses until a folder or GitHub is set up, or after leaving them
 *  - github:  the vault's GitHub repository through the REST API (github.ts); changes wait in this browser until the
 *             user saves them as a commit
 *  The static build (GitHub Pages) has no server, so it offers folder, browser and github. */
export type Backend = "server" | "browser" | "folder" | "github";

/** `ready` is false while a folder is remembered but the browser wants permission again, or no folder was picked yet
 *  (`picked` false). */
export type Location = {
  kind: Backend; label: string; ready: boolean; picked: boolean;
  /** Name of the data folder (the vault's name in Obsidian); none for browser storage. */
  name?: string;
};

export type Entry = { name: string; kind: "file" | "directory" };
export type FileData = { text: string; mtime: number };

export const TOOLS_DIR = ".game-tools";
/** Path of a tool's own data folder. */
export const toolDir = (tool: string) => `${TOOLS_DIR}/${tool}`;

/** Thrown while a picked folder is remembered but the browser wants the user to allow access again. */
export class NeedsPermission extends Error {
  constructor() { super("The browser needs permission to use the folder again."); }
}

interface Store {
  read(path: string): Promise<FileData | null>;
  /** A file's bytes (images), null if it doesn't exist or this backend can't give them. */
  readBytes(path: string): Promise<Blob | null>;
  write(path: string, text: string): Promise<number>;
  remove(path: string): Promise<void>;
  list(dir: string): Promise<Entry[]>;
  /** Every file under `dir` in one go, not looking into dot-folders (see `walkFiles`). Only where that's cheaper
   *  than listing folder by folder. */
  walk?(dir: string): Promise<string[]>;
  /** Last change time of a file, null if it doesn't exist. */
  stat(path: string): Promise<number | null>;
  /** Move or rename a file or a whole folder, any kind of file (images too). `to` must not exist yet. */
  move(from: string, to: string): Promise<void>;
  /** Delete a folder and everything in it. */
  removeDir(dir: string): Promise<void>;
  /** Make an empty folder. Browser storage and GitHub can't hold empty folders: there it does nothing. */
  mkdir(dir: string): Promise<void>;
}

function check(path: string) {
  if (path.startsWith("/") || path.split("/").includes("..")) throw new Error(`invalid path ${path}`);
  return path.split("/").filter(Boolean);
}

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
  if (!r.ok) throw new Error(data?.error ?? r.statusText);
  return data as T;
}

const q = (path: string) => `?path=${encodeURIComponent(check(path).join("/"))}`;

const server: Store = {
  read: path => api("GET", `/api/fs/file${q(path)}`),
  readBytes: async path => {
    const r = await fetch(`/api/fs/raw${q(path)}`);
    return r.ok ? r.blob() : null;
  },
  write: async (path, text) => (await api<{ mtime: number }>("PUT", `/api/fs/file${q(path)}`, { text })).mtime,
  remove: async path => void (await api("DELETE", `/api/fs/file${q(path)}`)),
  list: dir => api("GET", `/api/fs/list${q(dir)}`),
  walk: dir => api("GET", `/api/fs/walk${q(dir)}`),
  stat: async path => (await api<{ mtime: number | null }>("GET", `/api/fs/stat${q(path)}`)).mtime,
  move: async (from, to) => void (await api("POST", "/api/fs/move", { from: check(from).join("/"), to: check(to).join("/") })),
  removeDir: async dir => void (await api("DELETE", `/api/fs/dir${q(dir)}`)),
  mkdir: async dir => void (await api("POST", `/api/fs/dir${q(dir)}`)),
};

// ---------------------------------------------------------------- IndexedDB (files + settings)

const DB_NAME = "game-tools";
let dbp: Promise<IDBDatabase> | null = null;
const idb = () => dbp ??= openDb(DB_NAME, db => {
  db.createObjectStore("files");
  db.createObjectStore("settings");
}).then(async db => { await migrateOldDb(db); return db; });

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, db?: IDBDatabase): Promise<T> {
  return req(fn((db ?? await idb()).transaction(store, mode).objectStore(store)));
}
const getSetting = <T>(key: string) => tx<T | undefined>("settings", "readonly", s => s.get(key));
const setSetting = (key: string, v: unknown) => tx("settings", "readwrite", s => s.put(v, key));

type Stored = { text: string; mtime: number };

const browser: Store = {
  read: async path => (await tx<Stored | undefined>("files", "readonly", s => s.get(check(path).join("/")))) ?? null,
  // only holds the tools' text files
  readBytes: async () => null,
  write: async (path, text) => {
    const mtime = Date.now();
    await tx("files", "readwrite", s => s.put({ text, mtime } satisfies Stored, check(path).join("/")));
    return mtime;
  },
  remove: async path => void (await tx("files", "readwrite", s => s.delete(check(path).join("/")))),
  list: async dir => {
    const prefix = check(dir).map(p => p + "/").join("");
    const keys = await tx("files", "readonly", s => s.getAllKeys(prefix ? IDBKeyRange.bound(prefix, prefix + "￿") : undefined));
    const out = new Map<string, Entry>();
    for (const k of keys as string[]) {
      const [name, ...more] = k.slice(prefix.length).split("/");
      if (!out.has(name) || more.length) out.set(name, { name, kind: more.length ? "directory" : "file" });
    }
    return [...out.values()];
  },
  stat: async path => (await browser.read(path))?.mtime ?? null,
  move: async (from, to) => {
    const [f, t] = [check(from).join("/"), check(to).join("/")];
    const keys = (await tx("files", "readonly", s => s.getAllKeys())) as string[];
    const moving = keys.filter(k => k === f || k.startsWith(f + "/"));
    if (keys.some(k => k === t || k.startsWith(t + "/"))) throw new Error(`${to} already exists`);
    for (const k of moving) {
      const v = await tx<Stored>("files", "readonly", s => s.get(k));
      await tx("files", "readwrite", s => s.put(v, t + k.slice(f.length)));
      await tx("files", "readwrite", s => s.delete(k));
    }
  },
  removeDir: async dir => {
    const d = check(dir).join("/") + "/";
    await tx("files", "readwrite", s => s.delete(IDBKeyRange.bound(d, d + "\uffff")));
  },
  mkdir: async () => {},
};

/** The Prompt Builder used to keep its own database ("prompt-builder": characters + settings). Copy it over once. */
async function migrateOldDb(db: IDBDatabase) {
  if (await tx("settings", "readonly", s => s.get("migrated"), db)) return;
  const names = (await indexedDB.databases?.().catch(() => [])) ?? [];
  if (names.some(d => d.name === "prompt-builder")) {
    const old = await openDb("prompt-builder");
    if (old.objectStoreNames.contains("characters")) {
      const chars = await req(old.transaction("characters").objectStore("characters").getAll());
      for (const c of chars) {
        if (!c?.id) continue;
        const key = `${toolDir("prompt-builder")}/${c.id}.json`;
        await tx("files", "readwrite", s => s.put({ text: jsonText(c), mtime: Date.now() } satisfies Stored, key), db);
      }
    }
    // The old remembered folder was the character folder, not the vault, so folder users pick the vault once.
    const backend = old.objectStoreNames.contains("settings")
      ? await req(old.transaction("settings").objectStore("settings").get("backend")) : undefined;
    if (backend) await tx("settings", "readwrite", s => s.put(backend, "backend"), db);
    old.close();
  }
  await tx("settings", "readwrite", s => s.put(true, "migrated"), db);
}

// ---------------------------------------------------------------- File System Access API (not in TS's DOM lib yet)

type Perm = "granted" | "denied" | "prompt";
type FileHandle = {
  kind: "file"; name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: string | Blob): Promise<void>; close(): Promise<void> }>;
};
type DirHandle = {
  kind: "directory"; name: string;
  values(): AsyncIterable<FileHandle | DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  removeEntry(name: string, o?: { recursive?: boolean }): Promise<void>;
  queryPermission(o: { mode: "readwrite" }): Promise<Perm>;
  requestPermission(o: { mode: "readwrite" }): Promise<Perm>;
};

type DirPicker = (o: { id: string; mode: "readwrite" }) => Promise<DirHandle>;
const errName = (e: unknown) => (e instanceof DOMException || e instanceof Error ? e.name : undefined);

let rootDir: DirHandle | null = null;
const permitted = async (d: DirHandle) => (await d.queryPermission({ mode: "readwrite" })) === "granted";
const notFound = (e: unknown) => errName(e) === "NotFoundError" || errName(e) === "TypeMismatchError";

async function dirAt(parts: string[], create: boolean): Promise<DirHandle | null> {
  if (!rootDir) throw new NeedsPermission();
  let d = rootDir;
  try {
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  } catch (e) {
    if (notFound(e)) return null;
    throw e;
  }
  return d;
}

async function fileAt(path: string, create: boolean): Promise<FileHandle | null> {
  const parts = check(path);
  const d = await dirAt(parts.slice(0, -1), create);
  if (!d) return null;
  try {
    return await d.getFileHandle(parts[parts.length - 1], { create });
  } catch (e) {
    if (notFound(e)) return null;
    throw e;
  }
}

const folder: Store = {
  read: async path => {
    const f = await (await fileAt(path, false))?.getFile();
    return f ? { text: await f.text(), mtime: f.lastModified } : null;
  },
  readBytes: async path => (await (await fileAt(path, false))?.getFile()) ?? null,
  write: async (path, text) => {
    const h = (await fileAt(path, true))!;
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
    return (await h.getFile()).lastModified;
  },
  remove: async path => {
    const parts = check(path);
    const d = await dirAt(parts.slice(0, -1), false);
    await d?.removeEntry(parts[parts.length - 1]).catch(e => { if (!notFound(e)) throw e; });
  },
  list: async dir => {
    const d = await dirAt(check(dir), false);
    const out: Entry[] = [];
    if (d) for await (const h of d.values()) out.push({ name: h.name, kind: h.kind });
    return out;
  },
  stat: async path => (await (await fileAt(path, false))?.getFile())?.lastModified ?? null,
  // The API has no general move for picked folders: copy the bytes over, then delete the old ones
  move: async (from, to) => {
    const fp = check(from), tp = check(to);
    const src = await dirAt(fp.slice(0, -1), false);
    if (!src) throw new Error(`${from} doesn't exist`);
    const dst = (await dirAt(tp.slice(0, -1), true))!;
    const name = fp[fp.length - 1], newName = tp[tp.length - 1];
    const h = await entryIn(src, name);
    if (!h) throw new Error(`${from} doesn't exist`);
    // Only the case changes (rin.md → Rin.md) in the same folder: on Windows and macOS both names are one file, so
    // copying onto the new name and deleting the old one would delete it. Go through a temporary name instead.
    if (from.toLowerCase() === to.toLowerCase()) {
      if (name === newName) return;
      // On a case-sensitive disk both names can be listed as two different files: don't overwrite the other one
      if (await entryIn(src, newName)) throw new Error(`${to} already exists`);
      const tmp = `${newName}.moving-${Date.now()}`;
      await copyInto(h, src, tmp);
      await src.removeEntry(name, { recursive: true });
      await copyInto((await entryIn(src, tmp))!, src, newName);
      await src.removeEntry(tmp, { recursive: true });
      return;
    }
    if (await entryIn(dst, newName)) throw new Error(`${to} already exists`);
    await copyInto(h, dst, newName);
    await src.removeEntry(name, { recursive: true });
  },
  removeDir: async dir => {
    const parts = check(dir);
    const d = await dirAt(parts.slice(0, -1), false);
    await d?.removeEntry(parts[parts.length - 1], { recursive: true }).catch(e => { if (!notFound(e)) throw e; });
  },
  mkdir: async dir => void (await dirAt(check(dir), true)),
};

async function entryIn(d: DirHandle, name: string): Promise<FileHandle | DirHandle | null> {
  for await (const h of d.values()) if (h.name === name) return h;
  return null;
}

async function copyInto(h: FileHandle | DirHandle, dst: DirHandle, name: string): Promise<void> {
  if (h.kind === "file") {
    const w = await (await dst.getFileHandle(name, { create: true })).createWritable();
    await w.write(await h.getFile());
    await w.close();
    return;
  }
  const d = await dst.getDirectoryHandle(name, { create: true });
  for await (const c of h.values()) await copyInto(c, d, c.name);
}

// ---------------------------------------------------------------- active backend

let kind: Backend | null = null;
async function backend(): Promise<Backend> {
  if (kind) return kind;
  if (!STATIC) return (kind = "server");
  const saved = await getSetting<Backend>("backend");
  if (saved === "folder" && folderSupported) {
    rootDir = (await getSetting<DirHandle>("root")) ?? null;
    return (kind = "folder");
  }
  if (saved === "github" && (await getConfig())) return (kind = "github");
  return (kind = "browser");
}

const stores: Record<Backend, Store> = { server, browser, folder, github };

async function store(): Promise<Store> {
  const k = await backend();
  if (k === "folder" && (!rootDir || !(await permitted(rootDir)))) throw new NeedsPermission();
  return stores[k];
}

/** Text of a file and when it last changed; null if it doesn't exist. */
export const readFile = async (path: string) => (await store()).read(path);
export const readBytes = async (path: string) => (await store()).readBytes(path);
export const readText = async (path: string) => (await readFile(path))?.text ?? null;
export async function readJson<T>(path: string): Promise<T | null> {
  const t = await readText(path);
  return t === null ? null : JSON.parse(t);
}
/** Writes (creating folders as needed) and returns the file's new change time. */
export const writeText = async (path: string, text: string) => (await store()).write(path, text);
/** How every tool writes JSON: two-space indent, a newline at the end (small git diffs). */
export const jsonText = (data: unknown) => JSON.stringify(data, null, 2) + "\n";
export const writeJson = (path: string, data: unknown) => writeText(path, jsonText(data));
export const removeFile = async (path: string) => (await store()).remove(path);
/** Entries of a folder; empty if it doesn't exist. */
export const listDir = async (dir: string) => (await store()).list(dir);
export const statFile = async (path: string) => (await store()).stat(path);
/** Move or rename a file or folder (with everything in it, any file type). Fails if `to` exists. */
export const movePath = async (from: string, to: string) => (await store()).move(from, to);
export const removeDir = async (dir: string) => (await store()).removeDir(dir);
export const makeDir = async (dir: string) => (await store()).mkdir(dir);

/** Every file under `dir` (full paths), not looking into dot-folders and dot-files (.git, .obsidian) below it, nor
 *  into the folders `skip` says. On the dev server one request, elsewhere all folders at once. */
export const walkFiles = async (dir = "", skip: (path: string) => boolean = () => false) =>
  // sorted like the dev server's walk, so every backend gives the same order (the first of two same names wins)
  (await walkIn(await store(), dir, skip)).sort();

async function walkIn(s: Store, dir: string, skip: (path: string) => boolean): Promise<string[]> {
  if (s.walk) {
    // the folders a file is in, below `dir`: none of them may be skipped
    const inSkipped = (f: string) => {
      const parts = f.slice(dir ? dir.length + 1 : 0).split("/").slice(0, -1);
      return parts.some((_, i) => skip(joinPath(dir, ...parts.slice(0, i + 1))));
    };
    return (await s.walk(dir)).filter(f => !inSkipped(f));
  }
  // a folder that can't be read is skipped instead of failing the whole walk
  const entries = await s.list(dir).catch(() => []);
  const nested = await Promise.all(entries.filter(e => !e.name.startsWith(".")).map(e => {
    const p = joinPath(dir, e.name);
    return e.kind === "file" ? [p] : skip(p) ? [] : walkIn(s, p, skip);
  }));
  return nested.flat();
}

/** Files directly in `dir` with the given extension, as full paths. */
export async function listFiles(dir: string, ext: string) {
  return (await listDir(dir)).filter(e => e.kind === "file" && e.name.endsWith(ext)).map(e => joinPath(dir, e.name)).sort();
}

export async function getLocation(): Promise<Location> {
  const k = await backend();
  if (k === "server") {
    const root = (await api<{ root: string }>("GET", "/api/config")).root;
    return { kind: k, label: root, ready: true, picked: true, name: root.split(/[\\/]/).filter(Boolean).pop() };
  }
  if (k === "browser") return { kind: k, label: BROWSER_LABEL, ready: true, picked: true };
  if (k === "github") {
    return { kind: k, label: githubLabel, ready: true, picked: true, name: REPO.repo };
  }
  if (!rootDir) return { kind: k, label: "No folder picked yet", ready: false, picked: false };
  return { kind: k, label: `Folder: ${rootDir.name}`, ready: await permitted(rootDir), picked: true, name: rootDir.name };
}

/** Before "Reload": look at the GitHub branch again right away instead of within the next few seconds. */
export async function refreshLocation() {
  if ((await backend()) === "github") await refreshGitHub();
}

/** Ask again for access to the remembered folder. Must run from a click. */
export async function reconnectFolder() {
  if (!rootDir || (await rootDir.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("Permission was not given.");
}

// ---------------------------------------------------------------- changing the location

let version = 0;
/** Counts changes of the location (another folder, backend or repository). A tool's data read for an older one is
 *  stale; one read for this one stays good while another tool is open (its poll picks up outside changes). */
export const locationVersion = () => version;

/** Every file under `.game-tools/`, recursively. */
const toolFiles = (s: Store) => walkIn(s, TOOLS_DIR, () => false).catch(() => [] as string[]);

/** Run `change`, then bring the tools' data along if the new place has none yet. Returns how many files were copied. */
async function moveData(change: () => Promise<void>): Promise<number> {
  const from = await store().catch(() => null);
  const files: [string, string][] = [];
  if (from) for (const p of await toolFiles(from)) {
    const f = await from.read(p);
    if (f) files.push([p, f.text]);
  }
  // a change that fails partway may still have moved things: data read before it counts as stale either way
  try { await change(); } finally { version++; }
  const to = await store();
  if (!files.length || (await toolFiles(to)).length) return 0;
  for (const [p, text] of files) await to.write(p, text);
  return files.length;
}

/** Opens the native folder dialog on the machine running `pnpm dev`; null if it was closed. */
export const pickServerRoot = async () => (await api<{ root: string | null }>("POST", "/api/pick-folder")).root;

/** Point the dev server at another folder. Returns the folder and how many tool files were copied there. */
export async function setServerRoot(root: string) {
  let chosen = root;
  const copied = await moveData(async () => { chosen = (await api<{ root: string }>("POST", "/api/config", { root })).root; });
  return { label: chosen, copied };
}

/** Switch to browser storage or a newly picked folder (the picker must open from a click). Returns null if the picker
 *  was closed. If the new place holds no tool data yet, the current data is copied there. */
export async function switchTo(target: "browser" | "folder"): Promise<{ label: string; copied: number } | null> {
  let picked: DirHandle | null = null;
  if (target === "folder") {
    try {
      picked = await (window as unknown as { showDirectoryPicker: DirPicker }).showDirectoryPicker({ id: "game-tools-root", mode: "readwrite" });
    } catch (e) {
      if (errName(e) === "AbortError") return null;   // picker closed
      throw e;
    }
  }
  const copied = await moveData(async () => {
    kind = target;
    if (picked) rootDir = picked;
    await setSetting("backend", target);
    if (picked) await setSetting("root", picked);
  });
  return { label: target === "folder" ? `Folder: ${picked!.name}` : BROWSER_LABEL, copied };
}

const githubLabel = `GitHub: ${REPO.owner}/${REPO.repo}`;
/** What browser storage is called: the fallback while nothing else is set up. */
const BROWSER_LABEL = "Only in this browser";

/** Connect to the GitHub repository (checking the token) and use it. If it has no tool data yet, the current data is
 *  copied there as unsaved changes. */
export async function switchToGitHub(token: string) {
  const copied = await moveData(async () => {
    await connect(token);
    kind = "github";
    await setSetting("backend", "github");
  });
  return { label: githubLabel, copied };
}

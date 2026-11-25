import type { Entry, FileData } from "./workspace";

/** The vault as a GitHub repository, used through GitHub's REST API, so the static build works in any browser.
 *
 *  Nothing is pushed on its own. Tools write as usual, but their writes are kept as *pending changes* in this browser
 *  (IndexedDB, so they survive a reload or going offline). `commit()` pushes them all as one commit when the user
 *  clicks Save. Reads show the pending version over the repo's.
 *
 *  Each pending change remembers the repo's version of the file it started from (`base`, a blob sha). If someone
 *  else pushed a different version in the meantime, the commit stops and names those files instead of overwriting.
 *
 *  Change times (`mtime`) are made up: the file's blob sha as a number, pending or not, so a file keeps its time when
 *  it gets saved. Tools only compare them for equality, to notice when a file changed somewhere else. */

export type GitHubConfig = { owner: string; repo: string; branch: string; token: string; login: string };

/** The story vault. Fixed: every author works on this repository and branch. */
export const REPO = { owner: "HASHTAGTB", repo: "game", branch: "main" } as const;

/** A pending change: new text, a deletion (`text` null), or, for a moved file, the repo blob it keeps (`sha`, with
 *  `text` null). Moves go by blob, so images and other binary files are moved without being read. */
type Pending = { text: string | null; sha?: string; base: string | null; mtime: number };
const deleted = (p: Pending) => p.text === null && !p.sha;
type Tree = { head: string; tree: string; files: Map<string, string>; dirs: Set<string>; etag: string | null; at: number };

const API = "https://api.github.com";
/** How long the repo's file list counts as current. Checking costs nothing while the branch hasn't moved (304). */
const FRESH_MS = 15_000;

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// ---------------------------------------------------------------- this browser's copy (config + pending changes)

let dbp: Promise<IDBDatabase> | null = null;
const db = () => dbp ??= new Promise((resolve, reject) => {
  const r = indexedDB.open("game-tools-github", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("kv");
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
async function kv<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const s = (await db()).transaction("kv", mode).objectStore("kv");
  return new Promise((resolve, reject) => { const r = fn(s); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

let config: GitHubConfig | null | undefined;
let pending: Map<string, Pending> | null = null;
let tree: Tree | null = null;
let treeLoad: Promise<Tree> | null = null;
/** Bumped whenever `tree` is replaced from outside `loadTree`, so a load that started earlier can't put back an older tree. */
let treeGen = 0;
const blobs = new Map<string, string>();

export async function getConfig() {
  if (config === undefined) {
    const saved = await kv<GitHubConfig | undefined>("readonly", s => s.get("config"));
    config = saved ? { ...saved, ...REPO } : null;
  }
  return config;
}

async function pend() {
  if (!pending) {
    const saved = await kv<[string, Pending][] | undefined>("readonly", s => s.get("pending"));
    pending ??= new Map(saved ?? []);
  }
  return pending;
}

// Writes to IndexedDB run in order, so an older snapshot never lands after a newer one.
let persisting: Promise<unknown> = Promise.resolve();
function changed() {
  const snap = [...pending!];
  persisting = persisting.then(() => kv("readwrite", s => s.put(snap, "pending")), () => {});
  notify();
}
function notify() {
  pendingPaths = [...pending!.keys()].sort();
  for (const fn of listeners) fn();
}

// ---------------------------------------------------------------- pending changes, for the UI

let pendingPaths: string[] = [];
const listeners = new Set<() => void>();
/** For useSyncExternalStore: the paths with unsaved changes, a new array whenever they change. */
export const pendingSnapshot = () => pendingPaths;
export function onPendingChange(fn: () => void) {
  listeners.add(fn);
  pend().then(notify, () => {});
  return () => { listeners.delete(fn); };
}

// ---------------------------------------------------------------- REST calls

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, token = config?.token): Promise<{ data: T; res: Response }> {
  const res = await fetch(API + path, {
    method,
    // the browser's HTTP cache would hand back a stale branch; freshness is checked with ETags below instead
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 304) return { data: null as T, res };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = res.status === 401 ? "GitHub refused the token (expired or revoked?). Connect again under Data folder."
      : res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0" ? "GitHub's hourly request limit is used up. Try again later."
      : res.status === 404 ? "GitHub can't find the repository or branch (or the token can't see it)."
      : `GitHub: ${data?.message ?? res.statusText}`;
    throw new GitHubError(res.status, msg);
  }
  return { data, res };
}

const repoPath = (c: GitHubConfig) => `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`;

async function cfg() {
  const c = await getConfig();
  if (!c) throw new Error("Not connected to GitHub.");
  return c;
}

/** The branch's current file list. Re-checked when older than FRESH_MS, or always with `force`. */
async function currentTree(force = false): Promise<Tree> {
  if (tree && !force && Date.now() - tree.at < FRESH_MS) return tree;
  if (treeLoad) return treeLoad;
  const p: Promise<Tree> = loadTree().finally(() => { if (treeLoad === p) treeLoad = null; });
  return (treeLoad = p);
}

/** Put in a tree known some other way (right after a commit). Loads still running can no longer replace it. */
function setTree(t: Tree) {
  treeGen++;
  treeLoad = null;
  tree = t;
}

async function loadTree(): Promise<Tree> {
  const gen = treeGen;
  const keep = (t: Tree) => (gen === treeGen ? (tree = t) : tree ?? t);
  const c = await cfg();
  const r = repoPath(c);
  const ref = await call<{ object: { sha: string } }>("GET", `${r}/git/ref/heads/${encodeURIComponent(c.branch)}`, undefined,
    tree?.etag ? { "If-None-Match": tree.etag } : {});
  if (ref.res.status === 304 && tree) return keep({ ...tree, at: Date.now() });
  const head = ref.data.object.sha;
  if (tree?.head === head) return keep({ ...tree, etag: ref.res.headers.get("etag"), at: Date.now() });
  const commit = (await call<{ tree: { sha: string } }>("GET", `${r}/git/commits/${head}`)).data;
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  await walk(r, commit.tree.sha, "", files, dirs);
  return keep({ head, tree: commit.tree.sha, files, dirs, etag: ref.res.headers.get("etag"), at: Date.now() });
}

type TreeEntry = { path: string; type: string; sha: string };

/** Every file under the tree `sha`. GitHub cuts long recursive listings short (`truncated`); then each folder is
 *  listed on its own, so no file goes missing (a missing file would look new, and saving would overwrite it). */
async function walk(r: string, sha: string, prefix: string, files: Map<string, string>, dirs: Set<string>): Promise<void> {
  const all = (await call<{ tree: TreeEntry[]; truncated: boolean }>("GET", `${r}/git/trees/${sha}?recursive=1`)).data;
  const add = (e: TreeEntry) => {
    if (e.type === "blob") files.set(prefix + e.path, e.sha);
    else if (e.type === "tree") dirs.add(prefix + e.path);
  };
  if (!all.truncated) { all.tree.forEach(add); return; }
  const top = (await call<{ tree: TreeEntry[]; truncated: boolean }>("GET", `${r}/git/trees/${sha}`)).data;
  if (top.truncated) throw new GitHubError(0, `GitHub can't list the folder "${prefix || "/"}" in full (too many files in it).`);
  top.tree.forEach(add);
  await Promise.all(top.tree.filter(e => e.type === "tree").map(e => walk(r, e.sha, prefix + e.path + "/", files, dirs)));
}

/** The folders holding `files` (git keeps no empty ones). */
function dirsOf(files: Map<string, string>) {
  const dirs = new Set<string>();
  for (const path of files.keys()) {
    for (let i = path.indexOf("/"); i >= 0; i = path.indexOf("/", i + 1)) dirs.add(path.slice(0, i));
  }
  return dirs;
}

const bytesToText = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), ch => ch.charCodeAt(0)));

async function blob(sha: string) {
  let text = blobs.get(sha);
  if (text === undefined) {
    const c = await cfg();
    const b = (await call<{ content: string; encoding: string }>("GET", `${repoPath(c)}/git/blobs/${sha}`)).data;
    text = b.encoding === "base64" ? bytesToText(b.content) : b.content;
    blobs.set(sha, text);
  }
  return text;
}

/** Git's id for a file with this content, to tell whether a write changes anything. */
async function blobSha(text: string) {
  const body = new TextEncoder().encode(text);
  const head = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head);
  all.set(body, head.length);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-1", all))].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** A blob sha as a change time (48 bits fit a JS number exactly). */
const shaTime = (sha: string) => parseInt(sha.slice(0, 12), 16);

// ---------------------------------------------------------------- the Store

export const github = {
  async read(path: string): Promise<FileData | null> {
    const p = (await pend()).get(path);
    if (p?.sha) return { text: await blob(p.sha), mtime: p.mtime };
    if (p) return p.text === null ? null : { text: p.text, mtime: p.mtime };
    const sha = (await currentTree()).files.get(path);
    return sha ? { text: await blob(sha), mtime: shaTime(sha) } : null;
  },

  async write(path: string, text: string): Promise<number> {
    const [ps, t, sha] = await Promise.all([pend(), currentTree(), blobSha(text)]);
    const remote = t.files.get(path) ?? null;
    const base = ps.has(path) ? ps.get(path)!.base : remote;
    blobs.set(sha, text);
    if (sha === remote && base === remote) {
      // back to what the repo has: nothing to save
      if (ps.delete(path)) changed();
    } else {
      ps.set(path, { text, base, mtime: shaTime(sha) });
      changed();
    }
    // the same time it will have once saved, so saving doesn't look like a change made somewhere else
    return shaTime(sha);
  },

  async remove(path: string): Promise<void> {
    const [ps, t] = await Promise.all([pend(), currentTree()]);
    const remote = t.files.get(path) ?? null;
    const base = ps.has(path) ? ps.get(path)!.base : remote;
    if (base === null && remote === null) ps.delete(path);   // only ever existed here
    else ps.set(path, { text: null, base, mtime: 0 });
    changed();
  },

  async list(dir: string): Promise<Entry[]> {
    const [ps, t] = await Promise.all([pend(), currentTree()]);
    const prefix = dir ? dir + "/" : "";
    const out = new Map<string, Entry>();
    const add = (path: string, kind: "file" | "directory") => {
      if (!path.startsWith(prefix)) return;
      const [name, ...more] = path.slice(prefix.length).split("/");
      if (name && (!out.has(name) || more.length)) out.set(name, { name, kind: more.length ? "directory" : kind });
    };
    // folders come from the files in them, not the repo's folder list: a folder whose files were all moved or deleted
    // here is gone (git keeps no empty folders either)
    for (const [f] of t.files) { const p = ps.get(f); if (!p || !deleted(p)) add(f, "file"); }
    for (const [f, p] of ps) if (!deleted(p)) add(f, "file");
    return [...out.values()];
  },

  async stat(path: string): Promise<number | null> {
    const p = (await pend()).get(path);
    if (p) return deleted(p) ? null : p.mtime;
    const sha = (await currentTree()).files.get(path);
    return sha ? shaTime(sha) : null;
  },

  async move(from: string, to: string): Promise<void> {
    const [ps, t] = await Promise.all([pend(), currentTree()]);
    const live = filesUnder(ps, t, from);
    if (!live.length) throw new Error(`${from} doesn't exist`);
    if (filesUnder(ps, t, to).length) throw new Error(`${to} already exists`);
    for (const path of live) {
      const dest = to + path.slice(from.length);
      const p = ps.get(path);
      const remote = t.files.get(dest) ?? null;
      const base = ps.has(dest) ? ps.get(dest)!.base : remote;
      const sha = p ? p.sha : t.files.get(path)!;
      if (p && !p.sha) ps.set(dest, { text: p.text, base, mtime: p.mtime });
      else if (sha === remote && base === remote) ps.delete(dest);   // moved back to where the repo has it
      else ps.set(dest, { text: null, sha, base, mtime: shaTime(sha!) });
      markRemoved(ps, t, path);
    }
    changed();
  },

  async removeDir(dir: string): Promise<void> {
    const [ps, t] = await Promise.all([pend(), currentTree()]);
    for (const path of filesUnder(ps, t, dir)) markRemoved(ps, t, path);
    changed();
  },

  async mkdir(): Promise<void> {},
};

/** Files (not deleted) that are `path` itself or inside the folder `path`. */
function filesUnder(ps: Map<string, Pending>, t: Tree, path: string) {
  const inside = (f: string) => f === path || f.startsWith(path + "/");
  const out = new Set<string>();
  for (const f of t.files.keys()) if (inside(f) && !(ps.has(f) && deleted(ps.get(f)!))) out.add(f);
  for (const [f, p] of ps) if (inside(f) && !deleted(p)) out.add(f);
  return [...out];
}

function markRemoved(ps: Map<string, Pending>, t: Tree, path: string) {
  const remote = t.files.get(path) ?? null;
  const base = ps.has(path) ? ps.get(path)!.base : remote;
  if (base === null && remote === null) ps.delete(path);   // only ever existed here
  else ps.set(path, { text: null, base, mtime: 0 });
}

// ---------------------------------------------------------------- connecting

/** Checks the token can push to REPO, then remembers it. Unsaved changes are kept (same repo, new token). */
export async function connect(token: string): Promise<GitHubConfig> {
  token = token.trim();
  if (!token) throw new Error("Paste a token.");
  const path = `/repos/${REPO.owner}/${REPO.repo}`;
  const repo = (await call<{ permissions?: { push?: boolean } }>("GET", path, undefined, {}, token)).data;
  if (!repo.permissions?.push) throw new Error("This token can read the repository but not write to it. Give it Contents: Read and write.");
  await call("GET", `${path}/git/ref/heads/${REPO.branch}`, undefined, {}, token);
  const login = (await call<{ login: string }>("GET", "/user", undefined, {}, token).catch(() => null))?.data.login ?? "";
  config = { ...REPO, token, login };
  await kv("readwrite", s => s.put(config, "config"));
  treeGen++;
  treeLoad = null;
  tree = null;
  return config;
}

/** Forget the token and any unsaved changes. */
export async function disconnect() {
  await discard();
  config = null;
  treeGen++;
  treeLoad = null;
  tree = null;
  await kv("readwrite", s => s.delete("config"));
}

// ---------------------------------------------------------------- saving

export type CommitResult = { ok: true; files: number; sha: string } | { ok: false; conflicts: string[] };

/** Push every pending change as one commit. Stops, changing nothing, if any of those files changed on GitHub since
 *  it was first edited here (see `keepMine` and `discard`). */
export async function commit(message: string): Promise<CommitResult> {
  const c = await cfg();
  const r = repoPath(c);
  const ps = await pend();
  for (let attempt = 0; ; attempt++) {
    const snap = [...ps];
    if (!snap.length) return { ok: true, files: 0, sha: "" };
    const t = await currentTree(true);
    const conflicts = snap.filter(([path, p]) => (t.files.get(path) ?? null) !== p.base).map(([path]) => path);
    if (conflicts.length) return { ok: false, conflicts };

    const entries = snap.map(([path, p]) => p.sha ? { path, mode: "100644", type: "blob", sha: p.sha }
      : p.text === null ? { path, mode: "100644", type: "blob", sha: null }
      : { path, mode: "100644", type: "blob", content: p.text });
    const newTree = (await call<{ sha: string }>("POST", `${r}/git/trees`, { base_tree: t.tree, tree: entries })).data;
    const made = (await call<{ sha: string }>("POST", `${r}/git/commits`, { message, tree: newTree.sha, parents: [t.head] })).data;
    try {
      await call("PATCH", `${r}/git/refs/heads/${encodeURIComponent(c.branch)}`, { sha: made.sha, force: false });
    } catch (e) {
      // someone pushed between reading the branch and moving it: check again on top of their commit
      if (e instanceof GitHubError && e.status === 422 && attempt < 2) continue;
      throw e;
    }

    // The branch now holds exactly what was sent. Build that file list here rather than asking GitHub, which could
    // still answer with the tree from before the commit.
    const files = new Map(t.files);
    for (const [path, p] of snap) {
      if (p.sha) { files.set(path, p.sha); continue; }
      if (p.text === null) { files.delete(path); continue; }
      const sha = await blobSha(p.text);
      blobs.set(sha, p.text);
      files.set(path, sha);
    }
    setTree({ head: made.sha, tree: newTree.sha, files, dirs: dirsOf(files), etag: null, at: Date.now() });
    for (const [path, p] of snap) {
      const now = ps.get(path);
      if (now === p) ps.delete(path);   // saved as it is now
      else if (now) now.base = files.get(path) ?? null;   // edited again while saving: still pending, on top of this commit
    }
    changed();
    return { ok: true, files: snap.length, sha: made.sha };
  }
}

/** For files that changed on GitHub too: keep this browser's version, so the next save overwrites theirs. */
export async function keepMine(paths: string[]) {
  const [ps, t] = await Promise.all([pend(), currentTree(true)]);
  for (const path of paths) {
    const p = ps.get(path);
    if (p) p.base = t.files.get(path) ?? null;
  }
  changed();
}

/** Drop pending changes (all of them, or just `paths`), going back to GitHub's version. */
export async function discard(paths?: string[]) {
  const ps = await pend();
  for (const path of paths ?? [...ps.keys()]) ps.delete(path);
  changed();
}

/** Re-read the branch now (after "Reload"). */
export const refresh = () => currentTree(true).then(() => {});

/** A commit message naming what changed, e.g. "Update timeline, prompt-builder". */
export function defaultMessage(paths: string[]) {
  const parts = new Set(paths.map(p => {
    const [top, tool] = p.split("/");
    return top === ".game-tools" ? (tool?.endsWith(".json") ? tool.replace(/\.json$/, "") : tool) : top;
  }));
  return `Update ${[...parts].join(", ")}`;
}

export const commitUrl = (c: GitHubConfig, sha: string) => `https://github.com/${c.owner}/${c.repo}/commit/${sha}`;

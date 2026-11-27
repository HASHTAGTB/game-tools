/** Tiny file API mounted into the Vite dev/preview server. Every tool reads and writes files under one root folder
 *  you choose (normally the story vault; tool data lives in its `.game-tools/` folder). Paths are relative to the root
 *  and can't leave it. */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** GAME_TOOLS_CONFIG points a second server at its own config (e.g. a test copy of the vault). */
const CONFIG = process.env.GAME_TOOLS_CONFIG ? path.resolve(process.env.GAME_TOOLS_CONFIG) : path.join(ROOT, "config.json");
const DEFAULT_DIR = path.join(ROOT, "characters");

type Config = { root: string };

/** Older configs held `dataDir`, the Prompt Builder's character folder. Inside a vault that was CANON/01_Characters,
 *  so the vault root is two levels up; any other folder simply becomes the root (the client moves its files). */
function fromLegacy(dataDir: string) {
  const m = dataDir.match(/^(.*?)[\\/]+CANON[\\/]+01_Characters[\\/]*$/);
  return m ? m[1] : dataDir;
}

/** The config as last read or written: every request needs it, so it's read from disk only once
 *  (editing config.json by hand needs a server restart; the app's own changes go through POST /api/config). */
let config: Config | null = null;

async function readConfig(): Promise<Config> {
  if (config) return config;
  const c = await readConfigFile();
  return (config ??= c); // a POST /api/config that landed during the read wins
}

async function readConfigFile(): Promise<Config> {
  try {
    const c = JSON.parse(await fs.readFile(CONFIG, "utf8"));
    if (typeof c.root === "string" && c.root) return { root: c.root };
    if (typeof c.dataDir === "string" && c.dataDir) return { root: fromLegacy(c.dataDir) };
  } catch { /* no config yet */ }
  return { root: DEFAULT_DIR };
}

const expand = (p: string) => path.resolve(ROOT, p.trim().replace(/^~(?=$|\/)/, os.homedir()));

type Run = { stdout: string; code: number | string | null };
const run = (cmd: string, args: string[]) => new Promise<Run>(resolve =>
  execFile(cmd, args, { windowsHide: true }, (err: any, stdout) => resolve({ stdout: String(stdout ?? ""), code: err ? err.code ?? 1 : 0 })));

const TITLE = "Folder for the tools' data (the story vault)";

/** Opens the OS's own folder dialog on this machine (the server runs locally, so the browser can't give us a real path).
 *  Returns the chosen folder, or null if the dialog was closed. Throws if no dialog program is available. */
async function pickFolder(start: string): Promise<string | null> {
  const tries: [string, string[]][] =
    process.platform === "darwin" ? [["osascript", ["-e",
      `POSIX path of (choose folder with prompt ${JSON.stringify(TITLE)} default location (POSIX file ${JSON.stringify(start)}))`]]]
    : process.platform === "win32" ? [["powershell", ["-NoProfile", "-STA", "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; " +
      `$d.Description = '${TITLE}'; $d.SelectedPath = '${start.replace(/'/g, "''")}'; ` +
      "if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }"]]]
    : [
      ["zenity", ["--file-selection", "--directory", `--title=${TITLE}`, `--filename=${start}/`]],
      ["kdialog", ["--getexistingdirectory", start, "--title", TITLE]],
      ["yad", ["--file", "--directory", `--title=${TITLE}`, `--filename=${start}/`]],
      ["qarma", ["--file-selection", "--directory", `--title=${TITLE}`, `--filename=${start}/`]],
    ];
  for (const [cmd, args] of tries) {
    const r = await run(cmd, args);
    if (r.code === "ENOENT") continue;                 // not installed, try the next one
    const picked = r.stdout.trim();
    return r.code === 0 && picked ? picked : null;     // non-zero exit = dialog cancelled
  }
  throw new Error(process.platform === "linux"
    ? "No folder dialog found. Install zenity or kdialog."
    : "Could not open the folder dialog.");
}

/** Absolute path of `rel` inside `root`. Rejects anything that would leave the root. */
function inRoot(root: string, rel: string | null) {
  const clean = (rel ?? "").replace(/\\/g, "/");
  if (clean.startsWith("/") || clean.split("/").includes("..")) throw new Error(`invalid path ${rel}`);
  const full = path.resolve(root, clean);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`invalid path ${rel}`);
  return full;
}

const RAW_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".gif": "image/gif", ".svg": "image/svg+xml",
};

const missing = (e: any) => e?.code === "ENOENT" || e?.code === "ENOTDIR";

async function writeAtomic(file: string, data: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, file);
}

async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://x");
  if (!url.pathname.startsWith("/api/")) return false;
  const cfg = await readConfig();
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /api/config") return send(res, 200, cfg), true;

  if (route === "POST /api/pick-folder") return send(res, 200, { root: await pickFolder(cfg.root) }), true;

  if (route === "POST /api/config") {
    const { root } = await body(req);
    if (typeof root !== "string" || !root.trim()) throw new Error("root missing");
    const dir = expand(root);
    await fs.mkdir(dir, { recursive: true });
    await writeAtomic(CONFIG, JSON.stringify({ root: dir }, null, 2) + "\n");
    config = { root: dir };
    return send(res, 200, { root: dir }), true;
  }

  if (!url.pathname.startsWith("/api/fs/")) return send(res, 404, { error: `no route ${route}` }), true;
  const root = path.resolve(cfg.root);
  const full = inRoot(root, url.searchParams.get("path"));

  if (route === "GET /api/fs/list") {
    try {
      const entries = await fs.readdir(full, { withFileTypes: true });
      return send(res, 200, entries
        .filter(e => e.isFile() || e.isDirectory())
        .map(e => ({ name: e.name, kind: e.isDirectory() ? "directory" : "file" }))), true;
    } catch (e) {
      if (missing(e)) return send(res, 200, []), true;
      throw e;
    }
  }

  if (route === "GET /api/fs/walk") {
    // every file below, as root-relative paths; dot-folders (.git, .obsidian) aren't looked into
    const rel = path.relative(root, full).split(path.sep).filter(Boolean).join("/");
    const out: string[] = [];
    const walk = async (dir: string, at: string) => {
      // a folder that can't be read (gone mid-walk, no permission) is skipped, like the per-folder fallback does
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      await Promise.all(entries.filter(e => !e.name.startsWith(".")).map(e => {
        const p = at ? `${at}/${e.name}` : e.name;
        if (e.isDirectory()) return walk(path.join(dir, e.name), p);
        if (e.isFile()) out.push(p);
      }));
    };
    await walk(full, rel);
    // sibling folders are read in parallel, so sort: callers rely on a stable order (first duplicate name wins)
    return send(res, 200, out.sort()), true;
  }

  if (route === "GET /api/fs/stat") {
    try {
      const st = await fs.stat(full);
      return send(res, 200, { mtime: st.isFile() ? st.mtimeMs : null }), true;
    } catch (e) {
      if (missing(e)) return send(res, 200, { mtime: null }), true;
      throw e;
    }
  }

  if (route === "GET /api/fs/file") {
    try {
      const [text, st] = await Promise.all([fs.readFile(full, "utf8"), fs.stat(full)]);
      return send(res, 200, { text, mtime: st.mtimeMs }), true;
    } catch (e) {
      if (missing(e)) return send(res, 200, null), true;
      throw e;
    }
  }

  if (route === "GET /api/fs/raw") {
    try {
      const data = await fs.readFile(full);
      res.statusCode = 200;
      res.setHeader("Content-Type", RAW_TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream");
      res.end(data);
      return true;
    } catch (e) {
      if (missing(e)) return send(res, 404, { error: "not found" }), true;
      throw e;
    }
  }

  if (route === "PUT /api/fs/file") {
    const { text } = await body(req);
    if (typeof text !== "string") throw new Error("text missing");
    await writeAtomic(full, text);
    return send(res, 200, { mtime: (await fs.stat(full)).mtimeMs }), true;
  }

  if (route === "DELETE /api/fs/file") {
    await fs.rm(full, { force: true });
    return send(res, 200, { ok: true }), true;
  }

  if (route === "POST /api/fs/move") {
    const { from, to } = await body(req);
    const src = inRoot(root, from), dst = inRoot(root, to);
    if (src === root || dst === root) throw new Error("can't move the root folder");
    if (dst === src || dst.startsWith(src + path.sep)) throw new Error("can't move a folder into itself");
    // a different case of the same name (Rin.md → rin.md) is the same file on case-insensitive disks
    // (on a case-sensitive disk rin.md and Rin.md can be two files: only the same file may be "overwritten")
    const there = await fs.stat(dst).catch(() => null);
    if (there) {
      const self = await fs.stat(src);
      if (there.ino !== self.ino || there.dev !== self.dev) throw new Error(`${to} already exists`);
    }
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.rename(src, dst);
    return send(res, 200, { ok: true }), true;
  }

  if (route === "DELETE /api/fs/dir") {
    if (full === root) throw new Error("can't delete the root folder");
    await fs.rm(full, { recursive: true, force: true });
    return send(res, 200, { ok: true }), true;
  }

  if (route === "POST /api/fs/dir") {
    await fs.mkdir(full, { recursive: true });
    return send(res, 200, { ok: true }), true;
  }

  send(res, 404, { error: `no route ${route}` });
  return true;
}

export function fileApi(): Plugin {
  const mw = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    handle(req, res)
      .then(done => { if (!done) next(); })
      .catch(e => send(res, 400, { error: String(e?.message ?? e) }));
  };
  return {
    name: "game-tools-file-api",
    configureServer: s => { s.middlewares.use(mw); },
    configurePreviewServer: s => { s.middlewares.use(mw); },
  };
}

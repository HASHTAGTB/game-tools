/** Tiny file API mounted into the Vite dev/preview server: characters are JSON files in a folder you choose. */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, "config.json");
const DEFAULT_DIR = path.join(ROOT, "characters");
const ID = /^[A-Za-z0-9_-]{1,100}$/;

type Config = { dataDir: string };

async function readConfig(): Promise<Config> {
  try {
    const c = JSON.parse(await fs.readFile(CONFIG, "utf8"));
    if (typeof c.dataDir === "string" && c.dataDir) return c;
  } catch { /* no config yet */ }
  return { dataDir: DEFAULT_DIR };
}

const expand = (p: string) => path.resolve(ROOT, p.trim().replace(/^~(?=$|\/)/, os.homedir()));

type Run = { stdout: string; code: number | string | null };
const run = (cmd: string, args: string[]) => new Promise<Run>(resolve =>
  execFile(cmd, args, { windowsHide: true }, (err: any, stdout) => resolve({ stdout: String(stdout ?? ""), code: err ? err.code ?? 1 : 0 })));

const TITLE = "Folder for the character files";

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

async function jsonFiles(dir: string) {
  try {
    return (await fs.readdir(dir)).filter(f => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

async function writeAtomic(file: string, data: string) {
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

  if (route === "POST /api/pick-folder") return send(res, 200, { dataDir: await pickFolder(cfg.dataDir) }), true;

  if (route === "POST /api/config") {
    const { dataDir } = await body(req);
    if (typeof dataDir !== "string" || !dataDir.trim()) throw new Error("dataDir missing");
    const dir = expand(dataDir);
    await fs.mkdir(dir, { recursive: true });
    // moving to an empty folder: bring the current characters along
    let copied = 0;
    if (dir !== cfg.dataDir && !(await jsonFiles(dir)).length) {
      for (const f of await jsonFiles(cfg.dataDir)) {
        await fs.copyFile(path.join(cfg.dataDir, f), path.join(dir, f));
        copied++;
      }
    }
    await writeAtomic(CONFIG, JSON.stringify({ dataDir: dir }, null, 2) + "\n");
    return send(res, 200, { dataDir: dir, copied }), true;
  }

  if (route === "GET /api/characters") {
    const out = [];
    for (const f of await jsonFiles(cfg.dataDir)) {
      try {
        out.push(JSON.parse(await fs.readFile(path.join(cfg.dataDir, f), "utf8")));
      } catch (e) {
        console.warn(`[prompt-builder] skipping ${f}: ${e}`);
      }
    }
    return send(res, 200, out), true;
  }

  const m = url.pathname.match(/^\/api\/characters\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!ID.test(id)) throw new Error(`invalid id ${id}`);
    const file = path.join(cfg.dataDir, `${id}.json`);
    if (req.method === "PUT") {
      const ch = await body(req);
      if (ch?.id !== id) throw new Error("id mismatch");
      await fs.mkdir(cfg.dataDir, { recursive: true });
      await writeAtomic(file, JSON.stringify(ch, null, 2) + "\n");
      return send(res, 200, { ok: true }), true;
    }
    if (req.method === "DELETE") {
      await fs.rm(file, { force: true });
      return send(res, 200, { ok: true }), true;
    }
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
    name: "prompt-builder-file-api",
    configureServer: s => { s.middlewares.use(mw); },
    configurePreviewServer: s => { s.middlewares.use(mw); },
  };
}

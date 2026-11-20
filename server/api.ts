/** Tiny file API mounted into the Vite dev/preview server: characters are JSON files in a folder you choose. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
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

/** Danbooru's CDN (Cloudflare) refuses cross-site image loads from a browser page, so thumbnails
 *  and full images go through here. Only cdn.donmai.us; Range is passed on so videos can seek. */
const IMG_HOST = "cdn.donmai.us";
// a browser-looking User-Agent from a non-browser client gets 403, an honest tool name passes
const UA = "prompt-builder/0.1";
const PASS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

async function proxyImage(req: IncomingMessage, res: ServerResponse, raw: string | null) {
  let target: URL;
  try { target = new URL(raw ?? ""); } catch { return send(res, 400, { error: "bad url" }); }
  if (target.protocol !== "https:" || target.hostname !== IMG_HOST) return send(res, 400, { error: "host not allowed" });
  const headers: Record<string, string> = { "User-Agent": UA, Accept: "image/*,video/*,*/*" };
  if (typeof req.headers.range === "string") headers.Range = req.headers.range;
  const up = await fetch(target, { headers });
  res.statusCode = up.status;
  for (const h of PASS) { const v = up.headers.get(h); if (v) res.setHeader(h, v); }
  if (up.ok) res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  if (!up.body) return res.end();
  Readable.fromWeb(up.body as any).on("error", () => res.destroy()).pipe(res);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://x");
  if (!url.pathname.startsWith("/api/")) return false;
  if (req.method === "GET" && url.pathname === "/api/img") return await proxyImage(req, res, url.searchParams.get("u")), true;
  const cfg = await readConfig();
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /api/config") return send(res, 200, cfg), true;

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

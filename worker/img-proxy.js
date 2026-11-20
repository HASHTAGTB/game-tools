/** Optional Cloudflare Worker for the GitHub Pages build, only needed if Danbooru images don't load there.
 *  Same job as /api/img in server/api.ts: fetch from cdn.donmai.us with an honest User-Agent.
 *  Deploy it (dash.cloudflare.com → Workers → Create → paste this), then set the repo variable
 *  IMG_PROXY to its URL, e.g. https://img-proxy.<you>.workers.dev, and re-run the Pages workflow. */
const PASS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

export default {
  async fetch(req) {
    let target;
    try { target = new URL(new URL(req.url).searchParams.get("u") ?? ""); } catch { return new Response("bad url", { status: 400 }); }
    if (target.protocol !== "https:" || target.hostname !== "cdn.donmai.us") return new Response("host not allowed", { status: 400 });
    const headers = { "User-Agent": "prompt-builder/0.1", Accept: "image/*,video/*,*/*" };
    const range = req.headers.get("range");
    if (range) headers.Range = range;
    const up = await fetch(target, { headers });
    const out = new Headers({ "Access-Control-Allow-Origin": "*" });
    for (const h of PASS) { const v = up.headers.get(h); if (v) out.set(h, v); }
    if (up.ok) out.set("Cache-Control", "public, max-age=86400, immutable");
    return new Response(up.body, { status: up.status, headers: out });
  },
};

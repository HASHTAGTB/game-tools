import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Search, X } from "lucide-react";
import { PAGE_SIZE, RATINGS, searchPosts, type Post, type Rating, type Sort } from "../lib/danbooru";
import { danbooruUrl, googleUrl } from "../lib/tag";
import { cn } from "../lib/utils";

const PREFS = "prompt-builder.image-panel";
type Prefs = { ratings: Rating[]; sort: Sort };

function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? "");
    if (Array.isArray(p.ratings) && p.ratings.length && (p.sort === "new" || p.sort === "score")) return p;
  } catch { /* first run or storage blocked */ }
  return { ratings: ["g", "s"], sort: "new" };
}

const chipCls = (on: boolean) => cn(
  "rounded-lg border px-2 py-0.5 font-talk text-[13.5px] font-semibold leading-5 transition-colors",
  on ? "border-caramel bg-caramel text-ink" : "border-ink-line text-bone hover:border-taupe hover:bg-ink-3 hover:text-paper",
);
const linkCls = "inline-flex h-7 items-center gap-1.5 rounded px-1.5 font-sans text-[15px] text-bone underline-offset-4 decoration-2 hover:text-paper hover:underline";

type Props = { tag: string; onTag: (name: string) => void; onClose: () => void };

/** Right-side gallery of Danbooru posts for one tag, laid over the tag browser. */
export function ImagePanel({ tag, onTag, onClose }: Props) {
  const [prefs, setPrefs] = useState(readPrefs);
  const [input, setInput] = useState(tag);
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fellBack, setFellBack] = useState(false);
  const [view, setView] = useState<number | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => setInput(tag), [tag]);
  useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* ignore */ } }, [prefs]);

  const ratingsKey = prefs.ratings.join(",");
  const load = useCallback(async (p: number) => {
    ctrl.current?.abort();
    const c = (ctrl.current = new AbortController());
    setLoading(true);
    setError(null);
    try {
      const r = await searchPosts(tag, ratingsKey.split(",") as Rating[], prefs.sort, p, c.signal);
      if (c.signal.aborted) return;
      setPosts(old => (p === 1 ? r.posts : [...old, ...r.posts.filter(n => !old.some(o => o.id === n.id))]));
      setPage(p);
      setMore(r.more);
      setFellBack(r.fellBack);
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [tag, ratingsKey, prefs.sort]);

  // new query: start over at the top
  useEffect(() => {
    setPosts([]);
    setView(null);
    scroller.current?.scrollTo({ top: 0 });
    load(1);
    return () => ctrl.current?.abort();
  }, [load]);

  // endless scroll: fetch the next page when the bottom comes into view
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || loading) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) load(page + 1); }, { root: scroller.current, rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, loading, page, load]);

  // Esc closes the viewer first, then the panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement)?.closest?.("input, textarea")) return;
      if (view === null) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, onClose]);

  const toggleRating = (r: Rating) => setPrefs(p => {
    const on = p.ratings.includes(r);
    if (on && p.ratings.length === 1) return p;    // keep at least one
    const ratings = RATINGS.map(x => x.id).filter(x => (x === r ? !on : p.ratings.includes(x)));
    return { ...p, ratings };
  });

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-[max(100%,min(42vw,640px))] flex-col border-l border-ink-line bg-ink shadow-[-16px_0_40px_rgba(0,0,0,.35)] animate-pop-in">
      <div className="space-y-3 border-b border-ink-line/60 px-5 pb-4 pt-6">
        <div className="flex items-center gap-2">
          <form className="flex min-w-0 flex-1 items-center gap-2 border-b-2 border-ink-line focus-within:border-caramel"
            onSubmit={e => { e.preventDefault(); const v = input.trim(); if (v) onTag(v); }}>
            <Search className="h-4 w-4 shrink-0 text-taupe" />
            <input value={input} onChange={e => setInput(e.target.value)} aria-label="Danbooru tag"
              className="h-10 min-w-0 flex-1 bg-transparent font-sans text-[22px] text-paper focus:outline-none" />
          </form>
          <button onClick={onClose} aria-label="Close images" title="Close (Esc)" className="grid h-8 w-8 place-items-center rounded text-taupe hover:text-paper">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {RATINGS.map(r => (
            <button key={r.id} onClick={() => toggleRating(r.id)} aria-pressed={prefs.ratings.includes(r.id)} className={chipCls(prefs.ratings.includes(r.id))}>{r.label}</button>
          ))}
          <span className="mx-1.5 h-4 w-px bg-ink-line" />
          {(["new", "score"] as Sort[]).map(s => (
            <button key={s} onClick={() => setPrefs(p => ({ ...p, sort: s }))} aria-pressed={prefs.sort === s} className={chipCls(prefs.sort === s)}>
              {s === "new" ? "Newest" : "Top score"}
            </button>
          ))}
        </div>
        <div className="-ml-1.5 flex flex-wrap gap-x-3">
          <a href={googleUrl(tag)} target="_blank" rel="noopener noreferrer" className={linkCls}>Search on Google Images<ExternalLink className="h-3.5 w-3.5" /></a>
          <a href={danbooruUrl(tag)} target="_blank" rel="noopener noreferrer" className={cn(linkCls, "text-taupe")}>Open on Danbooru<ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {fellBack && <p className="mb-3 font-talk text-sm text-butter">This tag is too big to sort by score, so these are the newest posts.</p>}
        {error && <p role="alert" className="mb-3 border-l-4 border-coral bg-coral/15 px-3 py-2 font-talk text-sm text-paper">{error}</p>}
        {!loading && !error && posts.length === 0 && (
          <p className="font-talk text-[15px] text-taupe">No posts for “{tag}” with these ratings. Check the spelling, or try Google.</p>
        )}
        <div className="columns-2 gap-2 2xl:columns-3">
          {posts.map((p, i) => (
            <button key={p.id} onClick={() => setView(i)} title={`Post #${p.id}`}
              className="group relative mb-2 block w-full overflow-hidden rounded-lg bg-ink-2 ring-caramel hover:ring-2 focus-visible:ring-2"
              style={{ aspectRatio: `${p.width} / ${p.height}` }}>
              <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover"
                onError={e => { const img = e.currentTarget; if (!img.dataset.fallback) { img.dataset.fallback = "1"; img.src = p.small; } }} />
              {p.video && <span className="absolute right-1.5 top-1.5 rounded bg-ink/80 px-1.5 font-talk text-[11px] font-bold text-paper">video</span>}
            </button>
          ))}
        </div>
        <div ref={sentinel} />
        {loading && <p className="py-3 font-talk text-sm text-taupe">Loading{posts.length ? " more" : ""}…</p>}
        {!loading && !more && posts.length >= PAGE_SIZE && <p className="py-3 font-talk text-sm text-taupe">That's all of them.</p>}
      </div>

      {view !== null && posts[view] && (
        <Viewer posts={posts} index={view} onIndex={setView} onClose={() => setView(null)}
          onNearEnd={() => { if (more && !loading) load(page + 1); }} />
      )}
    </aside>
  );
}

function Viewer({ posts, index, onIndex, onClose, onNearEnd }: {
  posts: Post[]; index: number; onIndex: (i: number) => void; onClose: () => void; onNearEnd: () => void;
}) {
  const p = posts[index];
  const go = useCallback((d: number) => {
    const i = index + d;
    if (i >= 0 && i < posts.length) onIndex(i);
  }, [index, posts.length, onIndex]);

  useEffect(() => { if (index >= posts.length - 3) onNearEnd(); }, [index, posts.length, onNearEnd]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, onClose]);

  const arrow = "absolute top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full text-bone hover:bg-ink-3 hover:text-paper disabled:opacity-20";
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/85 animate-pop-in" onClick={onClose} role="dialog" aria-label={`Post #${p.id}`}>
      <div className="flex items-center justify-between px-5 py-3 font-talk text-[15px] text-bone" onClick={e => e.stopPropagation()}>
        <span>{index + 1} / {posts.length}</span>
        <div className="flex items-center gap-4">
          <a href={`https://danbooru.donmai.us/posts/${p.id}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-caramel underline-offset-4 hover:underline">
            Post #{p.id}<ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button onClick={onClose} aria-label="Close viewer" className="text-taupe hover:text-paper"><X className="h-6 w-6" /></button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-20 pb-6">
        {p.video
          ? <video key={p.id} src={p.large} poster={p.thumb} controls autoPlay loop muted className="max-h-full max-w-full rounded-lg" onClick={e => e.stopPropagation()} />
          : <img key={p.id} src={p.large} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full rounded-lg object-contain" onClick={e => e.stopPropagation()} />}
        <button className={cn(arrow, "left-4")} disabled={index === 0} aria-label="Previous" onClick={e => { e.stopPropagation(); go(-1); }}>
          <ChevronLeft className="h-8 w-8" />
        </button>
        <button className={cn(arrow, "right-4")} disabled={index === posts.length - 1} aria-label="Next" onClick={e => { e.stopPropagation(); go(1); }}>
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>
    </div>
  );
}

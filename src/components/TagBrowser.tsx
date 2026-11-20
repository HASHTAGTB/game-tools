import { useDeferredValue, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { tagKey } from "../lib/prompt";
import { RARE, searchTags, toPromptText, type TagDb } from "../lib/tags";
import { cn, fmtCount } from "../lib/utils";
import { DRAG_MIME, useDnd } from "../lib/dnd";
import { Rule } from "./ui/heading";

type Props = { db: TagDb | null; target: string; selected: Set<string>; onToggle: (promptText: string) => void };

/** Right column: search all Danbooru tags + browse tag groups. Clicking adds/removes from the active list. */
export function TagBrowser({ db, target, selected, onToggle }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const dq = useDeferredValue(q);
  const df = useDeferredValue(filter.trim().toLowerCase().replace(/\s+/g, "_"));
  const results = useMemo(() => (db ? searchTags(db, dq, 40) : []), [db, dq]);
  const dnd = useDnd();

  const chip = (t: string, n: number, extra?: string) => {
    const text = toPromptText(t);
    const on = selected.has(tagKey(text));
    return (
      <button
        key={t}
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData(DRAG_MIME, text); dnd.start({ tag: text, from: null, index: -1 }); }}
        onClick={() => onToggle(text)}
        title={`${t} — ${n.toLocaleString()} posts${extra ?? ""}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 font-talk text-[13.5px] font-semibold leading-5 transition-colors",
          on ? "border-caramel bg-caramel text-ink"
            : n < RARE ? "border-butter/40 text-butter/90 hover:bg-ink-3"
            : "border-ink-line text-bone hover:border-taupe hover:bg-ink-3 hover:text-paper",
        )}
      >
        {text}<small className={cn("text-[11px] font-normal", on ? "text-ink/70" : "text-taupe")}>{fmtCount(n)}</small>
      </button>
    );
  };

  return (
    <aside className="flex min-h-0 flex-1 flex-col border-l border-ink-line/60">
      <div className="space-y-3 border-b border-ink-line/60 px-5 pb-4 pt-6">
        <p className="font-talk text-sm text-taupe">Clicked tags go to <span className="font-bold text-paper underline decoration-caramel decoration-2 underline-offset-4">{target}</span>. Click another tag list to change this.</p>
        <label className="flex items-center gap-2 border-b-2 border-ink-line focus-within:border-caramel">
          <Search className="h-4 w-4 text-taupe" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search all Danbooru tags"
            className="h-9 flex-1 bg-transparent font-talk text-[15px] text-paper placeholder:text-taupe focus:outline-none" />
        </label>
        {results.length > 0 && <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">{results.map(r => chip(r.t, r.n, r.alias ? " (alias match)" : ""))}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter tag groups"
          className="mb-3 h-9 w-full border-b-2 border-ink-line bg-transparent font-talk text-[15px] text-paper placeholder:text-taupe focus:border-caramel focus:outline-none" />
        {!db && <p className="font-talk text-sm text-taupe">Loading tags…</p>}
        {db?.groups.sections.map((s, si, all) => {
          const subs = s.subsections
            .map(sub => ({ ...sub, tags: df ? sub.tags.filter(t => t.t.includes(df)) : sub.tags }))
            .filter(sub => sub.tags.length);
          if (!subs.length) return null;
          const n = subs.reduce((a, x) => a + x.tags.length, 0);
          const heading = si === 0 || all[si - 1].group !== s.group;
          return (
            <div key={s.id + (df ? "-f" : "")}>
            {heading && <h3 className="mb-2 mt-6 font-sans text-xl text-paper">{s.group}<Rule /></h3>}
            <details open={!!df} className="group mb-1 rounded-lg">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded py-1 font-talk text-[15px] text-bone hover:text-paper group-open:text-paper">
                <ChevronRight className="h-4 w-4 text-taupe transition-transform group-open:rotate-90" />
                {s.label}<small className="ml-auto text-xs text-taupe">{n}</small>
              </summary>
              <Lazy>
                {subs.map(sub => (
                  <div key={sub.title} className="mb-3 ml-5">
                    <h4 className="mb-1.5 mt-2 font-talk text-[13px] font-bold text-taupe">{sub.title}</h4>
                    <div className="flex flex-wrap gap-1">{sub.tags.map(t => chip(t.t, t.n))}</div>
                  </div>
                ))}
              </Lazy>
            </details>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/** Renders children only once the parent <details> has been opened (keeps thousands of chips out of the DOM). */
function Lazy({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <div ref={el => {
      const d = el?.parentElement as HTMLDetailsElement | null;
      if (!d || shown) return;
      if (d.open) setShown(true);
      else d.addEventListener("toggle", () => d.open && setShown(true), { once: true });
    }}>
      {shown && children}
    </div>
  );
}

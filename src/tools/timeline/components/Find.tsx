import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { MenuMarker, MenuRule } from "@/shared/ui/menu";
import { Popover } from "@/shared/ui/popover";
import { SearchField } from "@/shared/ui/search-field";
import { visible } from "../lib/colors";
import { allEvents, castOf } from "../lib/model";
import { reveal } from "../lib/nav";
import { useTimeline } from "../state";

const MAX = 60;
/** Lower case, no accents: "auflosung" finds "Auflösung". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
/** Where in `s` the character at `i` of `fold(s)` came from. Folding drops characters (accents, but also ^ or `), so
 *  positions in the folded text don't line up with the original. */
function originalIndex(s: string, i: number) {
  let folded = 0;
  for (let j = 0; j < s.length; ) {
    const ch = String.fromCodePoint(s.codePointAt(j)!);
    folded += fold(ch).length;
    if (folded > i) return j;
    j += ch.length;
  }
  return s.length;
}

/** Toolbar button (and Ctrl+K) that finds events by title, note or character name and jumps to them. */
export function FindButton() {
  const doc = useTimeline(s => s.doc);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // reopening keeps the last search, ready to be typed over
  useEffect(() => { if (open) setTimeout(() => input.current?.select(), 0); }, [open]);

  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const names = new Map(castOf(doc.roster, doc.chapters).map(c => [c.id, c]));
    const hits = [];
    const story = allEvents(doc.chapters).map((x, i) => ({ ...x, i })).sort((a, b) =>
      doc.chapters.indexOf(a.chapter) - doc.chapters.indexOf(b.chapter) || a.event.col - b.event.col || a.i - b.i);
    for (const { chapter, event } of story) {
      const title = fold(event.title), note = fold(event.note ?? ""), who = fold(event.chars.map(c => names.get(c)?.name ?? c).join(" "));
      if (!words.every(w => title.includes(w) || note.includes(w) || who.includes(w))) continue;
      const inTitle = words.every(w => title.includes(w) || who.includes(w));
      // a bit of the note around the first word found there
      let snippet: string | undefined;
      const at = words.map(w => note.indexOf(w)).filter(i => i >= 0).sort((a, b) => a - b)[0];
      if (!inTitle && at !== undefined && event.note) {
        const from = Math.max(0, originalIndex(event.note, at) - 30);
        snippet = (from ? "…" : "") + event.note.slice(from, from + 90).replace(/\s+/g, " ") + (from + 90 < event.note.length ? "…" : "");
      }
      hits.push({ chapter, event, inTitle, snippet, color: names.get(event.chars[0])?.color });
    }
    // title hits first, each group in story order
    return [...hits.filter(h => h.inTitle), ...hits.filter(h => !h.inTitle)].slice(0, MAX);
  }, [query, doc]);

  useEffect(() => setActive(0), [query]);
  // the list can also shrink under the highlight (the doc reloaded or was edited)
  useEffect(() => setActive(a => Math.max(0, Math.min(a, results.length - 1))), [results]);
  useEffect(() => { list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const go = (i: number) => {
    const r = results[i];
    if (!r) return;
    setOpen(false);
    reveal(r.event.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} side="bottom" align="end" className="w-[30rem] p-0" trigger={
      <Button size="sm" variant="quiet" className="mr-1">
        <Search className="h-4 w-4" />Find<kbd className="ml-1 font-talk text-xs text-taupe/80">Ctrl K</kbd>
      </Button>
    }>
      <div className="px-4 pt-2">
        <SearchField ref={input} autoFocus value={query} onValueChange={setQuery} placeholder="Titles, notes, characters…" aria-label="Find an event"
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
            if (e.key === "Enter") { e.preventDefault(); go(active); }
          }} />
      </div>
      <MenuRule ref={list} className="mx-4 my-2.5 max-h-[55vh] overflow-y-auto">
        {results.map((r, i) => (
          <li key={r.event.id} className="relative">
            {i === active && <MenuMarker layoutId="find-marker" color={r.color ? visible(r.color) : undefined} />}
            <button data-i={i} onClick={() => go(i)} onPointerMove={() => setActive(i)}
              className={cn("block w-full py-1 pl-3 pr-1 text-left transition-colors", i === active ? "text-paper" : "text-bone/80")}>
              <span className="block truncate font-talk text-base">{r.event.title || <i className="text-taupe">untitled</i>}</span>
              <span className="block truncate font-talk text-xs text-taupe">
                {r.chapter.name}{r.chapter.columns[r.event.col] && <> · {r.chapter.columns[r.event.col]}</>}
              </span>
              {r.snippet && <span className="mt-0.5 block line-clamp-2 font-talk text-xs text-bone">{r.snippet}</span>}
            </button>
          </li>
        ))}
        {query.trim() && !results.length && <li className="py-1 pl-3 font-talk text-sm text-taupe">Nothing found.</li>}
        {!query.trim() && <li className="py-1 pl-3 font-talk text-sm text-taupe">↑ ↓ to pick, Enter to jump there.</li>}
      </MenuRule>
    </Popover>
  );
}

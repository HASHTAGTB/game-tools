import { ChevronLeft, ChevronRight, FileText, Folder, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { MenuMarker, MenuRule } from "@/shared/ui/menu";
import { Popover, popoverCls } from "@/shared/ui/popover";
import { useVault } from "./context";
import { fuzzy, shownPath, type Hit } from "./fuzzy";
import { baseName, parentOf, type Node } from "./store";

/** The top of the page: the open file's path, like an address bar. Each folder opens a menu of what's in it;
 *  clicking the name (or the empty space) turns the bar into a fuzzy search over every file of the tool.
 *  `rootLabel` names the tool's root folder (default: the vault's name); `title` is shown for the open file instead of
 *  its file name. */
export function PathBar({ rootLabel, title, children }: { rootLabel?: string; title?: string; children?: ReactNode }) {
  const [searching, setSearching] = useState(false);
  return (
    <div className="relative z-30 flex h-12 shrink-0 items-center gap-3 border-b border-ink-line/60 px-6">
      {searching ? <QuickSwitch onClose={() => setSearching(false)} /> : <Crumbs rootLabel={rootLabel} title={title} onSearch={() => setSearching(true)} />}
      {!searching && children}
    </div>
  );
}

// ---------------------------------------------------------------- the path

function Crumbs({ rootLabel, title, onSearch }: { rootLabel?: string; title?: string; onSearch: () => void }) {
  const useStore = useVault();
  const { root, noun } = useStore.config;
  const loc = useStore(s => s.loc);
  const ready = useStore(s => s.ready);
  const path = useStore(s => s.path);
  const inner = path ? (root ? path.slice(root.length + 1) : path) : "";
  const parts = inner ? inner.split("/").slice(0, -1) : [];
  const dirs = parts.map((_, i) => [root, ...parts.slice(0, i + 1)].filter(Boolean).join("/"));

  return (
    <div className="flex h-full min-w-0 flex-1 items-center">
      <div className="flex min-w-0 shrink items-center overflow-hidden">
        <FolderMenu dir={root} label={rootLabel ?? loc?.name ?? "Vault"} disabled={!ready} />
        {dirs.map((d, i) => (
          <span key={d} className="flex min-w-0 items-center">
            <span aria-hidden className="px-1 font-talk text-sm text-taupe/60">/</span>
            <FolderMenu dir={d} label={parts[i]} disabled={!ready} />
          </span>
        ))}
        {path && <span aria-hidden className="px-1 font-talk text-sm text-taupe/60">/</span>}
      </div>
      <button onClick={onSearch} disabled={!ready} title={`Search ${noun}s`}
        className="group/search flex h-full min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default">
        {path
          ? <span className="truncate font-sans text-lg text-paper">{title || baseName(path)}</span>
          : <span className="truncate pl-1 font-talk text-base text-taupe">Search {noun}s…</span>}
        <Search className={cn("ml-auto h-4 w-4 shrink-0 text-taupe transition-opacity", path && "opacity-0 group-hover/search:opacity-100 group-focus-visible/search:opacity-100")} />
      </button>
    </div>
  );
}

/** A folder in the path. Its menu lists what's inside; folders in it open in place, notes open in the editor. */
function FolderMenu({ dir, label, disabled }: { dir: string; label: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(dir);
  const [items, setItems] = useState<Node[] | null>(null);
  const useStore = useVault();
  const current = useStore(s => s.path);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setItems(useStore.getState().tree[at] ?? null);
    useStore.getState().listFolder(at).then(n => live && setItems(n), () => live && setItems([]));
    return () => { live = false; };
  }, [open, at]);

  const change = (v: boolean) => { setOpen(v); if (v) setAt(dir); };
  const name = (p: string) => p.split("/").pop() || label;

  return (
    <Popover open={open} onOpenChange={change} align="start" className="w-72 p-1.5"
      trigger={
        <button disabled={disabled} title={dir || "The vault"}
          className={cn("min-w-0 shrink truncate rounded-md px-1 font-talk text-sm text-taupe transition-colors hover:text-paper disabled:pointer-events-none",
            open && "text-paper")}>
          {label}
        </button>
      }>
      {at !== dir && (
        <button onClick={() => setAt(parentOf(at))}
          className="mb-1 flex h-8 w-full items-center gap-1.5 rounded-md border-b border-ink-line/60 px-2 text-left text-sm text-taupe hover:text-paper">
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
          <span className="truncate">{name(at)}</span>
        </button>
      )}
      <ul className="max-h-[60vh] overflow-y-auto">
        {items === null && <li className="px-2 py-1.5 text-sm text-taupe">…</li>}
        {items?.length === 0 && <li className="px-2 py-1.5 text-sm italic text-taupe">empty</li>}
        {items?.map(n => (
          <li key={n.path}>
            <button
              onClick={() => {
                if (n.kind === "directory") return setAt(n.path);
                setOpen(false);
                useStore.getState().open(n.path);
              }}
              className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-paper/8",
                n.path === current ? "text-paper" : n.kind === "directory" ? "text-bone" : "text-bone/75 hover:text-paper")}>
              {n.kind === "directory"
                ? <Folder className="h-3.5 w-3.5 shrink-0 text-taupe" />
                : <FileText className={cn("h-3.5 w-3.5 shrink-0", n.path === current ? "text-caramel" : "text-taupe")} />}
              <span className={cn("truncate", n.kind === "directory" ? "font-sans text-base" : "text-base")}>
                {n.kind === "directory" ? n.name : baseName(n.path)}
              </span>
              {n.kind === "directory" && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-taupe" strokeWidth={2.5} />}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

// ---------------------------------------------------------------- the search

function QuickSwitch({ onClose }: { onClose: () => void }) {
  const useStore = useVault();
  const { root, noun } = useStore.config;
  const index = useStore(s => s.index);
  const recent = useStore(s => s.recent);
  const current = useStore(s => s.path);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { useStore.getState().loadIndex(); }, [useStore]);

  const hits: Hit[] = useMemo(() => {
    if (q.trim()) return fuzzy(index ?? [], q);
    const known = index && new Set(index);
    return recent.filter(p => p !== current && (!known || known.has(p))).map(path => ({ path, score: 0, marks: [] }));
  }, [q, index, recent, current]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const pick = (h: Hit | undefined) => {
    if (!h) return;
    onClose();
    useStore.getState().open(h.path);
  };

  const empty = q.trim()
    ? index === null ? "Listing the vault…" : `No ${noun}s match.`
    : `No recent ${noun}s. Type to search.`;

  return (
    <>
      <Search className="h-4 w-4 shrink-0 text-caramel" />
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} onBlur={onClose}
        placeholder={`Find a ${noun}…`} aria-label={`Find a ${noun}`} role="combobox" aria-expanded aria-controls="note-hits"
        aria-activedescendant={hits[sel] ? `note-hit-${sel}` : undefined}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel(i => Math.min(i + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel(i => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(hits[sel]); }
          else if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
        className="h-full min-w-0 flex-1 bg-transparent font-talk text-base text-paper placeholder:text-taupe focus:outline-hidden" />
      <kbd className="font-talk text-xs text-taupe">esc</kbd>

      <div className={cn(popoverCls, "absolute inset-x-4 top-full mt-1.5 origin-top animate-bloom px-4 py-2.5")}>
          {!q.trim() && hits.length > 0 && <p className="pb-1.5 text-xs text-taupe">Recent</p>}
          <MenuRule ref={listRef} id="note-hits" role="listbox" className="max-h-[60vh] overflow-y-auto">
            {hits.length === 0 && <li className="py-1 pl-3 text-base text-taupe">{empty}</li>}
            {hits.map((h, i) => (
              <li key={h.path} id={`note-hit-${i}`} data-i={i} role="option" aria-selected={i === sel}
                // mousedown, not click: picking happens before the input's blur closes the list
                onMouseDown={e => { e.preventDefault(); pick(h); }}
                onMouseMove={() => setSel(i)}
                className="relative flex cursor-pointer items-baseline gap-3 py-1 pl-3">
                {i === sel && <MenuMarker layoutId="note-hit-marker" />}
                <HitText hit={h} root={root} />
              </li>
            ))}
          </MenuRule>
      </div>
    </>
  );
}

/** The note's name, then its folder, with the matched letters lit. */
function HitText({ hit, root }: { hit: Hit; root: string }) {
  const s = shownPath(hit.path);
  const nameAt = s.lastIndexOf("/") + 1;
  const marks = new Set(hit.marks);
  // the folder part is shown from inside the tool's root
  const from = root && s.startsWith(root + "/") ? Math.min(root.length + 1, nameAt) : 0;
  const lit = (from: number, to: number) => {
    const out: ReactNode[] = [];
    let run = "", on = false;
    const push = (k: number) => { if (run) out.push(on ? <mark key={k} className="bg-transparent text-caramel">{run}</mark> : run); run = ""; };
    for (let i = from; i < to; i++) {
      if (marks.has(i) !== on) { push(i); on = !on; }
      run += s[i];
    }
    push(to);
    return out;
  };
  return (
    <>
      <span className="shrink-0 truncate font-sans text-base text-paper">{lit(nameAt, s.length)}</span>
      {nameAt - 1 > from && <span className="min-w-0 truncate font-talk text-xs text-taupe">{lit(from, nameAt - 1)}</span>}
    </>
  );
}

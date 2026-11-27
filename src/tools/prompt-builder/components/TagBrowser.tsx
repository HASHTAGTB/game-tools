import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronRight } from "lucide-react";
import { tagKey } from "../lib/prompt";
import { RARE, searchTags, toPromptText, type TagDb } from "../lib/tags";
import { cn, fmtCount } from "@/shared/lib/utils";
import { DRAG_MIME, useDnd } from "../lib/dnd";
import { CollapsiblePanel } from "@/shared/ui/collapsible";
import { Chip } from "@/shared/ui/chip";
import { Rule } from "@/shared/ui/heading";
import { SearchField } from "@/shared/ui/search-field";
import { AnimatePresence, m, spring } from "@/shared/ui/motion";

type Props = {
  db: TagDb | null;
  /** Name of the tag list clicks go to, and its section color. */
  target: string;
  targetColor: string;
  selected: Set<string>;
  onToggle: (promptText: string) => void;
};

/** Right column. One search field: it searches every Danbooru tag and filters the tag groups below.
    Clicking a tag adds it to (or removes it from) the target list. */
export function TagBrowser({ db, target, targetColor, selected, onToggle }: Props) {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const filter = dq.trim().toLowerCase().replace(/\s+/g, "_");
  const results = useMemo(() => (db && filter ? searchTags(db, dq, 40) : []), [db, dq, filter]);
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
        aria-pressed={on}
        title={`${t}: ${n.toLocaleString()} posts${extra ?? ""}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 font-talk text-sm font-semibold leading-5 transition-[color,background-color,border-color,scale] active:scale-95",
          on ? "border-(--target) bg-(--target) text-ink"
            : n < RARE ? "border-butter/40 text-butter/90 hover:bg-ink-3"
            : "border-ink-line text-bone hover:border-taupe hover:bg-ink-3 hover:text-paper",
        )}
      >
        {text}<small className={cn("text-xs font-normal", on ? "text-ink/70" : "text-taupe")}>{fmtCount(n)}</small>
      </button>
    );
  };

  const sections = (db?.groups.sections ?? [])
    .map(s => {
      const subs = s.subsections
        .map(sub => ({ ...sub, tags: filter ? sub.tags.filter(t => t.t.includes(filter)) : sub.tags }))
        .filter(sub => sub.tags.length);
      return { ...s, subs, n: subs.reduce((a, x) => a + x.tags.length, 0) };
    })
    .filter(s => s.subs.length);

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ "--target": targetColor } as React.CSSProperties}>
      <div className="space-y-3 px-5 pb-3 pt-6">
        <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 font-talk text-sm text-taupe">
          Adding to
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={target}
              initial={{ opacity: 0, y: -6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.9 }}
              transition={spring.bouncy}
              className="inline-flex max-w-full"
            >
              <Chip color="var(--target)" dot>{target}</Chip>
            </m.span>
          </AnimatePresence>
        </div>
        <SearchField value={q} onValueChange={setQ} placeholder="Search tags" aria-label="Search Danbooru tags" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {!db && <p className="py-4 font-talk text-sm text-taupe">Loading tags…</p>}

        {filter && results.length > 0 && (
          <Group title="All tags">
            <div className="flex flex-wrap gap-1">{results.map(r => chip(r.t, r.n, r.alias ? " (alias match)" : ""))}</div>
          </Group>
        )}
        {db && filter && !results.length && !sections.length && (
          <p className="py-4 font-talk text-sm text-taupe">No tags match “{q.trim()}”. Press Enter in a tag list to add it anyway.</p>
        )}

        {sections.map((s, si) => (
          <div key={s.id}>
            {(si === 0 || sections[si - 1].group !== s.group) && (
              <h3 className="mb-1 mt-6 font-sans text-lg text-paper">{s.group}<Rule /></h3>
            )}
            {/* Filtering opens every matching group; the key remounts it so clearing the search closes them again. */}
            <TagGroup key={filter ? "f" : "all"} label={s.label} count={s.n} defaultOpen={!!filter}>
              {s.subs.map(sub => (
                <div key={sub.title} className="mb-3">
                  <h4 className="mb-1.5 mt-2 font-talk text-sm font-bold text-taupe">{sub.title}</h4>
                  <div className="flex flex-wrap gap-1">{sub.tags.map(t => chip(t.t, t.n))}</div>
                </div>
              ))}
            </TagGroup>
          </div>
        ))}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="mb-2 font-sans text-lg text-paper">{title}<Rule /></h3>
      {children}
    </div>
  );
}

/** A collapsible tag group. Its chips render only after the first open (there can be thousands). */
function TagGroup({ label, count, defaultOpen, children }: { label: string; count: number; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const [seen, setSeen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={v => { setOpen(v); if (v) setSeen(true); }}>
      <Collapsible.Trigger className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-1 rounded-md px-1.5 py-1 font-talk text-base text-bone transition-colors hover:bg-ink-2 hover:text-paper data-panel-open:text-paper">
        <m.span animate={{ rotate: open ? 90 : 0 }} transition={spring.snappy} className="grid place-items-center text-taupe">
          <ChevronRight className="h-4 w-4" />
        </m.span>
        {label}<small className="ml-auto text-xs tabular-nums text-taupe">{count}</small>
      </Collapsible.Trigger>
      <CollapsiblePanel className="pl-5">{seen && children}</CollapsiblePanel>
    </Collapsible.Root>
  );
}

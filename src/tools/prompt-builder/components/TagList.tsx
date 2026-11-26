import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { X, TriangleAlert } from "lucide-react";
import { splitTags, tagKey } from "../lib/prompt";
import { parseTag, setWeight, toggleOff } from "../lib/tag";
import { RARE, searchTags, toPromptText, type TagDb } from "../lib/tags";
import { DRAG_MIME, useDnd } from "../lib/dnd";
import type { ListKey } from "../lib/types";
import { cn, fmtCount } from "@/shared/lib/utils";
import { MenuMarker, MenuRule } from "@/shared/ui/menu";
import { AnimatePresence, fade, m, pop, spring } from "@/shared/ui/motion";
import { surfaceCls } from "@/shared/ui/popover";
import { DEFAULT_COLOR } from "@/shared/lib/colors";

type Props = {
  listKey: ListKey;
  tags: string[];
  onChange: (tags: string[]) => void;
  db: TagDb | null;
  active?: boolean;
  onActivate?: () => void;
  placeholder?: string;
  /** The section's color: the border while this is the list the tag browser adds to. */
  accent?: string;
};

/** Chip editor.
 *  type + Enter/comma to add (Danbooru autocomplete) · paste comma lists · drag chips within/between lists
 *  (hold Ctrl to copy instead of move) · click = turn off/on · Ctrl+scroll = weight · double-click = edit text
 *  · Backspace in the empty input removes the last chip. */
export function TagList({ listKey, tags, onChange, db, active, onActivate, placeholder = "Add tags…", accent = DEFAULT_COLOR }: Props) {
  const [text, setText] = useState("");
  const [hi, setHi] = useState(0);
  const [focused, setFocused] = useState(false);
  const [over, setOver] = useState<number | null>(null); // drop marker position
  const editAt = useRef<number | null>(null); // original position of the chip being edited
  const input = useRef<HTMLInputElement>(null);
  const dnd = useDnd();

  const suggestions = useMemo(() => (db && focused && !text.includes(",") ? searchTags(db, text, 8) : []), [db, text, focused]);

  const add = (raw: string[]) => {
    const have = new Set(tags.map(tagKey));
    const fresh: string[] = [];
    for (const t of raw) {
      const k = tagKey(t);
      if (k && !have.has(k)) { have.add(k); fresh.push(t.trim()); }
    }
    const at = Math.min(editAt.current ?? tags.length, tags.length);
    editAt.current = null;
    if (fresh.length) onChange([...tags.slice(0, at), ...fresh, ...tags.slice(at)]);
  };

  const commit = (useSuggestion: boolean) => {
    const s = useSuggestion && suggestions[hi];
    if (s) add([toPromptText(s.t)]);
    else add(splitTags(text));
    editAt.current = null;
    setText(""); setHi(0);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length) { e.preventDefault(); setHi(h => (h + 1) % suggestions.length); }
    else if (e.key === "ArrowUp" && suggestions.length) { e.preventDefault(); setHi(h => (h - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === "Enter") { e.preventDefault(); commit(suggestions.length > 0); }
    else if (e.key === "Tab" && suggestions.length && text) { e.preventDefault(); commit(true); }
    else if (e.key === ",") { e.preventDefault(); commit(false); }
    else if (e.key === "Escape") { setText(""); input.current?.blur(); }
    else if (e.key === "Backspace" && !text && tags.length) onChange(tags.slice(0, -1));
  };

  // Stable keys so chips keep their identity (and animate) when the list changes. Same tag twice: suffix.
  const chipKeys = useMemo(() => {
    const seen = new Map<string, number>();
    return tags.map(t => { const k = tagKey(t) || t; const n = seen.get(k) ?? 0; seen.set(k, n + 1); return n ? `${k}#${n}` : k; });
  }, [tags]);

  const replaceAt = (i: number, v: string) => onChange(tags.map((t, j) => (j === i ? v : t)));
  const dropAt = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    dnd.drop(listKey, index, e.ctrlKey || e.altKey);
  };

  return (
    <div
      onMouseDown={onActivate}
      onClick={e => { if (e.target === e.currentTarget) input.current?.focus(); }}
      onDragOver={e => { if (dnd.drag) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey || e.altKey || !dnd.drag.from ? "copy" : "move"; if (over === null) setOver(tags.length); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
      onDrop={e => dropAt(e, Infinity)}
      style={{ "--accent": accent } as React.CSSProperties}
      className={cn(
        "relative flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border-2 bg-ink-2 p-2 transition-colors",
        active ? "border-(--accent)" : "border-ink-3 hover:border-ink-line",
        dnd.drag && "border-dashed",
        dnd.drag && over !== null && "border-(--accent) bg-(--accent)/10",
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
      {tags.map((t, i) => (
        <Chip
          key={chipKeys[i]}
          raw={t}
          count={db?.count.get(tagKey(t))}
          known={!!db}
          marker={over === i}
          dragging={dnd.drag?.from != null && JSON.stringify(dnd.drag.from) === JSON.stringify(listKey) && dnd.drag.index === i}
          onDragStart={e => { e.dataTransfer.effectAllowed = "copyMove"; e.dataTransfer.setData(DRAG_MIME, t); dnd.start({ tag: t, from: listKey, index: i }); }}
          onDragOver={e => { if (dnd.drag) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = e.ctrlKey || e.altKey || !dnd.drag.from ? "copy" : "move"; setOver(i); } }}
          onDrop={e => dropAt(e, i)}
          onToggle={() => replaceAt(i, toggleOff(t))}
          onWeight={w => replaceAt(i, setWeight(t, w))}
          onEdit={() => { editAt.current = i; onChange(tags.filter((_, j) => j !== i)); setText(t); input.current?.focus(); }}
          onRemove={() => onChange(tags.filter((_, j) => j !== i))}
        />
      ))}
      </AnimatePresence>
      {over === tags.length && <DropMarker />}
      <div className="relative min-w-32 flex-1">
        <input
          ref={input}
          value={text}
          placeholder={tags.length ? "" : placeholder}
          onChange={e => { setText(e.target.value); setHi(0); }}
          onKeyDown={onKey}
          onFocus={() => { setFocused(true); onActivate?.(); }}
          onBlur={() => { setFocused(false); if (text.trim()) commit(false); }}
          onPaste={e => {
            const p = e.clipboardData.getData("text");
            if (/[,\n]/.test(p)) { e.preventDefault(); add(splitTags(text + p)); setText(""); }
          }}
          className="h-7 w-full bg-transparent px-1 font-talk text-base text-paper placeholder:text-taupe focus:outline-hidden"
        />
        {suggestions.length > 0 && (
          <m.div {...pop} className={cn(surfaceCls, "absolute left-0 top-full z-40 mt-1.5 w-72 origin-top-left px-3 py-2")}>
            <MenuRule>
              {suggestions.map((s, i) => (
                <li
                  key={s.t}
                  onMouseDown={e => { e.preventDefault(); add([toPromptText(s.t)]); setText(""); setHi(0); }}
                  onMouseEnter={() => setHi(i)}
                  className={cn("relative flex cursor-pointer items-center justify-between py-1 pl-3 text-base", i === hi ? "text-paper" : "text-bone")}
                >
                  {i === hi && <MenuMarker layoutId="tag-suggestion" />}
                  <span>{toPromptText(s.t)}{s.alias && <small className="ml-1 text-taupe">(alias)</small>}</span>
                  <small className="text-taupe">{fmtCount(s.n)}</small>
                </li>
              ))}
            </MenuRule>
          </m.div>
        )}
      </div>
    </div>
  );
}

type ChipProps = {
  raw: string;
  count: number | undefined;
  known: boolean;
  marker: boolean;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onToggle: () => void;
  onWeight: (w: number) => void;
  onEdit: () => void;
  onRemove: () => void;
};

/** Insertion point shown while dragging. */
const DropMarker = () => <m.span layout initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} className="h-6 w-1 rounded-full bg-(--accent)" />;

/** Chip enter/exit. Layout is "position" only: a chip whose text changes width snaps instead of stretching. */
const chipMotion = {
  layout: "position" as const,
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1, transition: { ...spring.snappy, opacity: fade.in } },
  exit: { opacity: 0, scale: 0.8, transition: fade.out },
};

const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip(props, ref) {
  return <m.span ref={ref} {...chipMotion} className="inline-flex items-center gap-1.5"><ChipBody {...props} /></m.span>;
});

function ChipBody({ raw, count, known, marker, dragging, onDragStart, onDragOver, onDrop, onToggle, onWeight, onEdit, onRemove }: ChipProps) {
  const { text, weight, off } = parseTag(raw);
  const rare = known && (count === undefined || count < RARE);
  const el = useRef<HTMLSpanElement>(null);
  const clickTimer = useRef<number | undefined>(undefined);
  const wheel = useRef({ weight, onWeight });
  wheel.current = { weight, onWeight };

  // Ctrl+scroll changes the weight. Needs a non-passive listener to stop the browser from zooming.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const h = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { weight, onWeight } = wheel.current;
      onWeight(Math.round((weight + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100);
    };
    node.addEventListener("wheel", h, { passive: false });
    return () => node.removeEventListener("wheel", h);
  }, []);

  return (
    <>
      {marker && <DropMarker />}
      <span
        ref={el}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={e => {
          e.stopPropagation();
          // wait a moment so a double-click (edit) does not also toggle
          clearTimeout(clickTimer.current);
          if (e.detail === 1) clickTimer.current = window.setTimeout(onToggle, 220);
        }}
        onDoubleClick={e => { e.stopPropagation(); clearTimeout(clickTimer.current); onEdit(); }}
        title={[
          count !== undefined ? `${count.toLocaleString()} posts` : "not a known Danbooru tag",
          "Click to switch off or on. Ctrl+scroll changes the weight, double-click edits, drag moves (hold Ctrl to copy).",
        ].join("\n")}
        className={cn(
          "group inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-0.5 font-talk text-base font-semibold leading-6 transition-opacity",
          rare ? "border-butter/50 bg-butter/10 text-paper" : "border-ink-line bg-ink-3 text-paper hover:border-taupe",
          off && "border-dashed opacity-40 [&>.label]:line-through",
          dragging && "opacity-30",
        )}
      >
        {rare && <TriangleAlert className="h-3.5 w-3.5 text-butter" aria-label="Rare or unknown tag" />}
        <span className="label">{text}</span>
        {weight !== 1 && (
          <button
            title="weight (click to reset to 1)"
            onClick={e => { e.stopPropagation(); onWeight(1); }}
            className={cn("rounded-md px-1 text-xs font-extrabold tabular-nums text-ink", weight > 1 ? "bg-caramel" : "bg-periwinkle")}
          >{weight}</button>
        )}
        {count !== undefined && <small className="text-xs font-normal text-taupe">{fmtCount(count)}</small>}
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          aria-label="Remove tag"
          className="-mr-1 rounded-md text-taupe opacity-70 hover:text-coral group-hover:opacity-100"
        ><X className="h-3 w-3" /></button>
      </span>
    </>
  );
}

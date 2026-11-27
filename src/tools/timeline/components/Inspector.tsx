import { useRef } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Eye, Trash2, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Confirm } from "@/shared/ui/confirm";
import { IconButton } from "@/shared/ui/icon-button";
import { fade, m, spring } from "@/shared/ui/motion";
import { Section } from "@/shared/ui/section";
import { removeEvent } from "../lib/actions";
import { visible } from "../lib/colors";
import { allEvents, castOf, deleteEvent, findEvent, moveEvent, orderBetween, threadsOf } from "../lib/model";
import { nav } from "../lib/nav";
import { useTimeline, useTimelinePick } from "../state";
import { AutoText, ColorInput, Field, TextInput } from "@/shared/ui/field";
import { Select } from "@/shared/ui/select";
import { ChipPicker } from "./fields";
import { DEFAULT_COLOR } from "@/shared/lib/colors";

/** Only open while something is picked (Timeline passes `asideOpen`). While it slides shut it keeps showing what
 *  was picked last, instead of going blank. */
export function Inspector() {
  const picked = useTimeline(s => s.selection);
  const last = useRef(picked);
  if (picked) last.current = picked;
  const sel = last.current;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
      {/* a new panel slides in a little, so it's clear the panel now shows something else */}
      <m.div key={sel ? `${sel.kind}:${sel.id}` : "none"} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
        transition={{ ...spring.snappy, opacity: fade.in }}>
        {!sel ? null : sel.kind === "event" ? <EventPanel id={sel.id} /> : sel.kind === "chapter" ? <ChapterPanel id={sel.id} />
          : sel.kind === "thread" ? <ThreadPanel id={sel.id} /> : sel.kind === "view" ? <ViewPanel id={sel.id} /> : <CharPanel id={sel.id} />}
      </m.div>
    </div>
  );
}

function Close() {
  const select = useTimeline(s => s.select);
  return <IconButton icon={X} label="Close" kbd="Esc" onClick={() => select(null)} />;
}

function EventPanel({ id }: { id: string }) {
  const { doc, edit, select } = useTimelinePick("doc", "edit", "select");
  const f = findEvent(doc.chapters, id);
  if (!f) return null;
  const { event, chapter } = f;
  const cast = castOf(doc.roster, doc.chapters);
  const threads = threadsOf(doc.threads, doc.chapters);
  const set = (fn: (e: typeof event) => void, key?: string) => edit(d => { const x = findEvent(d.chapters, id); if (x) fn(x.event); }, key);
  const titleOf = (eid: string) => findEvent(doc.chapters, eid)?.event.title || "(untitled)";
  const incoming = allEvents(doc.chapters).flatMap(({ event: e }) => (e.links ?? []).filter(l => l.to === id).map(l => ({ from: e, label: l.label })));
  const go = (eid: string) => { select({ kind: "event", id: eid }); nav.toEvent(eid); };
  const colName = (i: number) => chapter.columns[i] || `Column ${i + 1}`;

  return (
    <div className="space-y-5">
      <Section title="Event" actions={<>
        <IconButton icon={Trash2} label="Delete event" kbd="Del" tone="danger" onClick={() => removeEvent(id)} />
        <Close />
      </>} />

      <AutoText key={id} value={event.title} autoFocus={!event.title} placeholder="What happens?" onChange={v => set(e => { e.title = v; }, `title:${id}`)} className="text-base" />
      <Field label="Note">
        <AutoText key={`n${id}`} value={event.note ?? ""} placeholder="Details, ideas, open questions…" minRows={2}
          onChange={v => set(e => { if (v) e.note = v; else delete e.note; }, `note:${id}`)} />
      </Field>
      <Field label="Characters" hint="Everyone who does something important here. The event shows on each of their lanes.">
        <ChipPicker options={cast} value={event.chars} onChange={v => set(e => { e.chars = v; })} />
      </Field>
      <Field label="Threads">
        <ChipPicker options={threads} value={event.threads} onChange={v => set(e => { e.threads = v; })} empty="No threads yet. Add one on the left." />
      </Field>
      <Field label="When">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Select variant="field" label="Chapter" value={chapter.id} options={doc.chapters.map(c => ({ value: c.id, label: c.name, hint: c.when }))}
            onChange={to => {
              // keep its column, as far as the other chapter has columns
              const cols = doc.chapters.find(c => c.id === to)?.columns.length ?? 1;
              edit(d => moveEvent(d.chapters, id, to, Math.min(event.col, cols - 1)));
            }} />
          <div className="flex items-center">
            <IconButton icon={ChevronLeft} size="sm" label="One column earlier" disabled={event.col === 0} onClick={() => set(e => { e.col--; })} />
            <IconButton icon={ChevronRight} size="sm" label="One column later" onClick={() => edit(d => moveEvent(d.chapters, id, chapter.id, event.col + 1))} />
          </div>
        </div>
        <p className="mt-1 font-talk text-xs text-taupe">
          {colName(event.col)}{(event.span ?? 1) > 1 && <> to {colName(event.col + event.span! - 1)}</>}
          {chapter.when && <> · {chapter.when}</>}
        </p>
      </Field>

      <Field label="Arrows" hint={!(event.links?.length || incoming.length) ? "Drag the dot on a card onto another event to draw one." : undefined}>
        <ul className="space-y-2">
          {(event.links ?? []).map((l, i) => (
            <li key={l.to} className="space-y-1">
              <div className="flex items-center gap-1">
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-taupe" />
                <button onClick={() => go(l.to)} className="min-w-0 flex-1 truncate text-left font-talk text-sm text-bone hover:text-paper hover:underline">{titleOf(l.to)}</button>
                <IconButton icon={X} size="sm" label="Remove arrow" tone="danger" onClick={() => set(e => { e.links!.splice(i, 1); if (!e.links!.length) delete e.links; })} />
              </div>
              <TextInput value={l.label ?? ""} placeholder="Label (why it leads there)" className="h-7 text-sm"
                onChange={v => set(e => { const x = e.links!.find(y => y.to === l.to)!; if (v) x.label = v; else delete x.label; }, `link:${id}:${l.to}`)} />
            </li>
          ))}
          {incoming.map(({ from, label }) => (
            <li key={from.id} className="flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-taupe" />
              <button onClick={() => go(from.id)} className="min-w-0 flex-1 truncate text-left font-talk text-sm text-bone hover:text-paper hover:underline">
                {from.title || "(untitled)"}{label && <span className="text-taupe"> · {label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Field>
    </div>
  );
}

function ChapterPanel({ id }: { id: string }) {
  const { doc, edit, select, folded, toggleFolded } = useTimelinePick("doc", "edit", "select", "folded", "toggleFolded");
  const i = doc.chapters.findIndex(c => c.id === id);
  const ch = doc.chapters[i];
  if (!ch) return null;
  const set = (fn: (c: typeof ch) => void, key?: string) => edit(d => { const x = d.chapters.find(c => c.id === id); if (x) fn(x); }, key);
  // moving only renumbers this chapter: it goes between its new neighbours
  const move = (dir: -1 | 1) => {
    const o = doc.chapters.map(c => c.order);
    const j = i + dir;
    set(c => { c.order = dir < 0 ? orderBetween(o[j - 1], o[j]) : orderBetween(o[j], o[j + 1]); });
    setTimeout(() => nav.toChapter(id), 50);
  };
  return (
    <div className="space-y-5">
      <Section title="Chapter" actions={<>
        <IconButton icon={ChevronLeft} label="Move earlier" disabled={i === 0} onClick={() => move(-1)} />
        <IconButton icon={ChevronRight} label="Move later" disabled={i === doc.chapters.length - 1} onClick={() => move(1)} />
        <Confirm message={ch.events.length ? `Delete "${ch.name}" and its ${ch.events.length} events?` : `Delete "${ch.name}"?`}
          onConfirm={() => { select(null); edit(d => { for (const e of ch.events) deleteEvent(d.chapters, e.id); d.chapters = d.chapters.filter(c => c.id !== id); }); }}>
          <IconButton icon={Trash2} label="Delete chapter" tone="danger" />
        </Confirm>
        <Close />
      </>} />
      <Field label="Name"><TextInput value={ch.name} onChange={v => set(c => { c.name = v; }, `name:${id}`)} /></Field>
      <Field label="When" hint="Free text, only a label: 2012 – 2020, 07. – 11.04.2025, Okt 2025">
        <TextInput value={ch.when ?? ""} placeholder="—" onChange={v => set(c => { if (v) c.when = v; else delete c.when; }, `when:${id}`)} />
      </Field>
      <Field label="Notes">
        <AutoText key={id} value={ch.notes ?? ""} minRows={3} onChange={v => set(c => { if (v) c.notes = v; else delete c.notes; }, `notes:${id}`)} />
      </Field>
      <p className="font-talk text-sm text-taupe">
        {ch.events.length} events in {ch.columns.length} columns.{" "}
        <button className="text-bone underline-offset-4 hover:text-paper hover:underline" onClick={() => toggleFolded(id)}>{folded.has(id) ? "Unfold" : "Fold"} it</button> (only for you).
      </p>
    </div>
  );
}

function ThreadPanel({ id }: { id: string }) {
  const { doc, edit, select, setFilter } = useTimelinePick("doc", "edit", "select", "setFilter");
  const t = doc.threads.find(x => x.id === id);
  const count = allEvents(doc.chapters).filter(x => x.event.threads.includes(id)).length;
  const strip = () => edit(d => { for (const { event } of allEvents(d.chapters)) event.threads = event.threads.filter(x => x !== id); d.threads = d.threads.filter(x => x.id !== id); });
  if (!t) return (
    <div className="space-y-4">
      <Section title={id} actions={<Close />} />
      <p className="font-talk text-sm text-bone">{count} events use this thread, but it isn't in the thread list.</p>
      <Button size="sm" onClick={() => edit(d => { d.threads.push({ id, name: id, color: DEFAULT_COLOR }); })}>Add it to the list</Button>
    </div>
  );
  const set = (fn: (x: NonNullable<typeof t>) => void, key?: string) => edit(d => { const x = d.threads.find(y => y.id === id); if (x) fn(x); }, key);
  return (
    <div className="space-y-5">
      <Section title="Thread" color={visible(t.color)} actions={<>
        <Confirm message={`Delete the thread "${t.name}"? Its ${count} events stay, they just lose the thread.`} onConfirm={() => { select(null); strip(); }}>
          <IconButton icon={Trash2} label="Delete thread" tone="danger" />
        </Confirm>
        <Close />
      </>} />
      <Field label="Name"><TextInput value={t.name} onChange={v => set(x => { x.name = v; }, `tname:${id}`)} /></Field>
      <Field label="Color"><ColorInput value={t.color} onChange={v => set(x => { x.color = v; }, `tcolor:${id}`)} /></Field>
      <Field label="Notes">
        <AutoText key={id} value={t.notes ?? ""} minRows={3} placeholder="What this storyline is about, where it should go…"
          onChange={v => set(x => { if (v) x.notes = v; else delete x.notes; }, `tnotes:${id}`)} />
      </Field>
      <div className="flex items-center gap-3 font-talk text-sm text-taupe">
        <span>{count} events</span>
        <Button size="sm" onClick={() => setFilter({ threads: [id], chars: [] }, null)}><Eye className="h-4 w-4" />Focus on it</Button>
      </div>
    </div>
  );
}

function CharPanel({ id }: { id: string }) {
  const { doc, edit, select, setFilter } = useTimelinePick("doc", "edit", "select", "setFilter");
  const c = castOf(doc.roster, []).find(x => x.id === id);
  const count = allEvents(doc.chapters).filter(x => x.event.chars.includes(id)).length;
  if (!c) return (
    <div className="space-y-4">
      <Section title={id} actions={<Close />} />
      <p className="font-talk text-sm text-bone">{count} events use this character, but it isn't in the character list.</p>
      <Button size="sm" onClick={() => edit(d => { d.roster.push({ id, name: id, color: DEFAULT_COLOR }); })}>Add it to the list</Button>
    </div>
  );
  // a game character the list doesn't have yet gets its entry on the first edit
  const set = (fn: (x: NonNullable<typeof c>) => void, key?: string) => edit(d => {
    let x = d.roster.find(y => y.id === id);
    if (!x) d.roster.push(x = { id, name: c.name, color: c.color });
    fn(x);
  }, key);
  return (
    <div className="space-y-5">
      <Section title="Character" color={visible(c.color)} actions={<>
        {/* the game's characters stay: they come back from the game anyway */}
        {!c.game && (
          <Confirm label="Remove" message={`Remove ${c.name} from the character list (shared by all tools)? Events keep the id.`}
            onConfirm={() => { select(null); edit(d => { d.roster = d.roster.filter(r => r.id !== id); }); }}>
            <IconButton icon={Trash2} label="Remove character" tone="danger" />
          </Confirm>
        )}
        <Close />
      </>} />
      <Field label="Name"><TextInput value={c.name} onChange={v => set(x => { x.name = v; }, `cname:${id}`)} /></Field>
      {c.game
        ? <Field label="Color"><p className="font-talk text-sm text-taupe">The game's textbox colour (core/gui/say.rpy).</p></Field>
        : <Field label="Color"><ColorInput value={c.color} onChange={v => set(x => { x.color = v; }, `ccolor:${id}`)} /></Field>}
      <div className="flex items-center gap-3 font-talk text-sm text-taupe">
        <span>{count} events</span>
        <Button size="sm" onClick={() => setFilter({ chars: [id], threads: [] }, null)}><Eye className="h-4 w-4" />Focus on {c.name}</Button>
      </div>
    </div>
  );
}

function ViewPanel({ id }: { id: string }) {
  const { doc, edit, select, filter, viewId, setFilter } = useTimelinePick("doc", "edit", "select", "filter", "viewId", "setFilter");
  const v = doc.views.find(x => x.id === id);
  if (!v) return null;
  const cast = castOf(doc.roster, doc.chapters), threads = threadsOf(doc.threads, doc.chapters);
  const names = (ids: string[], list: { id: string; name: string }[]) => ids.map(x => list.find(y => y.id === x)?.name ?? x).join(", ");
  const same = JSON.stringify({ ...filter }) === JSON.stringify({ groupBy: v.groupBy, chars: v.chars, threads: v.threads, hideOthers: v.hideOthers });
  return (
    <div className="space-y-5">
      <Section title="Saved view" actions={<>
        <Confirm message={`Delete the view "${v.name}" for everyone?`} onConfirm={() => { select(null); edit(d => { d.views = d.views.filter(x => x.id !== id); }); }}>
          <IconButton icon={Trash2} label="Delete view" tone="danger" />
        </Confirm>
        <Close />
      </>} />
      <Field label="Name"><TextInput value={v.name} onChange={x => edit(d => { const y = d.views.find(z => z.id === id); if (y) y.name = x; }, `vname:${id}`)} /></Field>
      <dl className="space-y-1 font-talk text-sm">
        <div><dt className="inline text-taupe">Lanes: </dt><dd className="inline text-bone">{v.groupBy === "chars" ? "characters" : v.groupBy === "threads" ? "threads" : "one lane"}</dd></div>
        <div><dt className="inline text-taupe">Characters: </dt><dd className="inline text-bone">{v.chars.length ? names(v.chars, cast) : "all"}</dd></div>
        <div><dt className="inline text-taupe">Threads: </dt><dd className="inline text-bone">{v.threads.length ? names(v.threads, threads) : "all"}</dd></div>
        <div><dt className="inline text-taupe">The rest: </dt><dd className="inline text-bone">{v.hideOthers ? "hidden" : "dimmed"}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-x-3">
        {viewId !== id && <Button size="sm" onClick={() => setFilter(v, id)}><Eye className="h-4 w-4" />Show it</Button>}
        <Button size="sm" disabled={same} className={cn(same && "hidden")}
          onClick={() => edit(d => { const y = d.views.find(z => z.id === id); if (y) Object.assign(y, filter); })}>Replace with what's shown now</Button>
      </div>
    </div>
  );
}

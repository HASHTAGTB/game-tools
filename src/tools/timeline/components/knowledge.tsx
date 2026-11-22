import { Trash2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { Confirm } from "@/shared/ui/confirm";
import { IconButton } from "@/shared/ui/icon-button";
import { Section } from "@/shared/ui/section";
import { visible } from "../lib/colors";
import { formatDate } from "../lib/duration";
import { findEvent } from "../lib/edit";
import { factId, unknownTo, whoKnows } from "../lib/knowledge";
import { laneChars } from "../lib/layout";
import type { Fact, StoryEvent } from "../lib/types";
import { useTimeline } from "../state";
import { Field, inputCls } from "./fields";

/** Chips for a list of facts, plus a box to add one: pick an existing fact by name or type a new one. */
function FactChips({ ids, onAdd, onRemove, warn, placeholder }: {
  ids: string[]; onAdd: (fact: Fact, isNew: boolean) => void; onRemove: (id: string) => void;
  /** Characters who don't know this fact yet, per fact (shown as a warning). */
  warn?: (id: string) => string[];
  placeholder: string;
}) {
  const { doc, select } = useTimeline();
  const [text, setText] = useState("");
  const listId = `facts-${placeholder.replace(/\W/g, "")}`;
  const add = () => {
    const n = text.trim();
    if (!n) return;
    const existing = doc.facts.find(f => f.name.toLowerCase() === n.toLowerCase());
    const fact = existing ?? { id: factId(n, doc.facts.map(f => f.id)), name: n };
    onAdd(fact, !existing);
    setText("");
  };
  return (
    <div className="space-y-1.5">
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ids.map(id => {
            const f = doc.facts.find(x => x.id === id);
            const who = warn?.(id) ?? [];
            return (
              <span key={id} className={cn("inline-flex items-center gap-0.5 rounded-full border-2 py-px pl-2 pr-0.5 font-talk text-[12px]", who.length ? "border-coral text-coral" : "border-ink-line text-bone")}
                title={who.length ? `Doesn't know this yet: ${who.join(", ")}` : undefined}>
                <button onClick={() => select({ kind: "fact", id })} className="hover:underline">{f?.name ?? id}</button>
                <button onClick={() => onRemove(id)} aria-label="Remove" className="grid h-4 w-4 place-items-center rounded-full text-taupe hover:text-paper"><X className="h-3 w-3" /></button>
              </span>
            );
          })}
        </div>
      )}
      <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} onBlur={add}
        list={listId} placeholder={placeholder} className={inputCls} />
      <datalist id={listId}>{doc.facts.filter(f => !ids.includes(f.id)).map(f => <option key={f.id} value={f.name} />)}</datalist>
    </div>
  );
}

/** The event panel's knowledge part: what its characters find out here, and what they act on. */
export function EventKnowledge({ event }: { event: StoryEvent }) {
  const { doc, res, edit } = useTimeline();
  const known = whoKnows(doc.arcs, res);
  const names = (ids: string[]) => ids.map(c => doc.roster.find(r => r.id === c)?.name ?? c);
  const set = (fn: (e: StoryEvent) => void) => edit(d => { const f = findEvent(d.arcs, event.id); if (f) fn(f.event); });
  const addFact = (d: { facts: Fact[] }, f: Fact, isNew: boolean) => { if (isNew) d.facts.push(f); };
  return (
    <div className="space-y-3">
      <Field label="Finds out">
        <FactChips ids={(event.learns ?? []).map(l => l.fact)} placeholder="Fact they learn here…"
          onAdd={(f, isNew) => edit(d => { addFact(d, f, isNew); const x = findEvent(d.arcs, event.id); if (x && !(x.event.learns ?? []).some(l => l.fact === f.id)) x.event.learns = [...(x.event.learns ?? []), { fact: f.id }]; })}
          onRemove={id => set(e => { e.learns = (e.learns ?? []).filter(l => l.fact !== id); if (!e.learns.length) delete e.learns; })} />
      </Field>
      <Field label="Acts on">
        <FactChips ids={event.needs ?? []} placeholder="Fact they must know already…"
          warn={id => names(unknownTo(event, id, known, res))}
          onAdd={(f, isNew) => edit(d => { addFact(d, f, isNew); const x = findEvent(d.arcs, event.id); if (x && !(x.event.needs ?? []).includes(f.id)) x.event.needs = [...(x.event.needs ?? []), f.id]; })}
          onRemove={id => set(e => { e.needs = (e.needs ?? []).filter(n => n !== id); if (!e.needs.length) delete e.needs; })} />
      </Field>
    </div>
  );
}

/** A fact: who finds it out when, and who acts on it. */
export function FactPanel({ id }: { id: string }) {
  const { doc, res, edit, select } = useTimeline();
  const fact = doc.facts.find(f => f.id === id);
  if (!fact) return null;
  const chars = laneChars(doc.roster, doc.arcs);
  const learned = [...(whoKnows(doc.arcs, res).get(id) ?? new Map()).entries()].sort((a, b) => a[1].at - b[1].at);
  const acting = doc.arcs.flatMap(a => a.events.filter(e => e.needs?.includes(id)));
  const set = (fn: (f: Fact) => void, key?: string) => edit(d => { const f = d.facts.find(x => x.id === id); if (f) fn(f); }, key);
  const char = (c: string) => chars.find(x => x.id === c);
  return (
    <div className="space-y-5">
      <Section title="Fact" actions={<>
        <Confirm message={`Delete the fact "${fact.name}"? Events that learn or act on it lose it.`}
          onConfirm={() => { edit(d => {
            d.facts = d.facts.filter(f => f.id !== id);
            for (const a of d.arcs) for (const e of a.events) {
              if (e.learns) { e.learns = e.learns.filter(l => l.fact !== id); if (!e.learns.length) delete e.learns; }
              if (e.needs) { e.needs = e.needs.filter(n => n !== id); if (!e.needs.length) delete e.needs; }
            }
          }); select(null); }}>
          <IconButton icon={Trash2} label="Delete fact" tone="danger" />
        </Confirm>
        <IconButton icon={X} label="Close" kbd="Esc" onClick={() => select(null)} />
      </>} />
      <Field label="Name">
        <input value={fact.name} onChange={e => set(f => { f.name = e.target.value; }, `fname:${id}`)} className={inputCls} />
      </Field>
      <Field label="Notes">
        <textarea value={fact.notes ?? ""} rows={3} onChange={e => set(f => { if (e.target.value) f.notes = e.target.value; else delete f.notes; }, `fnotes:${id}`)}
          className="w-full resize-y rounded-md border-2 border-ink-line bg-ink px-2 py-1.5 font-talk text-sm text-paper focus:border-caramel focus:outline-hidden" />
      </Field>
      <div>
        <span className="mb-1.5 block font-sans text-[13px] text-taupe">Who finds out when</span>
        {learned.length ? (
          <ul className="space-y-1">
            {learned.map(([c, l]) => {
              const s = res.events.get(l.event.id);
              return (
                <li key={c}>
                  <button onClick={() => select({ kind: "event", id: l.event.id })} className="flex w-full items-baseline gap-2 text-left font-talk text-[13px] text-bone hover:text-paper">
                    <span className="w-20 shrink-0 truncate font-sans" style={{ color: visible(char(c)?.color ?? "#9a8f86") }}>{char(c)?.name ?? c}</span>
                    <span className="min-w-0 flex-1 truncate">{l.event.text || "(empty)"}</span>
                    {s && <span className="shrink-0 text-[11px] text-taupe">{formatDate(s.end, s.precision)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="font-talk text-[13px] text-taupe">Nobody yet. Add it under "Finds out" on an event.</p>}
      </div>
      {acting.length > 0 && (
        <div>
          <span className="mb-1.5 block font-sans text-[13px] text-taupe">Acted on in</span>
          <ul className="space-y-1">
            {acting.map(e => (
              <li key={e.id}><button onClick={() => select({ kind: "event", id: e.id })} className="block w-full truncate text-left font-talk text-[13px] text-bone hover:text-paper">{e.text || "(empty)"}</button></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** What a character knows, in the order they find out. */
export function CharKnowledge({ id }: { id: string }) {
  const { doc, res, select } = useTimeline();
  const known = whoKnows(doc.arcs, res);
  const list = doc.facts.flatMap(f => { const l = known.get(f.id)?.get(id); return l ? [{ f, l }] : []; }).sort((a, b) => a.l.at - b.l.at);
  if (!list.length) return null;
  return (
    <div>
      <span className="mb-1.5 block font-sans text-[13px] text-taupe">Finds out</span>
      <ul className="space-y-1">
        {list.map(({ f, l }) => {
          const s = res.events.get(l.event.id);
          return (
            <li key={f.id}>
              <button onClick={() => select({ kind: "fact", id: f.id })} className="flex w-full items-baseline gap-2 text-left font-talk text-[13px] text-bone hover:text-paper">
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {s && <span className="shrink-0 text-[11px] text-taupe">{formatDate(s.end, s.precision)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

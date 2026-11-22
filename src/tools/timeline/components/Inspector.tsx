import { ArrowRight, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn, uniqueId } from "@/shared/lib/utils";
import type { RosterCharacter } from "@/shared/lib/roster";
import { Confirm } from "@/shared/ui/confirm";
import { IconButton } from "@/shared/ui/icon-button";
import { Section } from "@/shared/ui/section";
import { visible } from "../lib/colors";
import { formatSpan, isDuration, parseDate } from "../lib/duration";
import { allConnections, deleteArc, deleteEvent, findEvent, moveToArc } from "../lib/edit";
import { laneChars } from "../lib/layout";
import type { Span } from "../lib/resolve";
import { DEFAULT_LENGTH, type Arc } from "../lib/types";
import { useTimeline } from "../state";
import { CheckedInput, Field, inputCls, WhenEditor } from "./fields";
import { ArcScenes, OpenInObsidian, SceneBadges, SceneField } from "./scenes";
import { CharKnowledge, EventKnowledge, FactPanel } from "./knowledge";
import { ageAt } from "../lib/checks";

const textareaCls = "w-full resize-y rounded-md border-2 border-ink-line bg-ink px-2 py-1.5 font-talk text-sm leading-snug text-paper placeholder:text-taupe focus:border-caramel focus:outline-hidden";

export function Inspector() {
  const sel = useTimeline(s => s.selection);
  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-ink-line/60 px-5 py-6">
      {!sel ? <Help /> : sel.kind === "event" ? <EventPanel id={sel.id} /> : sel.kind === "arc" ? <ArcPanel id={sel.id} />
        : sel.kind === "connection" ? <ConnectionPanel id={sel.id} /> : sel.kind === "fact" ? <FactPanel id={sel.id} /> : <CharPanel id={sel.id} />}
    </aside>
  );
}

/** The resolved time under a panel's title, with how exactly it's known. */
function When({ span }: { span: Span }) {
  return (
    <p className="-mt-3 font-talk text-[13px] text-bone">
      {formatSpan(span.start, span.end, span.precision)}
      <span className="text-taupe"> · {span.pinned ? `known to the ${span.precision}` : "not tied to a date"}</span>
    </p>
  );
}

function Close() {
  const select = useTimeline(s => s.select);
  return <IconButton icon={X} label="Close" kbd="Esc" onClick={() => select(null)} />;
}

function Help() {
  return (
    <div className="space-y-4 font-talk text-sm text-bone">
      <p className="font-sans text-xl text-paper">Timeline</p>
      <ul className="space-y-2 text-[13.5px] leading-snug">
        <li><b className="text-paper">Double-click</b> an empty spot in a lane to add an event there.</li>
        <li><b className="text-paper">Drag</b> an event to move it in time, or onto another lane to give it to that character. Drag its right edge to change how long it lasts.</li>
        <li>Drag the <b className="text-paper">dot</b> on an event onto another event to connect them.</li>
        <li><b className="text-paper">Ctrl + scroll</b> zooms. Hatched stretches are empty time, shortened.</li>
        <li><b className="text-paper">Dashed</b> borders: the time is only known roughly (to the month or year), or isn't tied to a date yet.</li>
        <li><b className="text-paper">Ctrl+Z</b> / <b className="text-paper">Ctrl+Shift+Z</b> undo and redo, <b className="text-paper">Del</b> deletes the selection.</li>
      </ul>
      <p className="text-[13px] text-taupe">Changes save on their own. If someone else changed a file (git pull), it reloads, or asks when you had changes in it too.</p>
      <UntoldScenes />
    </div>
  );
}

/** Scene files no event points at. Scenes in an arc folder can be added from that arc's panel. */
function UntoldScenes() {
  const { scenes, doc, select } = useTimeline();
  const linked = new Set(doc.arcs.flatMap(a => a.events.map(e => e.scene)).filter(Boolean));
  const missing = scenes.filter(sc => !linked.has(sc.path));
  if (!scenes.length) return null;
  const arcOf = (path: string) => doc.arcs.find(a => a.folder && path.startsWith(a.folder + "/"));
  return (
    <div className="pt-2">
      <p className="mb-2 font-sans text-[15px] text-paper">Scenes not on the timeline <span className="font-talk text-[13px] text-taupe">{missing.length} of {scenes.length}</span></p>
      <ul className="space-y-2">
        {missing.map(sc => {
          const a = arcOf(sc.path);
          return (
            <li key={sc.path} className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <button onClick={() => a && select({ kind: "arc", id: a.id })} disabled={!a}
                  className={cn("block max-w-full truncate text-left font-talk text-[13px] text-bone", a && "hover:text-paper hover:underline")}>{sc.name}</button>
                <span className="block font-talk text-[11px] text-taupe">{a ? a.name : sc.folder || "loose, in no arc folder"}</span>
                <span className="mt-0.5 block"><SceneBadges scene={sc} /></span>
              </div>
              <OpenInObsidian path={sc.path} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EventPanel({ id }: { id: string }) {
  const { doc, res, edit, select } = useTimeline();
  const f = findEvent(doc.arcs, id);
  const text = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (f && !f.event.text) text.current?.focus(); }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return <Help />;
  const { event, arc } = f;
  const span = res.events.get(id);
  const chars = laneChars(doc.roster, doc.arcs);
  const set = (fn: (e: typeof event) => void, key?: string) => edit(d => { const x = findEvent(d.arcs, id); if (x) fn(x.event); }, key);
  const links = allConnections(doc.arcs).filter(({ conn }) => conn.from === id || conn.to === id);
  const nameOf = (eid: string) => { const x = findEvent(doc.arcs, eid); return x ? `${chars.find(c => c.id === x.event.chars[0])?.name ?? x.event.chars[0]}: ${x.event.text || "(empty)"}` : eid; };
  const prevInLane = arc.events.filter(e => e.id !== id && e.chars.includes(event.chars[0]) && (res.events.get(e.id)?.end ?? Infinity) <= (span?.start ?? -Infinity)).at(-1);

  return (
    <div className="space-y-5">
      <Section title="Event"
        actions={<>
          <Confirm message="Delete this event? Events timed from it keep their place." onConfirm={() => { edit((d, r) => { deleteEvent(d.arcs, id, r); }); select(null); }}>
            <IconButton icon={Trash2} label="Delete event" kbd="Del" tone="danger" />
          </Confirm>
          <Close />
        </>} />
      {span && <When span={span} />}
      <textarea ref={text} value={event.text} rows={4} placeholder="What happens?"
        onChange={e => set(x => { x.text = e.target.value; }, `text:${id}`)} className={textareaCls} />

      <Field label="Characters">
        <div className="flex flex-wrap gap-1.5">
          {chars.map(c => {
            const on = event.chars.includes(c.id);
            return (
              <button key={c.id} onClick={() => set(x => { x.chars = on ? (x.chars.length > 1 ? x.chars.filter(y => y !== c.id) : x.chars) : [...x.chars, c.id]; })}
                className={cn("rounded-full border-2 px-2 py-0.5 font-sans text-[13px] transition-colors", on ? "text-ink" : "border-ink-line text-taupe hover:text-paper")}
                style={on ? { background: visible(c.color), borderColor: visible(c.color) } : undefined}>
                {c.name}{on && span && ageAt(c.birthday, span.start) !== null && <span className="ml-1 opacity-70">{ageAt(c.birthday, span.start)}</span>}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="When">
        <WhenEditor when={event.when} span={span} arcs={doc.arcs} res={res} self={id}
          defaultRef={prevInLane ? { event: prevInLane.id } : { arc: arc.id }}
          onChange={w => set(x => { x.when = w; })} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Lasts">
          <CheckedInput value={event.length ?? ""} placeholder={DEFAULT_LENGTH} valid={v => v.trim() === "" || isDuration(v)}
            onCommit={v => set(x => { if (v.trim()) x.length = v.trim(); else delete x.length; })} />
        </Field>
        <Field label="Arc">
          <select value={arc.id} onChange={e => edit(d => moveToArc(d.arcs, id, e.target.value))} className={inputCls}>
            {doc.arcs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>

      <EventKnowledge event={event} />

      <div>
        <span className="mb-1 block font-sans text-[13px] text-taupe">Scene</span>
        <SceneField event={event} arc={arc}
          onLink={path => set(x => { if (path) x.scene = path; else delete x.scene; })}
          onPin={date => set(x => { x.when = { at: date }; })} />
      </div>

      {links.length > 0 && (
        <Field label="Connections">
          <ul className="space-y-1">
            {links.map(({ conn }) => (
              <li key={conn.id}>
                <button onClick={() => select({ kind: "connection", id: conn.id })} className="flex w-full items-start gap-1.5 rounded-sm py-0.5 text-left font-talk text-[13px] text-bone hover:text-paper">
                  <ArrowRight className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", conn.to === id && "rotate-180")} />
                  <span className="line-clamp-2">{conn.label ? <b className="font-semibold">{conn.label}: </b> : null}{nameOf(conn.from === id ? conn.to : conn.from)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}
      <p className="font-talk text-[11px] text-taupe select-text">id: {id}</p>
    </div>
  );
}

function ArcPanel({ id }: { id: string }) {
  const { doc, res, edit, select } = useTimeline();
  const arc = doc.arcs.find(a => a.id === id);
  if (!arc) return <Help />;
  const span = res.arcs.get(id);
  const set = (fn: (a: Arc) => void, key?: string) => edit(d => { const x = d.arcs.find(a => a.id === id); if (x) fn(x); }, key);
  const prevArc = [...doc.arcs].filter(a => a.id !== id && (res.arcs.get(a.id)?.end ?? Infinity) <= (span?.start ?? -Infinity))
    .sort((a, b) => res.arcs.get(b.id)!.end - res.arcs.get(a.id)!.end)[0];
  return (
    <div className="space-y-5">
      <Section title="Arc" color={arc.color}
        actions={<>
          <Confirm message={`Delete the arc "${arc.name}" and its ${arc.events.length} events? Things elsewhere timed from it get fixed dates.`}
            onConfirm={() => { edit((d, r) => deleteArc(d.arcs, id, r)); select(null); }}>
            <IconButton icon={Trash2} label="Delete arc" tone="danger" />
          </Confirm>
          <Close />
        </>} />
      {span && <When span={span} />}
      <Field label="Name">
        <input value={arc.name} onChange={e => set(a => { a.name = e.target.value; }, `name:${id}`)} className={inputCls} />
      </Field>
      <Field label="Starts">
        <WhenEditor when={arc.start} span={span} arcs={doc.arcs} res={res} self={id} defaultRef={prevArc ? { arc: prevArc.id } : null}
          onChange={w => set(a => { a.start = w; })} />
      </Field>
      <Field label="Ends no earlier than" hint="Optional date, counted inclusively (2025-04-11 = end of that day). Otherwise the arc ends with its last event.">
        <CheckedInput value={arc.end && "at" in arc.end ? arc.end.at : ""} placeholder="—" valid={v => v.trim() === "" || !!parseDate(v)}
          onCommit={v => set(a => { if (v.trim()) a.end = { at: v.trim() }; else delete a.end; })} />
      </Field>
      <div className="grid grid-cols-[auto_1fr] items-end gap-3">
        <Field label="Color">
          <input type="color" value={arc.color ?? "#c4956a"} onChange={e => set(a => { a.color = e.target.value; }, `color:${id}`)}
            className="h-8 w-12 cursor-pointer rounded-md border-2 border-ink-line bg-ink" />
        </Field>
        <Field label="Scene folder">
          <input value={arc.folder ?? ""} placeholder="CANON/03_Story/02_Scenes/…" onChange={e => set(a => { if (e.target.value) a.folder = e.target.value; else delete a.folder; }, `folder:${id}`)} className={inputCls} />
        </Field>
      </div>
      {arc.folder && (
        <div>
          <span className="mb-1.5 block font-sans text-[13px] text-taupe">Scenes in this folder</span>
          <ArcScenes arc={arc} />
        </div>
      )}
      <Field label="Notes">
        <textarea value={arc.notes ?? ""} rows={4} onChange={e => set(a => { if (e.target.value) a.notes = e.target.value; else delete a.notes; }, `notes:${id}`)} className={textareaCls} />
      </Field>
      <p className="font-talk text-[11px] text-taupe select-text">{arc.events.length} events · {arc.connections.length} connections · file {id}.json</p>
    </div>
  );
}

function ConnectionPanel({ id }: { id: string }) {
  const { doc, edit, select } = useTimeline();
  const found = allConnections(doc.arcs).find(x => x.conn.id === id);
  if (!found) return <Help />;
  const { conn } = found;
  const chars = laneChars(doc.roster, doc.arcs);
  const end = (eid: string) => {
    const x = findEvent(doc.arcs, eid);
    const c = x && chars.find(ch => ch.id === x.event.chars[0]);
    return (
      <button onClick={() => select({ kind: "event", id: eid })} className="block w-full rounded-md border-l-[3px] bg-ink-2 px-2 py-1.5 text-left font-talk text-[13px] text-bone hover:text-paper"
        style={{ borderColor: c ? visible(c.color) : undefined }}>
        <span className="block font-sans text-[12px] text-taupe">{c?.name ?? "?"}</span>
        <span className="line-clamp-3">{x?.event.text || (x ? "(empty)" : `missing event ${eid}`)}</span>
      </button>
    );
  };
  return (
    <div className="space-y-4">
      <Section title="Connection" actions={<>
        <IconButton icon={Trash2} label="Delete connection" kbd="Del" tone="danger"
          onClick={() => { edit(d => { for (const a of d.arcs) a.connections = a.connections.filter(c => c.id !== id); }); select(null); }} />
        <Close />
      </>} />
      {end(conn.from)}
      <ArrowRight className="mx-auto h-4 w-4 rotate-90 text-taupe" />
      {end(conn.to)}
      <Field label="Label">
        <input value={conn.label ?? ""} placeholder="What links them?" autoFocus={!conn.label}
          onChange={e => edit(d => { for (const a of d.arcs) for (const c of a.connections) if (c.id === id) { if (e.target.value) c.label = e.target.value; else delete c.label; } }, `label:${id}`)}
          className={inputCls} />
      </Field>
    </div>
  );
}

function CharPanel({ id }: { id: string }) {
  const { doc, edit, select } = useTimeline();
  const idx = doc.roster.findIndex(c => c.id === id);
  const c: RosterCharacter | undefined = doc.roster[idx];
  const used = doc.arcs.reduce((n, a) => n + a.events.filter(e => e.chars.includes(id)).length, 0);
  if (!c) {
    // a character used by events but missing from the roster: offer to add it
    return (
      <div className="space-y-4">
        <Section title={id} actions={<Close />} />
        <p className="font-talk text-sm text-bone">This character is used by {used} events but isn't in the character list.</p>
        <button className="font-sans text-caramel underline-offset-4 hover:underline"
          onClick={() => edit(d => { d.roster.push({ id, name: id, color: "#9a8f86" }); })}>Add to the character list</button>
      </div>
    );
  }
  const set = (fn: (x: RosterCharacter) => void, key?: string) => edit(d => { const x = d.roster.find(r => r.id === id); if (x) fn(x); }, key);
  const move = (by: number) => edit(d => { const i = d.roster.findIndex(r => r.id === id); const j = i + by; if (j < 0 || j >= d.roster.length) return; [d.roster[i], d.roster[j]] = [d.roster[j], d.roster[i]]; });
  return (
    <div className="space-y-5">
      <Section title="Character" color={visible(c.color)} actions={<>
        <Confirm message={used ? `${c.name} is in ${used} events. Remove from the list anyway? The events keep them (shown grey).` : `Remove ${c.name} from the list?`}
          onConfirm={() => { edit(d => { d.roster = d.roster.filter(r => r.id !== id); }); select(null); }} label="Remove">
          <IconButton icon={Trash2} label="Remove character" tone="danger" />
        </Confirm>
        <Close />
      </>} />
      <Field label="Name">
        <input value={c.name} onChange={e => set(x => { x.name = e.target.value; }, `cname:${id}`)} className={inputCls} />
      </Field>
      <div className="grid grid-cols-[auto_1fr] items-end gap-3">
        <Field label="Color">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#9a8f86"} onChange={e => set(x => { x.color = e.target.value; }, `ccolor:${id}`)}
            className="h-8 w-12 cursor-pointer rounded-md border-2 border-ink-line bg-ink" />
        </Field>
        <Field label="Birthday" hint="2007-11-30, or 11-30 if the year is open">
          <CheckedInput value={c.birthday ?? ""} placeholder="—" valid={v => v.trim() === "" || /^(\d{4}-)?\d{2}-\d{2}$/.test(v.trim())}
            onCommit={v => set(x => { if (v.trim()) x.birthday = v.trim(); else delete x.birthday; })} />
        </Field>
      </div>
      <Field label="Narrator variable" hint="Ren'Py: scenes with $ narrator = this are told by them">
        <input value={c.narrator ?? ""} placeholder={`${c.id}_n`} onChange={e => set(x => { if (e.target.value) x.narrator = e.target.value; else delete x.narrator; }, `cnarr:${id}`)} className={inputCls} />
      </Field>
      <CharKnowledge id={id} />
      <div className="flex gap-3 font-sans text-[14px]">
        <button disabled={idx === 0} onClick={() => move(-1)} className="text-bone hover:text-paper hover:underline disabled:opacity-30">Move lane up</button>
        <button disabled={idx === doc.roster.length - 1} onClick={() => move(1)} className="text-bone hover:text-paper hover:underline disabled:opacity-30">Move lane down</button>
      </div>
      <p className="font-talk text-[11px] text-taupe select-text">id: {id} · in {used} events</p>
    </div>
  );
}

/** Id for a new character from its name, not clashing with the roster or ids used by events. */
export function newCharId(name: string, roster: RosterCharacter[], taken: string[]) {
  return uniqueId(name, [...roster.map(c => c.id), ...taken]).replace(/-/g, "_");
}

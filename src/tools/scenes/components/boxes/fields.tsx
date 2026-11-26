import { useMemo, useState, type ReactNode } from "react";
import { characterOf, type Manifest } from "@/shared/lib/game";
import { cn } from "@/shared/lib/utils";
import { fieldCls } from "@/shared/ui/field";
import { look } from "../../lib/look";
import type { Script } from "../../lib/script";
import type { Stage } from "../../lib/stage";
import type { Stmt } from "../../lib/statements";
import { useKnownLabels } from "../../state";

/** The fields a stage card shows when it's open: chips for the game's backgrounds, sprites, music and transitions
 *  (dashed: no file for it yet), "other…" for anything else. And the first values a new card gets. */

/** Sensible first values for a new statement, from what's on stage there. */
export function defaults(stage: Stage, cast: string[], m: Manifest | null, script: Script, line: number) {
  const offstage = [...cast, ...Object.keys(m?.sprites ?? {})].find(id => !stage.sprites.some(s => s.tag === id)) ?? cast[0] ?? "";
  const speaking = (() => { for (let i = line - 1; i >= 0; i--) { const p = script.parsed[i]; if (p?.kind === "say" && p.who) return p.who; } return null; })();
  const onstage = stage.sprites.find(s => s.tag === speaking) ?? stage.sprites[0];
  const firstLook = (tag: string) => {
    const outfits = m?.sprites[tag];
    const outfit = outfits ? Object.keys(outfits)[0] : "casual";
    return [outfit, ...(outfits?.[outfit]?.[0]?.split(" ") ?? [])];
  };
  return {
    scene: { kind: "scene", image: stage.background ?? m?.backgrounds.find(b => b !== "black") ?? "black", with: "dissolve" } as Stmt,
    enter: { kind: "show", tag: offstage, attrs: firstLook(offstage), at: "center", with: "dissolve" } as Stmt,
    expression: onstage ? { kind: "show", tag: onstage.tag, attrs: onstage.attrs.length ? onstage.attrs : firstLook(onstage.tag), with: "expr_change" } as Stmt : null!,
    hide: onstage ? { kind: "hide", tag: onstage.tag, with: "dissolve" } as Stmt : null!,
    play: { kind: "play", channel: "music", name: m?.music[0] ?? "casual", fadein: "2.0" } as Stmt,
    stop: { kind: "stop", channel: "music", fadeout: "2.0" } as Stmt,
    pov: { kind: "pov", who: stage.pov ?? cast.find(id => characterOf(m, id)?.pov) ?? "satoru" } as Stmt,
    date: { kind: "date", date: stage.date ?? new Date().toISOString().slice(0, 10), time: stage.time ?? undefined } as Stmt,
    time: { kind: "time", time: stage.time ?? "12:00" } as Stmt,
    pause: { kind: "pause", seconds: "1.0" } as Stmt,
    jump: { kind: "jump", target: "" } as Stmt,
    phone: { kind: "phone", action: "on" } as Stmt,
  };
}

export function Fields({ x, set, cast, m, stage, script, line }: {
  x: Stmt; set: (p: Partial<Stmt>) => void; cast: string[]; m: Manifest | null; stage: Stage; script: Script; line: number;
}) {
  const used = useMemo(() => usedInScript(script), [script]);
  const labels = useKnownLabels();
  switch (x.kind) {
    case "scene":
      return <>
        <Row label="Background">
          <Chips value={x.image} onChange={image => set({ image })} other
            options={uniq(["black", ...(m?.backgrounds ?? []), ...used.backgrounds]).map(b => ({ value: b, missing: !!m && !m.backgrounds.includes(b) }))} />
        </Row>
        <TransitionRow value={x.with} onChange={w => set({ with: w })} m={m} />
      </>;
    case "show": {
      const outfits = m?.sprites[x.tag] ?? {};
      const outfit = x.attrs[0] ?? "";
      const expr = x.attrs.slice(1).join(" ");
      const exprs = uniq([...(outfits[outfit] ?? []), ...(used.expressions[x.tag] ?? [])]);
      const onStage = stage.sprites.find(s => s.tag === x.tag);
      const people = uniq([...cast, ...stage.sprites.map(s => s.tag), ...Object.keys(m?.sprites ?? {}), x.tag]).filter(Boolean);
      return <>
        <Row label="Who">
          <Chips value={x.tag} onChange={tag => set({ tag, attrs: x.attrs })} other
            options={people.map(id => ({ value: id, label: look(m, id).name, color: look(m, id).color }))} />
        </Row>
        <Row label="Outfit">
          <Chips value={outfit} onChange={o => set({ attrs: [o, ...x.attrs.slice(1)] })} other
            options={uniq([...Object.keys(outfits), "casual", outfit]).filter(Boolean).map(o => ({ value: o, missing: !!m && !outfits[o] }))} />
        </Row>
        <Row label="Expression">
          <Chips value={expr} onChange={e => set({ attrs: [outfit || "casual", ...e.split(/\s+/).filter(Boolean)] })} other
            options={uniq([...exprs, expr]).filter(Boolean).map(e => ({ value: e, missing: !!m && !(outfits[outfit] ?? []).includes(e) }))} />
        </Row>
        <Row label="Where">
          <Chips value={x.at ?? ""} onChange={at => set({ at: at || undefined })} other
            options={[
              ...(onStage ? [{ value: "", label: onStage.at ? `stays (${onStage.at})` : "stays" }] : []),
              ...(m?.positions.filter(p => !p.params).map(p => ({ value: p.name })) ?? ["center", "left", "right", "small"].map(value => ({ value }))),
            ]} />
        </Row>
        <TransitionRow value={x.with} onChange={w => set({ with: w })} m={m} />
      </>;
    }
    case "hide":
      return <>
        <Row label="Who">
          <Chips value={x.tag} onChange={tag => set({ tag })} other
            options={uniq([...stage.sprites.map(s => s.tag), x.tag]).map(id => ({ value: id, label: look(m, id).name, color: look(m, id).color }))} />
        </Row>
        <TransitionRow value={x.with} onChange={w => set({ with: w })} m={m} />
      </>;
    case "with":
      return <TransitionRow value={x.with} onChange={w => set({ with: w ?? "dissolve" })} m={m} required />;
    case "play":
      return <>
        <Row label="Track">
          <Chips value={x.name} onChange={name => set({ name })} other options={uniq([...(m?.music ?? []), ...used.music, x.name]).map(v => ({ value: v, missing: !!m && !m.music.includes(v) }))} />
        </Row>
        <Row label="Fade in">
          <Chips value={x.fadein ?? ""} onChange={f => set({ fadein: f || undefined })} options={[{ value: "", label: "no" }, ...["1.0", "2.0", "4.0"].map(v => ({ value: v, label: `${+v}s` }))]} />
        </Row>
      </>;
    case "stop":
      return (
        <Row label="Fade out">
          <Chips value={x.fadeout ?? ""} onChange={f => set({ fadeout: f || undefined })} options={[{ value: "", label: "no" }, ...["1.0", "2.0", "4.0"].map(v => ({ value: v, label: `${+v}s` }))]} />
        </Row>
      );
    case "pov":
      return (
        <Row label="Whose thoughts">
          <Chips value={x.who} onChange={w => set({ who: w })}
            options={(m?.characters.filter(c => c.pov) ?? cast.map(id => ({ id }))).map(c => ({ value: c.id, label: look(m, c.id).name, color: look(m, c.id).color }))} />
        </Row>
      );
    case "date":
      return <>
        <Row label="Day"><input type="date" value={x.date} onChange={e => set({ date: e.target.value })} className={fieldCls} /></Row>
        <Row label="Time (optional)"><input value={x.time ?? ""} onChange={e => set({ time: e.target.value || undefined })} placeholder="12:56" className={fieldCls} /></Row>
      </>;
    case "time":
      return <Row label="Time"><input autoFocus value={x.time} onChange={e => set({ time: e.target.value })} placeholder="7:21" className={fieldCls} /></Row>;
    case "pause":
      return (
        <Row label="How long">
          <Chips value={x.seconds ?? ""} onChange={s => set({ seconds: s || undefined })}
            options={[...["0.5", "1.0", "2.0", "3.0"].map(v => ({ value: v, label: `${+v}s` })), { value: "", label: "until a click" }]} />
        </Row>
      );
    case "jump": case "call": {
      const all = [...(labels ?? m?.labels ?? [])].sort();
      return (
        <Row label="Label of the scene">
          <input autoFocus list="scene-labels" value={x.target} onChange={e => set({ target: e.target.value.trim() })} placeholder="sc_2025_04_07_mon" className={fieldCls} />
          <datalist id="scene-labels">{all.map(l => <option key={l} value={l} />)}</datalist>
        </Row>
      );
    }
    case "phone":
      return <>
        <Row label="The phone">
          <Chips value={x.action} onChange={a => set(a === "off" ? { action: "off", thread: undefined } : { action: a as "on" | "open" })}
            options={[{ value: "on", label: "comes out" }, { value: "open", label: "opens a chat" }, { value: "off", label: "goes away" }]} />
        </Row>
        {x.action !== "off" && (
          <Row label={x.action === "open" ? "Chat" : "Chat it shows (optional)"}>
            <input value={x.thread ?? ""} onChange={e => set({ thread: e.target.value || undefined })} placeholder="sakari" className={fieldCls} />
          </Row>
        )}
      </>;
    default: return null;
  }
}

function TransitionRow({ value, onChange, m, required }: { value?: string; onChange: (w: string | undefined) => void; m: Manifest | null; required?: boolean }) {
  // the game's own first (slow_fade, day_change, …), then the everyday Ren'Py ones
  const common = uniq([...(m?.transitions.slice(0, m.transitions.indexOf("dissolve") + 1) ?? []), "dissolve", "ease", "easeinright", "easeinleft", "easeoutright", "easeoutleft", value ?? ""]).filter(Boolean);
  return (
    <Row label="Transition">
      <Chips value={value ?? ""} onChange={w => onChange(w || undefined)} other
        options={[...(required ? [] : [{ value: "", label: "none" }]), ...common.map(v => ({ value: v }))]} />
    </Row>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-sans text-sm text-taupe">{label}</p>
      {children}
    </div>
  );
}

type Option = { value: string; label?: string; color?: string; missing?: boolean };

/** One-of-many as chips (quicker than a dropdown for a dozen names), plus "other" for something not listed. */
function Chips({ value, onChange, options, other }: { value: string; onChange: (v: string) => void; options: Option[]; other?: boolean }) {
  const [typing, setTyping] = useState(false);
  const listed = options.some(o => o.value === value);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => { setTyping(false); onChange(o.value); }}
          title={o.missing ? "The game has no file for this yet" : undefined}
          className={cn("h-7 rounded-md border px-2 font-talk text-sm transition-colors",
            o.value === value ? "border-caramel bg-caramel/15 text-paper" : "border-ink-line text-bone hover:border-taupe hover:text-paper",
            o.missing && "border-dashed")}
          style={o.color && o.value === value ? { borderColor: o.color, backgroundColor: `color-mix(in srgb, ${o.color} 18%, transparent)` } : undefined}>
          {o.color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-[1px]" style={{ background: o.color }} />}
          {o.label ?? o.value}
        </button>
      ))}
      {other && (typing || (!listed && value) ? (
        <input autoFocus={typing} value={value} onChange={e => onChange(e.target.value)} placeholder="name" aria-label="Other"
          className={cn(fieldCls, "h-7 w-36 text-sm")} />
      ) : (
        <button type="button" onClick={() => setTyping(true)} className="h-7 rounded-md px-2 font-talk text-sm text-taupe hover:text-paper">other…</button>
      ))}
    </div>
  );
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** Names this scene already uses that the game may not have files for yet. */
function usedInScript(s: Script) {
  const backgrounds: string[] = [], music: string[] = [], expressions: Record<string, string[]> = {};
  for (const p of s.parsed) {
    if (p?.kind !== "stmt") continue;
    const x = p.stmt;
    if (x.kind === "scene") backgrounds.push(x.image);
    if (x.kind === "play" && x.channel === "music") music.push(x.name);
    if (x.kind === "show" && x.attrs.length > 1) (expressions[x.tag] ??= []).push(x.attrs.slice(1).join(" "));
  }
  return { backgrounds, music, expressions };
}

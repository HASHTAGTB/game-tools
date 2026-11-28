import { useMemo, type ReactNode } from "react";
import { characterOf, type Manifest } from "@/shared/lib/game";
import { Chip } from "@/shared/ui/chip";
import { fieldCls } from "@/shared/ui/field";
import { look } from "../../lib/look";
import type { Script } from "../../lib/script";
import type { Stage } from "../../lib/stage";
import type { Stmt } from "../../lib/statements";
import { useKnownLabels } from "../../state";
import { BgPicker } from "./card/BgPicker";
import { DayPicker, TimePicker } from "./card/ClockPicker";
import { MusicPicker } from "./card/MusicPicker";
import { ShowPicker } from "./card/SpritePicker";
import { CardRow, NewName, TransitionStrip } from "./card/parts";
import { Segmented } from "@/shared/ui/segmented";

/** The fields a stage card shows when it's open: a picker for the game's backgrounds, sprites, music and transitions
 *  (dashed: no file for it yet), "+" or the search for any other name. And the first values a new card gets. */

/** The first values of each kind of new card; `expression` and `hide` are null while nobody is on stage. */
export type Defaults = Record<"scene" | "enter" | "play" | "stop" | "pov" | "date" | "time" | "pause" | "jump" | "phone", Stmt>
  & { expression: Stmt | null; hide: Stmt | null };

export function defaults(stage: Stage, cast: string[], m: Manifest | null, script: Script, line: number): Defaults {
  const offstage = [...cast, ...Object.keys(m?.sprites ?? {})].find(id => !stage.sprites.some(s => s.tag === id)) ?? cast[0] ?? "";
  const speaking = (() => { for (let i = line - 1; i >= 0; i--) { const p = script.parsed[i]; if (p?.kind === "say" && p.who) return p.who; } return null; })();
  const onstage = stage.sprites.find(s => s.tag === speaking) ?? stage.sprites[0];
  const firstLook = (tag: string) => {
    const outfits = m?.sprites[tag];
    const outfit = outfits ? Object.keys(outfits)[0] : "casual";
    return [outfit, ...(outfits?.[outfit]?.[0]?.split(" ") ?? [])];
  };
  return {
    scene: { kind: "scene", image: stage.background ?? m?.backgrounds.find(b => b !== "black") ?? "black", with: "dissolve" },
    enter: { kind: "show", tag: offstage, attrs: firstLook(offstage), at: "center", with: "dissolve" },
    expression: onstage ? { kind: "show", tag: onstage.tag, attrs: onstage.attrs.length ? onstage.attrs : firstLook(onstage.tag), with: "expr_change" } : null,
    hide: onstage ? { kind: "hide", tag: onstage.tag, with: "dissolve" } : null,
    play: { kind: "play", channel: "music", name: m?.music[0] ?? "casual", fadein: "2.0" },
    stop: { kind: "stop", channel: "music", fadeout: "2.0" },
    pov: { kind: "pov", who: stage.pov ?? cast.find(id => characterOf(m, id)?.pov) ?? "satoru" },
    date: { kind: "date", date: stage.date ?? new Date().toISOString().slice(0, 10), time: stage.time ?? undefined },
    time: { kind: "time", time: stage.time ?? "12:00" },
    pause: { kind: "pause", seconds: "1.0" },
    jump: { kind: "jump", target: "" },
    phone: { kind: "phone", action: "on" },
  };
}

export function Fields({ x, set, cast, m, stage, script, line }: {
  x: Stmt; set: (p: Partial<Stmt>) => void; cast: string[]; m: Manifest | null; stage: Stage; script: Script; line: number;
}) {
  const used = useMemo(() => usedInScript(script), [script]);
  const labels = useKnownLabels();
  const transition = (required?: boolean) => "with" in x &&
    <TransitionStrip value={x.with} onChange={w => set({ with: required ? w ?? "dissolve" : w })} m={m} line={line} required={required} />;
  switch (x.kind) {
    case "scene":
      return <>
        <BgPicker image={x.image} onPick={image => set({ image })} m={m} stage={stage} inScene={used.backgrounds} />
        {transition()}
      </>;
    case "show":
      return <>
        <ShowPicker x={x} set={set} m={m} stage={stage} cast={cast} />
        {transition()}
      </>;
    case "hide":
      return <>
        <CardRow label="Who">
          <People ids={uniq([...stage.sprites.map(s => s.tag), x.tag])} value={x.tag} onPick={tag => set({ tag })} m={m}>
            <NewName label="Someone else (their image tag)" placeholder="image tag" onAdd={tag => set({ tag })} />
          </People>
        </CardRow>
        {transition()}
      </>;
    case "with":
      return transition(true);
    case "play":
      return <>
        {x.channel === "music"
          ? <MusicPicker name={x.name} onPick={name => set({ name })} m={m} before={stage.music} inScene={used.music} />
          : <CardRow label="Sound">
              {/* written on Enter or leaving it, not on every key */}
              <input key={x.name} defaultValue={x.name} placeholder="sound name" aria-label="Sound" className={fieldCls}
                onBlur={e => { const n = e.target.value.trim(); if (n && n !== x.name) set({ name: n }); }}
                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
            </CardRow>}
        <CardRow label="Fade in"><Fade value={x.fadein} onChange={fadein => set({ fadein })} /></CardRow>
      </>;
    case "stop":
      return <CardRow label="Fade out"><Fade value={x.fadeout} onChange={fadeout => set({ fadeout })} /></CardRow>;
    case "pov":
      return (
        <CardRow label="Whose thoughts">
          <People ids={m?.characters.filter(c => c.pov).map(c => c.id) ?? cast} value={x.who} onPick={who => set({ who })} m={m} />
        </CardRow>
      );
    case "date":
      return <>
        <DayPicker date={x.date} onChange={date => set({ date })} before={stage.date} />
        <CardRow label="Time"
          aside={<Segmented label="Time" value={x.time ? "set" : "none"} onChange={v => set({ time: v === "set" ? stage.time ?? "12:00" : undefined })}
            options={[{ value: "none", label: "keep the clock" }, { value: "set", label: "set the clock" }]} />}>
          {x.time
            ? <TimePicker time={x.time} onChange={time => set({ time })} before={stage.time} date={x.date} sameDay={stage.date === x.date} />
            : <p className="font-talk text-sm text-taupe">The clock stays at {stage.time ?? "what it was"}.</p>}
        </CardRow>
      </>;
    case "time":
      return <TimePicker time={x.time} onChange={time => set({ time })} before={stage.time} date={stage.date} autoFocus />;
    case "pause":
      return (
        <CardRow label="How long">
          <Segmented label="How long" value={x.seconds ?? ""} onChange={s => set({ seconds: s || undefined })}
            options={[...["0.5", "1.0", "2.0", "3.0"].map(v => ({ value: v, label: `${+v}s` })), { value: "", label: "until a click" }]} />
        </CardRow>
      );
    case "jump": case "call": {
      const all = [...(labels ?? m?.labels ?? [])].sort();
      return (
        <CardRow label="Label of the scene">
          <input autoFocus list="scene-labels" value={x.target} onChange={e => set({ target: e.target.value.trim() })} placeholder="sc_2025_04_07_mon" className={fieldCls} />
          <datalist id="scene-labels">{all.map(l => <option key={l} value={l} />)}</datalist>
        </CardRow>
      );
    }
    case "phone":
      return <>
        <CardRow label="The phone">
          <Segmented label="The phone" value={x.action} onChange={a => set(a === "off" ? { action: "off", thread: undefined } : { action: a })}
            options={[{ value: "on", label: "comes out" }, { value: "open", label: "opens a chat" }, { value: "off", label: "goes away" }]} />
        </CardRow>
        {x.action !== "off" && (
          <CardRow label={x.action === "open" ? "Chat" : "Chat it shows (optional)"}>
            <input value={x.thread ?? ""} onChange={e => set({ thread: e.target.value || undefined })} placeholder="sakari" className={fieldCls} />
          </CardRow>
        )}
      </>;
    default: return null;
  }
}

/** Characters as chips in their colour (hide: who goes; POV: whose thoughts). `children`: after the chips. */
function People({ ids, value, onPick, m, children }: { ids: string[]; value: string; onPick: (id: string) => void; m: Manifest | null; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ids.map(id => { const c = look(m, id); return <Chip key={id} color={c.legible} pressed={id === value} onClick={() => onPick(id)}>{c.name}</Chip>; })}
      {children}
    </div>
  );
}

/** A fade's length: none, 1, 2 or 4 seconds, or "+" for any other. */
function Fade({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const steps = ["1.0", "2.0", "4.0"];
  return (
    <Segmented label="Fade" value={value ?? ""} onChange={v => onChange(v || undefined)}
      options={[{ value: "", label: "no" }, ...[...steps, ...(value && !steps.includes(value) ? [value] : [])].map(v => ({ value: v, label: `${+v}s` }))]}>
      <NewName label="Another length (seconds)" placeholder="seconds" onAdd={v => { const n = parseFloat(v); if (n > 0) onChange(Number.isInteger(n) ? n.toFixed(1) : String(n)); }} />
    </Segmented>
  );
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** Names this scene already uses that the game may not have files for yet. */
function usedInScript(s: Script) {
  const backgrounds: string[] = [], music: string[] = [];
  for (const p of s.parsed) {
    if (p?.kind !== "stmt") continue;
    const x = p.stmt;
    if (x.kind === "scene") backgrounds.push(x.image);
    if (x.kind === "play" && x.channel === "music") music.push(x.name);
  }
  return { backgrounds: uniq(backgrounds), music };
}

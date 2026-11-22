import { ExternalLink, Plus } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { RosterCharacter } from "@/shared/lib/roster";
import { IconButton } from "@/shared/ui/icon-button";
import { visible } from "../lib/colors";
import { formatDate, parseDate } from "../lib/duration";
import { allEvents, newId, findEvent } from "../lib/edit";
import { narratorChar, obsidianLink, RENPY, STATUSES, type Scene } from "../lib/scenes";
import type { Arc, StoryEvent } from "../lib/types";
import { useTimeline } from "../state";
import { inputCls } from "./fields";

const STATUS_COLOR: Record<string, string> = {
  idea: "var(--color-taupe)", outline: "var(--color-periwinkle)", draft: "var(--color-butter)", revision: "var(--color-caramel)", final: "#6fcf8e",
};
const RENPY_COLOR: Record<string, string> = { no: "var(--color-taupe)", basic: "var(--color-butter)", full: "var(--color-caramel)", production: "#6fcf8e" };

export const statusColor = (s?: string) => (s && STATUS_COLOR[s]) || "var(--color-ink-line)";

function Badge({ label, value, colors, steps }: { label: string; value?: string; colors: Record<string, string>; steps: string[] }) {
  const i = value ? steps.indexOf(value) : -1;
  return (
    <span title={`${label}: ${value ?? "not set"} (${steps.join(" → ")})`}
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-talk text-[11px]"
      style={{ borderColor: value ? colors[value] ?? "var(--color-ink-line)" : "var(--color-ink-line)", color: value ? colors[value] ?? "var(--color-bone)" : "var(--color-taupe)" }}>
      {label} {value ?? "—"}
      <span className="flex gap-px">{steps.map((st, j) => <span key={st} className="h-1.5 w-1 rounded-[1px]" style={{ background: j <= i ? "currentColor" : "var(--color-ink-line)" }} />)}</span>
    </span>
  );
}

export function SceneBadges({ scene }: { scene: Scene }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge label="status" value={scene.status} colors={STATUS_COLOR} steps={STATUSES} />
      <Badge label="renpy" value={scene.renpy} colors={RENPY_COLOR} steps={RENPY} />
    </span>
  );
}

/** POV characters of a scene, from its narrator variables. */
export function Pov({ scene, roster }: { scene: Scene; roster: RosterCharacter[] }) {
  if (!scene.narrators.length) return null;
  return (
    <span className="font-talk text-[12px] text-taupe">
      POV {scene.narrators.map((n, i) => {
        const c = narratorChar(n, roster);
        return <span key={n}>{i > 0 && " → "}<span style={{ color: c ? visible(c.color) : undefined }}>{c?.name ?? n}</span></span>;
      })}
    </span>
  );
}

export function OpenInObsidian({ path }: { path: string }) {
  const vault = useTimeline(s => s.loc?.name);
  if (!vault) return null;
  return <IconButton icon={ExternalLink} size="sm" label="Open in Obsidian" onClick={() => { window.location.href = obsidianLink(vault, path); }} />;
}

/** The event panel's scene link: pick a scene file, see its state, take over its date. */
export function SceneField({ event, arc, onLink, onPin }: { event: StoryEvent; arc: Arc; onLink: (path: string | null) => void; onPin: (date: string) => void }) {
  const { scenes, doc, res, loc } = useTimeline();
  if (loc?.kind === "browser") return null;
  const scene = scenes.find(s => s.path === event.scene);
  const span = res.events.get(event.id);
  const sceneDate = scene?.date ? parseDate(scene.date) : null;
  const differs = sceneDate && span && Math.abs(sceneDate.hours - span.start) > 0.01;
  const inArc = scenes.filter(s => arc.folder && s.path.startsWith(arc.folder + "/"));
  const others = scenes.filter(s => !inArc.includes(s));
  const usedBy = new Map(allEvents(doc.arcs).filter(e => e.scene && e.id !== event.id).map(e => [e.scene!, e]));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <select value={event.scene ?? ""} onChange={e => onLink(e.target.value || null)} className={inputCls}>
          <option value="">— no scene —</option>
          {event.scene && !scene && <option value={event.scene}>missing: {event.scene}</option>}
          {inArc.length > 0 && <optgroup label={arc.name}>{inArc.map(s => <option key={s.path} value={s.path}>{s.name}{usedBy.has(s.path) ? " (also elsewhere)" : ""}</option>)}</optgroup>}
          {others.length > 0 && <optgroup label="Other scenes">{others.map(s => <option key={s.path} value={s.path}>{s.folder ? `${s.folder} / ` : ""}{s.name}</option>)}</optgroup>}
        </select>
        {event.scene && <OpenInObsidian path={event.scene} />}
      </div>
      {event.scene && !scene && scenes.length > 0 && <p className="font-talk text-[12px] text-coral">This scene file doesn't exist (any more).</p>}
      {scene && (
        <div className="space-y-1.5">
          <SceneBadges scene={scene} />
          <div className="flex flex-wrap items-center gap-x-3"><Pov scene={scene} roster={doc.roster} />{scene.owner && <span className="font-talk text-[12px] text-taupe">owner {scene.owner}</span>}</div>
          {sceneDate && (
            <p className="font-talk text-[12px] text-taupe">
              set_date {formatDate(sceneDate.hours, sceneDate.precision)}
              {differs && <button onClick={() => onPin(scene.date!)} className="ml-2 font-sans text-[13px] text-caramel underline-offset-4 hover:underline">Use this date</button>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** A new event for a scene file: told by its first narrator, at its set_date (or the arc's start). */
export function eventForScene(arcs: Arc[], arcId: string, scene: Scene, roster: RosterCharacter[]): StoryEvent | null {
  const arc = arcs.find(a => a.id === arcId);
  if (!arc) return null;
  const char = (scene.narrators[0] && narratorChar(scene.narrators[0], roster))
    || roster.find(c => scene.chars.some(n => n.split(" ")[0].toLowerCase() === c.name.toLowerCase()))
    || roster[0];
  if (!char) return null;
  const e: StoryEvent = {
    id: newId(char.id, id => !!findEvent(arcs, id)), chars: [char.id], text: scene.name,
    when: scene.date && parseDate(scene.date) ? { at: scene.date } : { from: { arc: arc.id } }, scene: scene.path,
  };
  arc.events.push(e);
  return e;
}

/** Scenes in an arc's folder and which event tells each one. */
export function ArcScenes({ arc }: { arc: Arc }) {
  const { scenes, doc, edit, select } = useTimeline();
  if (!arc.folder) return null;
  const list = scenes.filter(s => s.path.startsWith(arc.folder + "/"));
  if (!list.length) return <p className="font-talk text-[12px] text-taupe">No scene files in {arc.folder}.</p>;
  const byScene = new Map(allEvents(doc.arcs).filter(e => e.scene).map(e => [e.scene!, e]));
  return (
    <ul className="space-y-1.5">
      {list.map(s => {
        const ev = byScene.get(s.path);
        return (
          <li key={s.path} className="group/scene flex items-start gap-2">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor(s.status) }} title={`status: ${s.status ?? "not set"}`} />
            <div className="min-w-0 flex-1">
              <button onClick={() => ev && select({ kind: "event", id: ev.id })} disabled={!ev}
                className={cn("block max-w-full truncate text-left font-talk text-[13px]", ev ? "text-bone hover:text-paper hover:underline" : "text-bone")}>{s.name}</button>
              <span className="block font-talk text-[11px] text-taupe">{ev ? "on the timeline" : "not on the timeline yet"}{s.renpy ? ` · renpy ${s.renpy}` : ""}</span>
            </div>
            {!ev && (
              <IconButton icon={Plus} size="sm" label="Add as event" onClick={() => {
                let made: string | null = null;
                edit(d => { made = eventForScene(d.arcs, arc.id, s, d.roster)?.id ?? null; });
                if (made) select({ kind: "event", id: made });
              }} />
            )}
            <OpenInObsidian path={s.path} />
          </li>
        );
      })}
    </ul>
  );
}

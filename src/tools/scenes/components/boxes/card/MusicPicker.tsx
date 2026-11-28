import { Pause, Play, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import type { Manifest } from "@/shared/lib/game";
import { isLfsPointer } from "@/shared/lib/assetUrl";
import { joinPath } from "@/shared/lib/paths";
import { GAME_DIR } from "@/shared/lib/places";
import { cn } from "@/shared/lib/utils";
import { readBytes } from "@/shared/lib/workspace";
import { SearchField } from "@/shared/ui/search-field";
import { Slider } from "@/shared/ui/slider";
import { useSceneIndex } from "../../../state";
import { UseTyped } from "./parts";

/** The music card's list: every track with a button to listen (in the tool only; picking is clicking the row), how
 *  often the scenes use it, the track playing before this line, and the `not_used/` ones dimmed at the end. */

// ---------------------------------------------------------------- listening

type Player = { playing: string | null; at: number; lengths: Record<string, number>; volume: number };
const VOLUME_KEY = "scenes-listen-volume";
const savedVolume = () => { try { const v = Number(localStorage.getItem(VOLUME_KEY)); return v > 0 && v <= 1 ? v : 0.6; } catch { return 0.6; } };
const usePlayer = create<Player>(() => ({ playing: null, at: 0, lengths: {}, volume: savedVolume() }));
let audio: HTMLAudioElement | null = null;

function setVolume(volume: number) {
  usePlayer.setState({ volume });
  if (audio) audio.volume = volume;
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* not kept */ }
}
const urls = new Map<string, Promise<string | null>>();

function urlOf(file: string) {
  let u = urls.get(file);
  if (!u) {
    u = readBytes(joinPath(GAME_DIR, "assets", file)).then(async b => (b && !(await isLfsPointer(b)) ? URL.createObjectURL(b) : null)).catch(() => null);
    urls.set(file, u);
  }
  return u;
}

export function stopTrack() {
  audio?.pause();
  usePlayer.setState({ playing: null, at: 0 });
}

async function toggle(name: string, file: string | undefined) {
  if (usePlayer.getState().playing === name) return stopTrack();
  stopTrack();
  if (!file) return;
  usePlayer.setState({ playing: name, at: 0 });
  const url = await urlOf(file);
  if (!url || usePlayer.getState().playing !== name) { if (!url) stopTrack(); return; }
  audio ??= new Audio();
  audio.src = url;
  audio.volume = usePlayer.getState().volume;
  audio.ontimeupdate = () => audio && usePlayer.setState({ at: audio.duration ? audio.currentTime / audio.duration : 0 });
  audio.onloadedmetadata = () => audio && usePlayer.setState(s => ({ lengths: { ...s.lengths, [name]: audio!.duration } }));
  audio.onended = stopTrack;
  audio.play().catch(stopTrack);
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---------------------------------------------------------------- the list

export function MusicPicker({ name, onPick, m, before, inScene }: {
  name: string; onPick: (name: string) => void; m: Manifest | null;
  /** the track playing before this line */
  before: string | null;
  inScene: string[];
}) {
  const [query, setQuery] = useState("");
  const files = useSceneIndex(i => i.files);
  const uses = useMemo(() => {
    const n = new Map<string, number>();
    for (const f of Object.values(files ?? {})) for (const t of f.uses.music) n.set(t, (n.get(t) ?? 0) + 1);
    return n;
  }, [files]);
  // stop listening when the card closes
  useEffect(() => stopTrack, []);

  const used = m?.music ?? [], unused = m?.musicUnused ?? [];
  const unknown = [...new Set([...inScene, name])].filter(t => t && !!m?.media && !used.includes(t) && !unused.includes(t));
  const q = query.toLowerCase().trim();
  const rows = [...used.map(t => ({ t, dim: false })), ...unknown.map(t => ({ t, dim: false })), ...unused.map(t => ({ t, dim: true }))]
    .filter(r => !q || r.t.toLowerCase().includes(q));
  const listed = rows.some(r => r.t === name);
  const known = (t: string) => used.includes(t) || unused.includes(t) || unknown.includes(t);
  const use = (t: string) => { setQuery(""); onPick(t); };

  return <>
    <div className="flex items-end gap-4">
      <SearchField value={query} onValueChange={setQuery} placeholder="Type a track…" data-card-search aria-label="Search tracks" className="flex-1"
        onKeyDown={e => { if (e.key === "Enter" && q) { e.preventDefault(); use(rows[0]?.t ?? query.trim()); } }} />
      <Volume />
    </div>
    <UseTyped query={query} known={known} what="a track" onUse={use} />
    <div data-grid className="bx-scroll flex flex-col gap-0.5">
      {rows.map(({ t, dim }, i) => (
        <Track key={t} name={t} file={m?.audioFiles?.[t]} picked={t === name} dim={dim} missing={unknown.includes(t)}
          before={t === before && t !== name} uses={uses.get(t) ?? 0} tab={t === name || (!listed && i === 0) ? 0 : -1} onPick={() => onPick(t)} />
      ))}
      {!rows.length && <p className="font-talk text-sm text-taupe">No track matches "{query}".</p>}
    </div>
  </>;
}

/** How loud listening in the tool is (kept for next time; the game's own volume isn't touched). */
function Volume() {
  const volume = usePlayer(s => s.volume);
  return (
    <label className="flex h-10 items-center gap-2 text-taupe" title="Listening volume (in the tool only)">
      <Volume2 className="h-4 w-4" />
      <Slider value={volume} onChange={setVolume} label="Listening volume" />
    </label>
  );
}

function Track({ name, file, picked, dim, missing, before, uses, tab, onPick }: {
  name: string; file?: string; picked: boolean; dim: boolean; missing: boolean; before: boolean; uses: number; tab: number; onPick: () => void;
}) {
  const playing = usePlayer(s => s.playing === name);
  const at = usePlayer(s => (s.playing === name ? s.at : 0));
  const length = usePlayer(s => s.lengths[name]);
  return (
    <div role="button" tabIndex={tab} data-tile onClick={onPick}
      onKeyDown={e => { if (e.key === "Enter") onPick(); if (e.key === " ") { e.preventDefault(); void toggle(name, file); } }}
      className={cn("bx-track", picked && "bx-tile-on", dim && "opacity-60", missing && "bx-track-missing")}>
      <button type="button" tabIndex={-1} className="bx-play" disabled={!file} aria-label={playing ? `Stop ${name}` : `Listen to ${name}`}
        title={file ? (playing ? "Stop" : "Listen") : "The game has no file for this"}
        onClick={e => { e.stopPropagation(); void toggle(name, file); }}>
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <span className="min-w-0">
        <span className="font-sans text-[15px] text-paper">{name}</span>
        <span className="block font-talk text-xs text-taupe">
          {before ? "playing before this · " : ""}{missing ? "no file yet" : dim ? "not_used/" : uses ? `used in ${uses} scene${uses > 1 ? "s" : ""}` : "not used yet"}
        </span>
      </span>
      <span className="bx-track-bar" aria-hidden><i style={{ width: `${at * 100}%` }} /></span>
      <span className="text-right font-mono text-xs text-taupe">{length ? mmss(length) : ""}</span>
    </div>
  );
}

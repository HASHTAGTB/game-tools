import { Layers, Moon, Sun, Sunrise, Sunset, type LucideIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AssetImage } from "@/shared/lib/assetUrl";
import type { Manifest } from "@/shared/lib/game";
import { parseClock, phaseAt, sunOf, useSunTable, type Phase } from "@/shared/lib/sun";
import { cn } from "@/shared/lib/utils";
import { SearchField } from "@/shared/ui/search-field";
import { Segmented } from "@/shared/ui/segmented";
import { closestVersion, extrasAt, findVersion, placesOf, timesOf, versionLabel, type BgVersion, type Place } from "../../../lib/bgPlaces";
import type { Stage } from "../../../lib/stage";
import { peekAt } from "../../../lib/ui";
import { useSceneIndex, useScenes } from "../../../state";
import { CardRow, Hint, UseTyped } from "./parts";
import { tabStop } from "./keys";
import { ThumbImg, useLazyThumb } from "./thumb";

/** The background card's picker: one tile per place (its versions switched in the bar under the grid), the places
 *  this scene and its chapter already use first, a search and a filter per folder. Hovering a tile shows it in the
 *  preview. */

export const PHASE_ICON: Record<Phase, LucideIcon> = { morning: Sunrise, day: Sun, evening: Sunset, night: Moon };

const placesCache = new WeakMap<object, Place[]>();
export function usePlaces(m: Manifest | null) {
  if (!m) return [];
  let p = placesCache.get(m);
  if (!p) placesCache.set(m, p = placesOf(m));
  return p;
}

/** The scene's chapter's other scenes' backgrounds, the latest first (scenes by path, as the list orders them). */
function useChapterBackgrounds(): string[] {
  const path = useScenes(s => s.path);
  const files = useSceneIndex(i => i.files);
  return useMemo(() => {
    if (!files || !path) return [];
    const chapter = files[path]?.info.chapter;
    if (!chapter) return [];
    const others = Object.entries(files).filter(([p, f]) => p !== path && f.info.chapter === chapter)
      .sort(([, a], [, b]) => (b.info.title || "").localeCompare(a.info.title || ""));
    return [...new Set(others.flatMap(([, f]) => [...f.uses.backgrounds].reverse()))];
  }, [files, path]);
}

export function BgPicker({ image, onPick, m, stage, inScene }: {
  image: string; onPick: (image: string) => void; m: Manifest | null; stage: Stage;
  /** backgrounds this scene uses (in order) */
  inScene: string[];
}) {
  const places = usePlaces(m);
  // the scene's own backgrounds as they were when the card opened: picking one mustn't reshuffle the rows above the
  // grid (the old pick leaving "no file yet", the new one joining "In this scene")
  const [opened] = useState(() => ({ inScene, image }));
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("all");
  const chapter = useChapterBackgrounds();
  const cur = findVersion(places, image);
  const sun = sunOf(useSunTable(), stage.date);

  const folders = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of places) n.set(p.folder, (n.get(p.folder) ?? 0) + p.versions.length);
    const order = (f: string) => (f === "main" ? "" : f);
    return [...n].sort(([a], [b]) => order(a).localeCompare(order(b)));
  }, [places]);
  const total = folders.reduce((a, [, n]) => a + n, 0);

  const words = query.toLowerCase().trim().split(/[\s_]+/).filter(Boolean);
  const shown = places.filter(p => (folder === "all" || p.folder === folder)
    && words.every(w => p.label.toLowerCase().includes(w) || p.versions.some(v => v.name.includes(w))));
  const filtering = !!words.length || folder !== "all";

  const shelf = (names: string[]) => names.map(n => findVersion(places, n)).filter(x => !!x).slice(0, 12);
  const sceneShelf = shelf(opened.inScene);
  const chapterShelf = shelf(chapter.filter(n => !opened.inScene.includes(n)));
  const unknown = [...new Set([...opened.inScene, opened.image, image])].filter(n => n && n !== "black" && !!m?.media && !m.backgrounds.includes(n));

  // the version a tile shows: the picked one in its place, else the one closest to the picked version
  const like = cur?.version ?? null;
  // the same function every render, so the tiles (memo) don't all draw again
  const latest = useRef(onPick);
  latest.current = onPick;
  const pick = useCallback((v: BgVersion) => { peekAt(null); latest.current(v.name); }, []);

  // the time at the card's line asks for a version this place has, other than the picked one
  const minutes = parseClock(stage.time);
  const want = minutes === null ? null : phaseAt(sun, minutes);
  const suggestion = cur && want && cur.version.phase !== want
    ? cur.place.versions.find(v => v.phase === want && v.extras === cur.version.extras) ?? cur.place.versions.find(v => v.phase === want)
    : undefined;

  const known = (n: string) => n === "black" || !!m?.backgrounds.includes(n) || unknown.includes(n);
  // Enter in the search: the first match, else the typed name
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !query.trim()) return;
    e.preventDefault();
    const first = shown[0];
    onPick(first ? (cur?.place === first ? cur.version : closestVersion(first, like)).name : query.trim());
  };

  return <>
    <div className="flex flex-col gap-2">
      <SearchField value={query} onValueChange={setQuery} onKeyDown={onSearchKey} placeholder="Type a place: hallway, rooftop, night…" data-card-search aria-label="Search backgrounds" />
      <UseTyped query={query} known={known} what="a background" onUse={n => { setQuery(""); onPick(n); }} />
      <Segmented label="Folder" value={folder} onChange={setFolder} className="self-start"
        options={[["all", total] as const, ...folders].map(([f, n]) => ({ value: f, label: <>{f === "all" ? "All" : f}<span className="text-xs text-taupe">{n.toLocaleString("en")}</span></> }))} />
    </div>

    {!filtering && sceneShelf.length > 0 && (
      <CardRow label="In this scene">
        <Grid small items={sceneShelf.map(x => ({ place: x.place, version: x.version, exact: true }))} image={image} m={m} onPick={pick} />
      </CardRow>
    )}
    {!filtering && chapterShelf.length > 0 && (
      <CardRow label="Earlier in this chapter">
        <Grid small items={chapterShelf.map(x => ({ place: x.place, version: x.version, exact: true }))} image={image} m={m} onPick={pick} />
      </CardRow>
    )}
    {unknown.length > 0 && (
      <CardRow label="Used here, no file yet">
        <Segmented label="Used here, no file yet" value={image} onChange={onPick} options={unknown.map(n => ({ value: n, missing: true }))} />
      </CardRow>
    )}
    <CardRow label={filtering ? "Matches" : "All places"} aside={<span className="font-talk text-xs">{shown.length} places</span>}>
      {shown.length
        ? <Grid scroll items={shown.map(p => ({ place: p, version: cur?.place === p ? cur.version : closestVersion(p, like), exact: false }))} image={image} m={m} onPick={pick}
            black={folder === "all" && words.every(w => "black".includes(w)) ? () => onPick("black") : null} />
        : <p className="font-talk text-sm text-taupe">No place matches "{query}".</p>}
    </CardRow>

    <VersionBar cur={cur ?? null} onPick={onPick}
      hint={suggestion && want && (
        <Hint icon={PHASE_ICON[want]} action={`Use ${want}`} onAction={() => onPick(suggestion.name)}>
          It's {stage.time} here, and this place has {want === "evening" ? "an" : "a"} {want} version.
        </Hint>
      )} />
  </>;
}

type Item = { place: Place; version: BgVersion; exact: boolean };

/** `black`: a plain black tile first (picks "black"), or null for none. */
function Grid({ items, image, m, onPick, small, scroll, black = null }: {
  items: Item[]; image: string; m: Manifest | null; onPick: (v: BgVersion) => void; small?: boolean; scroll?: boolean; black?: (() => void) | null;
}) {
  const anyPicked = image === "black" || items.some(i => i.version.name === image || (!i.exact && i.place.versions.some(v => v.name === image)));
  const limit = useGrowing(items.length);
  return (
    <div data-grid className={cn("bx-grid", small && "bx-grid-sm", scroll && "bx-scroll")} onPointerLeave={() => peekAt(null)}>
      {black && (
        <button type="button" data-tile tabIndex={tabStop(image === "black", 0, anyPicked)} className={cn("bx-tile", image === "black" && "bx-tile-on")}
          onClick={black} onPointerEnter={() => peekAt({ stage: { background: "black", sprites: [] } })} onFocus={() => peekAt({ stage: { background: "black", sprites: [] } })}>
          <span className="bx-th" style={{ background: "#000" }} />
          <span className="bx-tile-name">black</span>
        </button>
      )}
      {items.slice(0, limit).map((it, i) => {
        const picked = it.exact ? it.version.name === image : it.place.versions.some(v => v.name === image);
        return <Tile key={`${it.place.id}:${it.exact ? it.version.name : ""}`} item={it} picked={picked} tab={tabStop(picked, black ? i + 1 : i, anyPicked)}
          file={m?.imageFiles[it.version.name] ?? null} onPick={onPick} />;
      })}
    </div>
  );
}

/** How many of `n` tiles to draw: a first screenful right away, the rest a chunk per frame after, so opening the card
 *  (and its morph) doesn't wait for 800 tiles. */
function useGrowing(n: number) {
  const [limit, setLimit] = useState(48);
  useEffect(() => {
    if (limit >= n) return;
    const f = requestAnimationFrame(() => setLimit(l => l + 96));
    return () => cancelAnimationFrame(f);
  }, [limit, n]);
  return limit;
}

const Tile = memo(function Tile({ item: { place, version, exact }, picked, tab, file, onPick }: {
  item: Item; picked: boolean; tab: number; file: string | null; onPick: (v: BgVersion) => void;
}) {
  const { ref, thumb } = useLazyThumb(file);
  const peek = (img: AssetImage | null) => {
    // only with an image in hand: on GitHub a missing thumbnail would mean downloading the full image
    if (img && file) peekAt({ stage: { background: version.name, sprites: [] }, images: { [file]: img } });
  };
  const phases = [...new Set(place.versions.map(v => v.phase))];
  return (
    <button ref={ref} type="button" data-tile tabIndex={tab} className={cn("bx-tile", picked && "bx-tile-on")} title={version.name}
      onClick={() => onPick(version)} onPointerEnter={() => peek(thumb.img)} onFocus={() => peek(thumb.img)}>
      <ThumbImg thumb={thumb} file={file} />
      <span className="bx-tile-name">
        {place.layer && <Layers className="mr-1 inline h-3 w-3 align-[-1px] text-caramel" aria-label="Layer piece" />}
        {place.label}
        {exact && version.key && <span className="text-taupe"> · {versionLabel(version)}</span>}
      </span>
      {!exact && (
        <span className="bx-tile-dots">
          {phases.map(p => <i key={p ?? "none"} className={`bx-dot-${p ?? "none"}`} title={p ?? "no time"} />)}
          {place.versions.length > phases.length && <span>+{place.versions.length - phases.length}</span>}
        </span>
      )}
    </button>
  );
});

/** The picked place's versions: its time words, then what else differs at that time (lights, curtains …), and the
 *  hint when the clock asks for another one. Always there at the same height, so picking a place moves nothing. */
function VersionBar({ cur, hint, onPick }: { cur: { place: Place; version: BgVersion } | null; hint: ReactNode; onPick: (name: string) => void }) {
  const timeLabel = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : "No time");
  if (!cur) return (
    <CardRow label="Versions">
      <div className="flex min-h-10 flex-wrap items-center gap-2">
        <span className="font-talk text-sm text-taupe">Pick a place to switch its time and lights here.</span>
        {hint}
      </div>
    </CardRow>
  );
  const { place, version } = cur;
  const times = timesOf(place);
  const here = extrasAt(place, version.time);
  const one = times.length <= 1 && here.length <= 1;
  return (
    <CardRow label={`${place.label}: versions`}>
      <div className="flex min-h-10 flex-wrap items-center gap-2">
      {one && <span className="font-talk text-sm text-taupe">This place has one version.</span>}
      {times.length > 1 && (
        <Segmented label="Time" value={version.time} onChange={t => onPick(closestVersion({ ...place, versions: extrasAt(place, t) }, version).name)}
          options={times.map(t => ({ value: t, label: timeLabel(t) }))} />
      )}
      {here.length > 1 && (
        <Segmented label="Version" value={version.name} onChange={onPick}
          options={here.map(v => ({ value: v.name, label: v.extras || "plain" }))} />
      )}
      {hint && <div className="ml-auto">{hint}</div>}
      </div>
    </CardRow>
  );
}

import { CalendarDays, Clock, Eye, Music, Wrench } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { boxLook, characterOf, useGame, type Manifest } from "@/shared/lib/game";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { m, spring, useReducedMotion } from "@/shared/ui/motion";
import type { Problem } from "../lib/checks";
import { look } from "../lib/look";
import { EMPTY_STAGE, placeOf, playScript, type Stage } from "../lib/stage";
import { beatsOf, type Beat } from "../lib/renpyText";
import { useSceneUi } from "../lib/ui";
import { useScenes } from "../state";
import { applyFixes } from "../lib/fixes";
import { DOT, FixButton } from "./problems";

/** Beside the script: what the player sees at the cursor (background, sprites, the textbox writing the line out with
 *  its pauses), and the scene's problems. */
export function Preview() {
  const script = useSceneUi(s => s.script);
  const line = useSceneUi(s => s.line);
  const moved = useSceneUi(s => s.moved);
  const manifest = useGame(s => s.manifest);
  const loaded = useGame(s => s.loaded);

  const stages = useMemo(() => (script ? playScript(script) : []), [script]);
  const stage = stages[line - 1] ?? EMPTY_STAGE;

  // the line in the textbox: the one at the cursor, or the last one before it
  let say: { who: string | null; raw: string; n: number } | null = null;
  if (script) {
    for (let i = Math.min(line, script.lines.length) - 1; i >= 0; i--) {
      const p = script.parsed[i];
      if (p?.kind === "say") { say = { who: p.who, raw: script.lines[i].slice(p.from, p.to), n: i + 1 }; break; }
      if (p?.kind === "stmt" && p.stmt.kind === "scene") break;
    }
  }

  return (
    <aside className="flex h-full min-h-0 flex-col gap-4 border-l border-ink-line/60 p-5">
      <div className="shrink-0 space-y-4">
        <StageView stage={stage} manifest={manifest} />
        <Facts stage={stage} manifest={manifest} />
        <TextboxPreview say={say} pov={stage.pov} manifest={manifest} restart={moved} />
      </div>
      {loaded && !manifest && (
        <p className="shrink-0 rounded-lg border border-dashed border-ink-line p-3 font-talk text-sm text-taupe">
          No game data yet, so names, sprites and backgrounds can't be checked. Run <code className="text-bone">python3 tools/export_manifest.py</code> in
          the game's folder; it writes <code className="text-bone">.game-tools/renpy.json</code> here.
        </p>
      )}
      <Problems />
    </aside>
  );
}

// ---------------------------------------------------------------- the stage

/** The background's name as a dim backdrop (the app can't load the game's images), sprites as tinted figures where
 *  they stand. They slide when someone moves. */
function StageView({ stage, manifest }: { stage: Stage; manifest: Manifest | null }) {
  const bg = stage.background;
  const hue = bg ? [...bg].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7) : 0;
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-ink-line"
      style={{ background: !bg || bg === "black" ? "#000" : `linear-gradient(180deg, hsl(${hue} 22% 30%), hsl(${(hue + 40) % 360} 18% 16%))` }}>
      {bg && bg !== "black" && (
        <span className="absolute left-3 top-2 max-w-[80%] truncate font-talk text-xs text-paper/70" title={manifest?.backgrounds.includes(bg) ? bg : `${bg} (no image in the game yet)`}>
          {bg}{manifest && !manifest.backgrounds.includes(bg) && " ·  no image yet"}
        </span>
      )}
      {!bg && <span className="absolute inset-0 grid place-items-center font-talk text-sm text-taupe">No background yet</span>}
      {stage.sprites.map(sp => {
        const { x, scale } = placeOf(sp.at, manifest?.positions);
        const c = look(manifest, sp.tag);
        const h = 74 * scale;
        return (
          <m.div key={sp.tag} layout="position" transition={spring.smooth}
            className="absolute bottom-0 flex flex-col items-center justify-start rounded-t-[999px] pt-[14%]"
            style={{ left: `${x * 100}%`, height: `${h}%`, width: `${h * 0.34}%`, translate: "-50% 0", background: `color-mix(in srgb, ${c.color} 42%, #1f1c1a)`, boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${c.color} 70%, transparent)` }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <span className="max-w-full truncate px-1 font-sans text-xs font-semibold text-paper">{c.name}</span>
            <span className="max-w-full truncate px-1 text-center font-talk text-[11px] leading-tight text-paper/75">{sp.attrs.slice(1).join(" ")}</span>
          </m.div>
        );
      })}
    </div>
  );
}

function Facts({ stage, manifest }: { stage: Stage; manifest: Manifest | null }) {
  const d = stage.date && /^(\d{4})-(\d{2})-(\d{2})$/.exec(stage.date);
  const pov = stage.pov && look(manifest, stage.pov);
  const item = "flex items-center gap-1.5";
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-talk text-sm text-taupe">
      <span className={item}><Eye className="h-3.5 w-3.5" />{pov ? <span style={{ color: pov.color }}>{pov.name}</span> : "no POV"}</span>
      <span className={item}><Music className="h-3.5 w-3.5" />{stage.music ?? "silence"}</span>
      {d && <span className={item}><CalendarDays className="h-3.5 w-3.5" />{`${d[3]}.${d[2]}.${d[1]}`}</span>}
      {stage.time && <span className={item}><Clock className="h-3.5 w-3.5" />{stage.time}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- the textbox

/** The game's textbox for the line: the speaker's colour, the POV's for narration, written out like the game does it
 *  (pauses included) each time the cursor moves to another line. Click to skip. */
function TextboxPreview({ say, pov, manifest, restart }: { say: { who: string | null; raw: string; n: number } | null; pov: string | null; manifest: Manifest | null; restart: number }) {
  const beats = useMemo(() => (say ? beatsOf(say.raw) : []), [say?.raw]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [shown, skip] = useCrawl(beats, `${restart}:${say?.n}`);
  const speaker = say?.who && say.who !== "extend" ? characterOf(manifest, say.who) : null;
  // the narrator's box is the POV character's; someone speaking has theirs, or the game's plain one
  const look = say?.who && say.who !== "extend" ? boxLook(manifest, characterOf(manifest, say.who)?.box ? say.who : null) : boxLook(manifest, pov);
  const style = { "--char": look.color, "--pattern": look.pattern ? `url(${look.pattern})` : "none" } as CSSProperties;
  return (
    <div>
      <div className="flex h-8 items-end px-4">
        {speaker && (
          <span className="say-tab px-3.5 pb-1 pt-1.5 font-sans text-base font-bold leading-none"
            style={{ color: `color-mix(in srgb, ${speaker.color ?? look.color} 78%, #2f2924)` }}>{speaker.name}</span>
        )}
        {say?.who && !speaker && say.who !== "extend" && <span className="say-tab px-3.5 pb-1 pt-1.5 font-sans text-base font-bold leading-none text-coral">{say.who}?</span>}
      </div>
      <div className="say-box" style={style} onClick={skip}>
        <p className="say-text min-h-24 whitespace-pre-wrap px-5 py-3.5 text-base leading-[1.7]">
          {say ? <Crawled beats={beats} shown={shown} /> : <span className="opacity-70">Put the cursor on a line to see it here.</span>}
        </p>
      </div>
    </div>
  );
}

/** How many beats are out. Restarts when `key` changes; Infinity when done or skipped. */
function useCrawl(beats: Beat[], key: string): [number, () => void] {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(Infinity);
  useEffect(() => {
    if (reduce || !beats.length) return setShown(Infinity);
    // when each beat is due (pauses as written, but at most 1.5s so the preview never stalls)
    const due: number[] = [];
    let t = 0;
    for (const b of beats) { t += b.kind === "char" ? 1000 / b.cps : Math.min(1.5, b.seconds) * 1000; due.push(t); }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const el = now - t0;
      let n = 0;
      while (n < due.length && due[n] <= el) n++;
      setShown(n >= due.length ? Infinity : n);
      if (n < due.length) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only moving to another line restarts it, not typing
  }, [key, reduce]);
  return [shown, () => setShown(Infinity)];
}

function Crawled({ beats, shown }: { beats: Beat[]; shown: number }) {
  return beats.map((b, i) => b.kind === "pause" ? null : (
    <span key={i} className={cn(i >= shown && "invisible", b.style.i && "italic", b.style.b && "font-extrabold", b.style.u && "underline", b.style.s && "line-through")}
      style={b.style.i ? { fontSynthesis: "style" } : undefined}>{b.ch}</span>
  ));
}

// ---------------------------------------------------------------- problems

function Problems() {
  const problems = useSceneUi(s => s.problems);
  const [showNotes, setShowNotes] = useState(false);
  const real = problems.filter(p => p.severity !== "info");
  const notes = problems.filter(p => p.severity === "info");
  const list = showNotes ? problems : real;
  const go = (p: Problem) => {
    const v = useSceneUi.getState().view;
    if (!v) return;
    if (useScenes.getState().mode === "live") { useSceneUi.setState({ reveal: { line: p.line, at: Date.now() } }); return; }
    const L = v.state.doc.line(Math.min(p.line, v.state.doc.lines));
    v.dispatch({ selection: { anchor: L.from + (p.from ?? L.length) }, scrollIntoView: true });
    v.focus();
  };
  const fixable = real.filter(p => p.fix && (p.fix.at ?? "line") === "line");
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-baseline gap-3">
        <h2 className="font-sans text-lg text-paper">Checks</h2>
        <span className="font-talk text-sm text-taupe">
          {real.length ? `${real.length} to fix` : "all good"}
          {notes.length > 0 && <> · <button className="underline-offset-4 hover:text-paper hover:underline" onClick={() => setShowNotes(v => !v)}>
            {showNotes ? "hide" : "show"} {notes.length} missing art</button></>}
        </span>
        {fixable.length > 1 && (
          <Button size="sm" variant="quiet" className="ml-auto" onClick={() => { const v = useSceneUi.getState().view; if (v) applyFixes(v, fixable); }}>
            <Wrench className="h-3.5 w-3.5" />Fix all {fixable.length}
          </Button>
        )}
      </div>
      <ul className="-mx-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
        {list.map((p, i) => (
          <li key={i} className="group/p flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-ink-2">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", DOT[p.severity])} />
            <button onClick={() => go(p)} className="min-w-0 flex-1 text-left font-talk text-sm text-bone hover:text-paper">
              <span className="mr-1.5 text-xs tabular-nums text-taupe">{p.line}</span>{p.message}
            </button>
            <FixButton view={useSceneUi.getState().view} problem={p} className="shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  );
}

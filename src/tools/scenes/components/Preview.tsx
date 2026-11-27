import { CalendarDays, Clock, Eye, Music, Wrench } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAssetUrl } from "@/shared/lib/assetUrl";
import { boxLook, characterOf, useGame, type Manifest } from "@/shared/lib/game";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { SayTab } from "@/shared/ui/say-tab";
import type { TargetAndTransition, Transition } from "motion/react";
import { AnimatePresence, m, spring, useReducedMotion } from "@/shared/ui/motion";
import type { Problem } from "../lib/checks";
import { look } from "../lib/look";
import { cueBetween, lengthOf, STILL, type Cue, type Motion } from "../lib/motion";
import type { Script } from "../lib/script";
import { EMPTY_STAGE, placeOf, playScript, type Sprite, type Stage } from "../lib/stage";
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
  const { stage, cue } = useShownStage(script, stages, line, moved, manifest);

  // the line in the textbox: the one at the cursor, or the last one before it
  let say: { who: string | null; raw: string; n: number } | null = null;
  if (script) {
    for (let i = Math.min(line, script.lines.length) - 1; i >= 0; i--) {
      const p = script.parsed[i];
      // `extend` goes on in the voice of the line before
      if (p?.kind === "say") { say = { who: p.who === "extend" ? stages[i - 1]?.speaker ?? null : p.who, raw: script.lines[i].slice(p.from, p.to), n: i + 1 }; break; }
      if (p?.kind === "stmt" && p.stmt.kind === "scene") break;
    }
  }

  return (
    <aside className="flex h-full min-h-0 flex-col gap-4 border-l border-ink-line/60 p-5">
      <div className="shrink-0 space-y-4">
        <StageView stage={stage} cue={cue} manifest={manifest} />
        <Facts stage={stage} manifest={manifest} />
        <TextboxPreview say={say} pov={stage.pov} manifest={manifest} restart={moved} wait={cue.length} />
      </div>
      {loaded && !manifest && (
        <p className="shrink-0 rounded-lg border border-dashed border-ink-line p-3 font-talk text-sm text-taupe">
          No game found, so names, sprites and backgrounds can't be checked. The tools read it from
          <code className="text-bone"> renpy/game</code> in the story folder (browser storage has no game files).
        </p>
      )}
      <Problems />
    </aside>
  );
}

// ---------------------------------------------------------------- the stage

/** The stage to show and the transitions to play getting there. Moving down the script plays what the lines passed
 *  over do (`with dissolve`, a fade, someone easing in); moving up just shows it. Changing a stage line in place (in
 *  its card) plays that line again, from the stage just before it. */
function useShownStage(script: Script | null, stages: Stage[], line: number, moved: number, manifest: Manifest | null) {
  const reduce = useReducedMotion();
  const was = useRef(line);
  // read before the effect below moves it on: the line the cursor came from
  const cue = useMemo(() => (!reduce && script && line > was.current ? cueBetween(script, was.current, line, manifest) : STILL),
    [moved, reduce]);   // eslint-disable-line react-hooks/exhaustive-deps -- only a move plays anything, not typing
  useEffect(() => { was.current = line; }, [line]);

  // the line at the cursor written again (its card): show the stage before it, then play it
  const text = script?.lines[line - 1];
  const [replay, setReplay] = useState<{ text: string; moved: number; cue: Cue | null } | null>(null);
  const seen = useRef({ moved, text });
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = { moved, text };
    if (reduce || !script || text === undefined || before.moved !== moved || before.text === text) return;
    const p = script.parsed[line - 1];
    if (p?.kind !== "stmt" || !("with" in p.stmt) || !p.stmt.with) return;
    setReplay({ text, moved, cue: null });
    // long enough for what the line changes to have gone, so it comes back in
    const t = setTimeout(() => setReplay({ text, moved, cue: cueBetween(script, line - 1, line, manifest) }), 40);
    return () => clearTimeout(t);
  }, [moved, text]);   // eslint-disable-line react-hooks/exhaustive-deps

  const r = replay && replay.text === text && replay.moved === moved ? replay : null;
  if (r && !r.cue) return { stage: stages[line - 2] ?? EMPTY_STAGE, cue: STILL };
  return { stage: stages[line - 1] ?? EMPTY_STAGE, cue: r?.cue ?? cue };
}

type Target = Record<string, string | number>;
type Enter = { initial: Target | false; transition: Transition };

const OFF = { left: "-40%", right: "140%", top: "-110%", bottom: "110%" };
const WIPE_FROM = { right: "inset(0% 100% 0% 0%)", left: "inset(0% 0% 0% 100%)", top: "inset(100% 0% 0% 0%)", bottom: "inset(0% 0% 100% 0%)" };
const SHOWN = "inset(0% 0% 0% 0%)";
const instant = { duration: 0 };
/** Under a fade everything changes at once, when the screen is covered. */
const atDark = (c: Cue): Transition => ({ duration: 0, delay: c.fade!.out });

/** How something comes on: from where, and how long it takes. `slides`: it can come in from a side (sprites). */
function enterOf(x: Motion | null | undefined, c: Cue, slides = false): Enter {
  if (c.fade) return { initial: { opacity: 0 }, transition: atDark(c) };
  switch (x?.kind) {
    case "dissolve": return { initial: { opacity: 0 }, transition: { duration: x.d, ease: "linear" } };
    case "zoom": return { initial: { opacity: 0, scale: 0.6 }, transition: { duration: x.d, ease: "easeOut" } };
    case "wipe": return { initial: { clipPath: WIPE_FROM[x.side] }, transition: { duration: x.d, ease: "linear" } };
    case "slide":
      if (!slides) return { initial: { opacity: 0 }, transition: { duration: x.d, ease: "linear" } };
      return {
        initial: x.side === "left" || x.side === "right" ? { left: OFF[x.side] } : { y: OFF[x.side] },
        transition: { duration: x.d, ease: x.ease ? "easeOut" : "linear" },
      };
    default: return { initial: false, transition: instant };
  }
}

/** How something goes. `under`: something new comes on over it, so it stays as it is until that has finished. */
function exitOf(x: Motion | null | undefined, c: Cue, under = false): TargetAndTransition {
  if (c.fade) return { opacity: 0, transition: atDark(c) };
  if (!x || x.kind === "move" || x.kind === "punch" || x.kind === "fade") return { opacity: 0, transition: instant };
  if (under) return { opacity: 0, transition: { duration: 0, delay: lengthOf(x) } };
  switch (x.kind) {
    case "zoom": return { opacity: 0, scale: 0.6, transition: { duration: x.d, ease: "easeIn" } };
    case "slide": return { ...(x.side === "left" || x.side === "right" ? { left: OFF[x.side] } : { y: OFF[x.side] }), transition: { duration: x.d, ease: x.ease ? "easeIn" : "linear" } };
    default: return { opacity: 0, transition: { duration: x.d, ease: "linear" } };
  }
}

const SHAKE = {
  y: ["0 0", "0 1.2%", "0 -1.2%", "0 .8%", "0 -.6%", "0 0"],
  x: ["0 0", "1.2% 0", "-1.2% 0", ".8% 0", "-.6% 0", "0 0"],
};

/** The background and the sprites as the game shows them, from the game's own images where this backend can read them
 *  (else the background's name on a tinted backdrop and sprites as tinted figures), with the lines' transitions. */
function StageView({ stage, cue, manifest }: { stage: Stage; cue: Cue; manifest: Manifest | null }) {
  const bg = stage.background;
  const frame = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const missing = !!bg && !!manifest?.media && !manifest.backgrounds.includes(bg);
  useEffect(() => {
    if (cue.punch) frame.current?.animate(SHAKE[cue.punch].map(translate => ({ translate })), { duration: 300 });
    const f = cue.fade, v = veil.current;
    if (f && v) {
      const t = f.out + f.hold + f.in || 1;
      v.style.background = f.color;
      v.animate([{ opacity: 0 }, { opacity: 1, offset: f.out / t }, { opacity: 1, offset: (f.out + f.hold) / t }, { opacity: 0 }], { duration: t * 1000 });
    }
  }, [cue]);
  return (
    <div className="group relative aspect-video overflow-hidden rounded-lg border border-ink-line bg-black">
      <div ref={frame} className="absolute inset-0">
        <AnimatePresence initial={false} custom={cue}>
          <Backdrop key={bg ?? ""} bg={bg} cue={cue} manifest={manifest} />
        </AnimatePresence>
        <div className="absolute inset-0 z-[2]">
          <AnimatePresence initial={false} custom={cue}>
            {stage.sprites.map(sp => <SpriteView key={sp.tag} sprite={sp} cue={cue} manifest={manifest} />)}
          </AnimatePresence>
        </div>
      </div>
      <div ref={veil} className="pointer-events-none absolute inset-0 z-[4] opacity-0" />
      {bg && bg !== "black" && (
        <span className="absolute left-3 top-2 z-[3] max-w-[80%] truncate rounded bg-ink/70 px-1.5 py-0.5 font-talk text-xs text-paper/70 opacity-0 transition-opacity group-hover:opacity-100"
          title={missing ? `${bg} (no image in the game yet)` : bg}>
          {bg}{missing && " ·  no image yet"}
        </span>
      )}
      {!bg && <span className="absolute inset-0 z-[3] grid place-items-center font-talk text-sm text-taupe">No background yet</span>}
    </div>
  );
}

/** One background: its image, or its name's colours while there is none. A new one comes on over the old. */
function Backdrop({ bg, cue, manifest }: { bg: string | null; cue: Cue; manifest: Manifest | null }) {
  const hue = bg ? [...bg].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7) : 0;
  const url = useAssetUrl(bg && bg !== "black" ? manifest?.imageFiles[bg] : null, manifest);
  const e = enterOf(cue.background, cue);
  return (
    <m.div className="absolute inset-0"
      style={{ background: !bg || bg === "black" ? "#000" : `linear-gradient(180deg, hsl(${hue} 22% 30%), hsl(${(hue + 40) % 360} 18% 16%))` }}
      initial={e.initial} animate={{ opacity: 1, scale: 1, clipPath: SHOWN, zIndex: 1 }} transition={e.transition}
      variants={{ out: (c: Cue) => ({ zIndex: 0, ...exitOf(c.background, c, true) }) }} exit="out">
      {url && <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />}
    </m.div>
  );
}

/** Ren'Py's screen height, and the zoom placeOf's scale 1 stands for (transforms in core/transitions.rpy). */
const SCREEN_H = 1080;
const BASE_ZOOM = 0.575;

/** The image file of a shown sprite: its words as written, else the image with the same words in another order
 *  (Ren'Py doesn't care about the order of attributes). */
function spriteFile(m: Manifest | null, sp: Sprite) {
  if (!m || !sp.attrs.length) return null;
  const name = [sp.tag, ...sp.attrs].join(" ");
  if (m.imageFiles[name]) return m.imageFiles[name];
  const want = [...sp.attrs].sort().join(" ");
  const hit = Object.keys(m.imageFiles).find(k => k.startsWith(sp.tag + " ") && k.split(" ").slice(1).sort().join(" ") === want);
  return hit ? m.imageFiles[hit] : null;
}

/** One sprite where it stands: the game's image (anchored like xalign/yalign 1.0 do), or a tinted figure with the
 *  character's name while there is none. It comes, goes, moves and changes its look the way the script says; a move
 *  written without a transition still glides a little, so you can see who went where. */
function SpriteView({ sprite: sp, cue, manifest }: { sprite: Sprite; cue: Cue; manifest: Manifest | null }) {
  const { x, scale } = placeOf(sp.at, manifest?.positions);
  const url = useAssetUrl(spriteFile(manifest, sp), manifest);
  const [natural, setNatural] = useState<Record<string, number>>({});
  const c = look(manifest, sp.tag);
  const tag = sp.tag;

  const come = enterOf(cue.enter[tag], cue, true);
  const mv = cue.move[tag];
  const glide: Transition = cue.fade ? atDark(cue)
    : mv && (mv.kind === "move" || mv.kind === "slide") ? { duration: mv.d, ease: mv.ease ? "easeInOut" : "linear" }
    : spring.smooth;
  const lk = cue.look[tag];
  const swap: Enter = cue.fade ? { initial: { opacity: 0 }, transition: atDark(cue) }
    : lk ? { initial: { opacity: 0 }, transition: { duration: lengthOf(lk), ease: "linear" } }
    : { initial: false, transition: instant };
  const swapOut = { out: (k: Cue) => ({ zIndex: 0, ...exitOf(k.look[tag], k, true) }) };

  const h = url ? natural[url] : null;
  const fig = 74 * scale;
  return (
    <m.div className="absolute inset-y-0 flex items-end" style={{ translate: url ? `-${x * 100}% 0` : "-50% 0", originY: 1 }}
      initial={come.initial} animate={{ left: `${x * 100}%`, opacity: 1, y: "0%", scale: 1 }}
      transition={tag in cue.enter ? come.transition : glide}
      variants={{ out: (k: Cue) => exitOf(k.exit[tag], k) }} exit="out">
      <AnimatePresence initial={false} mode="popLayout" custom={cue}>
        {url ? (
          <m.div key={url} className="relative" style={{ height: `${h ? (h * BASE_ZOOM * scale / SCREEN_H) * 100 : 85}%` }}
            initial={swap.initial} animate={{ opacity: 1, zIndex: 1 }} transition={swap.transition} variants={swapOut} exit="out">
            <img src={url} alt={`${c.name} ${sp.attrs.join(" ")}`} draggable={false} className="h-full w-auto max-w-none"
              style={{ opacity: h ? 1 : 0 }} onLoad={e => { const n = e.currentTarget.naturalHeight; setNatural(v => ({ ...v, [url]: n })); }} />
          </m.div>
        ) : (
          <m.div key={`fig:${sp.attrs.join(" ")}`}
            className="relative flex flex-col items-center justify-start rounded-t-[999px] pt-[14%]"
            style={{ height: `${fig}%`, aspectRatio: 0.34 * 16 / 9, background: `color-mix(in srgb, ${c.color} 42%, #1f1c1a)`, boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${c.color} 70%, transparent)` }}
            initial={swap.initial} animate={{ opacity: 1, zIndex: 1 }} transition={swap.transition} variants={swapOut} exit="out">
            <span className="max-w-full truncate px-1 font-sans text-xs font-semibold text-paper">{c.name}</span>
            <span className="max-w-full truncate px-1 text-center font-talk text-[11px] leading-tight text-paper/75">{sp.attrs.slice(1).join(" ")}</span>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
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
 *  (pauses included) each time the cursor moves to another line, once the transitions on the way (`wait` seconds)
 *  have played. Click to skip. */
function TextboxPreview({ say, pov, manifest, restart, wait }: { say: { who: string | null; raw: string; n: number } | null; pov: string | null; manifest: Manifest | null; restart: number; wait: number }) {
  const beats = useMemo(() => (say ? beatsOf(say.raw) : []), [say?.raw]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [shown, skip] = useCrawl(beats, `${restart}:${say?.n}`, wait);
  const speaker = say?.who ? characterOf(manifest, say.who) : null;
  // the narrator's box is the POV character's; someone speaking has theirs, or the game's plain one
  const look = say?.who ? boxLook(manifest, characterOf(manifest, say.who)?.box ? say.who : null) : boxLook(manifest, pov);
  const style = { "--char": look.color, "--pattern": look.pattern ? `url(${look.pattern})` : "none" } as CSSProperties;
  return (
    <div>
      <div className="flex h-8 items-end px-4">
        {speaker && <SayTab id={say!.who!} name={speaker.name} color={speaker.color ?? look.color} className="px-3.5 pb-1 pt-1.5 font-sans text-base font-bold leading-none" />}
        {say?.who && !speaker && <span className="say-tab px-3.5 pb-1 pt-1.5 font-sans text-base font-bold leading-none text-coral">{say.who}?</span>}
      </div>
      <div className="say-box" style={style} onClick={skip}>
        <p className="say-text min-h-24 whitespace-pre-wrap px-5 py-3.5 text-base leading-[1.7]">
          {say ? <Crawled beats={beats} shown={shown} /> : <span className="opacity-70">Put the cursor on a line to see it here.</span>}
        </p>
      </div>
    </div>
  );
}

/** How many beats are out, starting after `wait` seconds. Restarts when `key` changes; Infinity when done or skipped. */
function useCrawl(beats: Beat[], key: string, wait = 0): [number, () => void] {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(Infinity);
  useEffect(() => {
    if (reduce || !beats.length) return setShown(Infinity);
    // when each beat is due (pauses as written, but at most 1.5s so the preview never stalls)
    const due: number[] = [];
    let t = wait * 1000;
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
  const fixable = real.filter(p => p.fix && !p.fix.create && (p.fix.at ?? "line") === "line");
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

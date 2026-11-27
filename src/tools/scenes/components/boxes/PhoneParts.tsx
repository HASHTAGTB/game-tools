import { CornerDownRight, Keyboard } from "lucide-react";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { useAssetImage } from "@/shared/lib/assetUrl";
import { useGame } from "@/shared/lib/game";
import { cn } from "@/shared/lib/utils";
import { glow, spotlight } from "@/shared/ui/flair";
import { IconButton } from "@/shared/ui/icon-button";
import type { Box } from "../../lib/blocks";
import { look } from "../../lib/look";
import { snippet, type ChatMsg, type ChatReact } from "../../lib/phone";
import { useSceneUi, type PhoneMenu } from "../../lib/ui";
import { useScenes } from "../../state";
import { phoneLook, problemsOf, stageBefore, useBox, type ListLayout } from "./context";
import { Acts, Problems } from "./List";

/* The pieces of a chat on the phone (ChatBox, and SayBox for a message): a reply's quote, photos, the typing chip,
   reactions under a message and a reaction's own row. Their popups are in ./PhoneMenus.tsx. */

export const openPhoneMenu = (menu: PhoneMenu) => useSceneUi.setState({ menu });

/** Points at a message: in this scene it's scrolled to and spotlit; from an earlier scene, that scene opens. */
export function goToMessage(m: ChatMsg) {
  if (m.scene) { void useScenes.getState().open(m.scene.path); return; }
  const page = document.querySelector<HTMLElement>(".bx-page");
  const box = page?.querySelector<HTMLElement>(`[data-line="${m.line}"]`);
  if (!page || !box) return;
  const target = box.querySelector<HTMLElement>(".bx-bub") ?? box;
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  spotlight(target, page, ".bx-bub, .bx-rx, .bx-box:not(.bx-msg, .bx-chat, .bx-react)");
}

/** A photo by its name: the game's image (assets/features/photos), or a tile with its name while there's none. */
export function Photo({ name, className }: { name: string; className?: string }) {
  const manifest = useGame(g => g.manifest);
  const rel = manifest?.photos?.[name] ?? manifest?.imageFiles[name] ?? null;
  const { img } = useAssetImage(rel, manifest);
  return (
    <span className={cn("bx-photo", className)} style={img ? { backgroundImage: `url(${img.url})` } : { background: tileOf(name) }} title={name}>
      {!img && <span>{name}</span>}
    </span>
  );
}
/** A stand-in colour for a photo there's no file for, the same every time. */
function tileOf(name: string) {
  let x = 0;
  for (const ch of name) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const a = x % 360, b = (a + 40 + ((x >> 8) % 60)) % 360;
  return `linear-gradient(${135 + (x % 90)}deg, hsl(${a} 28% 40%), hsl(${b} 32% 25%))`;
}

export function Photos({ names }: { names: string[] }) {
  return <div className={cn("bx-photos", `bx-n${Math.min(names.length, 4)}`)}>{names.map((p, i) => <Photo key={p + i} name={p} />)}</div>;
}

/** The message a reply quotes, as the phone shows it (its sender, its text or first photo); from an earlier scene
 *  with that scene's name. Click: go to it. Finding nothing: says so, click picks another. */
export function Quote({ target, reply, onRepick, pending }: { target: ChatMsg | null; reply: string; onRepick: (el: Element) => void; pending?: boolean }) {
  const manifest = useGame(g => g.manifest);
  if (!target && pending) {
    // the earlier scenes aren't read yet: it may well find something then
    return <span className="bx-quote"><span className="bx-qb"><span className="bx-qs">„{reply}“</span></span></span>;
  }
  if (!target) {
    return (
      <button type="button" className="bx-quote bx-miss" onClick={e => onRepick(e.currentTarget)} title="Pick the message it replies to">
        <span className="bx-qb"><span className="bx-qn">The reply finds nothing</span><span className="bx-qs">„{reply}“</span></span>
      </button>
    );
  }
  const w = look(manifest, target.who);
  return (
    <button type="button" className="bx-quote" style={{ "--qc": w.legible } as CSSProperties} onClick={() => goToMessage(target)}
      title={target.scene ? `In ${target.scene.title}. Click: open that scene` : "Click: show the message"}>
      <span className="bx-qb">
        <span className="bx-qn">{w.name}{target.scene && <span className="bx-qtag">{target.scene.title}</span>}</span>
        <span className="bx-qs">{snippet(target)}</span>
      </span>
      {target.photos[0] && <Photo name={target.photos[0]} className="bx-qth" />}
    </button>
  );
}

export function TypingChip({ secs, live, onClick }: { secs: number; live: boolean; onClick: (el: Element) => void }) {
  return (
    <button type="button" className={cn("bx-typing", !live && "bx-off")} onClick={e => live && onClick(e.currentTarget)}
      title={live ? "“Typing…” first, for this long. Click: change" : "Ignored: this chat arrived earlier"}>
      <Keyboard strokeWidth={2.25} />{+secs.toFixed(2)} s<span className="bx-tdots"><b /><b /><b /></span>
    </button>
  );
}

/** The reactions in this scene that land on a message, as pills under it. A new one lights up once (Glow). */
export function Pills({ reacts }: { reacts: ChatReact[] }) {
  const c = useBox();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<number> | null>(null);
  useLayoutEffect(() => {
    const was = seen.current;
    seen.current = new Set(reacts.map(r => r.line));
    if (!was || !ref.current) return;
    for (const el of ref.current.querySelectorAll<HTMLElement>("[data-react]")) if (!was.has(+el.dataset.react!)) glow(el, "var(--color-caramel)");
  }, [reacts]);
  if (!reacts.length) return null;
  return (
    <div ref={ref} className="bx-pills">
      {reacts.map(r => {
        const by = r.by ?? stageBefore(c, r.line).pov;
        const w = by ? look(c.manifest, by) : null;
        return (
          <button key={r.line} type="button" className="bx-pill" data-react={r.line} style={{ "--rc": w?.legible ?? "var(--color-taupe)" } as CSSProperties}
            title={`${w?.name ?? "The phone's owner"}. Click: show the reaction`}
            onClick={() => goToMessage({ line: r.line } as ChatMsg)}>
            {r.emoji}
          </button>
        );
      })}
    </div>
  );
}

type ReactBox = Extract<Box, { kind: "stmt" }> & { stmt: { kind: "react" } };

/** `react rin_luck "👌"` in a chat: who reacts, the emoji (click: change it, who, take it back) and the message it's
 *  on (click: go there). The emoji also shows under that message. */
export function ReactRow({ box: b, prev, next }: { box: Extract<Box, { kind: "stmt" }>; prev: Box | null; next: Box | null; layout: ListLayout }) {
  const c = useBox();
  const x = (b as ReactBox).stmt as Extract<ReactBox["stmt"], { kind: "react" }>;
  const target = phoneLook(c, b.from, x.ref)?.target ?? null;
  const by = x.by ?? stageBefore(c, b.from).pov;
  const w = by ? look(c.manifest, by) : null;
  const tw = target ? look(c.manifest, target.who) : null;
  const probs = problemsOf(c, b);
  const pick = (anchor: Element) => openPhoneMenu({ kind: "pick", anchor, line: b.from, for: "react" });
  return (
    <div className="bx-box bx-react" data-line={b.from} data-from={b.from} data-to={b.to} style={{ "--whoL": w?.legible } as CSSProperties}>
      <div className={cn("bx-rx", probs.some(p => p.severity === "error") && "bx-bad")}>
        <span className="bx-dot" /><b>{w?.name ?? "The phone's owner"}</b>
        <button type="button" className="bx-rx-emoji" title={x.emoji ? "Change it, who reacts, or take it back" : "Takes the reaction back"}
          onClick={e => openPhoneMenu({ kind: "emoji", anchor: e.currentTarget, line: b.from })}>{x.emoji || "∅"}</button>
        <button type="button" className="bx-rx-on" title={target ? (target.scene ? `In ${target.scene.title}. Click: open that scene` : "Click: show the message") : "Pick the message"}
          onClick={e => (target ? goToMessage(target) : pick(e.currentTarget))}>
          <CornerDownRight strokeWidth={2.25} />
          {target && tw && <span style={{ color: tw.legible }}>{tw.name}</span>}
          <q>{target ? snippet(target) : x.ref}</q>
        </button>
      </div>
      <Problems list={probs} />
      <Acts box={b} prev={prev} next={next}>
        <IconButton icon={CornerDownRight} size="sm" label="React to another message" onClick={e => pick(e.currentTarget)} />
      </Acts>
    </div>
  );
}

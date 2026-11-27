import { Check, ClipboardCopy } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SayTab } from "@/shared/ui/say-tab";
import { useWash } from "@/shared/ui/use-wash";
import type { Character } from "../lib/types";
import { castLook } from "../lib/cast";
import { promptSegments, segColor, type Segment } from "../lib/prompt";
import { copyText } from "@/shared/lib/clipboard";
import { useGame } from "@/shared/lib/game";
import { Button } from "@/shared/ui/button";
import { AnimatePresence, m, spring, useReducedMotion } from "@/shared/ui/motion";

/** The finished prompt, drawn as the character's dialogue box from the game. Ctrl+Shift+C copies it.
 *  Tags from categories and toggles get a highlighter band in their section's color; General tags are not.
 *  Opening a character writes the prompt out like the game's text crawl (click the box to skip). */
export function PromptPanel({ ch, onNegative }: { ch: Character; onNegative: (v: string) => void }) {
  const segs = promptSegments(ch);
  const prompt = segs.map(s => s.tag).join(", ");
  const [copied, setCopied] = useState<"p" | "n" | null>(null);
  const manifest = useGame(s => s.manifest);
  useEffect(() => { useGame.getState().load(); }, []);   // a cached copy shows meanwhile
  const look = castLook(ch.name, manifest);
  const [shown, skip] = useCrawl(ch.id, prompt.length);

  const copy = async (what: "p" | "n") => {
    await copyText(what === "p" ? prompt : ch.negative);
    setCopied(what);
    setTimeout(() => setCopied(c => (c === what ? null : c)), 1400);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") { e.preventDefault(); copy("p"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const boxRef = useRef<HTMLDivElement>(null);
  useWash(ch.id, boxRef);
  const boxStyle = { "--char": look.color, "--pattern": look.pattern ? `url(${look.pattern})` : "none" } as CSSProperties;

  return (
    <div className="relative z-10 bg-ink px-6 pb-5 pt-2 shadow-[0_-16px_24px_-8px_#2b2826]">
      <div className="flex h-10 items-end justify-between px-6">
        {/* The namebox swaps (ducks behind the box, the new one springs up) and the box's colour washes over. */}
        <SayTab id={ch.id} name={ch.name || ch.id} color={look.color} className="px-5 pb-1.5 pt-2.5 font-sans text-lg font-bold leading-none" />
        <button
          onClick={() => copy("p")}
          title="Copy prompt (Ctrl+Shift+C)"
          className="say-tab inline-flex items-center gap-2 px-4 pb-1.5 pt-2 font-sans text-lg font-semibold leading-none text-ink transition-colors hover:bg-bone"
        >
          <Swap on={copied === "p"} yes={<Check className="h-4 w-4" />} no={<ClipboardCopy className="h-4 w-4" />} />
          {copied === "p" ? "Copied" : "Copy prompt"}
        </button>
      </div>

      <m.div
        ref={boxRef}
        className="say-box"
        style={boxStyle}
        animate={copied === "p" ? { scale: [1, 1.012, 1] } : { scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        onClick={skip}
      >
        <p className="say-text max-h-[min(11.75rem,22vh)] min-h-22 select-text overflow-y-auto px-6 py-4 text-lg leading-[1.75]">
          <Crawled segs={segs} shown={shown} />
          {!segs.length && <span className="opacity-70">No tags yet. Add some above and the prompt appears here.</span>}
        </p>
      </m.div>

      <div className="mt-3 flex items-center gap-4 px-1">
        <span className="shrink-0 font-talk text-sm tabular-nums text-taupe">{segs.length} tags, {prompt.length} characters</span>
        <div className="flex flex-1 items-center gap-2 border-b-2 border-ink-line transition-colors focus-within:border-caramel">
          <label htmlFor="negative" className="font-sans text-base text-bone">Negative</label>
          <input
            id="negative"
            value={ch.negative}
            onChange={e => onNegative(e.target.value)}
            placeholder="optional, for this character only"
            className="h-9 flex-1 bg-transparent font-talk text-base text-paper placeholder:text-taupe focus:outline-hidden"
          />
        </div>
        <Button size="md" onClick={() => copy("n")} disabled={!ch.negative}>
          <Swap on={copied === "n"} yes={<Check className="h-4 w-4" />} no={<ClipboardCopy className="h-4 w-4" />} />
          {copied === "n" ? "Copied" : "Copy negative"}
        </Button>
      </div>
    </div>
  );
}

/** Icon that pops between two states (copy → check). */
function Swap({ on, yes, no }: { on: boolean; yes: React.ReactNode; no: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.span key={on ? "y" : "n"} className="grid place-items-center"
        initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.08 } }}
        transition={spring.bouncy}>
        {on ? yes : no}
      </m.span>
    </AnimatePresence>
  );
}

/** Number of prompt characters revealed so far. Restarts whenever `key` changes; Infinity when done or skipped.
 *  Speed scales with length so long prompts still finish in well under a second. */
function useCrawl(key: string, total: number): [number, () => void] {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(Infinity);
  useEffect(() => {
    if (reduce || !total) return;
    const dur = Math.min(750, Math.max(300, total * 3.5));
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setShown(p >= 1 ? Infinity : Math.floor(total * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); setShown(Infinity); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a character switch restarts it, not edits
  }, [key, reduce]);
  return [shown, () => setShown(Infinity)];
}

/** The segments with only the first `shown` characters visible. The rest is laid out but hidden, so the box doesn't grow while it writes. */
function Crawled({ segs, shown }: { segs: Segment[]; shown: number }) {
  let left = shown;
  return segs.map((s, i) => {
    const sep = i < segs.length - 1 ? ", " : "";
    const vis = Math.max(0, Math.min(s.tag.length, left));
    const sepVis = Math.max(0, Math.min(sep.length, left - s.tag.length));
    left -= s.tag.length + sep.length;
    const hl = s.color === 0 ? undefined : {
      backgroundImage: `linear-gradient(transparent 52%, ${segColor(s.color)} 52%, ${segColor(s.color)} 90%, transparent 90%)`,
    };
    const hlCls = s.color === 0 ? undefined : "rounded-md px-0.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]";
    return (
      <span key={i} title={s.source}>
        {vis === s.tag.length
          ? <span className={hlCls} style={hl}>{s.tag}</span>
          : <>
              {vis > 0 && <span className={hlCls} style={hl}>{s.tag.slice(0, vis)}</span>}
              <span className="invisible">{s.tag.slice(vis)}</span>
            </>}
        {sep && <span className={sepVis < sep.length ? "invisible" : undefined}>{sep}</span>}
      </span>
    );
  });
}

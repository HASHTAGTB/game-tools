import { Check, ClipboardCopy } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import type { Character } from "../lib/types";
import { castLook } from "../lib/cast";
import { promptSegments, segColor } from "../lib/prompt";
import { copyText } from "../lib/store";
import { Button } from "./ui/button";

/** The finished prompt, drawn as the character's dialogue box from the game. Ctrl+Shift+C copies it.
 *  Tags from categories and toggles get a highlighter band in their section's color; General tags are not. */
export function PromptPanel({ ch, onNegative }: { ch: Character; onNegative: (v: string) => void }) {
  const segs = promptSegments(ch);
  const prompt = segs.map(s => s.tag).join(", ");
  const [copied, setCopied] = useState<"p" | "n" | null>(null);
  const look = castLook(ch.name);

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

  const boxStyle = { "--char": look.color, "--pattern": look.pattern ? `url(${look.pattern})` : "none" } as CSSProperties;

  return (
    <div className="relative z-10 bg-ink px-6 pb-5 pt-2 shadow-[0_-16px_24px_-8px_#2b2826]">
      <div className="flex items-end justify-between px-6">
        <span className="say-tab px-5 pb-1.5 pt-2.5 font-sans text-xl font-bold leading-none" style={{ color: `color-mix(in srgb, ${look.color} 78%, #2f2924)` }}>
          {ch.name || ch.id}
        </span>
        <button
          onClick={() => copy("p")}
          title="Copy prompt (Ctrl+Shift+C)"
          className="say-tab inline-flex items-center gap-2 px-4 pb-1.5 pt-2 font-sans text-[17px] font-semibold leading-none text-ink transition-colors hover:bg-bone"
        >
          {copied === "p" ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
          {copied === "p" ? "Copied" : "Copy prompt"}
        </button>
      </div>

      <div className="say-box" style={boxStyle}>
        <p className="say-text max-h-[min(11.75rem,22vh)] min-h-[5.5rem] select-text overflow-y-auto px-6 py-4 text-[17px] leading-[1.75]">
          {segs.map((s, i) => (
            <span key={i} title={s.source}>
              <span
                className={s.color === 0 ? undefined : "rounded-sm px-0.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"}
                style={s.color === 0 ? undefined : {
                  backgroundImage: `linear-gradient(transparent 52%, ${segColor(s.color)} 52%, ${segColor(s.color)} 90%, transparent 90%)`,
                }}
              >{s.tag}</span>
              {i < segs.length - 1 && ", "}
            </span>
          ))}
          {!segs.length && <span className="opacity-70">No tags yet. Add some above and the prompt appears here.</span>}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-3 px-1">
        <span className="font-talk text-sm text-taupe">{segs.length} tags, {prompt.length} characters</span>
        <div className="flex flex-1 items-center gap-2 border-b-2 border-ink-line focus-within:border-caramel">
          <label htmlFor="negative" className="font-sans text-base text-bone">Negative</label>
          <input
            id="negative"
            value={ch.negative}
            onChange={e => onNegative(e.target.value)}
            placeholder="optional, for this character only"
            className="h-9 flex-1 bg-transparent font-talk text-[15px] text-paper placeholder:text-taupe focus:outline-none"
          />
        </div>
        <Button size="md" onClick={() => copy("n")} disabled={!ch.negative}>
          {copied === "n" ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}{copied === "n" ? "Copied" : "Copy negative"}
        </Button>
      </div>
    </div>
  );
}

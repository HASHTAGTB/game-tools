import type { Box } from "../../lib/blocks";
import { tokenize } from "../../lib/renpyText";

/** How long the card is up at least when a scene opens (its crawl is done by then), in ms. */
export const CARD_MIN = 750;
/** How long the card takes to go (see .bx-title.bx-out), in ms. */
export const CARD_OUT = 320;

/** The scene opening's title card: its chapter, its title crawling in letter by letter, a rule and its first line.
 *  It's up while the boxes are built (in one go, which keeps the page busy): it only fades and moves (opacity,
 *  transform), which the browser keeps playing meanwhile, so it has to be on screen before the build starts. */
export function TitleCard({ chapter, title, first, out }: { chapter: string; title: string; first: string; out: boolean }) {
  const letters = [...title];
  const step = Math.min(26, 360 / Math.max(1, letters.length));
  return (
    <div className={out ? "bx-title bx-out" : "bx-title"} aria-hidden>
      {chapter && <div className="bx-title-ch">{chapter}</div>}
      <h2>{letters.map((c, i) => <span key={i} style={{ animationDelay: `${60 + Math.round(i * step)}ms` }}>{c}</span>)}</h2>
      <div className="bx-title-rule" />
      {first && <p>“{first}”</p>}
    </div>
  );
}

/** The scene's first line that's said, as plain text (no tags), for the card. */
export function firstLine(boxes: Box[]): string {
  const say = boxes.find(b => b.kind === "say" && b.raw.trim());
  if (!say || say.kind !== "say") return "";
  return tokenize(say.raw).map(t => (t.kind === "tag" ? "" : t.text === "\n" ? " " : t.text)).join("").trim();
}

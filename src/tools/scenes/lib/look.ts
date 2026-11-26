import { DEFAULT_COLOR } from "@/shared/lib/colors";
import { characterOf, type Manifest } from "@/shared/lib/game";

/** How a character looks in the editor: the name and colour the game gives them, and that colour made readable on
 *  the editor's dark background. */

export type Look = { name: string; color: string; legible: string; known: boolean };

/** A name colour that reads on the ink background: colours too dark for it are mixed toward bone. Only the editor
 *  does this; the game keeps its colour. */
export function legible(color: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (l >= 0.42) return color;
  const t = 0.62 - l, bone = [217, 208, 199];
  return `rgb(${[r, g, b].map((c, i) => Math.round(c * (1 - t) + bone[i] * t)).join(", ")})`;
}

/** A character's look. `extend` (a line going on from the one before) has its own; someone the game doesn't know is
 *  coral (or the default colour while there's no manifest). */
export function look(m: Manifest | null, id: string): Look {
  if (id === "extend") return { name: "…", color: "var(--color-taupe)", legible: "var(--color-taupe)", known: true };
  const c = characterOf(m, id);
  const color = c?.color ?? (m ? "var(--color-coral)" : DEFAULT_COLOR);
  return { name: c?.name ?? id, color, legible: legible(color), known: !m || !!c };
}

/** A speaker's colour for the highlighter (readable on ink), or null when the word isn't a character. */
export function whoColor(m: Manifest | null, id: string): string | null {
  if (id === "extend") return null;
  const w = look(m, id);
  return w.known && m ? w.legible : null;
}

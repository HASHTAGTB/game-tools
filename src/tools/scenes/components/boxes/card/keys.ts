import type { KeyboardEvent } from "react";

/** Keys in an open card with a grid of tiles (`data-grid` holding `data-tile` buttons):
 *  arrows move between tiles (up/down to the nearest tile in the row above/below), a typed letter goes to the
 *  card's search (`data-card-search`). Enter and Space are the buttons' own. Tab leaves the grid: only one tile per grid
 *  is in the tab order (see `tabStop`). */
export function onCardKeys(e: KeyboardEvent<HTMLElement>) {
  const target = e.target as HTMLElement;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const tile = target.closest<HTMLElement>("[data-tile]");
  if (tile && e.key.startsWith("Arrow")) {
    const grid = tile.closest<HTMLElement>("[data-grid]");
    const tiles = grid ? [...grid.querySelectorAll<HTMLElement>("[data-tile]")] : [];
    const next = neighbour(tiles, tile, e.key);
    if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ block: "nearest" }); }
    return;
  }
  if (e.key.length === 1 && e.key !== " " && !target.matches("input, textarea, [contenteditable]")) {
    const search = e.currentTarget.querySelector<HTMLInputElement>("[data-card-search]");
    // focused while the key is still going on, so the letter lands in it
    if (search) search.focus();
  }
}

function neighbour(tiles: HTMLElement[], from: HTMLElement, key: string): HTMLElement | null {
  const i = tiles.indexOf(from);
  if (key === "ArrowLeft") return tiles[i - 1] ?? null;
  if (key === "ArrowRight") return tiles[i + 1] ?? null;
  const r = from.getBoundingClientRect(), cx = r.left + r.width / 2;
  const down = key === "ArrowDown";
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const t of tiles) {
    const q = t.getBoundingClientRect();
    const dy = down ? q.top - r.bottom : r.top - q.bottom;
    if (dy < -2) continue;
    const score = dy * 1000 + Math.abs(q.left + q.width / 2 - cx);
    if (t !== from && score < bestScore) { best = t; bestScore = score; }
  }
  return best;
}

/** The one tile of a grid Tab stops at: the picked one, else the first. */
export const tabStop = (picked: boolean, index: number, anyPicked: boolean) => (picked || (!anyPicked && index === 0) ? 0 : -1);

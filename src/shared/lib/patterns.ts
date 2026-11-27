import { assetUrl } from "./assetUrl";
import type { GameCharacter } from "./game";
import { withoutExt } from "./paths";

/** The textbox patterns of the game's POV characters, drawn from their icons in assets/ the way the game draws them. */

/** Tiles made so far, by the icon's object URL (a new URL = the icon changed). */
const tiles = new Map<string, Promise<string | null>>();

/** Give each character with a textbox pattern a tile made from its icon in assets/ (`patternUrl`, a data URL so it can
 *  be cached with the rest of the game's data). `media`: the files in assets/, `isImage` tells the icons among them.
 *  Where the icon can't be read (browser storage has no game files, a checkout without Git LFS only pointers)
 *  `boxLook` falls back to public/patterns. */
export async function loadPatterns(chars: GameCharacter[], media: string[], isImage: (file: string) => boolean) {
  await Promise.all(chars.map(async c => {
    if (!c.patternAsset) return;
    const file = media.find(f => withoutExt(f) === c.patternAsset && isImage(f));
    const icon = file && await assetUrl(file);
    if (!icon) return;
    if (!tiles.has(icon)) tiles.set(icon, tileOf(icon).catch(() => null));
    const tile = await tiles.get(icon);
    if (tile) c.patternUrl = tile;
  }));
}

/** The tile the textbox CSS repeats (index.css `.say-box`, 120×72): the icon at 30px in a staggered grid with room
 *  around it, like the game's `_make_icon_pattern` (and the copies in public/patterns). */
const TILE = { w: 120, h: 72, icon: 30 };
async function tileOf(iconUrl: string) {
  const img = await createImageBitmap(await (await fetch(iconUrl)).blob());
  const canvas = document.createElement("canvas");
  canvas.width = TILE.w;
  canvas.height = TILE.h;
  const g = canvas.getContext("2d")!;
  const { w, h, icon: s } = TILE;
  for (const [x, y] of [[0, 0], [w / 2, 0], [w / 4, h / 2], [w * 3 / 4, h / 2]]) g.drawImage(img, x, y, s, s);
  img.close();
  return canvas.toDataURL("image/png");
}

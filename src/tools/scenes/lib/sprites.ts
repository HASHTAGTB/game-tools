import { create } from "zustand";
import type { Manifest } from "@/shared/lib/game";
import { writeIfUnchanged } from "@/shared/lib/fileSync";
import { jsonText, locationVersion, readFile, TOOLS_DIR } from "@/shared/lib/workspace";

/** Sprites as the show card picks them. Files are `name_outfit_expression_pose.ext`: the third part is the expression
 *  (words of one expression joined with "-": `confused-blush`), everything after it the pose. The game declares each
 *  file with underscores as spaces, so `rin_casual_happy_arms_crossed` is `show rin casual happy arms crossed`. */

export type Look = {
  /** everything after the outfit, as the show statement writes it ("happy arms crossed") */
  look: string;
  expr: string;
  /** "" for the plain pose */
  pose: string;
  /** the file in assets/ */
  file: string | null;
};

export function splitLook(look: string): { expr: string; pose: string } {
  const [expr = "", ...pose] = look.split(/\s+/).filter(Boolean);
  return { expr, pose: pose.join(" ") };
}
export const joinLook = (expr: string, pose: string) => [expr, pose].filter(Boolean).join(" ");

/** Every look of `tag` in `outfit`, as the game has them. */
export function looksOf(m: Manifest | null, tag: string, outfit: string): Look[] {
  return (m?.sprites[tag]?.[outfit] ?? []).map(look => ({ look, ...splitLook(look), file: m?.imageFiles[`${tag} ${outfit} ${look}`] ?? null }));
}
export const outfitsOf = (m: Manifest | null, tag: string) => Object.keys(m?.sprites[tag] ?? {});
/** The poses in `looks`, the plain one ("") first. */
export const posesOf = (looks: Look[]) => [...new Set(looks.map(l => l.pose))].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
/** "" → "no pose", "arms crossed" stays */
export const poseLabel = (pose: string) => pose || "no pose";

// ---------------------------------------------------------------- face boxes (.game-tools/sprites.json)

/** Where a face sits in a character's sprites, as fractions of the image: left edge, top edge, width. The box is
 *  square in pixels (its height in fractions is w × width / height). Set by hand in the show card. */
export type FaceBox = { x: number; y: number; w: number };
type SpritesFile = { version: 1; faces: Record<string, FaceBox> };

export const SPRITES_PATH = `${TOOLS_DIR}/sprites.json`;
/** Until a character's box is set: about where the head of a standing full-body sprite is. */
export const DEFAULT_FACE: FaceBox = { x: 0.36, y: 0.06, w: 0.28 };

/** Keys: the tag ("rin") for every pose, "rin/arms crossed" for one pose. */
export const faceKey = (tag: string, pose: string) => (pose ? `${tag}/${pose}` : tag);

type Faces = {
  faces: Record<string, FaceBox>;
  /** the location the file was read from (`locationVersion`), -1 before the first read */
  readFor: number;
  /** the file's change time as last read or written (null: no file) */
  mtime: number | null;
  load: () => Promise<void>;
  /** Set (or with null: remove) the box for `key` and write the file. */
  save: (key: string, box: FaceBox | null) => Promise<void>;
};

const parse = (text: string | null): Record<string, FaceBox> => {
  try {
    const f = text ? (JSON.parse(text) as SpritesFile) : null;
    return f && typeof f.faces === "object" ? f.faces : {};
  } catch { return {}; }
};
const round = (n: number) => Math.round(n * 10000) / 10000;

export const useFaces = create<Faces>()((set, get) => ({
  faces: {},
  readFor: -1,
  mtime: null,
  load: async () => {
    const f = await readFile(SPRITES_PATH).catch(() => null);
    set({ faces: parse(f?.text ?? null), mtime: f?.mtime ?? null, readFor: locationVersion() });
  },
  save: async (key, box) => {
    const put = (faces: Record<string, FaceBox>) => {
      const next = { ...faces };
      if (box) next[key] = { x: round(box.x), y: round(box.y), w: round(box.w) }; else delete next[key];
      return next;
    };
    let faces = put(get().faces);
    set({ faces });
    // someone else changed the file meanwhile: take theirs and put this one box on top (each edit is one key)
    for (let tries = 0; tries < 3; tries++) {
      const r = await writeIfUnchanged(SPRITES_PATH, jsonText({ version: 1, faces: sortKeys(faces) }), get().mtime);
      if ("mtime" in r) { set({ mtime: r.mtime }); return; }
      faces = put(parse(r.theirs?.text ?? null));
      set({ faces, mtime: r.theirs?.mtime ?? null });
    }
  },
}));

const sortKeys = (o: Record<string, FaceBox>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

/** The box for a pose: its own, else the character's, else the default. */
export function faceOf(faces: Record<string, FaceBox>, tag: string, pose: string): FaceBox {
  return faces[faceKey(tag, pose)] ?? faces[tag] ?? DEFAULT_FACE;
}

/** CSS that shows the face box of an image (natural size w×h, at `url`) in a square of `size` px. */
export function faceCss(url: string, box: FaceBox, w: number, h: number, size: number): React.CSSProperties {
  const bw = size / box.w, bh = bw * (h / w);
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${bw}px ${bh}px`,
    backgroundPosition: `${-box.x * bw}px ${-box.y * bh}px`,
    backgroundRepeat: "no-repeat",
  };
}

/** Name colors and textbox patterns from HTAWAGE (game/core/characters.rpy, core/gui/say.rpy).
 *  A character whose name starts with a cast name gets that character's dialogue-box look. */
export type CastLook = { color: string; pattern?: string };

const CAST: Record<string, CastLook> = {
  satoru: { color: "#7ec8e3" },
  kaishi: { color: "#e38c7e" },
  rin: { color: "#c97ec8", pattern: import.meta.env.BASE_URL + "patterns/rin.png" },
  takaya: { color: "#8ce3a0", pattern: import.meta.env.BASE_URL + "patterns/takaya.png" },
  timo: { color: "#e3d07e" },
  rumina: { color: "#e3a87e" },
  dai: { color: "#7e9be3" },
  izuya: { color: "#b0b0b0" },
  mei: { color: "#e37eb8" },
  haru: { color: "#7ec8b0" },
  minako: { color: "#c8b07e" },
  yui: { color: "#b07ec8" },
  akito: { color: "#7eb8e3" },
};

/** Characters outside the cast use the GUI accent color. */
const DEFAULT: CastLook = { color: "#c4956a" };

export const castLook = (name: string): CastLook =>
  CAST[name.trim().split(/[\s_-]+/)[0]?.toLowerCase() ?? ""] ?? DEFAULT;

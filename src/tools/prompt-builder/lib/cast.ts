/** Name colors and textbox patterns from HTAWAGE (game/core/characters.rpy, core/gui/say.rpy).
 *  A character whose name starts with a cast name gets that character's dialogue-box look. */
export type CastLook = { color: string; pattern?: string };

const CAST: Record<string, CastLook> = {
  satoru: { color: "#7ec8e3" },
  kaishi: { color: "#8ce3a0" },
  rin: { color: "#c97ec8", pattern: import.meta.env.BASE_URL + "patterns/rin.png" },
  takaya: { color: "#57535e", pattern: import.meta.env.BASE_URL + "patterns/takaya.png" },
  timo: { color: "#e38c7e" },
  rumina: { color: "#e3a87e" },
  dai: { color: "#e3925e" },
  izuya: { color: "#6fc48a" },
  mei: { color: "#9a6ea8" },
  haru: { color: "#a98ee3" },
  minako: { color: "#d47e5e" },
  yui: { color: "#e3c27e" },
  akito: { color: "#7e9be3" },
};

/** Characters outside the cast use the GUI accent color. */
const DEFAULT: CastLook = { color: "#c4956a" };

export const castLook = (name: string): CastLook =>
  CAST[name.trim().split(/[\s_-]+/)[0]?.toLowerCase() ?? ""] ?? DEFAULT;

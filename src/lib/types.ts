/** A named set of tags (an outfit, an expression, a pose, …). Tags are stored as raw prompt text. */
export type Preset = { id: string; name: string; tags: string[] };

/** Extra preset that can be switched on/off independently (accessories, props, …). */
export type Toggle = Preset & { on: boolean };

/** Pick-one group of presets. `selected` is the preset that goes into the prompt (null = none). */
export type Category = { id: string; name: string; presets: Preset[]; selected: string | null };

export type Character = {
  version: 1;
  id: string;
  name: string;
  base: string[];
  categories: Category[];
  toggles: Toggle[];
  negative: string;
  notes: string;
};

/** Which tag list the tag browser / search adds to. */
export type ListKey = { kind: "base" } | { kind: "preset"; cat: string; preset: string } | { kind: "toggle"; id: string };

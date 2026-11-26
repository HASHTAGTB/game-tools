import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Knows the app's own shadow names (index.css), so `shadow-panel` and `shadow-lift` replace each other. */
const twMerge = extendTailwindMerge({ extend: { theme: { shadow: ["panel", "lift"] } } });

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";

/** The first name that isn't taken: `base`, then `nth(2)`, `nth(3)`, … */
export function freeName(base: string, taken: (name: string) => boolean, nth = (i: number) => `${base}-${i}`) {
  let name = base;
  for (let i = 2; taken(name); i++) name = nth(i);
  return name;
}

/** slug of `name` that is not in `taken`. */
export function uniqueId(name: string, taken: Iterable<string>) {
  const set = new Set(taken);
  return freeName(slugify(name), id => set.has(id));
}

/** `path` is `dir` itself or inside it. */
export const isUnder = (path: string, dir: string) => path === dir || path.startsWith(dir + "/");

/** The strings in `v`, if it's an array (data read from a file can hold anything). */
export const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export const errorMessage = (e: unknown) => String(e instanceof Error ? e.message : e);

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const fmtCount = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n));

/** Hand a file to the browser to save. */
export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

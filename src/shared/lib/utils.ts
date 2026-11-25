import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Knows the app's own shadow names (index.css), so `shadow-panel` and `shadow-lift` replace each other. */
const twMerge = extendTailwindMerge({ extend: { theme: { shadow: ["panel", "lift"] } } });

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";

/** slug of `name` that is not in `taken`. */
export function uniqueId(name: string, taken: Iterable<string>) {
  const set = new Set(taken);
  const base = slugify(name);
  let id = base;
  for (let i = 2; set.has(id); i++) id = `${base}-${i}`;
  return id;
}

export const fmtCount = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n));

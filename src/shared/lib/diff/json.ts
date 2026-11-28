/** Comparing the tools' JSON files by what they mean, not line by line: a changed event title is one change, an added
 *  event another, and so is a new order of the events. Lists of things with an `id` are matched by id; anything
 *  else counts as one value. Merging builds valid JSON back from the side picked for each change. */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
/** A value that isn't there (a key or an item one side doesn't have). */
export type Maybe = Json | undefined;

/** Where a change is: object keys and, in lists of things with ids, `#id`. A list's order is `[…, "@order"]`. */
export type JPath = string[];
export const ORDER = "@order";

export type JChange = {
  path: JPath;
  a: Maybe; b: Maybe;
  /** Only with a base: what it was. */
  o?: Maybe;
  /** Taken without asking: only that side changed it. Null: both did, differently. Undefined: no base. */
  auto?: "a" | "b" | null;
  /** For `@order`: the ids in each side's order. */
  order?: { a: string[]; b: string[]; o?: string[] };
};

const isObj = (v: Maybe): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const hasId = (v: Json) => isObj(v) && typeof v.id === "string";
/** A list of things with ids (an empty list counts, if the other side's is one). */
const idList = (v: Maybe): v is Obj[] => Array.isArray(v) && v.every(hasId);
const ids = (l: Obj[]) => l.map(x => x.id as string);
const byId = (l: Obj[] | undefined) => new Map((l ?? []).map(x => [x.id as string, x]));

export function same(p: Maybe, q: Maybe): boolean {
  if (p === q) return true;
  if (p === undefined || q === undefined || typeof p !== typeof q || p === null || q === null) return false;
  if (Array.isArray(p) || Array.isArray(q)) {
    return Array.isArray(p) && Array.isArray(q) && p.length === q.length && p.every((x, i) => same(x, q[i]));
  }
  if (typeof p !== "object") return false;
  const kp = Object.keys(p), kq = Object.keys(q as Obj);
  return kp.length === kq.length && kp.every(k => k in (q as Obj) && same((p as Obj)[k], (q as Obj)[k]));
}

/** Keys in order: `first`'s, then the others' in theirs, each after the key before it there. */
function keyOrder(first: string[], ...more: string[][]) {
  const out = [...first];
  for (const list of more) list.forEach((k, i) => {
    if (out.includes(k)) return;
    const before = list.slice(0, i).reverse().find(p => out.includes(p));
    out.splice(before === undefined ? 0 : out.indexOf(before) + 1, 0, k);
  });
  return out;
}

/** The changes between `a` and `b`. With `base` (`three`), each says which side changed it. */
export function diffJson(a: Maybe, b: Maybe, three = false, base?: Maybe): JChange[] {
  const out: JChange[] = [];
  const leaf = (path: JPath, o: Maybe, x: Maybe, y: Maybe) => {
    if (!three) return out.push({ path, a: x, b: y });
    out.push({ path, a: x, b: y, o, auto: same(o, x) ? "b" : same(o, y) ? "a" : null });
  };
  const walk = (path: JPath, o: Maybe, x: Maybe, y: Maybe) => {
    if (same(x, y)) return;
    if (three && same(o, x) && same(o, y)) return;
    if (isObj(x) && isObj(y) && (!three || o === undefined || isObj(o))) {
      const oo = isObj(o) ? o : undefined;
      for (const k of keyOrder(Object.keys(x), Object.keys(y), Object.keys(oo ?? {}))) walk([...path, k], oo?.[k], x[k], y[k]);
      return;
    }
    if (idList(x) && idList(y) && (!three || o === undefined || idList(o)) && (x.length || y.length)) {
      const oo = idList(o) ? o : undefined;
      const mx = byId(x), my = byId(y), mo = byId(oo);
      for (const id of keyOrder(ids(x), ids(y), ids(oo ?? []))) walk([...path, "#" + id], mo.get(id), mx.get(id), my.get(id));
      // order: of the items both sides still have
      const both = (l: Obj[]) => ids(l).filter(id => mx.has(id) && my.has(id));
      const ox = both(x), oy = both(y);
      if (ox.join("\n") !== oy.join("\n")) {
        const order = { a: ox, b: oy, ...(oo ? { o: both(oo) } : {}) };
        if (!three) out.push({ path: [...path, ORDER], a: undefined, b: undefined, order });
        else {
          const oz = (order.o ?? []).join("\n");
          out.push({ path: [...path, ORDER], a: undefined, b: undefined, order, auto: oz === ox.join("\n") ? "b" : oz === oy.join("\n") ? "a" : null });
        }
      }
      return;
    }
    leaf(path, o, x, y);
  };
  walk([], base, a, b);
  return out;
}

export type JPick = "a" | "b" | "both";
export const pathKey = (p: JPath) => JSON.stringify(p);

/** `a` and `b` put together: each change from the side picked for it (by `pathKey`); what's the same is kept. Keys
 *  and items keep `b`'s order (`a`'s where it was picked), so picking `b` everywhere gives `b` back. */
export function buildJson(a: Maybe, b: Maybe, picks: Map<string, JPick>): Maybe {
  const build = (path: JPath, x: Maybe, y: Maybe): Maybe => {
    const pick = picks.get(pathKey(path));
    if (pick !== undefined) {
      if (pick === "both" && Array.isArray(x) && Array.isArray(y)) return [...x, ...y.filter(v => !x.some(w => same(v, w)))];
      return pick === "a" ? x : y;
    }
    if (same(x, y)) return y;
    if (isObj(x) && isObj(y)) {
      const out: Obj = {};
      for (const k of keyOrder(Object.keys(y), Object.keys(x))) {
        const v = build([...path, k], x[k], y[k]);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    if (idList(x) && idList(y)) {
      const mx = byId(x), my = byId(y);
      const lead = picks.get(pathKey([...path, ORDER])) === "a" ? ids(x) : ids(y);
      const order = keyOrder(lead, ids(y), ids(x));
      return order.flatMap(id => {
        const v = build([...path, "#" + id], mx.get(id), my.get(id));
        return v === undefined ? [] : [v];
      });
    }
    return y;
  };
  return build([], a, b);
}

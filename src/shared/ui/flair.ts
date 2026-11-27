/* The app's motion vocabulary (picked from the Scenes motion page, https://claude.ai/artifact/1TzAYY6g2pRcsi6tYCqERs)
   that runs as plain Web Animations on real elements: for DOM React doesn't own (CodeMirror, contenteditable) and
   for one-off moments on one element. Which piece is for what: the map at the top of ./motion.ts. They animate
   `translate`/`scale`, never `transform`, where Motion may be moving the same element. Nothing moves with reduced
   motion. */

export const EASE = "cubic-bezier(.22, .8, .24, 1)";
/** overshoots a little, then settles */
export const SPRING = "cubic-bezier(.3, 1.35, .45, 1)";

export const calm = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Opts = KeyframeAnimationOptions & { duration: number };
function play(el: Element, kf: Keyframe[], o: Opts): Animation | null {
  if (calm()) return null;
  return el.animate(kf, { easing: EASE, ...o });
}
const finished = (a: Animation | null) => (a ? a.finished.then(() => {}, () => {}) : Promise.resolve());

/** The part of the window `el` can be seen in: the window, cut down by every ancestor that clips (a scroller, a
 *  popup with a max height). */
function clipOf(el: Element, inWindow: boolean) {
  let top = inWindow ? 0 : -Infinity, bottom = inWindow ? innerHeight : Infinity, left = inWindow ? 0 : -Infinity, right = inWindow ? innerWidth : Infinity;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowY === "visible" && cs.overflowX === "visible") continue;
    const r = p.getBoundingClientRect();
    top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom); left = Math.max(left, r.left); right = Math.min(right, r.right);
  }
  return { top, bottom, left, right };
}

/** Plays `kf` on each of `els` that can be seen, one after another. Every item on screen takes part however tall
 *  the screen is: the gap between them shrinks so the whole run takes at most `spread` ms. Items out of sight are
 *  left alone (they'd only be waiting there, invisible, to be scrolled to). `inWindow: false`: only what clips them
 *  counts, not the window (a popup that isn't in its place yet). */
function stagger(els: Iterable<Element>, kf: Keyframe[], o: Opts & { step: number; spread: number; inWindow?: boolean }) {
  if (calm()) return;
  const { step, spread, inWindow = true, delay = 0, ...rest } = o;
  const list = [...els];
  if (!list.length) return;
  // each item by what clips it (items may sit in different scrollers); siblings share it, so it's worked out once each
  const clips = new Map<Element | null, ReturnType<typeof clipOf>>();
  const clipFor = (el: Element) => {
    const k = el.parentElement;
    let c = clips.get(k);
    if (!c) clips.set(k, c = clipOf(el, inWindow));
    return c;
  };
  const seen = list.filter(el => {
    const clip = clipFor(el);
    const r = el.getBoundingClientRect();
    return (r.width || r.height) && r.bottom > clip.top && r.top < clip.bottom && r.right > clip.left && r.left < clip.right;
  });
  const gap = seen.length > 1 ? Math.min(step, spread / (seen.length - 1)) : 0;
  seen.forEach((el, i) => play(el, kf, { fill: "backwards", ...rest, delay: (delay as number) + i * gap }));
}

// ---------------------------------------------------------------- coming and going

/** Drop in: falls into place with a small bounce and squash (something new in a list). */
export function dropIn(el: Element, delay = 0) {
  return play(el, [
    { opacity: 0, transform: "translateY(-22px)" },
    { opacity: 1, transform: "translateY(3px) scaleY(.95)", offset: .65 },
    { transform: "translateY(-1px) scaleY(1.02)", offset: .82 },
    { opacity: 1, transform: "none" },
  ], { duration: 520, delay, easing: "ease-out", fill: "backwards" });
}

/** Crumple, then `remove`: squeezes, tilts and blurs away. For things outside a list (a card on the board); list
 *  items crumple on their own (./motion-list.tsx, the same look). Call it instead of removing right away; a second
 *  call while it runs does nothing. */
export function crumple(el: HTMLElement | null, remove: () => void) {
  if (!el || calm()) return remove();
  if (el.dataset.leaving) return;
  el.dataset.leaving = "1";
  el.style.pointerEvents = "none";
  const a = el.animate([
    { transform: "none", opacity: 1, filter: "blur(0)" },
    { transform: "scale(.9, .7) rotate(-2deg)", opacity: .8, filter: "blur(0)", offset: .4 },
    { transform: "scale(.4, .2) rotate(-6deg)", opacity: 0, filter: "blur(3px)" },
  ], { duration: 320, easing: "ease-in", fill: "forwards" });
  a.finished.then(() => {
    remove();
    // should the element stay (drawn again for something else), it looks like itself again
    requestAnimationFrame(() => { a.cancel(); el.style.pointerEvents = ""; delete el.dataset.leaving; });
  }, () => {});
}

/** Fade in: `el` was just drawn again in another form (a box shown as Ren'Py, shown as a box again). */
export const fadeIn = (el: Element) => play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });

/** Cascade: a page of items falls into place one after another (a scene or a list opening). */
export function cascade(els: Iterable<Element>) {
  // `translate`, not `transform`: list items' transform is Motion's (they slide)
  stagger(els, [{ opacity: 0, translate: "0 -10px" }, { opacity: 1, translate: "0 0" }], { duration: 320, step: 55, spread: 700 });
}

/** Unfold, for the same text shown another way (a scene's script ↔ source view): the view has been scrolled so the
 *  line you were on is where it was (screen height `at`); it stays put and everything else opens out from it, the
 *  nearest first, each coming from a little closer to it. Only what can be seen takes part. */
export function unfold(els: Iterable<Element>, at: number) {
  if (calm()) return;
  const clips = new Map<Element | null, ReturnType<typeof clipOf>>();
  const reach = innerHeight / 2 || 1;
  for (const el of els) {
    const k = el.parentElement;
    let clip = clips.get(k);
    if (!clip) clips.set(k, clip = clipOf(el, true));
    const r = el.getBoundingClientRect();
    if (!(r.width || r.height) || r.bottom <= clip.top || r.top >= clip.bottom) continue;
    const d = Math.max(r.top - at, Math.min(0, r.bottom - at));   // 0 for the line itself
    const far = Math.min(1, Math.abs(d) / reach);
    play(el, [
      { opacity: Math.max(0, 0.6 - Math.abs(d) / 160), translate: `0 ${Math.round(-d * 0.08)}px` },
      { opacity: 1, translate: "0 0" },
    ], { duration: 300, delay: far * 180, fill: "backwards" });
  }
}

// ---------------------------------------------------------------- moving

/** Lift and arc, the lift: the item being moved rises (bigger, shadow) and swings out a little while it travels.
 *  Call it as the move happens; the travel itself is the list's (a MotionList slides it). On `translate`/`scale`,
 *  which Motion leaves alone, so the two run together. */
export function lift(el: HTMLElement | null) {
  if (!el) return;
  const set = !el.style.position;
  if (set) el.style.position = "relative";
  el.style.zIndex = "3";
  const a = play(el, [
    { translate: "0 0", scale: "1", filter: "drop-shadow(0 0 0 transparent)" },
    { translate: "-14px 0", scale: "1.03", filter: "drop-shadow(0 12px 14px rgba(0,0,0,.45))", offset: .5 },
    { translate: "0 0", scale: "1", filter: "drop-shadow(0 0 0 transparent)" },
  ], { duration: 480, easing: "cubic-bezier(.45, 0, .2, 1)" });
  finished(a).then(() => { el.style.zIndex = ""; if (set) el.style.position = ""; });
}

// ---------------------------------------------------------------- opening

export type Size = { w: number; h: number; r: string };
export const sizeOf = (el: HTMLElement): Size => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, r: getComputedStyle(el).borderTopLeftRadius }; };

/** Morph: `el` grows (or shrinks) from the size and corners it had (`from`, measured before the change) to its size
 *  now. It stays centred where it is meanwhile (a pill in the middle opens into a card from there), and what's below
 *  follows it down or up. One element, for the thing the user just opened, closed or switched (see `useMorph`). */
export function morph(el: HTMLElement, from: Size, easing = SPRING) {
  const to = sizeOf(el);
  if (Math.abs(to.w - from.w) < 1 && Math.abs(to.h - from.h) < 1) return null;
  const clamp = (radius: string, h: number) => `${Math.min(parseFloat(radius) || 0, h / 2)}px`;
  const corners = from.r !== to.r ? [clamp(from.r, from.h), clamp(to.r, to.h)] : null;
  el.style.overflow = "hidden";
  if (to.w !== from.w) el.style.alignSelf = "center";
  const a = play(el, [
    { width: `${from.w}px`, height: `${from.h}px`, ...(corners && { borderRadius: corners[0] }) },
    { width: `${to.w}px`, height: `${to.h}px`, ...(corners && { borderRadius: corners[1] }) },
  ], { duration: 460, easing });
  finished(a).then(() => { el.style.overflow = ""; el.style.alignSelf = ""; });
  return a;
}

/** Rise: items come up into an opened card one after another. */
export function rise(els: Iterable<Element>, delay = 140) {
  stagger(els, [{ opacity: 0, translate: "0 8px" }, { opacity: 1, translate: "0 0" }], { duration: 300, delay, step: 55, spread: 400 });
}

/** Bloom: a popup's items rise in one after another (the popup itself grows from its trigger: `bloomCls` in ./motion.ts). */
const BLOOM_ITEMS = "[role=menuitem], [role=option], [role=menuitemradio], [role=menuitemcheckbox], button, a[href], input, [data-bloom]";
export function bloomItems(root: Element) {
  const all = [...root.querySelectorAll(BLOOM_ITEMS)];
  const items = all.filter(el => !all.some(o => o !== el && o.contains(el)));
  // they rise and fade, not scale: the popup around them is already growing
  stagger(items, [{ opacity: 0, translate: "0 6px" }, { opacity: 1, translate: "0 0" }], { duration: 220, delay: 60, step: 18, spread: 280, inWindow: false });
}
/** A stable ref callback (so it runs once, when the element appears) that blooms what's inside. */
export const bloomRef = (el: HTMLElement | null) => { if (el) bloomItems(el); };

// ---------------------------------------------------------------- changing

/** Colour wash: the new colour sweeps over `el` from left to right. `old`: what it looked like before (a background
 *  and border colour), drawn on top and wiped away. */
export function wash(el: HTMLElement, old: { background: string; border?: string }) {
  if (calm()) return;
  const layer = document.createElement("div");
  const cs = getComputedStyle(el);
  layer.style.cssText = `position:absolute;inset:-1px;pointer-events:none;border-radius:${cs.borderTopLeftRadius};background:${old.background};` +
    (old.border ? `border:1px solid ${old.border};` : "") + "z-index:-1";
  // under the text, over the element's own background; the new colour shows at once under it (no colour transition)
  el.style.isolation = "isolate";
  const transition = el.style.transition;
  el.style.transition = "none";
  el.prepend(layer);
  const a = layer.animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 0 100%)" }], { duration: 440, easing: "cubic-bezier(.5, 0, .2, 1)", fill: "forwards" });
  const end = () => { layer.remove(); el.style.transition = transition; };
  a.finished.then(end, end);
}

/** Roll: text that changed rolls in from below (a name, a word). */
export function roll(el: Element, dir: 1 | -1 = 1) {
  return play(el, [{ opacity: 0, transform: `translateY(${dir * 12}px)` }, { opacity: 1, transform: "none" }], { duration: 240, easing: SPRING });
}

/** Flip: a label turns over to show what it says now (a box shown as Ren'Py and back: the speaker's name ↔ "Ren'Py").
 *  `old`: a copy of the label as it was and where it was, taken before the change. Both sides are drawn on top of the
 *  page (the box under them may be clipped while it morphs); the real label shows again once it has turned. */
export type Face = { el: HTMLElement; rect: DOMRect; opacity: string };
export const faceOf = (el: HTMLElement | null | undefined): Face | null => {
  if (!el) return null;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) return null;
  const copy = el.cloneNode(true) as HTMLElement;
  // the label's look, copied from where it sits (its styles depend on the box around it)
  for (const k of ["font", "color", "lineHeight", "padding", "gap", "display", "alignItems", "whiteSpace", "letterSpacing"] as const) copy.style[k] = cs[k];
  copy.style.setProperty("--whoL", cs.getPropertyValue("--whoL"));
  copy.removeAttribute("id");
  return { el: copy, rect: el.getBoundingClientRect(), opacity: cs.opacity };
};
export function flip(old: Face | null, now: HTMLElement | null | undefined) {
  if (calm()) return;
  const next = faceOf(now);
  if (!old && !next) return;
  const half = 150;
  const place = (f: Face) => {
    f.el.style.cssText += `;position:fixed;left:${f.rect.left}px;top:${f.rect.top}px;width:${f.rect.width}px;height:${f.rect.height}px;` +
      `margin:0;right:auto;max-width:none;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;pointer-events:none;z-index:40;` +
      `opacity:${f.opacity};transform-origin:50% 50%;backface-visibility:hidden;transition:none;background:none`;
    document.body.append(f.el);
  };
  if (old) {
    place(old);
    old.el.animate([{ transform: "perspective(300px) rotateX(0deg)" }, { transform: "perspective(300px) rotateX(90deg)", opacity: 0 }],
      { duration: half, easing: "cubic-bezier(.5, 0, .9, .5)", fill: "forwards" }).finished.then(() => old.el.remove(), () => old.el.remove());
  }
  if (next && now) {
    place(next);
    now.style.visibility = "hidden";
    const a = next.el.animate([{ transform: "perspective(300px) rotateX(-90deg)", opacity: 0 }, { transform: "perspective(300px) rotateX(0deg)", opacity: next.opacity }],
      { duration: half * 2, delay: old ? half : 0, easing: SPRING, fill: "backwards" });
    const end = () => { next.el.remove(); now.style.visibility = ""; };
    a.finished.then(end, end);
  }
}

/** Decode: `el` looks like its text scrambling into `text`, character by character. Draws on top of it (so it works
 *  on editors that own their DOM) and hides it meanwhile. */
export function decode(el: HTMLElement, text: string, ms = 460) {
  if (calm() || !text) return;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const over = document.createElement("pre");
  over.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;overflow:hidden;` +
    `pointer-events:none;z-index:40;white-space:pre-wrap;overflow-wrap:anywhere;font:${cs.font};line-height:${cs.lineHeight};` +
    `padding:${cs.padding};color:var(--color-bone)`;
  document.body.append(over);
  el.style.opacity = "0";
  const glyphs = "{}[]=_\"/\\<>#$*0123456789abcdef";
  const t0 = performance.now();
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    let out = "";
    for (let i = 0; i < text.length; i++) out += text[i] === "\n" || i < k * text.length ? text[i] : glyphs[(Math.random() * glyphs.length) | 0];
    over.textContent = out;
    if (k < 1) requestAnimationFrame(tick);
    else { over.remove(); el.style.opacity = ""; }
  };
  requestAnimationFrame(tick);
}

/** Type in: the text shows letter by letter, as if typed (a new tab's name). */
export function typeIn(el: HTMLElement) {
  const n = Math.max(1, (el.textContent ?? "").length);
  return play(el, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: Math.min(70 * n, 700), easing: `steps(${n}, end)`, fill: "backwards" });
}

/** Wave: the letters of `el` lift one after another (a slowed-down stretch of text). Drawn as a copy on top, so the
 *  text itself (in an editor) is never touched. */
export function wave(el: HTMLElement) {
  if (calm()) return;
  const cs = getComputedStyle(el);
  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:40";
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let i = 0;
  const range = document.createRange();
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    for (let c = 0; c < n.data.length; c++) {
      if (!n.data[c].trim()) continue;
      range.setStart(n, c); range.setEnd(n, c + 1);
      const r = range.getBoundingClientRect();
      const s = document.createElement("span");
      s.textContent = n.data[c];
      s.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;font:${cs.font};line-height:${r.height}px;color:${cs.color}`;
      layer.append(s);
      s.animate([{ transform: "none" }, { transform: "translateY(-5px)" }, { transform: "none" }], { duration: 380, delay: i++ * 40, easing: "ease-in-out" });
    }
  }
  document.body.append(layer);
  el.style.color = "transparent";
  setTimeout(() => { layer.remove(); el.style.color = ""; }, 380 + i * 40);
}

/** Glow: a mark lights up once as it appears. */
export function glow(el: Element, color = "var(--color-periwinkle)") {
  return play(el, [{ opacity: 0, textShadow: "0 0 0 transparent", filter: "brightness(1)" }, { opacity: 1, textShadow: `0 0 10px ${color}`, filter: "brightness(1.4)", offset: .35 }, { opacity: 1, textShadow: "0 0 0 transparent", filter: "brightness(1)" }], { duration: 700 });
}

// ---------------------------------------------------------------- pointing at something

/** Spotlight: everything else in `scope` that matches `others` dims for a moment, so `target` stands alone. */
export function spotlight(target: HTMLElement, scope: ParentNode, others: string) {
  if (calm()) return;
  const T = 1500;
  for (const el of scope.querySelectorAll<HTMLElement>(others)) {
    if (el === target || el.contains(target) || target.contains(el)) continue;
    // opacity only: a blur on every other card of a full board is what made this stutter
    el.animate([{ opacity: 1 }, { opacity: .25, offset: .18 }, { opacity: .25, offset: .75 }, { opacity: 1 }], { duration: T, easing: "ease-in-out" });
  }
  const ring = "0 0 0 2px var(--color-caramel), 0 0 24px color-mix(in srgb, var(--color-caramel) 40%, transparent)";
  target.animate([{ boxShadow: "0 0 0 transparent" }, { boxShadow: ring, offset: .18 }, { boxShadow: ring, offset: .75 }, { boxShadow: "0 0 0 transparent" }], { duration: T, easing: "ease-in-out" });
}


/** Crumple several elements at once (all copies of a card), then `remove` once. */
export function crumpleAll(els: Iterable<HTMLElement>, remove: () => void) {
  const list = [...els];
  if (!list.length) return remove();
  list.forEach((el, i) => crumple(el, i === 0 ? remove : () => {}));
}

import { escapeText, factorOf, tokenize } from "./renpyText";

/** A box's text, between Ren'Py (what's between the quotes: text tags, `\"`, `\n`, `{{`) and the editable element:
 *  `{i}`/`{b}`/`{u}`/`{s}` become real italic/bold/…, `{cps=*x}` a slower or faster span, pauses and line breaks
 *  small chips you can't type into, and any other tag a chip that keeps it exactly as written. `toDOM` then `fromDOM`
 *  gives back the same text. */

const STYLE: Record<string, string> = { i: "em", b: "strong", u: "u", s: "s" };
const TAG_OF: Record<string, string> = { EM: "i", I: "i", STRONG: "b", B: "b", U: "u", S: "s", STRIKE: "s" };

/** The marks' icons (the same icons as the top bar's buttons; the pause is filled, outlined bars blur at this size), drawn at one size next to their number. */
/** The filled pause's bars (also the top bar's pause icon, TextTools.tsx). */
export const PAUSE_BARS = [{ x: 14, y: 4, width: 4.5, height: 16, rx: 1.25 }, { x: 5.5, y: 4, width: 4.5, height: 16, rx: 1.25 }];
const ICON: Record<string, string> = {
  pause: `<g fill="currentColor" stroke="none">${PAUSE_BARS.map(r => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}"/>`).join("")}</g>`,
  click: '<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
  para: '<path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/>',
  on: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
  nl: '<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

/** A pause or click wait as Ren'Py reads it: `{w=0.5}` → w, 0.5; `{p}` → p, null (waits for a click). */
export function pauseOf(raw: string): { tag: "w" | "p"; secs: number | null } | null {
  const m = /^\{(w|p)(?:=([\d.]+))?\}$/.exec(raw);
  return m ? { tag: m[1] as "w" | "p", secs: m[2] ? +m[2] : null } : null;
}
export const pauseRaw = (tag: "w" | "p", secs: number | null) => `{${tag}${secs === null ? "" : "=" + secs}}`;

/** A mark for a tag (`raw` exactly as it is written, e.g. `{w=0.5}`), or a line break (`\n`). Pauses show an icon
 *  and their number; you can't type into a mark, a click opens its popup. */
export function chip(raw: string): HTMLElement {
  const e = document.createElement("span");
  e.contentEditable = "false";
  setChip(e, raw);
  return e;
}

/** Make `e` the mark for `raw` (in place, so a popup anchored to it stays put). */
export function setChip(e: HTMLElement, raw: string) {
  e.dataset.raw = raw;
  const look = (cls: string, ico: string, text: string, title: string) => {
    e.className = "bx-chip " + cls;
    e.innerHTML = icon(ico);
    if (text) e.append(text);
    e.title = title;
  };
  if (raw === "\\n") return look("bx-nl", "nl", "", "Line break in the textbox (Shift+Enter)");
  const p = pauseOf(raw);
  if (p) {
    const n = p.secs === null ? "" : String(p.secs);
    if (p.tag === "p") return look("bx-pause", "para", n, n ? `Waits ${n}, then goes on in a new line · Ctrl+scroll to change` : "Waits for a click, then goes on in a new line");
    return p.secs === null ? look("bx-pause", "click", "", "Waits for a click") : look("bx-pause", "pause", n, `Pause of ${n} · Ctrl+scroll to change`);
  }
  if (raw === "{nw}") return look("bx-pause bx-nw", "on", "", "Goes on by itself, without a click");
  e.className = "bx-chip bx-tag";
  e.textContent = raw;
  e.title = raw.startsWith("[") ? "A Ren'Py variable, filled in by the game" : "A Ren'Py text tag";
}

/** The lengths the pause popup offers ({w=…}; no unit shown, Ren'Py scales it by the text speed). */
export const PAUSES = [0.5, 1, 1.5, 2, 3, 5];

/** Ctrl+scroll on a mark: the next value in 0.05 steps (off-grid values snap onto it), kept in [min, max]; `skip`
 *  is jumped over (normal speed, which would take the speed's number away). */
export function stepBy(v: number, dir: 1 | -1, min: number, max: number, skip?: number): number {
  const STEP = 0.05, k = v / STEP;
  let n = (dir > 0 ? Math.floor(k + 1e-6) + 1 : Math.ceil(k - 1e-6) - 1) * STEP;
  if (Math.abs(n - (skip ?? NaN)) < 1e-6) n += dir * STEP;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

// ---------------------------------------------------------------- speed

/** The speeds the speed popup offers; 1 is normal speed (no tag). */
export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3];

/** Set a speed span's factor (`open`: keep the tag as it's written, e.g. `{cps=20}`). At 1 it writes no tag. */
export function setSpeed(span: HTMLElement, f: number, open?: string) {
  span.dataset.f = String(f);
  span.dataset.open = open ?? `{cps=*${f}}`;
  span.dataset.label = f === 1 ? "" : String(+f.toFixed(2));
  span.className = "bx-speed" + (f < 1 ? " bx-slow" : f > 1 ? " bx-fast" : "");
  span.title = f === 1 ? "Normal speed" : f < 1 ? `Written slower (×${+f.toFixed(2)})` : `Written faster (×${+f.toFixed(2)})`;
}

function speedSpan(f: number, open?: string) {
  const s = document.createElement("span");
  s.dataset.name = "cps";
  setSpeed(s, f, open);
  return s;
}

const closestIn = (el: HTMLElement, sel: string) => {
  const r = selRange();
  if (!r || !el.contains(r.startContainer)) return null;
  const n = r.startContainer.nodeType === 1 ? r.startContainer as HTMLElement : r.startContainer.parentElement;
  const hit = n?.closest<HTMLElement>(sel);
  return hit && el.contains(hit) && hit !== el ? hit : null;
};

/** What the caret is in: italic, bold, a speed span (its factor). */
export function marksAt(el: HTMLElement) {
  const sp = closestIn(el, "[data-f]");
  const r = selRange();
  return {
    i: !!closestIn(el, "em, i"), b: !!closestIn(el, "strong, b"),
    speed: sp ? +sp.dataset.f! : null,
    selected: !!r && !r.collapsed && el.contains(r.startContainer),
  };
}
export type Marks = ReturnType<typeof marksAt>;

/** The speed span around the caret, if any. */
export const speedAround = (el: HTMLElement) => closestIn(el, "[data-f]");

/** Wrap the selection in a speed span (factor `f`), the caret after it. */
export function wrapSpeed(el: HTMLElement, f: number): HTMLElement | null {
  const r = selRange();
  if (!r || r.collapsed || !el.contains(r.startContainer)) return null;
  const s = speedSpan(f);
  s.append(r.extractContents());
  r.insertNode(s);
  caretAfter(s);
  return s;
}

/** A click on a speed span's gauge and factor (drawn after its text), not on the text itself. */
export function onSpeedLabel(span: HTMLElement, x: number, y: number) {
  if (!span.dataset.label) return false;
  const r = document.createRange();
  r.selectNodeContents(span);
  const text = [...r.getClientRects()].filter(b => b.width > 0).pop();
  const all = [...span.getClientRects()].pop();
  if (!all) return false;
  const endX = text && Math.abs(text.top - all.top) < 4 ? text.right : all.left;
  return x >= endX - 1 && x <= all.right + 2 && y >= all.top - 2 && y <= all.bottom + 2;
}

export function caretAfter(n: Node) {
  const r = document.createRange();
  r.setStartAfter(n);
  r.collapse(true);
  const s = getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
}

/** A speed span at the caret, the caret inside it: what's typed next is written at that speed. */
export function speedAtCaret(el: HTMLElement, f: number) {
  const s = speedSpan(f);
  s.append("\u200b");
  insertAtCaret(el, s);
  const r = document.createRange();
  r.setStart(s.firstChild!, 1);
  r.collapse(true);
  const sel = getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
}

/** Take the span out, keep its text. */
export const unwrap = (span: HTMLElement) => span.replaceWith(...span.childNodes);

export function toDOM(el: HTMLElement, raw: string) {
  el.textContent = "";
  const stack: HTMLElement[] = [el];
  const top = () => stack[stack.length - 1];
  for (const t of tokenize(raw)) {
    if (t.kind === "text") { top().append(t.text); continue; }
    if (t.kind === "escape") { top().append(t.text === "\n" ? chip("\\n") : t.text); continue; }
    if (t.kind === "var") { top().append(chip(t.text)); continue; }
    const src = raw.slice(t.from, t.to);
    const styled = STYLE[t.name] && t.value === null;
    if ((styled || t.name === "cps") && !t.close) {
      const w = styled ? document.createElement(STYLE[t.name]) : speedSpan(factorOf(t.value), src);
      w.dataset.name = t.name;
      top().append(w);
      stack.push(w);
      continue;
    }
    if ((styled || t.name === "cps") && t.close && stack.length > 1 && top().dataset.name === t.name) { stack.pop(); continue; }
    top().append(chip(src));
  }
  padMarks(el);
}

const ZW = "\u200b";
const isMark = (n: Node | null): n is HTMLElement => n instanceof HTMLElement && n.dataset.raw != null;

/** A mark can't hold the caret, and the browser won't put it after one with nothing behind it (the end of the box, of
 *  a speed span, or right before another mark): give each such mark an invisible character to stand behind. */
export function padMarks(el: HTMLElement) {
  const r = selRange();
  el.querySelectorAll<HTMLElement>("[data-raw]").forEach(m => {
    const n = m.nextSibling;
    if (n?.nodeType === Node.TEXT_NODE && (n as Text).data) return;
    const zw = document.createTextNode(ZW);
    m.after(zw);
    // a caret right after the mark goes behind the new character, where the browser can show it
    if (r?.collapsed && r.startContainer === m.parentNode && r.startOffset === [...m.parentNode!.childNodes].indexOf(zw)) {
      const c = document.createRange();
      c.setStart(zw, 1);
      c.collapse(true);
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(c);
    }
  });
}

/** The mark the caret is just behind (only invisible characters between them), if any. */
export function markBeforeCaret(el: HTMLElement): HTMLElement | null {
  const r = selRange();
  if (!r || !r.collapsed || !el.contains(r.startContainer)) return null;
  const n = r.startContainer;
  if (n.nodeType === Node.TEXT_NODE) {
    if ((n as Text).data.slice(0, r.startOffset).replaceAll(ZW, "")) return null;
    return isMark(n.previousSibling) ? n.previousSibling : null;
  }
  const p = n.childNodes[r.startOffset - 1] ?? null;
  return isMark(p) ? p : null;
}

/** The character just before (or after) the caret is an invisible one, so a step that way would show no move. */
export function zwAtCaret(dir: "backward" | "forward") {
  const r = selRange();
  if (!r || !r.collapsed || r.startContainer.nodeType !== Node.TEXT_NODE) return false;
  const t = (r.startContainer as Text).data;
  return (dir === "backward" ? t[r.startOffset - 1] : t[r.startOffset]) === ZW;
}

/** Typed text as Ren'Py (the invisible characters behind marks dropped). */
const esc = (s: string) => escapeText(s.replaceAll(ZW, ""));

export function fromDOM(node: Node): string {
  let s = "";
  node.childNodes.forEach(n => {
    if (n.nodeType === Node.TEXT_NODE) { s += esc((n as Text).data); return; }
    if (!(n instanceof HTMLElement)) return;
    if (n.dataset.raw != null) { s += n.dataset.raw; return; }
    if (n.tagName === "BR") return;
    const inner = fromDOM(n);
    if (!inner) return;
    const tag = TAG_OF[n.tagName];
    if (tag) s += `{${tag}}${inner}{/${tag}}`;
    else if (n.dataset.f) s += n.dataset.f === "1" ? inner : `${n.dataset.open}${inner}{/cps}`;
    else if (n.tagName === "DIV" || n.tagName === "P") s += (s ? "\\n" : "") + inner;
    else s += inner;
  });
  return s;
}

/** How many characters of plain text `raw` shows (what the caret counts; chips don't count). */
export function plainCount(raw: string) {
  let n = 0;
  for (const t of tokenize(raw)) if (t.kind === "text") n += t.text.length; else if (t.kind === "escape" && t.text !== "\n") n += t.text.length;
  return n;
}

// ---------------------------------------------------------------- the caret

export const selRange = () => { const s = getSelection(); return s && s.rangeCount ? s.getRangeAt(0) : null; };

/** Nothing (no text, no chip) between the caret and the start (or end) of `el`. */
export function atEdge(el: HTMLElement, side: "start" | "end") {
  const r = selRange();
  if (!r || !r.collapsed || !el.contains(r.startContainer)) return false;
  const x = document.createRange();
  x.selectNodeContents(el);
  if (side === "start") x.setEnd(r.startContainer, r.startOffset); else x.setStart(r.endContainer, r.endOffset);
  const f = x.cloneContents();
  return f.textContent!.replace(/​/g, "") === "" && !f.querySelector("[data-raw]");
}

export const isEmpty = (el: HTMLElement) => el.textContent!.replace(/​/g, "").trim() === "" && !el.querySelector("[data-raw]");

/** Put the caret at the start, the end, or after `n` characters of plain text. */
export function setCaret(el: HTMLElement, where: "start" | "end" | number) {
  el.focus({ preventScroll: true });
  const r = document.createRange();
  if (where === "start" || where === "end") { r.selectNodeContents(el); r.collapse(where === "start"); }
  else {
    let left = where, done = false;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.parentElement?.closest("[data-raw]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      // the invisible characters behind marks don't count
      const d = (n as Text).data, len = d.replaceAll(ZW, "").length;
      if (left <= len) {
        let i = 0;
        for (let seen = 0; i < d.length && (seen < left || d[i] === ZW); i++) if (d[i] !== ZW) seen++;
        r.setStart(n, i); r.collapse(true); done = true; break;
      }
      left -= len;
    }
    if (!done) { r.selectNodeContents(el); r.collapse(false); }
  }
  const s = getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
}

/** How many characters of plain text are before the caret. */
export function caretCount(el: HTMLElement): number {
  const r = selRange();
  if (!r || !el.contains(r.startContainer)) return plainCount(fromDOM(el));
  const x = document.createRange();
  x.selectNodeContents(el);
  x.setEnd(r.startContainer, r.startOffset);
  const box = document.createElement("div");
  box.append(x.cloneContents());
  return plainCount(fromDOM(box));
}

/** The element's text split at the caret (a selection is dropped), as Ren'Py. */
export function splitAtCaret(el: HTMLElement): [string, string] {
  const r = selRange();
  if (!r || !el.contains(r.startContainer)) return [fromDOM(el), ""];
  r.deleteContents();
  const x = document.createRange();
  x.setStart(r.startContainer, r.startOffset);
  x.setEnd(el, el.childNodes.length);
  const tail = document.createElement("div");
  tail.append(x.cloneContents());
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(r.startContainer, r.startOffset);
  const head = document.createElement("div");
  head.append(before.cloneContents());
  return [fromDOM(head), fromDOM(tail)];
}

/** Put `node` at the caret (replacing a selection) and the caret after it. */
export function insertAtCaret(el: HTMLElement, node: Node) {
  const r = selRange();
  if (!r || !el.contains(r.startContainer)) { el.append(node); return; }
  r.deleteContents();
  r.insertNode(node);
  caretAfter(node);
  padMarks(el);
}

/** An arrow at the inner edge of italic/bold/a speed span with no text beyond it (the box's end, a mark, another
 *  span): the caret steps out of it, one level a press, so what's typed next isn't italic (or that speed) any more.
 *  The browser won't put the caret there by itself; an invisible character holds the spot. */
export function stepOutOfWrap(el: HTMLElement, dir: "backward" | "forward"): boolean {
  const r = selRange();
  if (!r || !r.collapsed || !el.contains(r.startContainer)) return false;
  const n = r.startContainer;
  const w = (n.nodeType === Node.ELEMENT_NODE ? n as HTMLElement : n.parentElement)?.closest<HTMLElement>("em, i, strong, b, u, s, [data-f]");
  if (!w || w === el || !el.contains(w) || w.dataset.raw != null) return false;
  const x = document.createRange();
  x.selectNodeContents(w);
  if (dir === "forward") x.setStart(r.startContainer, r.startOffset); else x.setEnd(r.startContainer, r.startOffset);
  const f = x.cloneContents();
  if (f.textContent!.replaceAll(ZW, "") || f.querySelector("[data-raw]")) return false;
  const side = dir === "forward" ? w.nextSibling : w.previousSibling;
  if (side?.nodeType === Node.TEXT_NODE && (side as Text).data.replaceAll(ZW, "")) return false;
  let t = side?.nodeType === Node.TEXT_NODE ? side as Text : null;
  if (!t) { t = document.createTextNode(ZW); if (dir === "forward") w.after(t); else w.before(t); }
  const c = document.createRange();
  c.setStart(t, dir === "forward" ? Math.min(1, t.data.length) : t.data.length);
  c.collapse(true);
  const s = getSelection()!;
  s.removeAllRanges();
  s.addRange(c);
  return true;
}

/** Up from the start of a box's text (or Down from its end): the caret goes to the box above (or below). */
export function stepToText(from: HTMLElement, dir: "up" | "down"): boolean {
  const all = [...document.querySelectorAll<HTMLElement>(".bx-page [data-text]")];
  const to = all[all.indexOf(from) + (dir === "up" ? -1 : 1)];
  if (!to) return false;
  if (to instanceof HTMLTextAreaElement) {
    to.focus({ preventScroll: true });
    const at = dir === "up" ? to.value.length : 0;
    to.setSelectionRange(at, at);
  } else setCaret(to, dir === "up" ? "end" : "start");
  to.scrollIntoView({ block: "nearest" });
  return true;
}

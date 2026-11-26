import { Popover as P } from "@base-ui/react/popover";
import { Bold, Gauge, Italic, MousePointerClick, Pilcrow, Rabbit, Redo2, Snail, Trash2, type LucideIcon, type LucideProps } from "lucide-react";
import { forwardRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "@/shared/ui/icon-button";
import { AnimatePresence, m, pop } from "@/shared/ui/motion";
import { popoverCls, surfaceCls } from "@/shared/ui/popover";
import {
  caretAfter, chip, insertAtCaret, PAUSE_BARS, pauseOf, pauseRaw, PAUSES, selRange, setChip, setSpeed, speedAround, SPEEDS, speedAtCaret, stepBy,
  unwrap, wrapSpeed, type Marks,
} from "../../lib/richtext";
import { useSceneUi } from "../../lib/ui";

/** The text tools of a say box: the buttons in the top bar (they add things), the `{` menu that opens at the caret,
 *  and the popups a click on a mark in the text opens (fixed choices for a speed, or for a pause; Ctrl+scroll on the
 *  mark steps it by 0.05). */

export const NO_MARKS: Marks = { i: false, b: false, speed: null, selected: false };
export const sameMarks = (a: Marks, b: Marks) => a.i === b.i && a.b === b.b && a.speed === b.speed && a.selected === b.selected;

/** What the top bar's speed button adds: slower, the usual case. Click its number in the text to change it. */
const NEW_SPEED = 0.5;

/** The speed button: takes out the speed the caret is in; else makes the selection (or what's typed next) slower. */
function toggleSpeed(el: HTMLElement) {
  const sp = speedAround(el);
  if (sp) { const last = sp.lastChild; unwrap(sp); if (last) caretAfter(last); return; }
  if (!wrapSpeed(el, NEW_SPEED)) speedAtCaret(el, NEW_SPEED);
}

/** Lucide's pause, filled: its outlined bars look muddy at button size. */
const Pause = forwardRef<SVGSVGElement, LucideProps>(({ size = 24, className, ...rest }, ref) => (
  <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor"
    aria-hidden="true" className={cn("lucide", className)} {...rest} stroke="none">
    {PAUSE_BARS.map(r => <rect key={r.x} {...r} />)}
  </svg>
)) as LucideIcon;
Pause.displayName = "PauseFilled";

// ---------------------------------------------------------------- what the text tools do

/** One thing the text tools can do: in the top bar (`bar`: its tooltip), in the `{` menu (`hint`: the tag it
 *  writes), or both. */
export type TextAction = {
  label: string; icon: LucideIcon; run: (el: HTMLElement) => void;
  hint?: string; bar?: string; kbd?: string;
  /** the top bar shows it pressed while the caret is in it */
  on?: (m: Marks) => boolean;
};

const mark = (raw: string) => (el: HTMLElement) => insertAtCaret(el, chip(raw));

const italic: TextAction = { label: "Italic", icon: Italic, hint: "{i}", bar: "Italic", kbd: "Ctrl+I", on: m => m.i, run: () => document.execCommand("italic") };
const bold: TextAction = { label: "Bold", icon: Bold, hint: "{b}", bar: "Bold", kbd: "Ctrl+B", on: m => m.b, run: () => document.execCommand("bold") };
const speed: TextAction = { label: "Speed", icon: Gauge, bar: "Slower (click its number in the text to change it)", kbd: "{", on: m => m.speed !== null, run: toggleSpeed };
const pause: TextAction = { label: "Pause", icon: Pause, hint: "{w=0.5}", bar: "Pause (click it in the text to change it)", kbd: "{", run: mark("{w=0.5}") };
const click: TextAction = { label: "Wait for a click", icon: MousePointerClick, hint: "{w}", bar: "Wait for a click", kbd: "{", run: mark("{w}") };
const para: TextAction = { label: "Wait for a click, then a new line", icon: Pilcrow, hint: "{p}", bar: "Wait for a click, then a new line", kbd: "{", run: mark("{p}") };
const noWait: TextAction = { label: "Go on without a click", icon: Redo2, hint: "{nw}", run: mark("{nw}") };
const slower: TextAction = { label: "Slower from here", icon: Snail, hint: "{cps=*0.5}", run: el => speedAtCaret(el, 0.5) };
const faster: TextAction = { label: "Faster from here", icon: Rabbit, hint: "{cps=*2}", run: el => speedAtCaret(el, 2) };

/** The top bar: styles | speed and the waits. */
const BAR = [[italic, bold], [speed, pause, click, para]];

// ---------------------------------------------------------------- the top bar

const on = "bg-caramel/20 text-paper";

/** Italic, bold, speed, a pause, a click wait, a click then a new line: for the say box you're typing in, dimmed
 *  while you aren't. Pressing one keeps the box focused. */
export function TextBar() {
  const t = useSceneUi(s => s.typing);
  const marks = t?.marks ?? NO_MARKS;
  const use = (a: TextAction) => () => {
    if (!t) return;
    t.el.focus({ preventScroll: true });
    a.run(t.el);
    t.commit();
  };
  return (
    <div role="toolbar" aria-label="Text effects" className="flex shrink-0 items-center gap-0.5" onMouseDown={e => e.preventDefault()}>
      {BAR.map((group, g) => (
        <span key={g} className="contents">
          {g > 0 && <span aria-hidden className="mx-1.5 h-4 w-px bg-ink-line" />}
          {group.map(a => {
            const pressed = a.on?.(marks);
            return (
              <IconButton key={a.label} icon={a.icon} size="sm" label={a === speed && pressed ? "Normal speed again" : a.bar!} kbd={a.kbd}
                tooltipSide="bottom" disabled={!t} aria-pressed={pressed} className={cn(pressed && on)} onClick={use(a)} />
            );
          })}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the `{` menu

export type BraceItem = TextAction & { hint: string };

/** The `{` menu: the waits and speeds, then the styles. */
export const BRACE_ITEMS = [pause, click, para, noWait, slower, faster, italic, bold] as BraceItem[];

/** Where the `{` was typed, what's typed after it, and the highlighted row. */
export type Brace = { node: Text; at: number; q: string; i: number; x: number; y: number };

export const braceMatches = (q: string) => {
  const s = q.toLowerCase();
  return BRACE_ITEMS.filter(it => (it.label + " " + it.hint).toLowerCase().includes(s));
};

/** Just typed `{`: open the menu there. */
export function braceAtCaret(): Brace | null {
  const r = selRange();
  if (!r || !r.collapsed || r.startContainer.nodeType !== Node.TEXT_NODE) return null;
  const node = r.startContainer as Text, at = r.startOffset - 1;
  if (node.data[at] !== "{") return null;
  const box = r.getClientRects()[0] ?? node.parentElement!.getBoundingClientRect();
  return { node, at, q: "", i: 0, x: box.left, y: box.bottom };
}

/** The menu after the caret moved or more was typed: the new filter, or null when it should close. */
export function braceUpdate(b: Brace): Brace | null {
  const r = selRange();
  if (!r || !r.collapsed || r.startContainer !== b.node || !b.node.isConnected || b.node.data[b.at] !== "{" || r.startOffset <= b.at) return null;
  const q = b.node.data.slice(b.at + 1, r.startOffset);
  if (/[\s{}]/.test(q) || !braceMatches(q).length) return null;
  return q === b.q ? b : { ...b, q, i: 0 };
}

/** Take out the `{` and what was typed after it, then do what the row does. */
export function bracePick(el: HTMLElement, b: Brace, it: BraceItem) {
  const r = document.createRange();
  r.setStart(b.node, b.at);
  r.setEnd(b.node, Math.min(b.node.data.length, b.at + 1 + b.q.length));
  r.deleteContents();
  r.collapse(true);
  const s = getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
  if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
  it.run(el);
}

export function BraceMenu({ brace, onPick }: { brace: Brace; onPick: (it: BraceItem) => void }) {
  const items = braceMatches(brace.q);
  return createPortal(
    <div className={cn(surfaceCls, "fixed z-50 min-w-60 p-1.5")} role="listbox" aria-label="Add to the text"
      style={{ left: Math.min(brace.x, innerWidth - 260), top: brace.y + 4 }} onMouseDown={e => e.preventDefault()}>
      {items.map((it, i) => (
        <div key={it.hint} role="option" aria-selected={i === brace.i} onClick={() => onPick(it)}
          className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-bone", i === brace.i ? "bg-paper/8 text-paper" : "hover:bg-paper/8")}>
          <it.icon className="h-3.5 w-3.5 text-taupe" strokeWidth={2.25} />
          <span className="truncate">{it.label}</span>
          <span className="ml-auto pl-4 font-mono text-xs text-taupe">{it.hint}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- the popups of the marks in the text

/** A mark in a say box whose popup is open: a speed span (its number) or a pause chip. */
type MarkEdit = { kind: "speed" | "pause"; mark: HTMLElement; box: HTMLElement; commit: () => void };
/** `tick`: the open mark changed under the popup (Ctrl+scroll), so it reads it again. */
const useMark = create<{ edit: MarkEdit | null; tick: number }>(() => ({ edit: null, tick: 0 }));

/** Open a mark's popup. The box keeps its place in the top bar meanwhile (`speedOpen`). */
export function openMark(edit: MarkEdit) {
  useSceneUi.setState({ speedOpen: true });
  useMark.setState({ edit });
}

/** Done: a speed back at normal goes (its text stays), the caret goes back after the mark. */
function closeMark() {
  const e = useMark.getState().edit;
  if (!e) return;
  useMark.setState({ edit: null });
  const { mark, box } = e;
  let after: Node | null = mark.isConnected ? mark : null;
  if (after && e.kind === "speed" && mark.dataset.f === "1") { after = mark.lastChild; unwrap(mark); }
  e.commit();
  box.focus({ preventScroll: true });
  if (after?.isConnected) caretAfter(after);
  useSceneUi.setState({ speedOpen: false });
}

const MIN_SPEED = 0.05, MAX_SPEED = 5, MIN_PAUSE = 0.5, MAX_PAUSE = 10;

/** Ctrl+scroll on a mark (`dir` 1: up, longer / faster): its value 0.05 further. False when it isn't a mark that
 *  has a number (a click wait, {nw}). A speed skips normal, so its number stays to scroll back. */
export function nudgeMark(kind: "speed" | "pause", mark: HTMLElement, dir: 1 | -1): boolean {
  if (kind === "speed") {
    const f = +mark.dataset.f!, n = stepBy(f, dir, MIN_SPEED, MAX_SPEED, 1);
    if (n !== f) setSpeed(mark, n);
  } else {
    const p = pauseOf(mark.dataset.raw!);
    if (!p || p.secs === null) return false;
    const n = stepBy(p.secs, dir, MIN_PAUSE, MAX_PAUSE);
    if (n !== p.secs) setChip(mark, pauseRaw(p.tag, n));
  }
  if (useMark.getState().edit?.mark === mark) useMark.setState(s => ({ tick: s.tick + 1 }));
  return true;
}

/** The one popup for the marks; rendered once by the box view. */
export function MarkPopup() {
  const edit = useMark(s => s.edit);
  const tick = useMark(s => s.tick);
  return (
    <P.Root open={!!edit} onOpenChange={v => { if (!v) closeMark(); }}>
      <AnimatePresence>
        {edit && (
          <P.Portal keepMounted>
            <P.Positioner anchor={edit.mark} side="bottom" align="center" sideOffset={6} className="z-50">
              <P.Popup className={cn(popoverCls, "p-2.5")} finalFocus={false} render={<m.div {...pop} />}>
                {edit.kind === "speed" ? <SpeedChoices key={tick} edit={edit} /> : <PauseChoices key={tick} edit={edit} />}
              </P.Popup>
            </P.Positioner>
          </P.Portal>
        )}
      </AnimatePresence>
    </P.Root>
  );
}

/** A row of fixed values, the current one lit (none when it's in between, e.g. scrolled to 0.85). */
function Choices<T extends number>({ title, value, options, at, label, onPick, dim }: {
  title: string; value: string; options: readonly T[]; at: number | null; label: (v: T) => string; onPick: (v: T) => void; dim?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-6 px-0.5">
        <span className="font-sans text-sm text-taupe">{title}</span>
        <span className="font-sans text-base font-semibold text-paper tabular-nums">{value}</span>
      </div>
      <div role="radiogroup" aria-label={title} className={cn("flex gap-1 transition-opacity", dim && "opacity-45")}>
        {options.map(v => (
          <button key={v} type="button" role="radio" aria-checked={v === at} onClick={() => onPick(v)}
            className={cn("rounded-md px-2 py-1 font-sans text-sm font-semibold tabular-nums transition-colors",
              v === at ? "bg-caramel/25 text-paper" : "text-bone hover:bg-paper/8 hover:text-paper")}>
            {label(v)}
          </button>
        ))}
      </div>
      <p className="mt-2 px-0.5 font-sans text-xs text-taupe">Ctrl+scroll on it in the text: 0.05 steps</p>
    </div>
  );
}

/** Normal speed takes the speed out (on closing). */
function SpeedChoices({ edit }: { edit: MarkEdit }) {
  const f = +edit.mark.dataset.f!;
  const pick = (v: number) => { setSpeed(edit.mark, v); closeMark(); };
  return (
    <>
      <Choices title="Speed" value={f === 1 ? "normal" : `×${+f.toFixed(2)}`} options={SPEEDS} at={SPEEDS.includes(f) ? f : null}
        label={v => (v === 1 ? "normal" : `×${v}`)} onPick={pick} />
      <Foot>
        <IconButton icon={Trash2} size="sm" tone="danger" label="Normal speed again" className="ml-auto" onClick={() => pick(1)} />
      </Foot>
    </>
  );
}

/** How long it pauses, or that it waits for a click; and whether the text goes on in a new line. */
function PauseChoices({ edit }: { edit: MarkEdit }) {
  const [p, setP] = useState(() => pauseOf(edit.mark.dataset.raw!) ?? { tag: "w" as const, secs: 0.5 });
  const [last, setLast] = useState(p.secs ?? 0.5);
  const write = (next: typeof p) => { setP(next); if (next.secs !== null) setLast(next.secs); setChip(edit.mark, pauseRaw(next.tag, next.secs)); edit.commit(); };
  const click = p.secs === null;
  const remove = () => { edit.mark.remove(); closeMark(); };
  return (
    <>
      <Choices title={click ? "Waits for a click" : "Pause"} value={click ? "click" : String(last)} options={PAUSES}
        at={!click && PAUSES.includes(last) ? last : null} label={String} dim={click}
        onPick={v => { write({ ...p, secs: v }); closeMark(); }} />
      <Foot>
        <Toggle icon={MousePointerClick} label="Wait for a click instead" pressed={click} onClick={() => write({ ...p, secs: click ? last : null })} />
        <Toggle icon={Pilcrow} label="Then a new line" pressed={p.tag === "p"} onClick={() => write({ ...p, tag: p.tag === "p" ? "w" : "p" })} />
        <IconButton icon={Trash2} size="sm" tone="danger" label="Remove" className="ml-auto" onClick={remove} />
      </Foot>
    </>
  );
}

const Foot = ({ children }: { children: React.ReactNode }) => <div className="mt-2.5 flex items-center gap-1 border-t border-ink-line pt-2">{children}</div>;
const Toggle = ({ icon, label, pressed, onClick }: { icon: LucideIcon; label: string; pressed: boolean; onClick: () => void }) => (
  <IconButton icon={icon} size="sm" label={label} aria-pressed={pressed} className={cn(pressed && on)} onClick={onClick} />
);

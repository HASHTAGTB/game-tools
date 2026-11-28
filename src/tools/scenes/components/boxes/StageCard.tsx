import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import { IconButton } from "@/shared/ui/icon-button";
import { expand, rise } from "@/shared/ui/flair";
import { AnimatePresence, m } from "@/shared/ui/motion";
import { useMorph } from "@/shared/ui/use-morph";
import { cn } from "@/shared/lib/utils";
import type { Box } from "../../lib/blocks";
import { worst } from "../../lib/fixes";
import { setStmt } from "../../lib/ops";
import { describe, formatStmt, isEditable, stmtHint, validStmt, type Stmt } from "../../lib/statements";
import { idAt, useSceneUi } from "../../lib/ui";
import { follow, stageBefore, useBox, type ListLayout } from "./context";
import { problemsOf } from "./kinds";
import { Fields } from "./fields";
import { Acts, Problems, useMoves } from "./List";
import { look } from "../../lib/look";
import type { Stage } from "../../lib/stage";
import type { Manifest } from "@/shared/lib/game";
import { CardFoot } from "./card/parts";
import { onCardKeys } from "./card/keys";

type StmtBox = Extract<Box, { kind: "stmt" }>;

/** A stage change (background, sprite, music, POV, date, a jump …) as a small pill. Click it and it opens in place:
 *  every change is written right away (Ctrl+Z undoes it), Done or Esc closes it. */
export function StageCard({ box: b, prev, next }: { box: StmtBox; prev: Box | null; next: Box | null; layout: ListLayout }) {
  const c = useBox();
  const id = idAt(c.view, b.from);
  const open = useSceneUi(s => s.openCard === id);
  const moves = useMoves(b, prev, next);
  const before = stageBefore(c, b.from);
  const d = describe(b.stmt, before, c.manifest);
  const probs = problemsOf(c, b);
  const bad = worst(probs);
  const editable = isEditable(b.stmt);
  const tint = b.stmt.kind === "show" || b.stmt.kind === "hide" ? b.stmt.tag : b.stmt.kind === "pov" ? b.stmt.who : null;
  const style = tint ? ({ "--whoL": look(c.manifest, tint).legible } as CSSProperties) : undefined;
  // the large view: the same form over the whole script column (more room for a grid), the preview still beside it
  const [big, setBig] = useState(false);
  useEffect(() => { if (!open) setBig(false); }, [open]);
  const close = () => useSceneUi.setState({ openCard: null });
  // opening and closing: the pill morphs into the card and back (the form fades out while it shrinks); back from the
  // large view the card morphs from its stand-in line to the form again
  const cardRef = useRef<HTMLDivElement>(null);
  useMorph(cardRef, open ? (big ? "big" : "open") : "closed");
  // where the large view grows out of: the card as it was when asked (before its form gives way to the stand-in)
  const bigFrom = useRef<Grown | null>(null);
  const goBig = () => { bigFrom.current = grownOf(cardRef.current); setBig(true); };

  return (
    <div className={cn("bx-stage", open && "bx-open")} data-line={b.from} data-from={b.from} data-to={b.to}>
      <div ref={cardRef} className={cn("bx-box bx-card", bad === "info" && "bx-missing", bad === "error" && "bx-error", bad === "warning" && "bx-warning")} style={style}
        title={bad === "info" ? probs.map(p => p.message).join("\n") : undefined}>
        <button type="button" className="bx-card-head" data-card
          onFocus={() => follow(c.view, b.from)}
          onClick={() => editable && useSceneUi.setState({ openCard: open ? null : id })}
          onKeyDown={e => {
            if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); (e.key === "ArrowUp" ? moves.up : moves.down)?.(); }
            if (e.key === "Escape" && open) close();
          }}>
          <d.ico strokeWidth={2.25} />
          <span className="bx-card-title">{d.title}</span>
          {d.detail && <span className="bx-card-detail">{d.detail}</span>}
          {open && (() => { const w = wasOf(b.stmt, before, c.manifest); return w && <span className="bx-card-was">← {w}</span>; })()}
        </button>
        <AnimatePresence mode="popLayout" initial={false}>
          {open && (
            <m.div key="form" exit={{ opacity: 0, transition: { duration: 0.12 } }}>
              {big
                ? <p className="px-4 pb-3 pt-1 font-talk text-sm text-taupe">Open in the large view.</p>
                : <CardForm key={b.from} box={b} onDone={close} />}
            </m.div>
          )}
        </AnimatePresence>
        {open && big && (
          <BigView anchor={cardRef} from={bigFrom.current} onSmall={() => setBig(false)} onClose={close} head={<><d.ico className="h-4 w-4" /><span className="bx-card-title">{d.title}</span>{d.detail && <span className="bx-card-detail">{d.detail}</span>}</>}>
            {leave => <CardForm key={b.from} box={b} onDone={() => leave(close)} />}
          </BigView>
        )}
        <Acts box={b} prev={prev} next={next}>
          {open && !big && <IconButton icon={Maximize2} size="sm" label="Large view" onClick={goBig} />}
        </Acts>
      </div>
      {!open && <Problems list={probs} />}
    </div>
  );
}

function CardForm({ box: b, onDone }: { box: StmtBox; onDone: () => void }) {
  const c = useBox();
  const script = useSceneUi(s => s.script)!;
  const [x, setX] = useState<Stmt>(b.stmt);
  const set = (patch: Partial<Stmt>) => setX(v => ({ ...v, ...patch }) as Stmt);
  const form = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (form.current) rise(form.current.children); }, []);
  // written as soon as it's valid Ren'Py
  useEffect(() => {
    if (validStmt(x) && formatStmt(x) !== formatStmt(b.stmt)) setStmt(c.view, b.from, x);
  }, [x]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={form} className="bx-card-form flex flex-col gap-3.5 px-4 pb-3.5 pt-1.5"
      onKeyDown={e => {
        // Escape in the search clears it first (it marks the key as handled)
        if (e.key === "Escape") { e.stopPropagation(); if (!e.defaultPrevented) onDone(); return; }
        onCardKeys(e);
      }}>
      <Fields x={x} set={set} cast={c.cast} m={c.manifest} stage={stageBefore(c, b.from)} script={script} line={b.from} />
      <CardFoot keys={KEYS[x.kind] ?? KEYS.default} onDone={onDone}
        note={!validStmt(x) && formatStmt(x) !== formatStmt(b.stmt) && <span className="font-talk text-sm text-coral">Not written yet: {stmtHint(x)}</span>} />
      <Problems list={problemsOf(c, b)} />
    </div>
  );
}

/** The keys each card's foot lists. */
const KEYS: Record<string, string[]> = {
  scene: ["[Type] filter", "[←] [→] [↑] [↓] move", "[Enter] pick", "[Esc] close"],
  show: ["[Type] filter", "[1]–[9] expression", "[←] [→] [↑] [↓] move", "[Enter] pick", "[Esc] close"],
  play: ["[Type] filter", "[↑] [↓] move", "[Space] listen", "[Enter] pick", "[Esc] close"],
  time: ["[←] [→] 5 min", "[Shift] + [←] [→] 1 hour", "[Esc] close"],
  date: ["[Esc] close"],
  default: ["[Esc] close"],
};

/** What a card's statement replaces on stage, for its head ("← Classroom evening"); null when there's nothing to say. */
function wasOf(x: Stmt, before: Stage, m: Manifest | null): string | null {
  switch (x.kind) {
    case "scene": return before.background && before.background !== x.image ? before.background : null;
    case "show": {
      const old = before.sprites.find(s => s.tag === x.tag);
      return old ? [old.attrs.join(" "), old.at && x.at && old.at !== x.at ? old.at : null].filter(Boolean).join(" · ") || null : null;
    }
    case "play": return before.music && before.music !== x.name ? before.music : null;
    case "time": return before.time && before.time !== x.time ? before.time : null;
    case "date": return before.date && before.date !== x.date ? [before.date, before.time].filter(Boolean).join(" ") : null;
    case "pov": return before.pov && before.pov !== x.who ? look(m, before.pov).name : null;
    default: return null;
  }
}

type Grown = { rect: DOMRect; r: string; bg: string };
const grownOf = (el: HTMLElement | null): Grown | null => {
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { rect: el.getBoundingClientRect(), r: cs.borderTopLeftRadius, bg: cs.backgroundColor };
};

/** The open card's form over the whole script column (the column that scrolls the boxes), until made small again. It
 *  grows out of the card (`from`) and shrinks back into it, also when closed from inside (`children` gets `leave`). */
function BigView({ anchor, from, head, onSmall, onClose, children }: {
  anchor: React.RefObject<HTMLElement | null>; from: Grown | null; head: ReactNode; onSmall: () => void; onClose: () => void;
  children: (leave: (then: () => void) => void) => ReactNode;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  const leave = (then: () => void) => {
    const to = grownOf(anchor.current);
    if (leaving.current) return;
    if (!to || !ref.current) return then();
    leaving.current = true;
    void expand(ref.current, to, true).then(then);
  };
  const latest = useRef(leave);
  latest.current = leave;
  // grows once it's placed
  const grown = useRef(false);
  useLayoutEffect(() => {
    if (!rect || grown.current || !ref.current) return;
    grown.current = true;
    const f = from ?? grownOf(anchor.current);
    if (f) void expand(ref.current, f);
  }, [rect]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Esc with the focus outside the form (the form's own Esc stops there)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) latest.current(onClose); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  useLayoutEffect(() => {
    let el: HTMLElement | null = anchor.current;
    while (el && !(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    const measure = () => setRect((el ?? document.body).getBoundingClientRect());
    measure();
    const ro = new ResizeObserver(measure);
    if (el) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [anchor]);
  if (!rect) return null;
  return createPortal(
    <div ref={ref} className="bx-big" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
      <div className="bx-big-head">
        {head}
        <IconButton icon={Minimize2} size="sm" label="Back in the script" className="ml-auto" onClick={() => leave(onSmall)} />
      </div>
      <div className="bx-big-body">{children(leave)}</div>
    </div>,
    document.body,
  );
}

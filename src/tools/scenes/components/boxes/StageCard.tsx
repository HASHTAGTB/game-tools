import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import type { Box } from "../../lib/blocks";
import { formatStmt, type Stmt } from "../../lib/script";
import { describe, EDITABLE } from "../../lib/scriptView";
import { setStmt } from "../../lib/ops";
import { useSceneUi } from "../../lib/ui";
import { follow, problemsOf, speaker, stageBefore, useBox, type ListLayout } from "./context";
import { Fields, validStmt } from "./fields";
import { Acts, Problems, useMoves, worst } from "./List";

type StmtBox = Extract<Box, { kind: "stmt" }>;

/** A stage change (background, sprite, music, POV, date, a jump …) as a small pill. Click it and it opens in place:
 *  every change is written right away (Ctrl+Z undoes it), Done or Esc closes it. */
export function StageCard({ box: b, prev, next }: { box: StmtBox; prev: Box | null; next: Box | null; layout: ListLayout }) {
  const c = useBox();
  const open = useSceneUi(s => s.openCard === b.from);
  const moves = useMoves(b, prev, next);
  const before = stageBefore(c, b.from);
  const d = describe(b.stmt, before, c.manifest);
  const probs = problemsOf(c, b);
  const bad = worst(probs);
  const editable = EDITABLE.has(b.stmt.kind);
  const tint = b.stmt.kind === "show" || b.stmt.kind === "hide" ? b.stmt.tag : b.stmt.kind === "pov" ? b.stmt.who : null;
  const style = tint ? ({ "--whoL": speaker(c, tint).legible } as CSSProperties) : undefined;
  const close = () => useSceneUi.setState({ openCard: null });

  return (
    <div className={cn("bx-stage", open && "bx-open")} data-line={b.from} data-from={b.from} data-to={b.to}>
      <div className={cn("bx-box bx-card", bad === "info" && "bx-missing", bad === "error" && "bx-error", bad === "warning" && "bx-warning")} style={style}
        title={bad === "info" ? probs.map(p => p.message).join("\n") : undefined}>
        <button type="button" className="bx-card-head" data-card
          onFocus={() => follow(c.view, b.from)}
          onClick={() => editable && useSceneUi.setState({ openCard: open ? null : b.from })}
          onKeyDown={e => {
            if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); (e.key === "ArrowUp" ? moves.up : moves.down)?.(); }
            if (e.key === "Escape" && open) close();
          }}>
          <d.ico strokeWidth={2.25} />
          <span className="bx-card-title">{d.title}</span>
          {d.detail && <span className="bx-card-detail">{d.detail}</span>}
        </button>
        {open && <CardForm key={b.from} box={b} onDone={close} />}
        <Acts box={b} prev={prev} next={next} />
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
  // written as soon as it's valid Ren'Py
  useEffect(() => {
    if (validStmt(x) && formatStmt(x) !== formatStmt(b.stmt)) setStmt(c.view, b.from, x);
  }, [x]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3.5 px-4 pb-3.5 pt-1.5" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onDone(); } }}>
      <Fields x={x} set={set} cast={c.cast} m={c.manifest} stage={stageBefore(c, b.from)} script={script} line={b.from} />
      <div className="flex items-center justify-end gap-3">
        {!validStmt(x) && formatStmt(x) !== formatStmt(b.stmt) && <span className="mr-auto font-talk text-sm text-coral">Not written yet: {hint(x)}</span>}
        <Button size="sm" variant="primary" onClick={onDone}>Done</Button>
      </div>
      <Problems list={problemsOf(c, b)} />
    </div>
  );
}

function hint(x: Stmt) {
  switch (x.kind) {
    case "jump": case "call": return "pick the scene it goes to.";
    case "date": return "pick a day.";
    case "time": return "write it like 13:12.";
    case "phone": return "name the chat.";
    default: return "names can't have spaces.";
  }
}

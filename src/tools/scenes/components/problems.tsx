import type { EditorView } from "@codemirror/view";
import { Wrench } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { SeverityIcon } from "@/shared/ui/problems";
import type { Problem } from "../lib/checks";
import { applyFix } from "../lib/fixes";

/** How problems look wherever they're listed: under a box, in the checks list, on an empty page. */

/** The button that puts a problem's fix in. Doesn't take the focus from the box being typed in. */
export function FixButton({ view, problem, variant = "quiet", className }: {
  view: EditorView | null; problem: Problem; variant?: "quiet" | "primary"; className?: string;
}) {
  if (!problem.fix) return null;
  return (
    <Button size="sm" variant={variant} className={className} title={problem.fix.label}
      onMouseDown={e => e.preventDefault()} onClick={() => { if (view) applyFix(view, problem); }}>
      <Wrench className={cn("shrink-0", variant === "primary" ? "h-3.5 w-3.5" : "h-3 w-3")} />{problem.fix.label}
    </Button>
  );
}

/** A box's problems under it (missing art only marks the card, it's not a problem to fix). */
export function BoxProblems({ list, view }: { list: Problem[]; view: EditorView }) {
  const real = list.filter(p => p.severity !== "info");
  if (!real.length) return null;
  return (
    <div className="bx-probs">
      {real.map((p, i) => (
        <div key={i} className="bx-prob">
          <SeverityIcon level={p.severity} />
          <span className="min-w-0 flex-1">{p.message}</span>
          <FixButton view={view} problem={p} className="h-6" />
        </div>
      ))}
    </div>
  );
}

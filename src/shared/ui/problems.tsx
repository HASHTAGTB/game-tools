import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Switch } from "./switch";

/** How a tool's checks look wherever they're listed (the timeline's Checks, a scene's checks, under a box). */

export type Severity = "error" | "warning" | "info";

const SEVERITY = {
  error: { icon: CircleAlert, tone: "text-coral" },
  warning: { icon: TriangleAlert, tone: "text-butter" },
  info: { icon: Info, tone: "text-taupe" },
} as const;

export function SeverityIcon({ level, className }: { level: Severity; className?: string }) {
  const { icon: Icon, tone } = SEVERITY[level];
  return <Icon aria-label={level} className={cn("h-3.5 w-3.5 shrink-0", tone, className)} />;
}

/** One problem: its icon and message (a click goes to what it's about), and an optional action on the right. */
export function ProblemRow({ level, onGo, prefix, action, children }: {
  level: Severity; onGo?: () => void; /** dim text before the message (a line number) */ prefix?: ReactNode; action?: ReactNode; children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2 rounded-md px-2 py-1.5 has-[button:enabled:hover]:bg-paper/8">
      <SeverityIcon level={level} className="mt-0.5" />
      <button disabled={!onGo} onClick={onGo}
        className="min-w-0 flex-1 select-text text-left font-talk text-sm leading-snug text-bone enabled:hover:text-paper">
        {prefix !== undefined && <span className="mr-1.5 text-xs tabular-nums text-taupe">{prefix}</span>}{children}
      </button>
      {action}
    </li>
  );
}

/** "2 to check" (or "all good") and a switch for the notes, which are hidden by default. */
export function ProblemSummary({ real, notes, notesLabel = "notes", showNotes, onShowNotes }: {
  real: number; notes: number; notesLabel?: string; showNotes: boolean; onShowNotes: (v: boolean) => void;
}) {
  return (
    <span className="flex items-center gap-3 font-talk text-sm text-taupe">
      {real ? `${real} to check` : "all good"}
      {notes > 0 && (
        <label className="flex items-center gap-1.5 text-xs">
          <Switch checked={showNotes} onCheckedChange={onShowNotes} />{notes} {notesLabel}
        </label>
      )}
    </span>
  );
}

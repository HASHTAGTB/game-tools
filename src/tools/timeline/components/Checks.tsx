import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { Popover } from "@/shared/ui/popover";
import type { Check } from "../lib/checks";
import { useTimeline } from "../state";

const ICON = { error: CircleAlert, warning: TriangleAlert, info: Info };
const TONE = { error: "text-coral", warning: "text-butter", info: "text-taupe" };

/** Toolbar button with the number of problems; opens the list. Clicking one selects what it is about. */
export function ChecksButton({ checks, onGo }: { checks: Check[]; onGo: (c: Check) => void }) {
  const [open, setOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const errors = checks.filter(c => c.level === "error").length;
  const warnings = checks.filter(c => c.level === "warning").length;
  const infos = checks.length - errors - warnings;
  const shown = showInfo ? checks : checks.filter(c => c.level !== "info");
  const select = useTimeline(s => s.select);
  return (
    <Popover open={open} onOpenChange={setOpen} side="bottom" align="end" className="w-[30rem] p-0" trigger={
      <button className={cn("flex items-center gap-1.5 rounded-sm px-1.5 py-1 font-talk text-[13px] hover:bg-ink-3", errors ? "text-coral" : warnings ? "text-butter" : "text-taupe")}>
        {errors + warnings ? <TriangleAlert className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
        {errors + warnings ? `${errors + warnings} to check` : "No problems"}
      </button>
    }>
      <div className="flex items-baseline gap-3 border-b border-ink-line px-4 py-2.5">
        <p className="flex-1 font-sans text-[17px] text-paper">Checks</p>
        <span className="font-talk text-[12px] text-taupe">{errors} errors · {warnings} warnings</span>
        <label className="flex items-center gap-1 font-talk text-[12px] text-taupe">
          <input type="checkbox" checked={showInfo} onChange={e => setShowInfo(e.target.checked)} /> {infos} notes
        </label>
      </div>
      <ul className="max-h-[60vh] overflow-y-auto py-1">
        {shown.length ? shown.map((c, i) => {
          const Icon = ICON[c.level];
          return (
            <li key={i}>
              <button disabled={!c.target && !c.go} onClick={() => { if (c.target) select(c.target); onGo(c); setOpen(false); }}
                className="flex w-full items-start gap-2 px-4 py-1.5 text-left font-talk text-[13px] leading-snug text-bone enabled:hover:bg-ink-3 enabled:hover:text-paper">
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", TONE[c.level])} />
                <span className="min-w-0 flex-1 select-text">{c.message}</span>
              </button>
            </li>
          );
        }) : <li className="px-4 py-3 font-talk text-[13px] text-taupe">Nothing to check.</li>}
      </ul>
    </Popover>
  );
}

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverTitle } from "@/shared/ui/popover";
import { ProblemRow, ProblemSummary } from "@/shared/ui/problems";
import type { Check } from "../lib/checks";
import { useTimeline } from "../state";

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
      <Button size="sm" variant="quiet" className={cn(errors ? "text-coral" : warnings ? "text-butter" : "")}>
        {errors + warnings ? <TriangleAlert className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
        {errors + warnings ? `${errors + warnings} to check` : "No problems"}
      </Button>
    }>
      <div className="flex items-start gap-3 border-b border-ink-line px-4 pb-2.5 pt-3">
        <PopoverTitle className="mb-0 flex-1">Checks</PopoverTitle>
        <ProblemSummary real={errors + warnings} notes={infos} showNotes={showInfo} onShowNotes={setShowInfo} />
      </div>
      <ul className="max-h-[60vh] overflow-y-auto px-2 py-1.5">
        {shown.length ? shown.map((c, i) => (
          <ProblemRow key={i} level={c.level} onGo={c.target || c.go ? () => { if (c.target) select(c.target); onGo(c); setOpen(false); } : undefined}>
            {c.message}
          </ProblemRow>
        )) : <li className="px-2 py-2 font-talk text-sm text-taupe">Nothing to check.</li>}
      </ul>
    </Popover>
  );
}

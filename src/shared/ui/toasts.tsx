import { CircleAlert, Check, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { AnimatePresence, m, pop } from "./motion";

type Toast = { id: string; kind: "error" | "notice"; text: string; onDismiss?: () => void };

/** Messages floating over the bottom of their container (which needs `relative`), so they never push the layout.
    Errors stay until dismissed; notices are cleared by whoever set them. */
export function Toasts({ items, className }: { items: Toast[]; className?: string }) {
  return (
    <div aria-live="polite" className={cn("pointer-events-none absolute inset-x-0 z-40 flex flex-col items-center gap-2 px-6", className)}>
      <AnimatePresence initial={false}>
        {items.map(t => (
          <m.div
            key={t.id + t.text}
            layout="position"
            role={t.kind === "error" ? "alert" : "status"}
            {...pop}
            initial={{ ...pop.initial, y: 8 }}
            animate={{ ...pop.animate, y: 0 }}
            className={cn(
              "pointer-events-auto flex max-w-xl items-center gap-3 rounded-xl border-[3px] bg-ink-2 py-2 pl-3 pr-2 font-talk text-[15px] text-paper shadow-[0_12px_40px_rgba(0,0,0,.45)]",
              t.kind === "error" ? "border-coral" : "border-paper",
            )}
          >
            {t.kind === "error" ? <CircleAlert className="h-4 w-4 shrink-0 text-coral" /> : <Check className="h-4 w-4 shrink-0 text-caramel" />}
            <span className="min-w-0 flex-1 select-text">{t.text}</span>
            {t.onDismiss && (
              <button onClick={t.onDismiss} aria-label="Dismiss" className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-taupe hover:text-paper">
                <X className="h-4 w-4" />
              </button>
            )}
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

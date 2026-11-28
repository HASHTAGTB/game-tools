import { CircleAlert, Check, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { MotionItem, MotionList } from "./motion-list";
import { surfaceCls } from "./popover";

type Toast = { id: string; kind: "error" | "notice"; text: string; onDismiss?: () => void; action?: { label: string; run: () => void } };

/** Messages floating over the bottom of their container (which needs `relative`), so they never push the layout.
    Errors stay until dismissed; notices are cleared by whoever set them. */
export function Toasts({ items, className }: { items: Toast[]; className?: string }) {
  return (
    <div aria-live="polite" className={cn("pointer-events-none absolute inset-x-0 z-40 flex flex-col items-center gap-2 px-6", className)}>
      {/* a list like any other: a new message drops in, a dismissed one crumples, the others slide */}
      <MotionList>
        {items.map(t => (
          <MotionItem
            as="div"
            key={t.id + t.text}
            role={t.kind === "error" ? "alert" : "status"}
            className={cn(
              surfaceCls, "pointer-events-auto flex max-w-xl items-center gap-3 py-2 pl-3 pr-2",
              t.kind === "error" && "border-coral/70",
            )}
          >
            {t.kind === "error" ? <CircleAlert className="h-4 w-4 shrink-0 text-coral" /> : <Check className="h-4 w-4 shrink-0 text-caramel" />}
            <span className="min-w-0 flex-1 select-text">{t.text}</span>
            {t.action && (
              <button onClick={t.action.run} className="shrink-0 font-sans text-caramel underline-offset-4 decoration-2 hover:text-paper hover:underline">
                {t.action.label}
              </button>
            )}
            {t.onDismiss && (
              <button onClick={t.onDismiss} aria-label="Dismiss" className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-taupe hover:text-paper">
                <X className="h-4 w-4" />
              </button>
            )}
          </MotionItem>
        ))}
      </MotionList>
    </div>
  );
}

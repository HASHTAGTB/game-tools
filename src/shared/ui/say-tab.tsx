import { cn } from "@/shared/lib/utils";
import { AnimatePresence, m, spring } from "./motion";

/** The game's namebox on top of a say box. On another speaker the old tab ducks behind the box and the new one
 *  springs up ("Tab swap"). `id`: who it is (a change swaps). Put it right before the `.say-box`. */
export function SayTab({ id, name, color, className }: { id: string; name: string; color: string; className?: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span key={id}
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%", transition: { duration: 0.12, ease: "easeIn" } }}
        transition={spring.bouncy}
        className={cn("say-tab", className)}
        style={{ color: `color-mix(in srgb, ${color} 78%, #2f2924)` }}>
        {name}
      </m.span>
    </AnimatePresence>
  );
}

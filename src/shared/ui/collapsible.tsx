import { Collapsible } from "@base-ui/react/collapsible";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { fade, m, spring } from "./motion";

/** Collapsible.Panel whose height springs open and closed.
    Base UI can't see Motion's height animation and would hide the panel at once on close, so it stays
    mounted, collapses to 0 and is made `inert` instead (no focus, hidden from screen readers).
    Put padding on `className`: it goes on an inner div so the outer one can reach a true 0. */
export function CollapsiblePanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Collapsible.Panel
      keepMounted
      render={(props, { open }) => (
        <m.div
          {...(props as object)}
          hidden={false}
          inert={!open}
          className={cn(props.className, "overflow-hidden")}
          initial={false}
          animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{ ...spring.smooth, opacity: open ? fade.in : fade.out }}
        />
      )}
    >
      <div className={className}>{children}</div>
    </Collapsible.Panel>
  );
}

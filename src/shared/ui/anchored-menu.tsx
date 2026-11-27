import { Menu } from "@base-ui/react/menu";
import { bloomRef } from "@/shared/ui/flair";
import { bloomCls } from "@/shared/ui/motion";
import type { LucideIcon } from "lucide-react";
import { create } from "zustand";
import { cn } from "@/shared/lib/utils";
import { popoverCls } from "@/shared/ui/popover";

/** A menu opened from outside React, next to any element: things CodeMirror draws (a table's handles, a scene's
 *  pause marks) open it through `openAnchoredMenu`; the page renders the one host. */

export type AnchoredMenuItem =
  | { icon: LucideIcon; label: string; run: () => void; danger?: boolean; checked?: boolean; disabled?: boolean }
  | "-";

const useAnchoredMenu = create<{ anchor: Element | null; items: AnchoredMenuItem[] }>(() => ({ anchor: null, items: [] }));

export const openAnchoredMenu = (anchor: Element, items: AnchoredMenuItem[]) => useAnchoredMenu.setState({ anchor, items });
const close = () => useAnchoredMenu.setState({ anchor: null });

export function AnchoredMenuHost() {
  const { anchor, items } = useAnchoredMenu();
  return (
    <Menu.Root open={!!anchor} onOpenChange={open => { if (!open) close(); }}>
      <Menu.Portal>
        <Menu.Positioner anchor={anchor} side="bottom" align="start" sideOffset={4} className="z-50">
          <Menu.Popup className={cn(popoverCls, "min-w-52 p-1.5", bloomCls)}>
<div className="contents" ref={bloomRef}>
            {items.map((it, i) => it === "-"
              ? <Menu.Separator key={i} className="my-1 h-px bg-ink-line" />
              : (
                <Menu.Item key={i} disabled={it.disabled} onClick={() => { close(); it.run(); }}
                  className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-base outline-hidden select-none data-highlighted:bg-paper/8 data-disabled:cursor-default data-disabled:opacity-40",
                    it.danger ? "text-bone data-highlighted:text-coral" : "text-bone data-highlighted:text-paper")}>
                  <it.icon className={cn("h-3.5 w-3.5", it.checked ? "text-caramel" : "text-taupe")} strokeWidth={2.25} />
                  <span className={cn("truncate", it.checked && "text-paper")}>{it.label}</span>
                </Menu.Item>
              ))}
          </div>
</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

import { Menu } from "@base-ui/react/menu";
import type { LucideIcon } from "lucide-react";
import { create } from "zustand";
import { cn } from "@/shared/lib/utils";
import { popoverCls } from "@/shared/ui/popover";

/** The menu behind a table's row, column and corner handles. The table is drawn by CodeMirror, outside React, so it
 *  opens this menu through `openTableMenu`; the Editor renders the one host. */

export type TableMenuItem =
  | { icon: LucideIcon; label: string; run: () => void; danger?: boolean; checked?: boolean; disabled?: boolean }
  | "-";

const useTableMenu = create<{ anchor: Element | null; items: TableMenuItem[] }>(() => ({ anchor: null, items: [] }));

export const openTableMenu = (anchor: Element, items: TableMenuItem[]) => useTableMenu.setState({ anchor, items });
const close = () => useTableMenu.setState({ anchor: null });

export function TableMenuHost() {
  const { anchor, items } = useTableMenu();
  return (
    <Menu.Root open={!!anchor} onOpenChange={open => { if (!open) close(); }}>
      <Menu.Portal>
        <Menu.Positioner anchor={anchor} side="bottom" align="start" sideOffset={4} className="z-50">
          <Menu.Popup className={cn(popoverCls, "min-w-52 p-1.5 transition-[opacity,scale] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0")}>
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
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

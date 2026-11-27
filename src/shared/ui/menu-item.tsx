import { ContextMenu } from "@base-ui/react/context-menu";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

/** Rows of a popup menu (context menus, the anchored menu, a folder's contents): icon, label, a soft highlight.
 *  `data-highlighted` is Base UI's (keyboard or pointer); plain buttons get the same look on hover. */
const ROW = "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-base text-bone outline-hidden select-none transition-colors";
export const menuItemCls = (danger?: boolean) => cn(ROW,
  "data-highlighted:bg-paper/8 data-disabled:cursor-default data-disabled:opacity-40",
  danger ? "data-highlighted:text-coral" : "data-highlighted:text-paper");
export const menuButtonCls = cn(ROW, "hover:bg-paper/8 hover:text-paper");

/** The row's icon: dim, or caramel while it's the current choice. */
export const MenuItemIcon = ({ icon: Icon, on }: { icon: LucideIcon; on?: boolean }) => (
  <Icon className={cn("h-3.5 w-3.5 shrink-0", on ? "text-caramel" : "text-taupe")} strokeWidth={2.25} />
);

export const menuSeparatorCls = "my-1 h-px bg-ink-line";

/** One action of a right-click menu. */
export function ContextMenuItem({ icon, label, danger, onClick }: { icon: LucideIcon; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <ContextMenu.Item onClick={onClick} className={menuItemCls(danger)}>
      <MenuItemIcon icon={icon} />
      <span className="truncate">{label}</span>
    </ContextMenu.Item>
  );
}
export const ContextMenuSeparator = () => <ContextMenu.Separator className={menuSeparatorCls} />;

import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Pin, PinOff } from "lucide-react";
import { TOOLS, type ToolInfo } from "@/app/tools";
import { browserPrefs } from "@/shared/lib/toolState";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "./icon-button";
import { MenuItem, MenuRule } from "./menu";

/** Whether the tools list stays open under the header or only shows on hover: this browser only, every tool. */
const navPrefs = browserPrefs("tool-nav", p => ({ pinned: p.pinned !== false }));

/** Sidebar head: a 48px header row in line with the top bar (`lead`, the collapse button, in its left corner, then
 *  the current tool's name and the pin toggle), and under it every tool as a game-menu list, one click to switch.
 *  Pinned, the list sits in the sidebar; unpinned, it drops over the sidebar while the header (or the list) is hovered
 *  or has focus. */
export function ToolNav({ current, lead }: { current: ToolInfo; lead?: ReactNode }) {
  const [pinned, setPinned] = useState(() => navPrefs.read().pinned);
  const togglePin = () => setPinned(p => { navPrefs.write({ pinned: !p }); return !p; });
  const navigate = useNavigate();
  const tools = Object.values(TOOLS as Record<string, ToolInfo>);

  const list = (
    <MenuRule aria-label="Tools">
      {tools.map(t => (
        <MenuItem key={t.path} size="base" label={t.name} title={t.description} active={t.path === current.path}
          onClick={() => { if (t.path !== current.path) void navigate({ to: t.path as "/" }); }} />
      ))}
    </MenuRule>
  );

  return (
    <div className="group/tools relative z-20 shrink-0">
      <div className="flex h-12 items-center gap-2 border-b border-ink-line/60 px-3">
        {lead}
        <h1 className="min-w-0 flex-1 truncate font-sans text-lg font-light leading-none text-paper">{current.name}</h1>
        <IconButton icon={pinned ? PinOff : Pin} size="sm" tooltipSide="bottom" pressed={pinned} onClick={togglePin}
          label={pinned ? "Show the tools only on hover" : "Keep the tools list open"} />
      </div>
      {pinned ? (
        <div className="border-b border-ink-line/60 px-6 py-4">{list}</div>
      ) : (
        // hidden until hovered: fades and drops in at once, waits a moment before going so the pointer can cross over
        <div className={cn("absolute inset-x-0 top-full border-b border-ink-line/60 bg-ink px-6 py-4 shadow-panel",
          "invisible -translate-y-1 opacity-0 transition-[opacity,translate,visibility] delay-150 duration-150 ease-out",
          "group-focus-within/tools:visible group-focus-within/tools:translate-y-0 group-focus-within/tools:opacity-100 group-focus-within/tools:delay-0",
          "group-hover/tools:visible group-hover/tools:translate-y-0 group-hover/tools:opacity-100 group-hover/tools:delay-0",
          "motion-reduce:transition-none")}>
          {list}
        </div>
      )}
    </div>
  );
}

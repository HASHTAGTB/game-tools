import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ToolInfo } from "@/app/tools";
import { useHotkeys } from "@/shared/lib/hotkeys";
import { browserPrefs } from "@/shared/lib/toolState";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "./icon-button";
import type { Resolution } from "@/shared/lib/fileSync";
import type { Location } from "@/shared/lib/workspace";
import { ConflictBar, StatusToasts, type ConflictItem } from "./status";
import { ToolNav } from "./tool-nav";
import { WorkspaceLocation } from "./workspace-location";

/** What every tool's store has, for the page around it: where its data is, its messages, and reload / save / drop. */
export type ToolData = {
  loc: Location | null;
  error: string | null;
  notice: string | null;
  setError: (msg: null) => void;
  setNotice: (msg: null) => void;
  /** Reload from the data folder, then show `msg`. */
  reload: (msg: string) => Promise<void>;
  /** Write the in-memory edits out now. */
  flush: () => Promise<void>;
  /** Drop the in-memory edits: run `drop`, then reload without writing first. */
  revert: (drop: () => Promise<void>) => Promise<void>;
};

type Props = {
  tool: ToolInfo;
  data: ToolData;
  /** The sidebar's lists, between the tool's name and the data folder. Scrolls. */
  sidebar: ReactNode;
  /** The bar at the top of the page (a `ToolBar`, or the vault's PathBar). */
  bar?: ReactNode;
  /** Files changed elsewhere while this tab had unsaved edits to them. */
  conflicts?: ConflictItem[];
  onResolve?: (key: string, keep: Resolution) => void;
  /** The right column (the tag browser, the Inspector, the preview). */
  aside?: ReactNode;
  /** Set it when the tool decides whether the right column shows (the timeline's Inspector, only while something is
   *  picked): it slides in and out on its own, with no collapse button. Left out, the reader collapses it. */
  asideOpen?: boolean;
  /** The right column's name, in its header row next to its collapse button ("Tags", "Preview"). */
  asideTitle?: ReactNode;
  /** The page itself, under the bar. */
  children: ReactNode;
};

/** Which side panels are collapsed, per tool: this browser only. */
const panelPrefs = browserPrefs("tool-panels", p => p as Record<string, { left?: boolean; right?: boolean }>);

/** The frame every tool shares: the sidebar (tool name, lists, data folder) on the left, the top bar, the page and
 *  its messages in the middle, an optional column on the right. Both side columns collapse (as in Obsidian: the button
 *  is in the column while it's open and at that end of the top bar while it's closed; Ctrl+\ and Ctrl+Shift+\) and
 *  slide open and shut: the column's width moves, what's inside keeps its width
 *  and slides with the edge. Also Ctrl+S, which saves right away (on GitHub the sidebar's Save to GitHub takes it, as
 *  a commit). */
export function ToolPage({ tool, data, sidebar, bar, conflicts = [], onResolve, aside, asideOpen, asideTitle, children }: Props) {
  const [open, setOpen] = useState(() => ({ left: true, right: true, ...panelPrefs.read()[tool.path] }));
  const toggle = (side: "left" | "right") => setOpen(o => {
    const next = { ...o, [side]: !o[side] };
    panelPrefs.write({ ...panelPrefs.read(), [tool.path]: next });
    return next;
  });
  const rightCollapsible = !!aside && asideOpen === undefined;
  const rightShown = !!aside && (asideOpen ?? open.right);
  useHotkeys({ "mod+s": () => void data.flush() }, data.loc?.kind !== "github");
  useHotkeys({
    "mod+\\": () => toggle("left"),
    "mod+shift+\\": () => { if (rightCollapsible) toggle("right"); else return false; },
    "mod+shift+|": () => { if (rightCollapsible) toggle("right"); else return false; },
  });
  const cols = { "--l": open.left ? "var(--lw)" : "0px", "--r": rightShown ? "var(--rw)" : "0px" } as CSSProperties;
  const panels: Panels = { left: open.left, right: rightCollapsible ? open.right : null, toggle };
  return (
    <PanelsCtx.Provider value={panels}>
    <div style={cols} className={cn("relative grid h-screen bg-ink text-paper",
      "[--lw:240px] xl:[--lw:280px] [--rw:300px] lg:[--rw:340px] xl:[--rw:360px] 2xl:[--rw:400px]",
      "grid-cols-[var(--l)_minmax(0,1fr)_var(--r)] transition-[grid-template-columns] duration-300 ease-[cubic-bezier(.25,.8,.3,1)] motion-reduce:transition-none")}>
      <aside inert={!open.left} className="flex min-h-0 justify-end overflow-hidden">
        <div className="flex min-h-0 w-(--lw) shrink-0 flex-col border-r border-ink-line/60">
          <ToolNav current={tool} lead={<PanelButton side="left" />} />
          <nav className="min-h-0 flex-1 overflow-y-auto pt-6 pb-4">{sidebar}</nav>
          <WorkspaceLocation data={data} />
        </div>
      </aside>

      <main className="@container relative flex min-h-0 flex-col">
        {bar}
        <StatusToasts className="top-16" data={data} error={data.error} notice={data.notice} setError={data.setError} setNotice={data.setNotice} />
        {onResolve && <ConflictBar items={conflicts} onResolve={onResolve} />}
        {children}
      </main>

      <aside inert={!rightShown} className="flex min-h-0 overflow-hidden">
        <div className="flex min-h-0 w-(--rw) shrink-0 flex-col border-l border-ink-line/60">
          {rightCollapsible && (
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-ink-line/60 pl-5 pr-3">
              <span className="min-w-0 flex-1 truncate font-sans text-base text-taupe">{asideTitle}</span>
              <PanelButton side="right" />
            </div>
          )}
          {aside}
        </div>
      </aside>
    </div>
    </PanelsCtx.Provider>
  );
}

/** Which side columns are open; `right` is null when the tool decides it (no button). */
type Panels = { left: boolean; right: boolean | null; toggle: (side: "left" | "right") => void };
const PanelsCtx = createContext<Panels | null>(null);

/** Collapses or opens a side column. ToolPage puts it in the column while it's open; the top bars put it at their
 *  ends while it's closed (`BarOpener`). */
function PanelButton({ side, show }: { side: "left" | "right"; show?: boolean }) {
  const p = useContext(PanelsCtx);
  if (!p || (side === "left" ? p.left : p.right) === null) return null;
  const Icon = side === "left" ? (show ? PanelLeftOpen : PanelLeftClose) : (show ? PanelRightOpen : PanelRightClose);
  return (
    <IconButton icon={Icon} size="sm" tooltipSide="bottom" onClick={() => p.toggle(side)}
      label={`${show ? "Show" : "Collapse"} the ${side === "left" ? "sidebar" : "side panel"}`}
      kbd={side === "left" ? "Ctrl+\\" : "Ctrl+Shift+\\"} />
  );
}

/** At an end of a top bar: the button that opens that side's column, only while it's collapsed. */
export function BarOpener({ side }: { side: "left" | "right" }) {
  const p = useContext(PanelsCtx);
  if (!p || (side === "left" ? p.left : p.right) !== false) return null;
  return side === "left"
    ? <span className="-ml-3 flex shrink-0 items-center"><PanelButton side="left" show /><BarDivider /></span>
    : <span className="-mr-3 flex shrink-0 items-center"><BarDivider /><PanelButton side="right" show /></span>;
}

/** The bar at the top of every page: 48px, a line under it. The page is a size container (`@container`), so a bar can
 *  hide extras by the page's width (`@5xl:inline`), which changes as the side columns open and close. */
export const toolBarCls = "flex h-12 shrink-0 items-center gap-1 border-b border-ink-line/60 px-6";
export function ToolBar({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(toolBarCls, className)}><BarOpener side="left" />{children}<BarOpener side="right" /></div>;
}
/** Thin rule between groups of buttons in a bar. */
export const BarDivider = () => <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-ink-line" />;

/** What an empty page says: a title and an optional hint under it. */
export function EmptyState({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid flex-1 place-items-center px-8 text-center", className)}>
      <div className="max-w-md space-y-3">
        <p className="font-sans text-xl font-light text-bone">{title}</p>
        {children && <div className="font-talk text-sm text-taupe">{children}</div>}
      </div>
    </div>
  );
}

/** The page while the data isn't there yet: still loading, or no folder picked. */
export const NotReady = ({ loc }: { loc: Location | null }) => (
  <EmptyState title={loc && !loc.ready ? "Pick the story folder at the bottom left." : "Loading…"} />
);

/** An inline text button in a hint ("…or start a new note"). */
export function HintLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button className="text-caramel underline underline-offset-4" onClick={onClick}>{children}</button>;
}

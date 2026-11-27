import type { ReactNode } from "react";
import type { ToolInfo } from "@/app/tools";
import { useHotkeys } from "@/shared/lib/hotkeys";
import { cn } from "@/shared/lib/utils";
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
  onResolve?: (key: string, keep: "mine" | "theirs") => void;
  /** The right column (the tag browser, the Inspector, the preview). */
  aside?: ReactNode;
  /** The page itself, under the bar. */
  children: ReactNode;
};

/** The frame every tool shares: the sidebar (tool name, lists, data folder) on the left, the top bar, the page and
 *  its messages in the middle, an optional column on the right. Also Ctrl+S, which saves right away (on GitHub the
 *  sidebar's Save to GitHub takes it, as a commit). */
export function ToolPage({ tool, data, sidebar, bar, conflicts = [], onResolve, aside, children }: Props) {
  useHotkeys({ "mod+s": () => void data.flush() }, data.loc?.kind !== "github");
  return (
    <div className={cn("grid h-screen bg-ink text-paper",
      aside
        ? "grid-cols-[240px_minmax(0,1fr)_300px] lg:grid-cols-[240px_minmax(0,1fr)_340px] xl:grid-cols-[280px_minmax(0,1fr)_360px] 2xl:grid-cols-[280px_minmax(0,1fr)_400px]"
        : "grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]")}>
      <aside className="flex min-h-0 flex-col border-r border-ink-line/60">
        <ToolNav current={tool} />
        <nav className="min-h-0 flex-1 overflow-y-auto pb-4">{sidebar}</nav>
        <WorkspaceLocation data={data} />
      </aside>

      <main className="relative flex min-h-0 flex-col">
        {bar}
        <StatusToasts className="top-16" error={data.error} notice={data.notice} setError={data.setError} setNotice={data.setNotice} />
        {onResolve && <ConflictBar items={conflicts} onResolve={onResolve} />}
        {children}
      </main>

      {aside && <aside className="flex min-h-0 flex-col border-l border-ink-line/60">{aside}</aside>}
    </div>
  );
}

/** The bar at the top of every page: 48px, a line under it. */
export const toolBarCls = "flex h-12 shrink-0 items-center gap-1 border-b border-ink-line/60 px-6";
export function ToolBar({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(toolBarCls, className)}>{children}</div>;
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

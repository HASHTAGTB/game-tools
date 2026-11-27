import { CircleHelp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "./icon-button";
import { Popover, PopoverTitle } from "./popover";

/** One key, drawn as a keycap. */
export const Key = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded-md border border-ink-line bg-ink-2 px-1 font-sans text-xs text-paper">{children}</kbd>
);

/** What you can do, as gesture → result. In `how`, keys go in brackets: "[Ctrl] + scroll", "[Ctrl] [Shift] [C]". */
export type Gesture = [how: string, what: string];

/** "[Ctrl] + scroll" with the bracketed keys as keycaps. */
function How({ text }: { text: string }) {
  return <>{text.split(/(\[[^\]]+\])/).filter(Boolean).map((p, i) => (p.startsWith("[") ? <Key key={i}>{p.slice(1, -1)}</Key> : p))}</>;
}

/** The gestures as a two-column list, so it can be scanned rather than read. */
export function GestureList({ items, className }: { items: Gesture[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 font-talk text-sm leading-snug", className)}>
      {items.map(([how, what]) => (
        <div key={how} className="contents">
          <dt className="whitespace-nowrap font-semibold text-paper"><How text={how} /></dt>
          <dd className="text-bone">{what}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The top bar's "?" button: the tool's gestures and shortcuts. */
export function HelpButton({ items, intro }: { items: Gesture[]; intro?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} align="end" className="w-96"
      trigger={<IconButton icon={CircleHelp} size="sm" label="Shortcuts" tooltipSide="bottom" />}>
      <PopoverTitle>Shortcuts</PopoverTitle>
      {intro && <p className="mb-3 text-sm leading-snug text-bone">{intro}</p>}
      <GestureList items={items} />
    </Popover>
  );
}

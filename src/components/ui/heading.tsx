import type { ReactNode } from "react";

/** Section label over a short 2px rule, as in the game's menu screens. The rule carries the section's color. */
export function Rule({ color = "#d9d0c7" }: { color?: string }) {
  return <span aria-hidden className="mt-1.5 block h-0.5 w-16" style={{ background: color }} />;
}

export function Heading({ children, note, color }: { children: ReactNode; note?: string; color?: string }) {
  return (
    <div>
      <h2 className="font-sans text-[22px] font-normal leading-tight text-paper">
        {children}
        {note && <span className="ml-3 font-talk text-sm font-normal text-taupe">{note}</span>}
      </h2>
      <Rule color={color} />
    </div>
  );
}

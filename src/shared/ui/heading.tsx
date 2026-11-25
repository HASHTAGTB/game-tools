import { cn } from "@/shared/lib/utils";

/** Short 2px rule under a title, as in the game's menu screens. The rule carries the section's color.
 *  `short` is the popup version (under a smaller title). */
export function Rule({ color = "#d9d0c7", short }: { color?: string; short?: boolean }) {
  return <span aria-hidden className={cn("mt-1.5 block h-0.5", short ? "w-10" : "w-16")} style={{ background: color }} />;
}

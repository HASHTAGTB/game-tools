/** Short 2px rule under a title, as in the game's menu screens. The rule carries the section's color. */
export function Rule({ color = "#d9d0c7" }: { color?: string }) {
  return <span aria-hidden className="mt-1.5 block h-0.5 w-16" style={{ background: color }} />;
}

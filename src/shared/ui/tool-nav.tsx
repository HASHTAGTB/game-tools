import { Link } from "@tanstack/react-router";
import { TOOLS, type ToolInfo } from "@/app/tools";
import { cn } from "@/shared/lib/utils";

/** Sidebar heading: the current tool's name, and the other tools as small links under it. */
export function ToolNav({ current }: { current: ToolInfo }) {
  const others = Object.values(TOOLS as Record<string, ToolInfo>).filter(t => t.path !== current.path);
  return (
    <div className="px-6 pb-7 pt-7">
      <h1 className="font-sans text-2xl font-light leading-none text-paper">{current.name}</h1>
      {others.length > 0 && (
        <nav className="mt-2 flex flex-wrap gap-x-3">
          {others.map(t => (
            <Link key={t.path} to={t.path as "/"} title={t.description}
              className={cn("font-sans text-sm text-taupe underline-offset-4 decoration-2 hover:text-paper hover:underline")}>
              {t.name}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

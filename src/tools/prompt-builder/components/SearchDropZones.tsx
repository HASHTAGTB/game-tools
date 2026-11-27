import { ExternalLink, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDnd } from "../lib/dnd";
import { danbooruUrl, googleUrl, searchName } from "../lib/tag";
import { cn } from "@/shared/lib/utils";
import { surfaceCls } from "@/shared/ui/popover";

type Blocked = { label: string; name: string; url: string };

/** Shown over the right column while a tag is dragged. Each zone opens the search in a new tab. Browsers may treat a drop as "not a click" and block that tab,
 *  then a link is shown instead (or allow popups for this page once). */
export function SearchDropZones() {
  const dnd = useDnd();
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  useEffect(() => {
    if (!blocked) return;
    const t = setTimeout(() => setBlocked(null), 8000);
    return () => clearTimeout(t);
  }, [blocked]);

  const open = (label: string, name: string, url: string) => {
    const w = window.open(url, "_blank");
    if (w) w.opener = null;
    else setBlocked({ label, name, url });
  };

  if (blocked && !dnd.drag) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-bloom origin-bottom-right">
        <div className={cn(surfaceCls, "flex items-center gap-3 px-4 py-3")}>
          <span className="text-bone">The browser blocked the new tab.</span>
          <a href={blocked.url} target="_blank" rel="noopener noreferrer" onClick={() => setBlocked(null)}
            className="inline-flex items-center gap-1 font-bold text-caramel underline-offset-4 hover:underline">
            Open “{blocked.name}” on {blocked.label}<ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button onClick={() => setBlocked(null)} aria-label="Dismiss" className="text-taupe hover:text-paper"><X className="h-4 w-4" /></button>
        </div>
      </div>
    );
  }
  if (!dnd.drag) return null;
  const name = searchName(dnd.drag.tag);
  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-50 flex w-[280px] flex-col items-center justify-center gap-4 animate-bloom origin-bottom-right lg:w-[340px] xl:w-[360px] 2xl:w-[400px]">
      <Zone label="Danbooru" sub={name} color="#7e9be3" onDrop={() => open("Danbooru", name, danbooruUrl(dnd.drag!.tag))} />
      <Zone label="Google" sub={name} color="#8ce3a0" onDrop={() => open("Google Images", name, googleUrl(dnd.drag!.tag))} />
    </div>
  );
}

function Zone({ label, sub, color, onDrop }: { label: string; sub: string; color: string; onDrop: () => void }) {
  const dnd = useDnd();
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(); dnd.end(); }}
      className={cn(
        "say-box pointer-events-auto flex w-[calc(100%-2rem)] max-w-72 flex-col items-center gap-1 px-6 py-5 shadow-[0_12px_40px_rgba(0,0,0,.45)] transition-transform",
        over && "scale-105",
      )}
      style={{ "--char": color, "--pattern": "none" } as React.CSSProperties}
    >
      <span className="say-text flex items-center gap-2 text-lg"><Search className="h-4 w-4" strokeWidth={3} />Search on {label}</span>
      <span className="max-w-full truncate font-talk text-sm font-bold text-ink">{sub}</span>
    </div>
  );
}

import { useRef, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import type { Character } from "../lib/types";
import { exportCharacter, readImport } from "../lib/store";
import type { Location } from "@/shared/lib/workspace";
import { castLook } from "../lib/cast";
import { cn } from "@/shared/lib/utils";
import { WorkspaceLocation } from "@/shared/ui/workspace-location";
import { ToolNav } from "@/shared/ui/tool-nav";
import { TOOLS } from "@/app/tools";
import { IconButton } from "@/shared/ui/icon-button";
import { m, spring } from "@/shared/ui/motion";

type Props = {
  chars: Character[]; current: string | null; onSelect: (id: string) => void; onCreate: (name: string) => void;
  loc: Location | null; onDirChanged: (msg: string) => void; onReload: () => void; onFlush: () => Promise<void>; onRevert: (drop: () => Promise<void>) => Promise<void>; onImport: (chars: Character[]) => void;
  onError: (msg: string) => void;
};

/** Laid out like the game's main menu: a thin vertical rule with text links beside it. */
export function Sidebar({ chars, current, onSelect, onCreate, loc, onDirChanged, onReload, onFlush, onRevert, onImport, onError }: Props) {
  const [name, setName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      onImport(await readImport(files));
    } catch (e) {
      onError(String(e instanceof Error ? e.message : e));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const create = () => { if (name.trim()) { onCreate(name.trim()); setName(""); } };
  return (
    <aside className="flex min-h-0 flex-col border-r border-ink-line/60">
      <ToolNav current={TOOLS.promptBuilder} />

      <nav className="min-h-0 flex-1 overflow-y-auto px-6">
        <ul className="border-l-2 border-bone/40">
          {chars.map(c => {
            const on = c.id === current;
            return (
              <li key={c.id} className="group/char relative flex items-center">
                {/* One shared layoutId: the bar slides to the selected character and takes on their color. */}
                {on && <m.span layoutId="char-marker" aria-hidden transition={spring.bouncy}
                  className="absolute left-[-3px] top-1 h-[calc(100%-8px)] w-1 rounded-full"
                  initial={false} animate={{ backgroundColor: castLook(c.name).color }} />}
                <button
                  onClick={() => onSelect(c.id)}
                  aria-current={on || undefined}
                  className={cn(
                    "block min-w-0 flex-1 truncate py-1.5 pl-5 text-left font-sans text-xl underline-offset-[6px] decoration-2 transition-colors",
                    on ? "text-paper" : "text-bone/70 hover:text-paper hover:underline",
                  )}
                >{c.name || c.id}</button>
                <IconButton icon={Download} size="sm" tooltipSide="right" label={`Export as ${c.id}.json`} onClick={() => exportCharacter(c)}
                  className="opacity-0 focus-visible:opacity-100 group-hover/char:opacity-100 [@media(hover:none)]:opacity-100" />
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex items-center gap-1 border-b-2 border-ink-line focus-within:border-caramel">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && create()}
            placeholder="New character"
            aria-label="New character name"
            className="h-9 min-w-0 flex-1 bg-transparent font-talk text-[15px] text-paper placeholder:text-taupe focus:outline-hidden"
          />
          <IconButton icon={Plus} size="sm" label="Create character" kbd="Enter" onClick={create} disabled={!name.trim()} />
        </div>

        <button onClick={() => fileInput.current?.click()} title="Load one or more character files (<id>.json)"
          className="mt-2 flex items-center gap-2 py-1 font-sans text-[15px] text-taupe underline-offset-4 decoration-2 hover:text-paper hover:underline">
          <Upload className="h-3.5 w-3.5" />Import characters
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" multiple hidden onChange={e => importFiles(e.target.files)} />
      </nav>

      <WorkspaceLocation loc={loc} onChanged={onDirChanged} onReload={onReload} onFlush={onFlush} onRevert={onRevert} />
    </aside>
  );
}

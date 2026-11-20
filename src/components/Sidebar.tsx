import { useState } from "react";
import { Plus } from "lucide-react";
import type { Character } from "../lib/types";
import type { Location } from "../lib/store";
import { castLook } from "../lib/cast";
import { cn } from "../lib/utils";
import { SaveLocation } from "./SaveLocation";

type Props = {
  chars: Character[]; current: string | null; onSelect: (id: string) => void; onCreate: (name: string) => void;
  loc: Location | null; onDirChanged: (msg: string) => void; onReload: () => void; onImport: (chars: Character[]) => void;
};

/** Laid out like the game's main menu: a thin vertical rule with text links beside it. */
export function Sidebar({ chars, current, onSelect, onCreate, loc, onDirChanged, onReload, onImport }: Props) {
  const [name, setName] = useState("");
  const create = () => { if (name.trim()) { onCreate(name.trim()); setName(""); } };
  return (
    <aside className="flex min-h-0 flex-col border-r border-ink-line/60">
      <h1 className="px-6 pb-8 pt-7 font-sans text-[28px] font-light leading-none text-paper">Prompt Builder</h1>

      <nav className="min-h-0 flex-1 overflow-y-auto px-6">
        <ul className="border-l-2 border-bone/40">
          {chars.map(c => {
            const on = c.id === current;
            return (
              <li key={c.id} className="relative">
                {on && <span aria-hidden className="absolute -left-[3px] top-1 h-[calc(100%-8px)] w-1 rounded-full" style={{ background: castLook(c.name).color }} />}
                <button
                  onClick={() => onSelect(c.id)}
                  aria-current={on || undefined}
                  className={cn(
                    "block w-full truncate py-1.5 pl-5 text-left font-sans text-xl underline-offset-[6px] decoration-2 transition-colors",
                    on ? "text-paper" : "text-bone/70 hover:text-paper hover:underline",
                  )}
                >{c.name || c.id}</button>
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
            className="h-9 min-w-0 flex-1 bg-transparent font-talk text-[15px] text-paper placeholder:text-taupe focus:outline-none"
          />
          <button onClick={create} disabled={!name.trim()} title="Create character"
            className="grid h-7 w-7 place-items-center rounded text-taupe hover:text-paper disabled:opacity-40">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </nav>

      <SaveLocation loc={loc} chars={chars} onChanged={onDirChanged} onReload={onReload} onImport={onImport} />
    </aside>
  );
}

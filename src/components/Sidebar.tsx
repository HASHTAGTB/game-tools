import { useRef, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import type { Character } from "../lib/types";
import { exportCharacter, readImport, type Location } from "../lib/store";
import { castLook } from "../lib/cast";
import { cn } from "../lib/utils";
import { SaveLocation } from "./SaveLocation";

type Props = {
  chars: Character[]; current: string | null; onSelect: (id: string) => void; onCreate: (name: string) => void;
  loc: Location | null; onDirChanged: (msg: string) => void; onReload: () => void; onImport: (chars: Character[]) => void;
  onError: (msg: string) => void;
};

/** Laid out like the game's main menu: a thin vertical rule with text links beside it. */
export function Sidebar({ chars, current, onSelect, onCreate, loc, onDirChanged, onReload, onImport, onError }: Props) {
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
      <h1 className="px-6 pb-8 pt-7 font-sans text-[28px] font-light leading-none text-paper">Prompt Builder</h1>

      <nav className="min-h-0 flex-1 overflow-y-auto px-6">
        <ul className="border-l-2 border-bone/40">
          {chars.map(c => {
            const on = c.id === current;
            return (
              <li key={c.id} className="group/char relative flex items-center">
                {on && <span aria-hidden className="absolute -left-[3px] top-1 h-[calc(100%-8px)] w-1 rounded-full" style={{ background: castLook(c.name).color }} />}
                <button
                  onClick={() => onSelect(c.id)}
                  aria-current={on || undefined}
                  className={cn(
                    "block min-w-0 flex-1 truncate py-1.5 pl-5 text-left font-sans text-xl underline-offset-[6px] decoration-2 transition-colors",
                    on ? "text-paper" : "text-bone/70 hover:text-paper hover:underline",
                  )}
                >{c.name || c.id}</button>
                <button onClick={() => exportCharacter(c)} title={`Export ${c.name || c.id} as ${c.id}.json`} aria-label={`Export ${c.name || c.id}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded text-taupe opacity-0 hover:text-paper focus-visible:opacity-100 group-hover/char:opacity-100">
                  <Download className="h-3.5 w-3.5" />
                </button>
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

        <button onClick={() => fileInput.current?.click()} title="Load one or more character files (<id>.json)"
          className="mt-2 flex items-center gap-2 py-1 font-sans text-[15px] text-taupe underline-offset-4 decoration-2 hover:text-paper hover:underline">
          <Upload className="h-3.5 w-3.5" />Import characters
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" multiple hidden onChange={e => importFiles(e.target.files)} />
      </nav>

      <SaveLocation loc={loc} onChanged={onDirChanged} onReload={onReload} />
    </aside>
  );
}

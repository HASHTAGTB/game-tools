import { useRef } from "react";
import { Download, Upload } from "lucide-react";
import type { Character } from "../lib/types";
import { exportCharacter, readImport } from "../lib/store";
import type { Location } from "@/shared/lib/workspace";
import { castLook } from "../lib/cast";
import { useGame } from "@/shared/lib/game";
import { WorkspaceLocation } from "@/shared/ui/workspace-location";
import { ToolNav } from "@/shared/ui/tool-nav";
import { TOOLS } from "@/app/tools";
import { IconButton } from "@/shared/ui/icon-button";
import { Button } from "@/shared/ui/button";
import { AddField } from "@/shared/ui/field";
import { MenuGroup, MenuItem, MenuRule } from "@/shared/ui/menu";

type Props = {
  chars: Character[]; current: string | null; onSelect: (id: string) => void; onCreate: (name: string) => void;
  loc: Location | null; onDirChanged: (msg: string) => void; onReload: () => void; onFlush: () => Promise<void>; onRevert: (drop: () => Promise<void>) => Promise<void>; onImport: (chars: Character[]) => void;
  onError: (msg: string) => void;
};

/** Laid out like the game's main menu: a thin vertical rule with text links beside it. */
export function Sidebar({ chars, current, onSelect, onCreate, loc, onDirChanged, onReload, onFlush, onRevert, onImport, onError }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const manifest = useGame(s => s.manifest);
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
  return (
    <aside className="flex min-h-0 flex-col border-r border-ink-line/60">
      <ToolNav current={TOOLS.promptBuilder} />

      <nav className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
        <MenuGroup title="Characters">
          <MenuRule>
            {chars.map(c => (
              // One shared layoutId: the bar slides to the selected character and takes on their color.
              <MenuItem key={c.id} label={c.name || c.id} active={c.id === current} color={castLook(c.name, manifest).color} layoutId="char-marker"
                onClick={() => onSelect(c.id)}
                actions={<IconButton icon={Download} size="sm" tooltipSide="right" label={`Export as ${c.id}.json`} onClick={() => exportCharacter(c)} />} />
            ))}
          </MenuRule>
        </MenuGroup>

        <AddField className="ml-4 mt-3" placeholder="New character" label="Create character" onAdd={onCreate} />

        <Button size="sm" variant="ghost" className="ml-3 mt-2" onClick={() => fileInput.current?.click()} title="Load one or more character files (<id>.json)">
          <Upload className="h-3.5 w-3.5" />Import characters
        </Button>
        <input ref={fileInput} type="file" accept=".json,application/json" multiple hidden onChange={e => importFiles(e.target.files)} />
      </nav>

      <WorkspaceLocation loc={loc} onChanged={onDirChanged} onReload={onReload} onFlush={onFlush} onRevert={onRevert} />
    </aside>
  );
}

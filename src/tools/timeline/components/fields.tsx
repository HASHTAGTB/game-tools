import type { ReactNode } from "react";
import { Chip } from "@/shared/ui/chip";
import { visible } from "../lib/colors";

export type ChipOption = { id: string; name: string; color: string };

/** Pick any number of characters or threads. Picked ones are filled with their color. */
export function ChipPicker({ options, value, onChange, empty }: { options: ChipOption[]; value: string[]; onChange: (v: string[]) => void; empty?: ReactNode }) {
  if (!options.length) return <p className="font-talk text-sm text-taupe">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => {
        const on = value.includes(o.id);
        return (
          <Chip key={o.id} color={visible(o.color)} pressed={on} onClick={() => onChange(on ? value.filter(x => x !== o.id) : [...value, o.id])}>
            {o.name}
          </Chip>
        );
      })}
    </div>
  );
}

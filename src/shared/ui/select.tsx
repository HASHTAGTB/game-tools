import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { fieldCls } from "./field";
import { MenuItem, MenuRule } from "./menu";
import { Popover } from "./popover";

export type SelectOption = { value: string; label: string; hint?: string };

/** Pick one of a few options: a menu like every other list (the sliding bar marks the current one). `field` looks like
 *  the boxed fields of a form; `quiet` is plain text in a row (the scene header). */
export function Select({ value, options, onChange, placeholder = "not set", variant = "quiet", label, className }: {
  value: string; options: SelectOption[]; onChange: (v: string) => void; placeholder?: string;
  variant?: "quiet" | "field"; /** the accessible name */ label: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const marker = useId();
  const current = options.find(o => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen} align="start" className="w-64 px-3 py-2.5"
      trigger={
        <button type="button" aria-label={label}
          className={cn(variant === "field"
            ? cn(fieldCls, "flex items-center justify-between gap-1 text-left")
            : cn("flex h-7 items-center gap-1 rounded-md px-1.5 font-talk text-base transition-colors hover:bg-ink-2", open && "bg-ink-2"),
            current && value ? "text-paper" : "text-taupe", className)}>
          <span className="truncate">{current ? current.label : value || placeholder}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-taupe" strokeWidth={2.5} />
        </button>
      }>
      <MenuRule className="max-h-80 overflow-y-auto">
        {options.map(o => (
          <MenuItem key={o.value || "-"} size="base" active={o.value === value} layoutId={marker} label={o.label} sub={o.hint}
            onClick={() => { setOpen(false); onChange(o.value); }} />
        ))}
      </MenuRule>
    </Popover>
  );
}

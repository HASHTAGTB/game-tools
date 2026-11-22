import { Search, X } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";
import { AnimatePresence, m } from "./motion";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onValueChange: (v: string) => void;
};

/** Underlined search input with a clear button. Escape clears it too. */
export const SearchField = forwardRef<HTMLInputElement, Props>(({ value, onValueChange, className, onKeyDown, ...p }, ref) => (
  <label className={cn("flex items-center gap-2 border-b-2 border-ink-line transition-colors focus-within:border-caramel", className)}>
    <Search className="h-4 w-4 shrink-0 text-taupe" />
    <input
      ref={ref}
      type="search"
      value={value}
      onChange={e => onValueChange(e.target.value)}
      onKeyDown={e => { if (e.key === "Escape" && value) { e.preventDefault(); onValueChange(""); } onKeyDown?.(e); }}
      className="h-10 min-w-0 flex-1 bg-transparent font-talk text-[15px] text-paper placeholder:text-taupe focus:outline-hidden [&::-webkit-search-cancel-button]:hidden"
      {...p}
    />
    <AnimatePresence initial={false}>
      {value && (
        <m.button
          type="button"
          aria-label="Clear search"
          onClick={() => onValueChange("")}
          initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
          className="grid h-6 w-6 place-items-center rounded-sm text-taupe hover:text-paper"
        ><X className="h-3.5 w-3.5" /></m.button>
      )}
    </AnimatePresence>
  </label>
));
SearchField.displayName = "SearchField";

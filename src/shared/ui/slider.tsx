import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@/shared/lib/utils";

/** A value along a line (a volume): drag the thumb or use the arrow keys. */
export function Slider({ value, onChange, min = 0, max = 1, step = 0.01, label, className }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; className?: string;
}) {
  return (
    <SliderPrimitive.Root value={value} onValueChange={v => onChange(v as number)} min={min} max={max} step={step}
      className={cn("flex w-24 items-center", className)}>
      <SliderPrimitive.Control className="flex h-5 w-full cursor-pointer touch-none items-center">
        <SliderPrimitive.Track className="relative h-1 w-full rounded-full bg-ink-line">
          <SliderPrimitive.Indicator className="rounded-full bg-caramel" />
          <SliderPrimitive.Thumb aria-label={label}
            className="h-3.5 w-3.5 rounded-full bg-paper shadow-[0_0_0_2px_var(--color-ink)] transition-[scale] hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-periwinkle" />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

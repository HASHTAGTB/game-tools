import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "../../lib/utils";

export function Switch({ className, ...p }: SwitchPrimitive.SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors",
        "data-[state=checked]:border-caramel data-[state=checked]:bg-caramel data-[state=unchecked]:border-ink-line data-[state=unchecked]:bg-transparent",
        className,
      )}
      {...p}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-3.5 w-3.5 rounded-full transition-transform data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-paper data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-taupe" />
    </SwitchPrimitive.Root>
  );
}

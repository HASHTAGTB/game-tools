import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/shared/lib/utils";
import { m, spring } from "./motion";

type Props = Omit<SwitchPrimitive.Root.Props, "className" | "onCheckedChange"> & {
  className?: string;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({ className, onCheckedChange, ...p }: Props) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors",
        "data-checked:border-caramel data-checked:bg-caramel data-unchecked:border-ink-line data-unchecked:bg-transparent",
        className,
      )}
      onCheckedChange={v => onCheckedChange?.(v)}
      {...p}
    >
      <SwitchPrimitive.Thumb
        className="pointer-events-none block h-3.5 w-3.5 rounded-full transition-colors data-checked:bg-paper data-unchecked:bg-taupe"
        render={(props, state) => (
          // Base UI's props are DOM props; Motion's onDrag/onAnimation* typings differ, so cast.
          <m.span {...(props as object)} initial={false} animate={{ x: state.checked ? 17 : 2 }} transition={spring.bouncy} />
        )}
      />
    </SwitchPrimitive.Root>
  );
}

import { useEffect, useRef, useState } from "react";
import { copyText } from "@/shared/lib/clipboard";

/** Copy to the clipboard and say so for a moment. `copied` is the key of what was copied last (for pages with more
 *  than one copy button), null once the moment is over. */
export function useCopy<K extends string = "it">() {
  const [copied, setCopied] = useState<K | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text: string, key = "it" as K) => {
    await copyText(text);
    setCopied(key);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1400);
  };
  return [copied, copy] as const;
}

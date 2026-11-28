import { useRef } from "react";
import { useSeen, useThumb, type Thumb } from "@/shared/lib/thumbs";
import { cn } from "@/shared/lib/utils";

/** A picker's small image of a game file (a path inside assets/), read once its element scrolls near the view.
 *  Put `ref` on the element that's on screen. */
export function useLazyThumb<E extends HTMLElement = HTMLButtonElement>(file: string | null) {
  const ref = useRef<E>(null);
  const seen = useSeen(ref);
  return { ref, thumb: useThumb(seen ? file : null) };
}

/** The thumbnail filling its box (16:9 unless `className` says otherwise), or a note when there is none. */
export function ThumbImg({ thumb, file, className }: { thumb: Thumb; file: string | null; className?: string }) {
  return (
    <span className={cn("bx-th", thumb.pending && "bx-th-wait", className)}>
      {thumb.img && <img src={thumb.img.url} alt="" draggable={false} />}
      {!file && <span className="bx-th-note">no file yet</span>}
      {file && thumb.missing && <span className="bx-th-note">thumbnail missing</span>}
    </span>
  );
}

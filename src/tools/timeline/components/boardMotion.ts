import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { BASE_COL_W, type Layout } from "../lib/layout";
import { useTimeline } from "../state";

/** The board's two pieces of motion that need the DOM: zooming around the pointer, and a dropped card flying into
 *  its new place. */

/** Ctrl+wheel zooms the columns and keeps the spot under the pointer where it is. Returns false while a zoom is
 *  being applied (cards shouldn't slide then). `labelW`: the lane labels' width, left of the track. */
export function useZoomAnchor(scroller: RefObject<HTMLDivElement | null>, zoom: number, colW: number, labelW: number) {
  const lastZoom = useRef(zoom);
  const anchor = useRef<{ x: number; px: number; colW: number } | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const st = useTimeline.getState();
      const px = e.clientX - el.getBoundingClientRect().left - labelW;
      anchor.current = { x: el.scrollLeft + px, px, colW: Math.round(BASE_COL_W * st.zoom) };
      st.setZoom(st.zoom * Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scroller, labelW]);
  const settled = lastZoom.current === zoom;
  useLayoutEffect(() => {
    lastZoom.current = zoom;
    const a = anchor.current, el = scroller.current;
    if (!a || !el) return;
    anchor.current = null;
    el.scrollLeft = (a.x * colW) / a.colW - a.px;
  }, [scroller, zoom, colW]);
  return settled;
}

/** `land(id, x, y)` when a card is let go of: once the board is laid out again, the card flies from that point
 *  (in track coordinates) into its new place instead of sliding from where it started. */
export function useLanding(track: RefObject<HTMLDivElement | null>, lay: Layout) {
  const landing = useRef<{ id: string; x: number; y: number } | null>(null);
  const [tick, setTick] = useState(0);
  useLayoutEffect(() => {
    const l = landing.current, root = track.current;
    landing.current = null;
    if (!l || !root || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let el: HTMLElement | null = null, best = Infinity;
    for (const c of root.querySelectorAll<HTMLElement>(`[data-event="${CSS.escape(l.id)}"]`)) {
      const d = Math.hypot(c.offsetLeft - l.x, c.offsetTop - l.y);
      if (d < best) { best = d; el = c; }
    }
    if (!el) return;
    // jump to the new place without the usual slide, then play the flight from the drop point
    el.style.transition = "none";
    void el.offsetWidth;
    el.style.transition = "";
    el.animate(
      [{ translate: `${l.x - el.offsetLeft}px ${l.y - el.offsetTop}px`, rotate: "-1.5deg", boxShadow: "0 10px 30px rgba(0,0,0,.5)" },
       { translate: "0 0", rotate: "0deg", boxShadow: "0 0 0 rgba(0,0,0,0)" }],
      { duration: 280, easing: "cubic-bezier(.22,.8,.24,1)" },
    );
  }, [track, lay, tick]);
  return (id: string, x: number, y: number) => { landing.current = { id, x, y }; setTick(n => n + 1); };
}

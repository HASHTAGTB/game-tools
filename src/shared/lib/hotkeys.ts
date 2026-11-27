import { useEffect, useRef } from "react";

/** Whether a key press happened in something you type in (a field, a text box, CodeMirror). */
export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Return `false` when it didn't apply after all: then the key does what it would have done. */
type Run = (e: KeyboardEvent) => void | false;
/** `inFields`: also while typing in a field. Default: yes for combos with `mod`, no for bare keys (Delete, Escape). */
export type Hotkey = Run | { run: Run; inFields?: boolean };

/** Page-wide shortcuts, as `{ "mod+shift+z": run }`. `mod` is Ctrl (Cmd on a Mac); `shift` and `alt` must match
 *  exactly, so "mod+z" doesn't also fire on Ctrl+Shift+Z. The key is `KeyboardEvent.key`, lower case ("s", "escape",
 *  "delete", "backspace"). A shortcut that ran has its default prevented. The latest `keys` are used, so handlers can
 *  read state from the render. */
export function useHotkeys(keys: Record<string, Hotkey>, enabled = true) {
  const latest = useRef(keys);
  latest.current = keys;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const combo = [(e.ctrlKey || e.metaKey) && "mod", e.altKey && "alt", e.shiftKey && "shift", e.key.toLowerCase()].filter(Boolean).join("+");
      const k = latest.current[combo];
      if (!k) return;
      const { run, inFields = combo.startsWith("mod+") } = typeof k === "function" ? { run: k } : k;
      if (!inFields && isTyping(e.target)) return;
      if (run(e) !== false) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

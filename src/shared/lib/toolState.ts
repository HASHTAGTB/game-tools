/** The plumbing every tool's store has: one job at a time, messages that go away, settings kept in this browser,
 *  saving a moment after the last edit and when the tab is hidden, and looking for changes made elsewhere. */

/** Runs async jobs one at a time, in the order they came, so nothing writes while another write is running. */
export function serialQueue() {
  let queue: Promise<void> = Promise.resolve();
  return (fn: () => Promise<void>) => (queue = queue.then(fn, fn));
}

/** Runs at most `n` async jobs at once; the rest wait their turn, in order. */
export function limiter(n: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (running >= n) await new Promise<void>(go => waiting.push(go));
    running++;
    try { return await fn(); } finally { running--; waiting.shift()?.(); }
  };
}

/** A `setNotice` for a store: the notice goes away after 5 s. */
export function noticeSetter(set: (s: { notice: string | null }) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (notice: string | null) => {
    clearTimeout(timer);
    set({ notice });
    if (notice) timer = setTimeout(() => set({ notice: null }), 5000);
  };
}

/** Settings for this browser only (localStorage). `parse` gets whatever was stored ({} if nothing or broken). */
export function browserPrefs<T>(key: string, parse: (raw: Record<string, any>) => T) {
  return {
    read(): T {
      try { return parse(JSON.parse(localStorage.getItem(key) ?? "{}") ?? {}); } catch { return parse({}); }
    },
    write(v: unknown) {
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window */ }
    },
  };
}

/** `fn` once, `ms` after the last `schedule()`. */
export function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule: () => { clearTimeout(timer); timer = setTimeout(fn, ms); },
    cancel: () => clearTimeout(timer),
  };
}

/** Runs `fn` right away when the tab is hidden or closed, so the last edit isn't lost. */
export function whenHidden(fn: () => void) {
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") fn(); });
}

/** Calls `fn` every few seconds while the tab is visible. Returns the stop function. */
export function whileVisible(fn: () => void, ms = 4000) {
  const timer = setInterval(() => { if (document.visibilityState === "visible") fn(); }, ms);
  return () => clearInterval(timer);
}

import type { StoreApi, UseBoundStore } from "zustand";
import { useShallow } from "zustand/shallow";

/** Some of a store's state and actions; the component draws again only when one of them changes (not on every change
 *  to the store, as a bare `store()` would, e.g. on every keystroke). */
export function usePick<S, K extends keyof S>(store: UseBoundStore<StoreApi<S>>, ...keys: K[]): Pick<S, K> {
  return store(useShallow(s => Object.fromEntries(keys.map(k => [k, s[k]])) as Pick<S, K>));
}

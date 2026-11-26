import { createContext, useContext, type ReactNode } from "react";
import type { VaultStore } from "./store";

/** The store the shared vault components (FileTree, PathBar) work on: each tool puts its own around its page. */
const Ctx = createContext<VaultStore | null>(null);

export function VaultProvider({ store, children }: { store: VaultStore; children: ReactNode }) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useVault(): VaultStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("useVault needs a VaultProvider");
  return s;
}

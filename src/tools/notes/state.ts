import { createVaultStore } from "@/shared/vault/store";

export type { Mode } from "@/shared/vault/store";

/** The vault's notes (the scenes are .rpy files in the game, so they don't show here). */
export const useNotes = createVaultStore({
  prefsKey: "notes-view-1",
  root: "",
  noun: "note",
});

import { isUnder, sceneHref, SCENES_DIR } from "@/shared/vault/places";
import { createVaultStore } from "@/shared/vault/store";

export type { Mode } from "@/shared/vault/store";

/** The vault's notes, all but the scenes (those open in the Scenes tool, and links to them lead there). */
export const useNotes = createVaultStore({
  prefsKey: "notes-view-1",
  root: "",
  noun: "note",
  hide: p => isUnder(p, SCENES_DIR),
  openElsewhere: p => { window.location.hash = sceneHref(p); },
});

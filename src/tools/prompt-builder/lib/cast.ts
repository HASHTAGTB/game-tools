import { boxLook, characterIdIn, type Manifest } from "@/shared/lib/game";

/** A prompt character's look in the game (name colour, textbox pattern), from the game
 *  (shared/lib/game): a character whose name starts with a cast name ("Rin casual") gets that character's
 *  dialogue-box look. Without a manifest, or for anyone the game doesn't know, the GUI accent. */
export const castLook = (name: string, manifest: Manifest | null) => boxLook(manifest, characterIdIn(name));

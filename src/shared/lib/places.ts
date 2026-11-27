/** Folders of the vault that belong to one tool. */

/** The Ren'Py project's game folder. */
export const GAME_DIR = "renpy/game";

/** New scenes go here. */
export const NEW_SCENE_DIR = `${GAME_DIR}/scenes`;
/** Test and experimental scenes. */
export const DEV_SCENE_DIR = `${GAME_DIR}/dev`;

/** Where the scenes are: the Scenes tool edits the .rpy files in these folders. */
export const SCENE_DIRS = [NEW_SCENE_DIR, DEV_SCENE_DIR];

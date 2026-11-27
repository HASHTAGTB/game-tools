/** Folders of the vault that belong to one tool. */

/** The Ren'Py project's game folder. */
export const GAME_DIR = "renpy/game";

/** Where the scenes are: the Scenes tool edits the .rpy files in these folders (dev/ also holds test files). */
export const SCENE_DIRS = [`${GAME_DIR}/scenes`, `${GAME_DIR}/dev`];

/** New scenes go here. */
export const NEW_SCENE_DIR = SCENE_DIRS[0];

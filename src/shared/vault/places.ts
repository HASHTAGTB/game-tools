/** Folders of the vault that belong to one tool. */

/** The scenes: the Scenes tool edits them, the Notes tool leaves them out. */
export const SCENES_DIR = "CANON/03_Story/02_Scenes";

/** The app's address of a scene (hash routing, see app/router.tsx). */
export const sceneHref = (path: string) =>
  "#/scenes/" + path.slice(SCENES_DIR.length + 1).replace(/\.md$/i, "").split("/").map(encodeURIComponent).join("/");

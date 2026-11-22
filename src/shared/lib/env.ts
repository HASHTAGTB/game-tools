/** "1" in the GitHub Pages build: no local server, so file access goes through the browser. */
export const STATIC = import.meta.env.VITE_STATIC === "1";

/** File System Access API (pick a folder, read and write files in it). Chromium browsers only. */
export const folderSupported = typeof window !== "undefined" && "showDirectoryPicker" in window;

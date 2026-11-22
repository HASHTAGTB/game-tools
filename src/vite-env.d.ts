/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" for the GitHub Pages build: no file API, characters live in the browser or a picked folder */
  readonly VITE_STATIC?: string;
}

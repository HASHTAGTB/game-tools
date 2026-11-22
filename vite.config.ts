import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileApi } from "./server/api.ts";

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the workflow passes that in as BASE
  base: process.env.BASE || "/",
  plugins: [react(), tailwindcss(), fileApi()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 7871, strictPort: true, watch: { ignored: ["**/characters/**", "**/.game-tools/**", "**/config.json"] } },
  preview: { port: 7871, strictPort: true },
});

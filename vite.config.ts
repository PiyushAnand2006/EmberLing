import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "renderer-build",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        orb: resolve(__dirname, "orb.html"),
      },
    },
  },
});

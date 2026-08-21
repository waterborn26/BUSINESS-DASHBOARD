// Build variant that emits ONE self-contained HTML file, for publishing the app
// as a shareable web page. Same code as the desktop build — no code-splitting,
// CSS inlined, so the whole dashboard travels as a single document.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  clearScreen: false,
  build: {
    target: "es2022",
    outDir: "dist-artifact",
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 1024 * 1024,
    rollupOptions: {
      output: { inlineDynamicImports: true, entryFileNames: "app.js", assetFileNames: "app.[ext]" },
    },
  },
});

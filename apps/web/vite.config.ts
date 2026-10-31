import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Set DESHIQR_BASE=/deshiQR/ for GitHub Pages; "/" is right for Netlify/Cloudflare Pages.
  base: process.env.DESHIQR_BASE ?? "/",
  resolve: {
    alias: [
      { find: /^deshiqr$/, replacement: at("../../packages/core/src/index.ts") },
      { find: /^deshiqr-qr$/, replacement: at("../../packages/qr/src/index.ts") },
      { find: /^deshiqr-element$/, replacement: at("../../packages/element/src/index.ts") },
    ],
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
    assetsInlineLimit: 2048,
  },
  server: { port: 5173, open: false },
});

import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { "deshiqr-element": "src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    noExternal: ["deshiqr", "deshiqr-qr"],
  },
  {
    entry: { "deshiqr-element": "src/index.ts" },
    format: ["iife"],
    globalName: "DeshiQrElement",
    sourcemap: true,
    target: "es2020",
    minify: true,
    noExternal: ["deshiqr", "deshiqr-qr"],
  },
]);

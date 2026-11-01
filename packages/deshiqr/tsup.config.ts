import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Main entry: payload library + QR encoder/renderers. No DOM side effects.
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
  },
  {
    // `deshiqr/element` subpath: the <deshiqr-pay> custom element (ESM only).
    // Importing it registers the element; bundlers see the side effect through
    // the `sideEffects` field in package.json.
    entry: { element: "src/element/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    target: "es2022",
  },
  {
    // Single browser global for plain <script> usage: window.DeshiQR.
    // Served by unpkg/jsDelivr (`dist/deshiqr.global.js`) and the repo CDN workflow.
    // Bundles the payload library, the QR encoder and the element registration.
    entry: { deshiqr: "src/global.ts" },
    format: ["iife"],
    globalName: "DeshiQR",
    sourcemap: true,
    target: "es2020",
    minify: true,
  },
]);

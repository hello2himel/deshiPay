/**
 * Browser global entry point for plain `<script src>` usage.
 *
 * The IIFE build (`dist/deshiqr.global.js`) exposes one global, `DeshiQR`, with
 * the payload library, the QR encoder/renderers and the `<deshiqr-pay>` element.
 * Importing the element module registers the custom element (a guarded no-op
 * outside a browser). Bundlers should prefer the package entry `deshiqr` (no DOM
 * side effects) or the `deshiqr/element` subpath.
 */

export * from "./index.ts";
export * from "./element/index.ts";

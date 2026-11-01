/**
 * deshiqr — Bangla QR toolkit: payload parsing/building plus a QR Code encoder.
 *
 * This is the main entry point of the npm package. It is pure: no DOM
 * side effects, no element registration, no network. The `<deshiqr-pay>` web
 * component is available from the `deshiqr/element` subpath, and the browser
 * global build (`dist/deshiqr.global.js`) bundles both behind `window.DeshiQR`.
 *
 * Zero dependencies, environment-agnostic (browser, Node, Deno, edge runtimes).
 */

export * from "./core/index.ts";
export * from "./qr/index.ts";

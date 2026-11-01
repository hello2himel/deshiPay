/**
 * The deshiQR QR engine — a dependency-free QR Code encoder (ISO/IEC 18004).
 *
 * Public contract (see `docs/architecture.md` §4 in the deshiQR repository):
 *   - `encode(text, options?)`        -> QrMatrix
 *   - `getVersionCapacity(version, level)` -> byte capacity
 *   - `toSvg(matrix, options?)`       -> complete SVG string
 *   - `toSvgPath(matrix, options?)`   -> `<path>` element string
 *   - `toTerminal(matrix, options?)`  -> text rendering
 *
 * The implementation is original code written from the ISO/IEC 18004
 * specification. It has zero runtime dependencies. `qrcode` and `jsqr` are
 * used only as dev-time test oracles and are not imported by this module.
 */

export { encode } from "./encode.ts";
export { getVersionCapacity } from "./tables.ts";
export { toSvg, toSvgPath, toTerminal } from "./render.ts";
export type {
  EcLevel,
  EncodeOptions,
  QrMatrix,
  RawText,
  SvgOptions,
  TerminalOptions,
} from "./types.ts";

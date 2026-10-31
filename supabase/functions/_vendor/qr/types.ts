// GENERATED FILE - do not edit.
// Source: packages/{core,qr}/src
// Regenerate with: node scripts/vendor-edge.mjs
/**
 * Public types for `deshiqr-qr`.
 *
 * The encoder is a from-scratch implementation of ISO/IEC 18004 "QR Code"
 * (byte mode only) with no runtime dependencies. See `README.md` for the API
 * contract and the limits of the implementation.
 */

/** Error-correction level: L (7%), M (15%), Q (25%), H (30%). */
export type EcLevel = "L" | "M" | "Q" | "H";

/**
 * Input text. It is always encoded in QR "byte mode" as UTF-8 bytes
 * (see `TextEncoder`), so any JavaScript string is accepted. No ECI designator
 * is written; byte-mode UTF-8 is what virtually every scanner expects.
 */
export type RawText = string;

/** An encoded QR Code symbol. */
export interface QrMatrix {
  /** Number of modules per side: `version * 4 + 17` (21 for version 1, 177 for version 40). */
  size: number;
  /** QR Code version, 1..40. */
  version: number;
  /** Error-correction level used for this symbol. */
  level: EcLevel;
  /** Data mask pattern that was applied, 0..7. */
  mask: number;
  /** `size * size` row-major modules; `1` = dark, `0` = light. */
  data: Uint8Array;
  /**
   * Read a module. `x` is the column (left to right), `y` is the row
   * (top to bottom). Out-of-range coordinates read as light (`false`).
   */
  get(x: number, y: number): boolean;
}

/** Options for {@link encode}. */
export interface EncodeOptions {
  /** Error-correction level. Default `"M"`. */
  level?: EcLevel;
  /** Force a specific version (1..40). The data must fit, otherwise `encode` throws. */
  version?: number;
  /** Lower bound for the automatic version search. Ignored when `version` is set. */
  minVersion?: number;
  /** Force a specific mask pattern (0..7). Skipped when omitted, where auto-selection is used. */
  mask?: number;
  /**
   * Skip the minimal-version search and use version 40 (unless `version` is
   * explicitly set). Internal escape hatch for callers that want a fixed-size
   * symbol; normal callers should leave this unset.
   */
  eager?: boolean;
}

/** Options shared by the SVG renderers. */
export interface SvgOptions {
  /** Quiet zone in modules. Default `4` (the QR Code specification minimum). */
  margin?: number;
  /** Pixels per module. Default `1`. */
  scale?: number;
  /** Colour of dark modules. Default `"#000"`. */
  dark?: string;
  /** Colour of the background. `null` renders a transparent background. Default `"#fff"`. */
  light?: string | null;
  /** Accessible title; emitted as `<title>` (and used as `aria-label` when no label is given). */
  title?: string;
  /** Corner radius (in viewBox units) of the quiet-zone background. Default `0`. */
  radius?: number;
  /** Optional class attribute on the `<svg>` element. */
  className?: string;
  /** Explicit accessible label (`aria-label`). */
  ariaLabel?: string;
}

/** Options for the terminal renderer. */
export interface TerminalOptions {
  /** Quiet zone in modules. Default `4`. */
  margin?: number;
  /**
   * Optional colour for dark modules: `#rgb`/`#rrggbb`, a basic colour name
   * (`black`, `white`, ...), or a raw ANSI SGR background sequence such as
   * `"\x1b[40m"`. When `dark` or `light` is given the renderer switches to
   * two-character colour cells, otherwise it uses Unicode half blocks.
   */
  dark?: string;
  /** Optional colour for light modules; same formats as {@link TerminalOptions.dark}. */
  light?: string;
}

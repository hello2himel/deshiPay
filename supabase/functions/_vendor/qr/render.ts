// GENERATED FILE - do not edit.
// Source: packages/{core,qr}/src
// Regenerate with: node scripts/vendor-edge.mjs
/**
 * Renderers for encoded QR matrices: deterministic SVG and a terminal view.
 *
 * Both renderers are pure functions of the matrix plus options: they never
 * include timestamps, random ids or other run-dependent data.
 */

import type { QrMatrix, SvgOptions, TerminalOptions } from "./types.ts";

const DEFAULT_MARGIN = 4;
const DEFAULT_DARK = "#000";
const DEFAULT_LIGHT = "#fff";

/** Format a number for an SVG attribute, trimming floating-point noise. */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

function checkMargin(margin: number): number {
  if (!Number.isInteger(margin) || margin < 0) {
    throw new RangeError(`margin must be a non-negative integer, got ${String(margin)}`);
  }
  return margin;
}

function checkScale(scale: number): number {
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`scale must be a positive finite number, got ${String(scale)}`);
  }
  return scale;
}

function checkRadius(radius: number, dimension: number): number {
  if (typeof radius !== "number" || !Number.isFinite(radius) || radius < 0) {
    throw new RangeError(`radius must be a non-negative finite number, got ${String(radius)}`);
  }
  // Never let the corners meet in the middle.
  return Math.min(radius, dimension / 2);
}

/** Escape text content (`&`, `<`, `>`). */
function escapeXmlText(value: string): string {
  return value.replace(/[&<>]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      default:
        return "&gt;";
    }
  });
}

/** Escape an XML attribute value (also quotes). */
function escapeXmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

/**
 * Build the `d` attribute for all dark modules, merging horizontal runs.
 *
 * Coordinates are in viewBox units (one module = one unit) and include the
 * quiet-zone margin, so the resulting path can be dropped into an SVG whose
 * viewBox is `0 0 (size + 2 * margin) (size + 2 * margin)`.
 */
function darkModulesPathData(matrix: QrMatrix, margin: number): string {
  const { size, data } = matrix;
  const commands: string[] = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (data[y * size + x] !== 1) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < size && data[y * size + x + run] === 1) run++;
      commands.push(`M${x + margin} ${y + margin}h${run}v1h${-run}z`);
      x += run;
    }
  }
  return commands.join("");
}

/**
 * Render only the `<path>` element that draws the dark modules.
 *
 * Useful for embedding a QR into an existing SVG document; the caller decides
 * the viewBox (`size + 2 * margin`) and the surrounding elements.
 */
export function toSvgPath(matrix: QrMatrix, options: SvgOptions = {}): string {
  const margin = checkMargin(options.margin ?? DEFAULT_MARGIN);
  const dark = options.dark ?? DEFAULT_DARK;
  const pathData = darkModulesPathData(matrix, margin);
  return `<path d="${pathData}" fill="${escapeXmlAttribute(dark)}" shape-rendering="crispEdges"/>`;
}

/**
 * Render a self-contained SVG document for a QR matrix.
 *
 * The output uses `viewBox="0 0 dim dim"` where `dim = size + 2 * margin`;
 * `width`/`height` are `dim * scale`. With `light: null` the background is
 * transparent (no background rectangle is emitted).
 */
export function toSvg(matrix: QrMatrix, options: SvgOptions = {}): string {
  const margin = checkMargin(options.margin ?? DEFAULT_MARGIN);
  const scale = checkScale(options.scale ?? 1);
  const dark = options.dark ?? DEFAULT_DARK;
  const light = options.light === undefined ? DEFAULT_LIGHT : options.light;
  const dimension = matrix.size + margin * 2;
  const sizeInPixels = formatNumber(dimension * scale);
  const label = options.ariaLabel ?? options.title;

  const attributes = [
    'xmlns="http://www.w3.org/2000/svg"',
    `viewBox="0 0 ${dimension} ${dimension}"`,
    `width="${sizeInPixels}"`,
    `height="${sizeInPixels}"`,
    'role="img"',
  ];
  if (options.className !== undefined) attributes.push(`class="${escapeXmlAttribute(options.className)}"`);
  if (label !== undefined) attributes.push(`aria-label="${escapeXmlAttribute(label)}"`);

  let svg = `<svg ${attributes.join(" ")}>`;
  if (options.title !== undefined) svg += `<title>${escapeXmlText(options.title)}</title>`;
  if (light !== null) {
    const radius = checkRadius(options.radius ?? 0, dimension);
    const rounded = radius > 0 ? ` rx="${formatNumber(radius)}" ry="${formatNumber(radius)}"` : "";
    svg += `<rect width="${dimension}" height="${dimension}" fill="${escapeXmlAttribute(light)}"${rounded}/>`;
  }
  svg += toSvgPath(matrix, { margin, dark });
  svg += "</svg>";
  return svg;
}

// --- Terminal renderer ------------------------------------------------------

const ANSI_RESET = "\x1b[0m";

const TERMINAL_NAMED_COLORS: Record<string, string> = {
  black: "\x1b[40m",
  red: "\x1b[41m",
  green: "\x1b[42m",
  yellow: "\x1b[43m",
  blue: "\x1b[44m",
  magenta: "\x1b[45m",
  cyan: "\x1b[46m",
  white: "\x1b[47m",
  gray: "\x1b[100m",
  grey: "\x1b[100m",
  default: "\x1b[49m",
};

/** Convert a colour option into an ANSI SGR background sequence. */
function terminalColourCode(colour: string): string {
  if (colour.startsWith("\x1b[")) return colour;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour);
  if (hex !== null) {
    const digits = hex[1];
    const expand = (index: number): number => {
      if (digits.length === 3) {
        const nibble = parseInt(digits[index], 16);
        return nibble * 16 + nibble;
      }
      return parseInt(digits.slice(index * 2, index * 2 + 2), 16);
    };
    return `\x1b[48;2;${expand(0)};${expand(1)};${expand(2)}m`;
  }
  const named = TERMINAL_NAMED_COLORS[colour.toLowerCase()];
  if (named === undefined) {
    throw new RangeError(
      `unsupported terminal colour "${colour}" (use #rgb, #rrggbb, a basic colour name, or a raw ANSI SGR sequence)`,
    );
  }
  return named;
}

/**
 * Render a QR matrix as text.
 *
 * Plain output uses Unicode half blocks (`█`, `▀`, `▄`, space) so a symbol takes
 * one character per module horizontally and one character per two modules
 * vertically. When `dark`/`light` are given, each module becomes two spaces
 * painted with the corresponding ANSI background colour instead.
 */
export function toTerminal(matrix: QrMatrix, options: TerminalOptions = {}): string {
  const margin = checkMargin(options.margin ?? DEFAULT_MARGIN);
  const width = matrix.size + margin * 2;
  const height = width;
  // The symbol always has an odd number of modules, so the padded grid can be
  // even or odd; an odd height is rendered by treating the last row as light.
  const paddedHeight = height + (height % 2);

  const isDark = (x: number, y: number): boolean => {
    if (x < margin || y < margin || x >= margin + matrix.size || y >= margin + matrix.size) return false;
    return matrix.data[(y - margin) * matrix.size + (x - margin)] === 1;
  };

  const lines: string[] = [];
  const coloured = options.dark !== undefined || options.light !== undefined;

  if (coloured) {
    const darkCode = terminalColourCode(options.dark ?? DEFAULT_DARK);
    const lightCode = terminalColourCode(options.light ?? DEFAULT_LIGHT);
    for (let y = 0; y < paddedHeight; y++) {
      let line = "";
      let runColour = "";
      for (let x = 0; x < width; x++) {
        const code = isDark(x, y) ? darkCode : lightCode;
        if (code !== runColour) {
          line += code;
          runColour = code;
        }
        line += "  ";
      }
      lines.push(`${line}${ANSI_RESET}`);
    }
    return lines.join("\n");
  }

  for (let y = 0; y < paddedHeight; y += 2) {
    let line = "";
    for (let x = 0; x < width; x++) {
      const top = isDark(x, y);
      const bottom = y + 1 < paddedHeight ? isDark(x, y + 1) : false;
      line += top ? (bottom ? "█" : "▀") : bottom ? "▄" : " ";
    }
    // Trim the light quiet-zone on the right; it carries no information.
    lines.push(line.replace(/ +$/u, ""));
  }
  return lines.join("\n");
}

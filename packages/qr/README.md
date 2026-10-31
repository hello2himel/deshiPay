# deshiqr-qr

A small, **zero-runtime-dependency** QR Code encoder written from scratch against
[ISO/IEC 18004](https://www.iso.org/standard/62021.html), plus deterministic SVG and
terminal renderers. It is the QR engine behind deshiQR's pay pages, printable posters
and embeds.

- Byte mode only (UTF-8), versions 1–40, error-correction levels L/M/Q/H.
- Automatic version selection, automatic mask selection (the four standard penalty rules).
- Optional forced version / minimum version / forced mask.
- Complete, script-free SVG output and a Unicode half-block terminal view.
- Works in browsers, Node, Deno and edge runtimes: no DOM, no Node built-ins, no deps.

## Install

```sh
npm install deshiqr-qr
```

The package ships ESM (`dist/index.js`), CommonJS (`dist/index.cjs`) and TypeScript
declarations (`dist/index.d.ts`).

## Usage

```ts
import { encode, getVersionCapacity, toSvg, toSvgPath, toTerminal } from "deshiqr-qr";

// 1. Encode text (UTF-8 bytes) into a QR matrix. Level M by default.
const qr = encode("https://pay.example.com/#/p/demo-store");

// 2. Render it.
const svg = toSvg(qr, { scale: 8, margin: 4, title: "Demo Store — scan to pay" });
document.body.innerHTML = svg;

// Or compose it into your own SVG:
const path = toSvgPath(qr, { margin: 4, dark: "#111" });
// <svg viewBox="0 0 41 41">…path…</svg>

// A terminal preview:
console.log(toTerminal(qr));

// Capacities are part of the public API:
getVersionCapacity(1, "L"); // 17 bytes
getVersionCapacity(40, "L"); // 2953 bytes
```

### API

```ts
type EcLevel = "L" | "M" | "Q" | "H";
type RawText = string;

interface QrMatrix {
  size: number;              // modules per side
  version: number;           // 1..40
  level: EcLevel;
  mask: number;              // 0..7
  data: Uint8Array;          // size*size, 1 = dark, row-major
  get(x: number, y: number): boolean;
}

interface EncodeOptions {
  level?: EcLevel;           // default "M"
  version?: number;          // force a version; throws if the data does not fit
  minVersion?: number;       // lower bound for the automatic version search
  mask?: number;             // force a mask 0..7; default: automatic (penalty)
  eager?: boolean;           // skip the minimal-version search (uses version 40)
}

function encode(text: string, options?: EncodeOptions): QrMatrix;
function getVersionCapacity(version: number, level: EcLevel): number;

interface SvgOptions {
  margin?: number;           // quiet zone in modules, default 4
  scale?: number;            // pixels per module, default 1
  dark?: string;             // default "#000"
  light?: string | null;     // null = transparent, default "#fff"
  title?: string;            // <title>, also used as aria-label when no label is given
  radius?: number;           // quiet-zone corner radius, default 0
  className?: string;
  ariaLabel?: string;
}
function toSvg(matrix: QrMatrix, options?: SvgOptions): string;
function toSvgPath(matrix: QrMatrix, options?: SvgOptions): string; // a <path> element

interface TerminalOptions {
  margin?: number;           // default 4
  dark?: string;             // #rgb, #rrggbb, a basic colour name, or an ANSI SGR sequence
  light?: string;
}
function toTerminal(matrix: QrMatrix, options?: TerminalOptions): string;
```

`encode()` throws a `RangeError` when the text does not fit the requested version, no
version up to 40 can hold it, or an option is out of range.

### Renderer notes

- `toSvg` returns a complete, self-contained `<svg>` with `xmlns`, `viewBox`, `width`
  and `height`, an optional `<title>` / `aria-label`, an optional rounded quiet-zone
  background and a single `<path>` for the dark modules. `shape-rendering="crispEdges"`
  keeps modules sharp. Output is deterministic: no ids, timestamps or random values.
- `toSvgPath` returns just the `<path>` element, positioned for a viewBox of
  `0 0 (size + 2 * margin) (size + 2 * margin)`, so you can embed a QR into an existing
  SVG document.
- `toTerminal` uses `█`, `▀`, `▄` and spaces (one character per module column, one line
  per two module rows). Passing `dark`/`light` switches to two-space, ANSI
  background-coloured cells instead, which is useful for coloured terminals.

## Limits (on purpose)

- **Byte mode only.** There is no numeric, alphanumeric or Kanji mode, so a digit-only
  string still costs 8 bits per character; version selection therefore may be one step
  larger than the most compact possible symbol.
- **No ECI designator.** Input is encoded as UTF-8 and the byte sequence is written
  verbatim. Virtually all modern scanners (including jsQR, used in our round-trip tests)
  interpret byte-mode payloads as UTF-8, so Bangla and other non-ASCII text decodes
  correctly. Files or badges that require a specific ECI are out of scope.
- **No micro QR, no structured append, no FNC1.**
- The renderers return strings; rasterization (PNG) is left to the caller or the
  browser. The SVG is designed to be printed and scanned directly.
- `eager: true` is an internal escape hatch that skips the version search and produces
  a version-40 symbol; normal code should not need it.

## Testing

```sh
pnpm --filter deshiqr-qr typecheck
pnpm --filter deshiqr-qr test
pnpm --filter deshiqr-qr build
```

The test suite uses Node's built-in test runner (`node --test`, no test framework) and
checks, among other things:

- format/version information BCH bit patterns against ISO/IEC 18004 reference values;
- all 40 × 4 byte capacities against the published capacity table and against the
  `qrcode` package used as an independent oracle;
- identical module grids to `qrcode` for forced version/level/mask combinations;
- automatic version and mask selection matches `qrcode`;
- real-decoder round-trips through [jsQR](https://github.com/cozmo/jsQR) for ASCII, URLs,
  UTF-8 Bangla text and the synthetic deshiQR demo payloads (encode → rasterize to RGBA
  → decode → original string);
- SVG structure, escaping, dimensions and XML well-formedness, plus terminal layout.

`qrcode` and `jsqr` are **dev dependencies only** — they are test oracles, never bundled
and never imported by `src/`.

## Attribution

The implementation in `src/` is original code written from the ISO/IEC 18004
specification (Reed–Solomon over GF(2^8), BCH format/version information, mask penalty
rules, the standard's numeric tables). It is not a port of another library. The
`qrcode` and `jsqr` packages are used solely as development-time test oracles, and
"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

## License

MIT

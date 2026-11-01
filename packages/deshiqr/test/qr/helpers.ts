/**
 * Test helpers: synthetic fixtures, a JSON/PNG-free rasterizer for the jsQR
 * round-trip, the `qrcode` package used as an oracle, and a tiny XML
 * well-formedness checker.
 *
 * Everything here is dev/test-only. No real merchant or payment data is used;
 * the fixtures are the synthetic payloads from `docs/demo-payloads.md`.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { QrMatrix } from "../../src/qr/types.ts";

/** `createRequire` for the CommonJS-only dev dependencies (`qrcode`, `jsqr`). */
export const requireCjs = createRequire(import.meta.url);

// --- Synthetic fixtures (docs/demo-payloads.md) -----------------------------

export const DEMO_STATIC_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D";

export const DEMO_DYNAMIC_PAYLOAD =
  "00020101021226470014bd.org.bb.npsb010202020420020311010000000005204601653030505406500.005802BD5910DEMO STORE6005Dhaka62200110DEMO1234560602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=630479CA";

export const DEMO_MINIMAL_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb0102020204200203110100000000053030505802BD5910DEMO STORE6005Dhaka63049C89";

export const DEMO_LONG_NAME_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204541153030505802BD5919DEMO SUPER SHOP LTD6010Chattogram630494E0";

export const DEMO_PAYLOADS: ReadonlyArray<{ name: string; payload: string }> = [
  { name: "static", payload: DEMO_STATIC_PAYLOAD },
  { name: "dynamic", payload: DEMO_DYNAMIC_PAYLOAD },
  { name: "minimal", payload: DEMO_MINIMAL_PAYLOAD },
  { name: "long-name", payload: DEMO_LONG_NAME_PAYLOAD },
];

/** Bangla text, including digits and a dash, to exercise multi-byte UTF-8. */
export const BANGLA_TEXT = "ডেমো স্টোর — পেমেন্ট ৫০০ টাকা (synthetic demo)";

export const ASCII_TEXT = "deshiQR: scan & pay demo";
export const URL_TEXT = "https://example.com/pay?m=demo-store&amount=500.00&ref=FT8012345";

// --- Rasterizer + real-decoder round-trip ----------------------------------

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Rasterize a matrix to an RGBA image: `scale` pixels per module, black
 * modules on a white canvas, with a `margin`-module quiet zone.
 */
export function rasterize(matrix: QrMatrix, scale = 4, margin = 4): RgbaImage {
  const width = (matrix.size + margin * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  // White, fully opaque background.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  const { size } = matrix;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix.data[y * size + x] !== 1) continue;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const row = (y + margin) * scale + py;
          const column = (x + margin) * scale + px;
          const index = (row * width + column) * 4;
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
          data[index + 3] = 255;
        }
      }
    }
  }
  return { data, width, height: width };
}

type JsQrDecoder = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: "attemptBoth" | "dontInvert" | "onlyInvert" | "invertFirst" },
) => { data: string; binaryData: number[] } | null;

/** Encode -> rasterize -> decode with the real `jsqr` decoder. */
export function decodeMatrix(matrix: QrMatrix, options: { scale?: number; margin?: number } = {}): string | null {
  const jsQr = requireCjs("jsqr") as JsQrDecoder;
  const image = rasterize(matrix, options.scale ?? 4, options.margin ?? 4);
  const result = jsQr(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
  return result === null ? null : result.data;
}

// --- `qrcode` oracle -------------------------------------------------------

export interface OracleSymbol {
  size: number;
  data: Uint8Array;
  version: number;
  mask: number;
}

/** Build a symbol with the `qrcode` package, forcing byte mode. */
export function qrcodeCreate(
  text: string,
  options: { version?: number; level?: string; mask?: number } = {},
): OracleSymbol {
  const QRCode = requireCjs("qrcode");
  const symbol = QRCode.create([{ data: text, mode: "byte" }], {
    errorCorrectionLevel: options.level ?? "M",
    ...(options.version === undefined ? {} : { version: options.version }),
    ...(options.mask === undefined ? {} : { maskPattern: options.mask }),
  });
  return {
    size: symbol.modules.size,
    data: symbol.modules.data as Uint8Array,
    version: symbol.version as number,
    mask: symbol.maskPattern as number,
  };
}

/** Byte capacity reported by the `qrcode` package for a version/level. */
export function qrcodeCapacity(version: number, level: string): number {
  const Version = requireCjs("qrcode/lib/core/version");
  const ECLevel = requireCjs("qrcode/lib/core/error-correction-level");
  return Version.getCapacity(version, ECLevel.from(level)) as number;
}

/** Number of EC codewords reported by the `qrcode` package. */
export function qrcodeEcCodewords(version: number, level: string): number {
  const ECCode = requireCjs("qrcode/lib/core/error-correction-code");
  const ECLevel = requireCjs("qrcode/lib/core/error-correction-level");
  return ECCode.getTotalCodewordsCount(version, ECLevel.from(level)) as number;
}

/** Number of EC blocks reported by the `qrcode` package. */
export function qrcodeEcBlocks(version: number, level: string): number {
  const ECCode = requireCjs("qrcode/lib/core/error-correction-code");
  const ECLevel = requireCjs("qrcode/lib/core/error-correction-level");
  return ECCode.getBlocksCount(version, ECLevel.from(level)) as number;
}

/** Total codewords reported by the `qrcode` package. */
export function qrcodeTotalCodewords(version: number): number {
  const Utils = requireCjs("qrcode/lib/core/utils");
  return Utils.getSymbolTotalCodewords(version) as number;
}

// --- Tiny XML well-formedness checker -------------------------------------

function assertNoUnescapedMarkup(text: string): void {
  assert.equal(/[<>]/.test(text), false, `unescaped markup in text content: ${JSON.stringify(text)}`);
  assert.equal(
    /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text),
    false,
    `unescaped "&" in text content: ${JSON.stringify(text)}`,
  );
}

/**
 * Minimal XML well-formedness check: balanced, correctly nested tags with
 * double-quoted attributes, no unescaped markup or ampersands in text. This is
 * deliberately hand-rolled (tests may not add a test framework or XML library).
 */
export function assertWellFormedXml(xml: string): void {
  const tagPattern =
    /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*\s*=\s*"[^"<]*")*)\s*(\/?)>/g;
  const stack: string[] = [];
  let cursor = 0;

  for (let match = tagPattern.exec(xml); match !== null; match = tagPattern.exec(xml)) {
    assertNoUnescapedMarkup(xml.slice(cursor, match.index));
    cursor = tagPattern.lastIndex;

    const isClosing = match[1] === "/";
    const name = match[2];
    const isSelfClosing = match[4] === "/";

    if (isClosing) {
      assert.equal(isSelfClosing, false, `closing tag </${name}> cannot be self-closing`);
      assert.equal(stack.pop(), name, `mismatched closing tag </${name}>`);
    } else if (!isSelfClosing) {
      stack.push(name);
    }
  }

  assertNoUnescapedMarkup(xml.slice(cursor));
  assert.deepEqual(stack, [], `unclosed tags: ${stack.join(", ")}`);
}

/**
 * Real-decoder round-trip: encode -> rasterize to RGBA -> decode with `jsqr`.
 *
 * `jsqr` is a dev dependency and a genuine QR decoder, so this is the test that
 * proves the symbols are actually scannable, not merely "look like" QR Codes.
 * It also pins the UTF-8/byte-mode choice: the Bangla fixtures must decode back
 * to exactly the same JavaScript string.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { encode } from "../../src/qr/index.ts";
import type { EcLevel } from "../../src/qr/types.ts";
import {
  ASCII_TEXT,
  BANGLA_TEXT,
  DEMO_PAYLOADS,
  URL_TEXT,
  decodeMatrix,
} from "./helpers.ts";

function roundTrip(text: string, level: EcLevel = "M"): void {
  const matrix = encode(text, { level });
  const decoded = decodeMatrix(matrix);
  assert.equal(decoded, text, `round-trip failed for level ${level}: ${JSON.stringify(text.slice(0, 40))}`);
}

test("round-trip: short ASCII", () => {
  roundTrip("HELLO deshiQR");
});

test("round-trip: URL with query string", () => {
  roundTrip(URL_TEXT);
});

test("round-trip: UTF-8 Bangla text", () => {
  roundTrip(BANGLA_TEXT);
});

test("round-trip: ASCII through every error-correction level", () => {
  for (const level of ["L", "M", "Q", "H"] as const) {
    roundTrip(ASCII_TEXT, level);
  }
});

test("round-trip: the four synthetic demo payloads", () => {
  for (const { name, payload } of DEMO_PAYLOADS) {
    const decoded = decodeMatrix(encode(payload, { level: "M" }));
    assert.equal(decoded, payload, `demo payload "${name}" did not round-trip`);
  }
});

test("round-trip: demo payloads with the highest error-correction level", () => {
  for (const { name, payload } of DEMO_PAYLOADS) {
    const decoded = decodeMatrix(encode(payload, { level: "H" }));
    assert.equal(decoded, payload, `demo payload "${name}" did not round-trip at level H`);
  }
});

test("round-trip: forced version keeps the payload intact", () => {
  const matrix = encode("forced version round-trip", { version: 10, level: "Q", mask: 3 });
  assert.equal(decodeMatrix(matrix), "forced version round-trip");
});

test("round-trip: large payload (version 40 territory)", () => {
  // ~2.1 KB forces a large version while staying inside version 40-L.
  const text = "deshiQR demo payload ".repeat(100).trim();
  const matrix = encode(text, { level: "L" });
  assert.ok(matrix.version >= 33, `expected a large symbol, got version ${matrix.version}`);
  // A 6px/module raster keeps the image manageable (~1100px) for jsQR.
  const decoded = decodeMatrix(matrix, { scale: 5 });
  assert.equal(decoded, text);
});

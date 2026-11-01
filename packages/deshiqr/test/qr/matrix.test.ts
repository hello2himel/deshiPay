/**
 * Matrix cross-checks against the `qrcode` dev dependency.
 *
 * Two kinds of checks:
 *   - forced version + level + mask: identical module grids (this pins the
 *     whole pipeline: RS encoding, block interleaving, function patterns,
 *     format/version information and data placement);
 *   - automatic version/mask selection: the same version and mask must be
 *     chosen as by the reference implementation, and the grids must match.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { encode } from "../../src/qr/index.ts";
import { penaltyScore } from "../../src/qr/tables.ts";
import type { EcLevel, QrMatrix } from "../../src/qr/types.ts";
import { BANGLA_TEXT, DEMO_DYNAMIC_PAYLOAD, qrcodeCreate } from "./helpers.ts";

function assertSameGrid(actual: QrMatrix, expected: { size: number; data: Uint8Array }, label: string): void {
  assert.equal(actual.size, expected.size, `${label}: size`);
  const mismatched: number[] = [];
  for (let i = 0; i < expected.data.length; i++) {
    if (actual.data[i] !== expected.data[i]) mismatched.push(i);
  }
  assert.deepEqual(
    mismatched.slice(0, 10),
    [],
    `${label}: ${mismatched.length} module(s) differ (first indices shown)`,
  );
}

test("forced version/level/mask matrices are identical to qrcode (28 combinations)", () => {
  const cases: ReadonlyArray<{ version: number; level: EcLevel; mask: number; text: string }> = [
    { version: 1, level: "L", mask: 0, text: "deshiQR" },
    { version: 1, level: "H", mask: 7, text: "abc" },
    { version: 2, level: "M", mask: 1, text: "hello" },
    { version: 2, level: "Q", mask: 2, text: "123456789" },
    { version: 3, level: "Q", mask: 3, text: "deshiQR!" },
    { version: 3, level: "H", mask: 5, text: "hello world" },
    { version: 4, level: "L", mask: 4, text: "A".repeat(40) },
    { version: 5, level: "Q", mask: 2, text: "https://example.com" },
    { version: 6, level: "H", mask: 6, text: "deshiQR demo payload" },
    { version: 7, level: "L", mask: 0, text: "byte mode only, versions one to forty" },
    { version: 7, level: "H", mask: 7, text: "hello" },
    { version: 8, level: "M", mask: 2, text: "deshiQR matrix cross-check" },
    { version: 9, level: "Q", mask: 1, text: "0123456789abcdef" },
    { version: 10, level: "L", mask: 3, text: "16-bit character count boundary" },
    { version: 10, level: "H", mask: 5, text: "deshiQR" },
    { version: 10, level: "Q", mask: 7, text: "ডেমো স্টোর — ডেমো পেমেন্ট" },
    { version: 12, level: "Q", mask: 4, text: "x".repeat(100) },
    { version: 14, level: "M", mask: 6, text: "deshiQR cross-check, version fourteen" },
    { version: 17, level: "L", mask: 7, text: "y".repeat(300) },
    { version: 20, level: "M", mask: 0, text: "z".repeat(400) },
    { version: 22, level: "Q", mask: 1, text: "w".repeat(400) },
    { version: 25, level: "H", mask: 3, text: "v".repeat(300) },
    { version: 27, level: "L", mask: 4, text: "version twenty-seven, 16-bit count" },
    { version: 32, level: "H", mask: 2, text: "special alignment pattern step" },
    { version: 35, level: "L", mask: 5, text: "q".repeat(100) },
    { version: 38, level: "M", mask: 6, text: "deshiQR" },
    { version: 40, level: "H", mask: 1, text: "r".repeat(500) },
    { version: 40, level: "L", mask: 0, text: DEMO_DYNAMIC_PAYLOAD },
  ];

  for (const { version, level, mask, text } of cases) {
    const actual = encode(text, { version, level, mask });
    const expected = qrcodeCreate(text, { version, level, mask });
    const label = `v${version}-${level}-m${mask} (${JSON.stringify(text.slice(0, 20))})`;
    assert.equal(actual.version, version, `${label}: version`);
    assert.equal(actual.level, level, `${label}: level`);
    assert.equal(actual.mask, mask, `${label}: mask`);
    assertSameGrid(actual, expected, label);
  }
});

test("automatic version and mask selection match qrcode", () => {
  const texts = [
    "a",
    "hello world",
    "deshiQR demo",
    "https://example.com/pay?m=demo-store&amount=500.00&ref=FT8012345",
    BANGLA_TEXT,
    DEMO_DYNAMIC_PAYLOAD,
    "x".repeat(500),
  ];
  const levels: readonly EcLevel[] = ["L", "M", "Q", "H"];

  let checked = 0;
  for (const text of texts) {
    for (const level of levels) {
      let expected: ReturnType<typeof qrcodeCreate>;
      try {
        expected = qrcodeCreate(text, { level });
      } catch {
        continue; // too large for this level: nothing to compare
      }
      const actual = encode(text, { level });
      const label = `${level} ${JSON.stringify(text.slice(0, 16))} (${text.length} chars)`;
      assert.equal(actual.version, expected.version, `${label}: auto version`);
      assert.equal(actual.mask, expected.mask, `${label}: auto mask`);
      assertSameGrid(actual, expected, label);
      checked++;
    }
  }
  assert.ok(checked >= 20, `expected at least 20 automatic comparisons, got ${checked}`);
});

test("automatic mask selection within a forced version matches qrcode", () => {
  const cases: ReadonlyArray<{ version: number; level: EcLevel; text: string }> = [
    { version: 5, level: "L", text: "forced version, automatic mask" },
    { version: 7, level: "Q", text: "version info block" },
    { version: 10, level: "M", text: "sixteen bit count indicator" },
    { version: 14, level: "H", text: "deshiQR" },
    { version: 21, level: "Q", text: "x".repeat(150) },
    { version: 32, level: "H", text: "special alignment grid" },
    { version: 40, level: "L", text: "y".repeat(1000) },
  ];
  for (const { version, level, text } of cases) {
    const actual = encode(text, { version, level });
    const expected = qrcodeCreate(text, { version, level });
    const label = `v${version}-${level}`;
    assert.equal(actual.mask, expected.mask, `${label}: mask`);
    assertSameGrid(actual, expected, label);
  }
});

test("auto mask selection keeps the lowest-penalty mask", () => {
  // 13 bytes: fits version 2 even at level H (14-byte capacity).
  const text = "deshiQR mask";
  for (const level of ["L", "M", "Q", "H"] as const) {
    for (const version of [2, 7, 12]) {
      const forced = Array.from({ length: 8 }, (_, mask) => encode(text, { version, level, mask }));
      const penalties = forced.map((matrix) => penaltyScore(matrix.data, matrix.size));
      let bestMask = 0;
      for (let mask = 1; mask < 8; mask++) {
        if (penalties[mask] < penalties[bestMask]) bestMask = mask;
      }
      const automatic = encode(text, { version, level });
      assert.equal(automatic.mask, bestMask, `v${version}-${level}: lowest penalty mask`);
      assert.deepEqual(
        Array.from(automatic.data),
        Array.from(forced[bestMask].data),
        `v${version}-${level}: auto matrix equals the chosen forced-mask matrix`,
      );
    }
  }
});

test("matrix accessor matches the raw module data", () => {
  const matrix = encode("accessor check", { level: "Q" });
  assert.equal(matrix.data.length, matrix.size * matrix.size);
  for (let y = 0; y < matrix.size; y += 3) {
    for (let x = 0; x < matrix.size; x += 5) {
      assert.equal(matrix.get(x, y), matrix.data[y * matrix.size + x] === 1, `get(${x}, ${y})`);
    }
  }
  assert.equal(matrix.get(-1, 0), false);
  assert.equal(matrix.get(0, -1), false);
  assert.equal(matrix.get(matrix.size, 0), false);
  assert.equal(matrix.get(0, matrix.size), false);
});

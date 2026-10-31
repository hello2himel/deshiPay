/**
 * Reference-value tests for the static parts of the standard:
 * format information, version information, alignment coordinates and the
 * published byte-mode capacity table.
 *
 * Reference values come from ISO/IEC 18004 Annex C/D and the published
 * byte-mode capacity table; the capacity boundaries are also exercised through
 * `encode()` (at capacity, and capacity + 1 auto-bumps the version).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { encode, getVersionCapacity } from "../src/index.ts";
import { alignmentPositions, formatInfo, versionInfo } from "../src/tables.ts";
import type { EcLevel } from "../src/types.ts";

test("format information matches ISO/IEC 18004 reference bit patterns", () => {
  // Annex C: 2-bit EC level + 3-bit mask, 10 BCH bits, XOR 0x5412.
  const reference: ReadonlyArray<readonly [EcLevel, number, string]> = [
    ["L", 0, "111011111000100"],
    ["L", 7, "110100101110110"],
    ["M", 0, "101010000010010"],
    ["M", 1, "101000100100101"],
    ["M", 7, "100101010100000"],
    ["Q", 0, "011010101011111"],
    ["Q", 7, "010101111101101"],
    ["H", 0, "001011010001001"],
    ["H", 7, "000100000111011"],
  ];
  for (const [level, mask, expected] of reference) {
    assert.equal(formatInfo(level, mask).toString(2).padStart(15, "0"), expected, `format info for ${level}-${mask}`);
  }

  // All 32 combinations are distinct 15-bit values (the XOR mask guarantees
  // that no valid pattern is all zeros).
  const patterns = new Set<number>();
  for (const level of ["L", "M", "Q", "H"] as const) {
    for (let mask = 0; mask < 8; mask++) {
      const pattern = formatInfo(level, mask);
      assert.ok(pattern >= 0 && pattern < 1 << 15, `${level}-${mask} is a 15-bit value`);
      patterns.add(pattern);
    }
  }
  assert.equal(patterns.size, 32);
  assert.equal(patterns.has(0), false);
});

test("version information matches ISO/IEC 18004 reference bit patterns", () => {
  // Annex D: 6 version bits + 12 BCH bits, no XOR mask.
  const reference: ReadonlyArray<readonly [number, string]> = [
    [7, "000111110010010100"],
    [8, "001000010110111100"],
    [10, "001010010011010011"],
    [25, "011001000111100001"],
    [40, "101000110001101001"],
  ];
  for (const [version, expected] of reference) {
    assert.equal(versionInfo(version).toString(2).padStart(18, "0"), expected, `version info for ${version}`);
  }

  for (let version = 1; version < 7; version++) {
    assert.throws(() => versionInfo(version), RangeError);
  }
  for (let version = 7; version <= 40; version++) {
    const bits = versionInfo(version);
    assert.ok(bits >= 0 && bits < 1 << 18);
  }
});

test("alignment pattern coordinates match the standard grid", () => {
  assert.deepEqual(alignmentPositions(1), []);
  assert.deepEqual(alignmentPositions(2), [6, 18]);
  assert.deepEqual(alignmentPositions(3), [6, 22]);
  assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
  assert.deepEqual(alignmentPositions(14), [6, 26, 46, 66]);
  assert.deepEqual(alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(alignmentPositions(40), [6, 30, 58, 86, 114, 142, 170]);

  for (let version = 2; version <= 40; version++) {
    const positions = alignmentPositions(version);
    assert.equal(positions[0], 6, `version ${version} starts at 6`);
    assert.equal(positions[positions.length - 1], version * 4 + 10, `version ${version} ends at size - 7`);
    assert.equal(positions.length, Math.floor(version / 7) + 2, `version ${version} position count`);
    for (let i = 1; i < positions.length; i++) {
      assert.ok(positions[i] > positions[i - 1], `version ${version} positions are ascending`);
    }
  }
});

test("byte-mode capacity matches the published table", () => {
  const published: ReadonlyArray<readonly [number, EcLevel, number]> = [
    [1, "L", 17],
    [1, "M", 14],
    [1, "Q", 11],
    [1, "H", 7],
    [2, "L", 32],
    [2, "M", 26],
    [2, "Q", 20],
    [2, "H", 14],
    [3, "L", 53],
    [3, "M", 42],
    [3, "Q", 32],
    [3, "H", 24],
    [4, "L", 78],
    [4, "M", 62],
    [4, "Q", 46],
    [4, "H", 34],
    [5, "L", 106],
    [5, "M", 84],
    [5, "Q", 60],
    [5, "H", 44],
    [6, "L", 134],
    [6, "M", 106],
    [6, "Q", 74],
    [6, "H", 58],
    [7, "L", 154],
    [7, "M", 122],
    [7, "Q", 86],
    [7, "H", 64],
    [8, "L", 192],
    [8, "M", 152],
    [8, "Q", 108],
    [8, "H", 84],
    [9, "L", 230],
    [9, "M", 180],
    [9, "Q", 130],
    [9, "H", 98],
    [10, "L", 271],
    [10, "M", 213],
    [10, "Q", 151],
    [10, "H", 119],
    [20, "L", 858],
    [20, "M", 666],
    [20, "Q", 482],
    [20, "H", 382],
    [30, "L", 1732],
    [30, "M", 1370],
    [30, "Q", 982],
    [30, "H", 742],
    [40, "L", 2953],
    [40, "M", 2331],
    [40, "Q", 1663],
    [40, "H", 1273],
  ];

  for (const [version, level, capacity] of published) {
    assert.equal(getVersionCapacity(version, level), capacity, `capacity ${version}-${level}`);
  }
});

test("data at capacity fits its version and one more byte bumps the version", () => {
  const boundaries: ReadonlyArray<readonly [number, EcLevel, number]> = [
    [1, "L", 17],
    [1, "H", 7],
    [2, "Q", 20],
    [3, "H", 24],
    [5, "M", 84],
    [7, "L", 154],
    [9, "H", 98],
    [10, "L", 271],
    [13, "Q", 241],
    [17, "M", 504],
    [25, "H", 535],
    [32, "L", 1952],
    [40, "H", 1273],
    [40, "L", 2953],
  ];

  for (const [version, level, capacity] of boundaries) {
    const atCapacity = encode("x".repeat(capacity), { level });
    assert.equal(atCapacity.version, version, `${capacity} bytes fit exactly in ${version}-${level}`);
    if (version < 40) {
      const oneMore = encode("x".repeat(capacity + 1), { level });
      assert.equal(oneMore.version, version + 1, `${capacity + 1} bytes need version ${version + 1}`);
    } else {
      assert.throws(() => encode("x".repeat(capacity + 1), { level }), RangeError);
    }
  }
});

test("capacity validation rejects bad versions and levels", () => {
  assert.throws(() => getVersionCapacity(0, "M"), RangeError);
  assert.throws(() => getVersionCapacity(41, "M"), RangeError);
  assert.throws(() => getVersionCapacity(1.5, "M"), RangeError);
  assert.throws(() => getVersionCapacity(1, "Z" as EcLevel), RangeError);
});

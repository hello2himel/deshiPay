/**
 * Exhaustive capacity / table cross-check against the `qrcode` dev dependency.
 *
 * `qrcode` is a test oracle only: the package under test has zero runtime
 * dependencies. All 40 x 4 version/level combinations are compared.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { getVersionCapacity } from "../src/index.ts";
import { ecBlockCount, ecCodewords, TOTAL_CODEWORDS } from "../src/tables.ts";
import type { EcLevel } from "../src/types.ts";
import {
  qrcodeCapacity,
  qrcodeEcBlocks,
  qrcodeEcCodewords,
  qrcodeTotalCodewords,
} from "./helpers.ts";

const LEVELS: readonly EcLevel[] = ["L", "M", "Q", "H"];

test("byte capacity for all 40 versions x 4 levels matches qrcode", () => {
  const mismatches: string[] = [];
  for (let version = 1; version <= 40; version++) {
    for (const level of LEVELS) {
      const actual = getVersionCapacity(version, level);
      const expected = qrcodeCapacity(version, level);
      if (actual !== expected) mismatches.push(`v${version}-${level}: got ${actual}, expected ${expected}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test("total codeword table matches qrcode for all versions", () => {
  for (let version = 1; version <= 40; version++) {
    assert.equal(TOTAL_CODEWORDS[version - 1], qrcodeTotalCodewords(version), `total codewords v${version}`);
  }
});

test("error-correction codeword and block counts match qrcode", () => {
  for (let version = 1; version <= 40; version++) {
    for (const level of LEVELS) {
      assert.equal(ecCodewords(version, level), qrcodeEcCodewords(version, level), `EC codewords v${version}-${level}`);
      assert.equal(ecBlockCount(version, level), qrcodeEcBlocks(version, level), `EC blocks v${version}-${level}`);
    }
  }
});

test("capacity is strictly increasing with version for every level", () => {
  for (const level of LEVELS) {
    for (let version = 2; version <= 40; version++) {
      const previous = getVersionCapacity(version - 1, level);
      const current = getVersionCapacity(version, level);
      assert.ok(current > previous, `${level}: v${version} (${current}) must exceed v${version - 1} (${previous})`);
    }
  }
});

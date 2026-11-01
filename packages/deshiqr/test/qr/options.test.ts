/**
 * Option handling and error behaviour of `encode()`.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { encode, getVersionCapacity } from "../../src/qr/index.ts";
import type { EcLevel } from "../../src/qr/types.ts";

test("defaults: level M, automatic version and mask", () => {
  const matrix = encode("defaults");
  assert.equal(matrix.level, "M");
  assert.ok(matrix.version >= 1 && matrix.version <= 40);
  assert.ok(matrix.mask >= 0 && matrix.mask <= 7);
  assert.equal(matrix.size, matrix.version * 4 + 17);
  assert.equal(matrix.data.length, matrix.size * matrix.size);
});

test("forced version is honoured, and a too-small version throws", () => {
  const matrix = encode("hello", { version: 12, level: "Q" });
  assert.equal(matrix.version, 12);
  assert.equal(matrix.size, 12 * 4 + 17);

  assert.throws(
    () => encode("x".repeat(18), { version: 1, level: "L" }),
    (error: unknown) => error instanceof RangeError && /does not fit/.test(error.message),
  );
});

test("forced masks 0-7 are all accepted", () => {
  for (let mask = 0; mask < 8; mask++) {
    const matrix = encode("mask", { mask });
    assert.equal(matrix.mask, mask);
  }
});

test("minVersion raises the automatic version", () => {
  const small = encode("hi");
  const raised = encode("hi", { minVersion: 10 });
  assert.ok(raised.version >= 10);
  assert.ok(raised.version > small.version);
  assert.equal(raised.size, raised.version * 4 + 17);
});

test("eager skips the minimal-version search and uses version 40", () => {
  const matrix = encode("eager", { eager: true, level: "L" });
  assert.equal(matrix.version, 40);
});

test("empty text encodes a valid version 1 symbol", () => {
  const matrix = encode("");
  assert.equal(matrix.version, 1);
  assert.equal(matrix.size, 21);
});

test("UTF-8 byte length (not JavaScript string length) drives version selection", () => {
  // "é" is two UTF-8 bytes, so 8 of them (16 bytes) fit version 1-L (17 bytes),
  // but 9 of them (18 bytes) need version 2.
  const eight = encode("é".repeat(8), { level: "L" });
  const nine = encode("é".repeat(9), { level: "L" });
  assert.equal(eight.version, 1);
  assert.equal(nine.version, 2);
  assert.equal(getVersionCapacity(1, "L"), 17);
});

test("invalid options throw RangeError", () => {
  assert.throws(() => encode("x", { level: "Z" as EcLevel }), RangeError);
  assert.throws(() => encode("x", { version: 0 }), RangeError);
  assert.throws(() => encode("x", { version: 41 }), RangeError);
  assert.throws(() => encode("x", { version: 2.5 }), RangeError);
  assert.throws(() => encode("x", { mask: 8 }), RangeError);
  assert.throws(() => encode("x", { mask: -1 }), RangeError);
  assert.throws(() => encode("x", { mask: 1.5 }), RangeError);
  assert.throws(() => encode("x", { minVersion: 0 }), RangeError);
  assert.throws(() => encode("x", { minVersion: 41 }), RangeError);
  assert.throws(() => encode(42 as unknown as string), TypeError);
});

test("data that cannot fit version 40 throws a useful error", () => {
  const tooLong = "x".repeat(getVersionCapacity(40, "L") + 1);
  assert.throws(
    () => encode(tooLong, { level: "L" }),
    (error: unknown) => error instanceof RangeError && /too long/.test(error.message),
  );
});

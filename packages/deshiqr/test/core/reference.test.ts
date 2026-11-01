import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_REFERENCE_LENGTH, newReference } from "../../src/core/reference.ts";
import { DeshiQrError } from "../../src/core/errors.ts";

const isCode = (code: string) => (error: unknown) =>
  DeshiQrError.is(error) && error.code === code;

test("newReference defaults to the 25-character bill-number shape bKash uses", () => {
  const reference = newReference();
  assert.equal(DEFAULT_REFERENCE_LENGTH, 25);
  assert.equal(reference.length, 25);
  assert.match(reference, /^[A-Za-z0-9]{25}$/);
});

test("newReference keeps the prefix and fills the rest", () => {
  const reference = newReference({ prefix: "FT80", length: 10 });
  assert.equal(reference.length, 10);
  assert.ok(reference.startsWith("FT80"));
  assert.match(reference, /^[A-Za-z0-9]{10}$/);
});

test("newReference supports any length from 1 to 32", () => {
  for (const length of [1, 2, 5, 12, 32]) {
    assert.equal(newReference({ length }).length, length);
  }
});

test("newReference returns the prefix alone when it fills the reference", () => {
  assert.equal(newReference({ prefix: "DEMO123456", length: 10 }), "DEMO123456");
});

test("newReference does not repeat itself", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(newReference());
  assert.equal(seen.size, 200);
});

test("newReference rejects impossible prefixes and lengths", () => {
  assert.throws(() => newReference({ length: 0 }), isCode("BAD_REFERENCE"));
  assert.throws(() => newReference({ length: 33 }), isCode("BAD_REFERENCE"));
  assert.throws(() => newReference({ length: 4.5 }), isCode("BAD_REFERENCE"));
  assert.throws(() => newReference({ prefix: "has space" }), isCode("BAD_REFERENCE"));
  assert.throws(() => newReference({ prefix: "TOOLONGPREFIX", length: 4 }), isCode("BAD_REFERENCE"));
});

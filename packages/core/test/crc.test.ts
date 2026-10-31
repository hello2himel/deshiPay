import assert from "node:assert/strict";
import { test } from "node:test";
import { crc16 } from "../src/crc.ts";
import { verifyChecksum } from "../src/index.ts";
import {
  BAD_CHECKSUM_PAYLOAD,
  DYNAMIC_PAYLOAD,
  LONG_NAME_PAYLOAD,
  MINIMAL_PAYLOAD,
  STATIC_PAYLOAD,
  rebuild,
  setField,
} from "./fixtures.ts";

test("CRC-16/CCITT-FALSE anchor vector: 123456789 -> 29B1", () => {
  assert.equal(crc16("123456789"), "29B1");
});

test("empty string hashes to FFFF and is four uppercase hex chars", () => {
  assert.equal(crc16(""), "FFFF");
  for (const input of ["", "a", "bangla qr", "123456789"]) {
    assert.match(crc16(input), /^[0-9A-F]{4}$/);
  }
});

test("fixture checksums are valid", () => {
  for (const payload of [STATIC_PAYLOAD, DYNAMIC_PAYLOAD, MINIMAL_PAYLOAD, LONG_NAME_PAYLOAD]) {
    const expected = crc16(payload.slice(0, -4));
    assert.equal(payload.slice(-4), expected);
    assert.equal(verifyChecksum(payload), true);
  }
});

test("verifyChecksum rejects a corrupted payload", () => {
  assert.equal(verifyChecksum(BAD_CHECKSUM_PAYLOAD), false);
  const swapped = STATIC_PAYLOAD.replace("01000000000", "01000000001");
  assert.equal(verifyChecksum(swapped), false);
});

test("verifyChecksum tolerates surrounding whitespace and lowercase hex", () => {
  assert.equal(verifyChecksum(`\n  ${STATIC_PAYLOAD}  \n`), true);
  const lower = STATIC_PAYLOAD.slice(0, -4) + STATIC_PAYLOAD.slice(-4).toLowerCase();
  assert.equal(verifyChecksum(lower), true);
});

test("verifyChecksum rejects garbage", () => {
  for (const input of ["", "   ", "abc", "000201", "0002016304ZZZZ"]) {
    assert.equal(verifyChecksum(input), false, input);
  }
});

test("changing any field invalidates the checksum", () => {
  const resigned = rebuild(STATIC_PAYLOAD, (fields) => setField(fields, "59", "DEMO STORE 2"));
  assert.equal(verifyChecksum(resigned), true);
  assert.notEqual(resigned, STATIC_PAYLOAD);
});

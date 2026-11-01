/**
 * The `qr` API does one thing: static payload + amount -> dynamic payload + QR.
 * These tests pin that contract, including the provider-agnostic guarantee:
 * a synthetic layout that is *not* the bKash/NPSB shape must derive correctly,
 * with only tag 01 and tag 54 changing.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DeshiQrError, crc16, parse, referenceFrom, verifyChecksum } from "../_vendor/core/index.ts";
import { buildAmountQr, coerceAmount } from "./qr-core.ts";

/** Synthetic, non-bKash layout: unknown AID, no MCC? (MCC present), no tokens, no tag 62. */
const GENERIC_STATIC =
  "00020101021126410022example.org.generic-qr0311017000000005204541153030505802BD5912GENERIC SHOP6006Sylhet6304818D";
/** Same payload for 1250.50 BDT — the only edits are tag 01 (11→12) and tag 54. */
const GENERIC_DYNAMIC_1250_50 =
  "00020101021226410022example.org.generic-qr03110170000000052045411530305054071250.505802BD5912GENERIC SHOP6006Sylhet630480A2";

const STATIC =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D";
const DYNAMIC_500 =
  "00020101021226470014bd.org.bb.npsb010202020420020311010000000005204601653030505406500.005802BD5910DEMO STORE6005Dhaka62350125DEMOQR0VZeK2MfbVRI6w36osd0602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304F835";
const REFERENCE = "DEMOQR0VZeK2MfbVRI6w36osd";

function isCode(code: string) {
  return (error: unknown) => DeshiQrError.is(error) && error.code === code;
}

test("derives a dynamic payload from a non-bKash layout, editing only tag 01 and 54", () => {
  const result = buildAmountQr({ payload: GENERIC_STATIC, amount: 1250.5 });

  assert.equal(result.payload, GENERIC_DYNAMIC_1250_50);
  assert.equal(result.amount, 1250.5);
  assert.equal(result.amountText, "1250.50");
  assert.equal(result.reference, null);
  assert.equal(verifyChecksum(result.payload), true);

  const before = parse(GENERIC_STATIC).filter((field) => field.tag !== "63");
  const after = parse(result.payload).filter((field) => field.tag !== "63");

  // Everything that is not the point-of-initiation or the amount is byte-identical.
  assert.deepEqual(
    after.filter((field) => field.tag !== "01" && field.tag !== "54"),
    before.filter((field) => field.tag !== "01"),
  );
  assert.equal(after.find((field) => field.tag === "01")?.value, "12");
  assert.equal(after.find((field) => field.tag === "54")?.value, "1250.50");
});

test("keeps provider-specific sub-tags and tokens verbatim", () => {
  const before = parse(STATIC);
  const after = parse(buildAmountQr({ payload: STATIC, amount: 500, reference: REFERENCE }).payload);
  for (const tag of ["26", "52", "53", "58", "59", "60", "80", "81"]) {
    assert.equal(
      after.find((field) => field.tag === tag)?.value,
      before.find((field) => field.tag === tag)?.value,
      `tag ${tag} changed`,
    );
  }
});

test("matches the pinned bKash fixture byte for byte", () => {
  const result = buildAmountQr({ payload: STATIC, amount: 500, reference: REFERENCE });
  assert.equal(result.payload, DYNAMIC_500);
  assert.equal(result.reference, REFERENCE);
  assert.equal(result.qr_svg.startsWith("<svg"), true);
  assert.equal(result.qr_svg.includes("<script"), false);
});

test("keeps an existing reference when none is supplied", () => {
  const result = buildAmountQr({ payload: DYNAMIC_500, amount: 777 });
  assert.equal(result.reference, REFERENCE);
  assert.equal(referenceFrom(result.payload), REFERENCE);
  assert.equal(result.amountText, "777.00");
});

test("accepts numeric-string amounts without rounding them silently", () => {
  const result = buildAmountQr({ payload: GENERIC_STATIC, amount: "500" });
  assert.equal(result.amount, 500);
  assert.equal(result.amountText, "500.00");
  assert.equal(coerceAmount("12.34"), 12.34);
  assert.equal(coerceAmount(0.1 + 0.2), 0.3);
});

test("rejects amounts that are not exact BDT values", () => {
  for (const bad of [0, -1, "0", "abc", null, undefined, 100000000, "1.005", 1.005, Number.NaN]) {
    assert.throws(
      () => buildAmountQr({ payload: GENERIC_STATIC, amount: bad }),
      isCode("BAD_AMOUNT"),
      `accepted amount ${String(bad)}`,
    );
  }
});

test("rejects malformed payloads with stable codes", () => {
  assert.throws(() => buildAmountQr({ payload: "", amount: 500 }), isCode("EMPTY_PAYLOAD"));
  assert.throws(() => buildAmountQr({ payload: 42, amount: 500 }), isCode("EMPTY_PAYLOAD"));
  assert.throws(
    () => buildAmountQr({ payload: GENERIC_STATIC.slice(0, -4) + "0000", amount: 500 }),
    isCode("CHECKSUM_MISMATCH"),
  );
  assert.throws(
    () => buildAmountQr({ payload: GENERIC_STATIC.slice(0, -12), amount: 500 }),
    isCode("BAD_TLV"),
  );
  assert.throws(() => buildAmountQr({ payload: "000201010211", amount: 500 }), isCode("MISSING_FIELD"));
  assert.throws(() => buildAmountQr({ payload: "x".repeat(5000), amount: 500 }), isCode("UNSUPPORTED"));
});

test("rejects invalid explicit references", () => {
  for (const bad of ["", "x".repeat(33), "bad\nreference", 42]) {
    assert.throws(
      () => buildAmountQr({ payload: GENERIC_STATIC, amount: 500, reference: bad }),
      isCode("BAD_REFERENCE"),
      `accepted reference ${String(bad)}`,
    );
  }
});

test("QR output is deterministic and self-contained", () => {
  const a = buildAmountQr({ payload: GENERIC_STATIC, amount: 1250.5 }).qr_svg;
  const b = buildAmountQr({ payload: GENERIC_STATIC, amount: 1250.5 }).qr_svg;
  assert.equal(a, b);
  assert.match(a, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.equal(a.includes("<script"), false);
});

test("checksum of the input is the only payload integrity requirement", () => {
  // A valid-CRC payload that `decode` would consider incomplete is still derived:
  // no merchant name, no account template — just generic TLV + CRC.
  const body = "000201" + "0102" + "11" + "5204" + "5411" + "5303" + "050" + "5802" + "BD";
  const payload = body + "6304" + crc16(body + "6304");
  const result = buildAmountQr({ payload, amount: 10 });
  assert.equal(verifyChecksum(result.payload), true);
  assert.equal(parse(result.payload).find((field) => field.tag === "54")?.value, "10.00");
});

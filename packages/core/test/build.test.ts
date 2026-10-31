import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_AMOUNT } from "../src/amount.ts";
import { build, toStatic, withAmount, referenceFrom, seal } from "../src/build.ts";
import { decode } from "../src/decode.ts";
import { DeshiQrError } from "../src/errors.ts";
import { TAGS, encodeFields, findValue, parse, parseSubfields } from "../src/tlv.ts";
import {
  DUMMY_REFERENCE,
  TAG80_VALUE,
  TAG81_VALUE,
  DYNAMIC_PAYLOAD,
  LONG_NAME_PAYLOAD,
  MINIMAL_PAYLOAD,
  STATIC_PAYLOAD,
} from "./fixtures.ts";

const isCode = (code: string) => (error: unknown) =>
  DeshiQrError.is(error) && error.code === code;

test("seal(parse(payload)) is a no-op for valid payloads", () => {
  for (const payload of [STATIC_PAYLOAD, DYNAMIC_PAYLOAD, MINIMAL_PAYLOAD, LONG_NAME_PAYLOAD]) {
    assert.equal(seal(parse(payload)), payload);
  }
});

test("toStatic strips the amount and reference and restores tag 01 = 11", () => {
  assert.equal(toStatic(DYNAMIC_PAYLOAD), STATIC_PAYLOAD);
  assert.equal(toStatic(STATIC_PAYLOAD), STATIC_PAYLOAD);
});

test("toStatic preserves MCC, name, city, tokens and other additional data", () => {
  const fields = parse(toStatic(DYNAMIC_PAYLOAD));
  assert.equal(findValue(fields, TAGS.MCC), "6016");
  assert.equal(findValue(fields, TAGS.TOKEN_80), TAG80_VALUE);
  assert.equal(findValue(fields, TAGS.TOKEN_81), TAG81_VALUE);
  assert.equal(findValue(fields, TAGS.ADDITIONAL), "0602FT");
});

test("withAmount reproduces the dynamic fixture exactly", () => {
  const derived = withAmount(STATIC_PAYLOAD, 500, { reference: DUMMY_REFERENCE });
  assert.equal(derived, DYNAMIC_PAYLOAD);
});

test("withAmount inserts the amount in ascending tag order", () => {
  const derived = withAmount(MINIMAL_PAYLOAD, 100);
  const tags = parse(derived).map((field) => field.tag);
  assert.ok(tags.indexOf("54") > tags.indexOf("53"));
  assert.ok(tags.indexOf("54") < tags.indexOf("58"));
  const qr = decode(derived);
  assert.equal(qr.kind, "dynamic");
  assert.equal(qr.amount, 100);
  assert.equal(qr.reference, null);
});

test("withAmount keeps tokens and the customer label when no reference is requested", () => {
  const qr = decode(withAmount(STATIC_PAYLOAD, 500));
  assert.deepEqual(qr.tokens, { tag80: TAG80_VALUE, tag81: TAG81_VALUE });
  assert.equal(qr.customerLabel, "FT");
  assert.equal(qr.reference, null);
  assert.equal(qr.kind, "dynamic");
});

test("withAmount can drop the reference explicitly", () => {
  const qr = decode(withAmount(DYNAMIC_PAYLOAD, 900, { reference: null }));
  assert.equal(qr.amount, 900);
  assert.equal(qr.reference, null);
});

test("withAmount generates a new reference from the existing prefix and length", () => {
  const qr = decode(withAmount(DYNAMIC_PAYLOAD, 250));
  assert.equal(qr.reference?.length, 25);
  assert.ok(qr.reference?.startsWith("DEMOQR0VZe")); // first 10 chars of the source reference
});

test("withAmount generates a reference with an explicit prefix and length", () => {
  const derived = withAmount(STATIC_PAYLOAD, 250, { referencePrefix: "ORD", referenceLength: 12 });
  const reference = referenceFrom(derived);
  assert.equal(reference?.length, 12);
  assert.ok(reference?.startsWith("ORD"));
  assert.match(reference ?? "", /^ORD[A-Za-z0-9]{9}$/);
});

test("withAmount can keep the existing reference", () => {
  const derived = withAmount(DYNAMIC_PAYLOAD, 777, { keepExistingReference: true });
  assert.equal(referenceFrom(derived), DUMMY_REFERENCE);
  assert.equal(decode(derived).amount, 777);
});

test("withAmount replaces an existing amount instead of duplicating it", () => {
  const derived = withAmount(DYNAMIC_PAYLOAD, 1500);
  const amounts = parse(derived).filter((field) => field.tag === TAGS.AMOUNT);
  assert.equal(amounts.length, 1);
  assert.equal(amounts[0]?.value, "1500.00");
});

test("withAmount preserves the rest of tag 62 when adding a reference", () => {
  const derived = withAmount(STATIC_PAYLOAD, 500, { reference: "REF123" });
  const additional = parseSubfields(findValue(parse(derived), TAGS.ADDITIONAL) ?? "");
  assert.deepEqual(additional, [
    { tag: "01", value: "REF123" },
    { tag: "06", value: "FT" },
  ]);
});

test("withAmount rejects invalid amounts", () => {
  for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, MAX_AMOUNT + 1]) {
    assert.throws(() => withAmount(STATIC_PAYLOAD, amount), isCode("BAD_AMOUNT"), String(amount));
  }
});

test("withAmount rejects invalid references", () => {
  assert.throws(() => withAmount(STATIC_PAYLOAD, 100, { reference: "" }), isCode("BAD_REFERENCE"));
  assert.throws(
    () => withAmount(STATIC_PAYLOAD, 100, { reference: "x".repeat(33) }),
    isCode("BAD_REFERENCE"),
  );
});

test("build() picks static or dynamic based on the amount", () => {
  assert.equal(build(STATIC_PAYLOAD), STATIC_PAYLOAD);
  assert.equal(build(DYNAMIC_PAYLOAD, { amount: null }), STATIC_PAYLOAD);
  assert.equal(decode(build(STATIC_PAYLOAD, { amount: 42 })).amount, 42);
});

test("derived payloads fail cleanly on malformed input", () => {
  assert.throws(() => toStatic("nonsense"), isCode("BAD_TLV"));
  assert.throws(() => withAmount("nonsense", 10), isCode("BAD_TLV"));
});

test("withAmount keeps field encoding consistent (no duplicate checksum)", () => {
  const derived = withAmount(STATIC_PAYLOAD, 100);
  assert.equal(derived.match(/6304/g)?.length, 1);
  assert.equal(parse(derived).filter((field) => field.tag === TAGS.CRC).length, 1);
  assert.equal(encodeFields(parse(derived)), derived);
});

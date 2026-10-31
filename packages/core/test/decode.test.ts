import assert from "node:assert/strict";
import { test } from "node:test";
import { DeshiQrError } from "../src/errors.ts";
import {
  KNOWN_INSTITUTIONS,
  decode,
  decodeSafe,
  institutionOf,
} from "../src/decode.ts";
import { verifyChecksum } from "../src/index.ts";
import { encodeFields } from "../src/tlv.ts";
import {
  DUMMY_REFERENCE,
  TAG80_VALUE,
  TAG81_VALUE,
  DYNAMIC_PAYLOAD,
  LONG_NAME_PAYLOAD,
  MINIMAL_PAYLOAD,
  STATIC_PAYLOAD,
  rebuild,
  removeField,
  setField,
} from "./fixtures.ts";

test("decodes the static fixture", () => {
  const qr = decode(STATIC_PAYLOAD);
  assert.equal(qr.kind, "static");
  assert.equal(qr.amount, null);
  assert.equal(qr.amountText, null);
  assert.equal(qr.currency, "BDT");
  assert.equal(qr.country, "BD");
  assert.deepEqual(qr.merchant, {
    name: "DEMO STORE",
    city: "Dhaka",
    account: "01000000000",
    institution: "bd.org.bb.npsb",
    mcc: "6016",
  });
  assert.equal(qr.reference, null);
  assert.equal(qr.customerLabel, "FT");
  assert.deepEqual(qr.tokens, { tag80: TAG80_VALUE, tag81: TAG81_VALUE });
  assert.equal(qr.checksum, "295D");
  assert.equal(qr.accountTemplate.length, 4);
});

test("decodes the dynamic fixture", () => {
  const qr = decode(DYNAMIC_PAYLOAD);
  assert.equal(qr.kind, "dynamic");
  assert.equal(qr.amount, 500);
  assert.equal(qr.amountText, "500.00");
  assert.equal(qr.reference, DUMMY_REFERENCE);
  assert.equal(qr.reference?.length, 25);
  assert.equal(qr.customerLabel, "FT");
  assert.equal(qr.fields.length, 13);
});

test("decodes a minimal payload without MCC, tokens or additional data", () => {
  const qr = decode(MINIMAL_PAYLOAD);
  assert.equal(qr.merchant.mcc, null);
  assert.equal(qr.merchant.city, "Dhaka");
  assert.deepEqual(qr.tokens, { tag80: null, tag81: null });
  assert.deepEqual(qr.additionalData, []);
  assert.equal(qr.reference, null);
});

test("decodes the long-name fixture", () => {
  const qr = decode(LONG_NAME_PAYLOAD);
  assert.equal(qr.merchant.name, "DEMO SUPER SHOP LTD");
  assert.equal(qr.merchant.city, "Chattogram");
  assert.equal(qr.merchant.mcc, "5411");
});

test("NPSB is the only verified institution today", () => {
  const qr = decode(STATIC_PAYLOAD);
  assert.deepEqual(institutionOf(qr), KNOWN_INSTITUTIONS["bd.org.bb.npsb"]);
  assert.equal(institutionOf(qr)?.verified, true);
});

test("an unknown institution decodes generically and is reported as unknown", () => {
  const unknown = rebuild(STATIC_PAYLOAD, (fields) => {
    setField(
      fields,
      "26",
      encodeFields([
        { tag: "00", value: "example.org.bank" },
        { tag: "01", value: "02" },
        { tag: "02", value: "2002" },
        { tag: "03", value: "01000000000" },
      ]),
    );
  });
  const qr = decode(unknown);
  assert.equal(qr.merchant.institution, "example.org.bank");
  assert.equal(institutionOf(qr), null);
  assert.equal(verifyChecksum(unknown), true);
});

test("unknown currency falls back to the raw numeric code", () => {
  const qr = decode(rebuild(STATIC_PAYLOAD, (fields) => setField(fields, "53", "999")));
  assert.equal(qr.currency, "999");
});

test("decode throws CHECKSUM_MISMATCH on a corrupted checksum", () => {
  const corrupted = STATIC_PAYLOAD.slice(0, -4) + "0000";
  assert.throws(
    () => decode(corrupted),
    (error: unknown) => DeshiQrError.is(error) && error.code === "CHECKSUM_MISMATCH",
  );
});

test("decode throws MISSING_FIELD when the checksum tag is absent", () => {
  const withoutChecksum = STATIC_PAYLOAD.slice(0, -8);
  assert.throws(
    () => decode(withoutChecksum),
    (error: unknown) => DeshiQrError.is(error) && error.code === "MISSING_FIELD",
  );
});

test("decode throws NOT_A_BANGLA_QR without the account template or name", () => {
  const noAccount = rebuild(STATIC_PAYLOAD, (fields) => removeField(fields, "26"));
  assert.throws(
    () => decode(noAccount),
    (error: unknown) => DeshiQrError.is(error) && error.code === "NOT_A_BANGLA_QR",
  );

  const noName = rebuild(STATIC_PAYLOAD, (fields) => removeField(fields, "59"));
  assert.throws(
    () => decode(noName),
    (error: unknown) => DeshiQrError.is(error) && error.code === "NOT_A_BANGLA_QR",
  );
});

test("decode throws UNSUPPORTED for an unknown point of initiation", () => {
  const unknownPoi = rebuild(STATIC_PAYLOAD, (fields) => setField(fields, "01", "99"));
  assert.throws(
    () => decode(unknownPoi),
    (error: unknown) => DeshiQrError.is(error) && error.code === "UNSUPPORTED",
  );
});

test("decode throws BAD_AMOUNT for a malformed amount field", () => {
  const badAmount = rebuild(DYNAMIC_PAYLOAD, (fields) => setField(fields, "54", "5,00"));
  assert.throws(
    () => decode(badAmount),
    (error: unknown) => DeshiQrError.is(error) && error.code === "BAD_AMOUNT",
  );
});

test("decodeSafe returns a discriminated result instead of throwing", () => {
  const ok = decodeSafe(STATIC_PAYLOAD);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.qr.merchant.name, "DEMO STORE");

  const bad = decodeSafe("not a qr");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(DeshiQrError.is(bad.error));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { validate, isBanglaQr } from "../src/validate.ts";
import { type Field, encodeFields } from "../src/tlv.ts";
import {
  DYNAMIC_PAYLOAD,
  LONG_NAME_PAYLOAD,
  MINIMAL_PAYLOAD,
  STATIC_PAYLOAD,
  rebuild,
  removeField,
  setField,
} from "./fixtures.ts";

test("every valid fixture validates cleanly", () => {
  for (const payload of [STATIC_PAYLOAD, DYNAMIC_PAYLOAD, MINIMAL_PAYLOAD, LONG_NAME_PAYLOAD]) {
    const report = validate(payload);
    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
    assert.notEqual(report.qr, null);
  }
  assert.equal(isBanglaQr(STATIC_PAYLOAD), true);
});

test("corrupted checksum is an error and blocks the decode", () => {
  const report = validate(STATIC_PAYLOAD.slice(0, -4) + "0000");
  assert.equal(report.ok, false);
  assert.equal(report.qr, null);
  assert.equal(report.errors[0]?.code, "CHECKSUM_MISMATCH");
  assert.equal(isBanglaQr(STATIC_PAYLOAD.slice(0, -4) + "0000"), false);
});

test("a payload without a checksum field is an error", () => {
  const report = validate(STATIC_PAYLOAD.slice(0, -8));
  assert.equal(report.ok, false);
  assert.equal(report.qr, null);
  assert.ok(report.errors.some((issue) => issue.code === "MISSING_FIELD"));
});

test("truncated and empty payloads are reported, not thrown", () => {
  const truncated = validate(STATIC_PAYLOAD.slice(0, -12));
  assert.equal(truncated.ok, false);
  assert.equal(truncated.qr, null);
  assert.ok(truncated.errors.some((issue) => issue.code === "BAD_TLV"));

  for (const input of ["", "   "]) {
    const empty = validate(input);
    assert.equal(empty.ok, false);
    assert.equal(empty.errors[0]?.code, "EMPTY_PAYLOAD");
  }
});

test("an unrecognised institution is a warning, not an error", () => {
  const payload = rebuild(STATIC_PAYLOAD, (fields) => {
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
  const report = validate(payload);
  assert.equal(report.ok, true);
  assert.notEqual(report.qr, null);
  assert.ok(report.warnings.some((issue) => issue.code === "UNSUPPORTED"));
});

test("a static QR carrying an amount is a warning", () => {
  const report = validate(rebuild(DYNAMIC_PAYLOAD, (fields) => setField(fields, "01", "11")));
  assert.equal(report.ok, true);
  assert.ok(report.warnings.some((issue) => issue.code === "BAD_TLV"));
});

test("a dynamic QR without an amount is a warning", () => {
  const report = validate(rebuild(STATIC_PAYLOAD, (fields) => setField(fields, "01", "12")));
  assert.equal(report.ok, true);
  assert.ok(report.warnings.some((issue) => issue.code === "BAD_TLV" && issue.tag === "54"));
});

test("a non-printable reference is an error", () => {
  const report = validate(
    rebuild(STATIC_PAYLOAD, (fields) => setField(fields, "62", "0107bad\x01ref")),
  );
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.code === "BAD_REFERENCE"));
});

test("non-BDT currency and non-BD country are warnings", () => {
  const report = validate(
    rebuild(STATIC_PAYLOAD, (fields) => {
      setField(fields, "53", "840");
      setField(fields, "58", "US");
    }),
  );
  assert.equal(report.ok, true);
  const warnings = report.warnings.filter((issue) => issue.code === "UNSUPPORTED");
  assert.equal(warnings.length, 2);
});

test("an over-long merchant name is a warning", () => {
  const report = validate(
    rebuild(STATIC_PAYLOAD, (fields) => setField(fields, "59", "DEMO STORE WITH A VERY LONG NAME")),
  );
  assert.equal(report.ok, true);
  assert.ok(report.warnings.some((issue) => issue.code === "BAD_TLV" && issue.tag === "59"));
});

test("missing required fields are errors", () => {
  const noAccount = validate(rebuild(STATIC_PAYLOAD, (fields) => removeField(fields, "26")));
  assert.equal(noAccount.ok, false);
  assert.ok(noAccount.errors.some((issue) => issue.code === "NOT_A_BANGLA_QR"));

  const noName = validate(rebuild(STATIC_PAYLOAD, (fields) => removeField(fields, "59")));
  assert.equal(noName.ok, false);
  assert.ok(noName.errors.some((issue) => issue.code === "NOT_A_BANGLA_QR"));
});

test("an unknown point of initiation is an error", () => {
  const report = validate(rebuild(STATIC_PAYLOAD, (fields) => setField(fields, "01", "99")));
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.code === "UNSUPPORTED"));
});

test("an empty additional-data template is a warning", () => {
  const report = validate(rebuild(STATIC_PAYLOAD, (fields) => setField(fields, "62", "")));
  assert.equal(report.ok, true);
  assert.ok(report.warnings.some((issue) => issue.code === "BAD_TLV" && issue.tag === "62"));
});

test("duplicate tags are a warning", () => {
  const payload = rebuild(STATIC_PAYLOAD, (fields) => {
    const duplicate: Field = { tag: "59", value: "OTHER STORE" };
    fields.splice(1, 0, duplicate);
  });
  const report = validate(payload);
  assert.equal(report.ok, true);
  assert.ok(report.warnings.some((issue) => issue.message.includes("more than once")));
});

test("absurdly large input is rejected early", () => {
  const report = validate("0".repeat(5000));
  assert.equal(report.ok, false);
  assert.equal(report.errors[0]?.code, "UNSUPPORTED");
});

test("undefined-like input does not throw", () => {
  const report = validate(undefined as unknown as string);
  assert.equal(report.ok, false);
  assert.equal(report.errors[0]?.code, "EMPTY_PAYLOAD");
});

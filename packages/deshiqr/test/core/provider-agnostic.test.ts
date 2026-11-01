/**
 * Provider-agnostic amount derivation.
 *
 * The core promise of the amount→QR API: given any valid Bangla QR payload,
 * adding an amount edits only tag 01 (11 → 12) and tag 54, preserving every
 * provider-specific field byte for byte. These tests use a synthetic layout that
 * is deliberately *not* the bKash/NPSB shape: a made-up institution AID, no NPSB
 * token templates, no tag 62, a different MCC.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { withAmount } from "../../src/core/build.ts";
import { crc16 } from "../../src/core/crc.ts";
import { encodeFields, parse } from "../../src/core/tlv.ts";
import { validate } from "../../src/core/validate.ts";

/** Synthetic "other provider" layout — not a real provider. */
const GENERIC_STATIC =
  "00020101021126410022example.org.generic-qr0311017000000005204541153030505802BD5912GENERIC SHOP6006Sylhet6304818D";
const GENERIC_DYNAMIC_1250_50 =
  "00020101021226410022example.org.generic-qr03110170000000052045411530305054071250.505802BD5912GENERIC SHOP6006Sylhet630480A2";

test("adds only tag 01 and 54 to a non-bKash layout", () => {
  const derived = withAmount(GENERIC_STATIC, 1250.5, { keepExistingReference: true });
  assert.equal(derived, GENERIC_DYNAMIC_1250_50);

  const before = parse(GENERIC_STATIC).filter((field) => field.tag !== "63");
  const after = parse(derived).filter((field) => field.tag !== "63");

  assert.deepEqual(
    after.filter((field) => field.tag !== "01" && field.tag !== "54"),
    before.filter((field) => field.tag !== "01"),
    "a field other than 01/54 changed",
  );
  assert.equal(after.find((field) => field.tag === "01")?.value, "12");
  assert.equal(after.find((field) => field.tag === "54")?.value, "1250.50");
});

test("preserves unknown institution AIDs and provider sub-tags verbatim", () => {
  const providerTags = ["26", "52", "53", "58", "59", "60"];
  const before = parse(GENERIC_STATIC);
  const after = parse(withAmount(GENERIC_STATIC, 1, { keepExistingReference: true }));
  for (const tag of providerTags) {
    assert.equal(
      after.find((field) => field.tag === tag)?.value,
      before.find((field) => field.tag === tag)?.value,
      `tag ${tag} changed`,
    );
  }
  // Tag 26 keeps the made-up AID and account exactly.
  assert.match(after.find((field) => field.tag === "26")?.value ?? "", /example\.org\.generic-qr/);
});

test("works for payloads without tag 52 (MCC), tag 60 (city) or tag 62", () => {
  const tlv = (tag: string, value: string) =>
    tag + String(value.length).padStart(2, "0") + value;
  const body = encodeFields([
    { tag: "00", value: "01" },
    { tag: "01", value: "11" },
    { tag: "26", value: tlv("00", "bd.org.bb.npsb") + tlv("03", "01700000000") },
    { tag: "53", value: "050" },
    { tag: "58", value: "BD" },
    { tag: "59", value: "MINIMAL" },
  ]);
  const payload = body + "6304" + crc16(body + "6304");

  const derived = withAmount(payload, 42, { keepExistingReference: true });
  const after = parse(derived);
  assert.equal(after.find((field) => field.tag === "01")?.value, "12");
  assert.equal(after.find((field) => field.tag === "54")?.value, "42.00");
  assert.equal(after.some((field) => field.tag === "52"), false);
  assert.equal(after.some((field) => field.tag === "60"), false);
  assert.equal(after.some((field) => field.tag === "62"), false);
});

test("validate() reading the merchant is a separate concern (warnings, not errors)", () => {
  // Unknown provider AID is a warning for the *decoder*; derivation above ignores it.
  const report = validate(GENERIC_STATIC);
  assert.equal(report.ok, true);
  assert.equal(
    report.warnings.some((issue) => issue.code === "UNSUPPORTED" && issue.tag === "26"),
    true,
  );
});

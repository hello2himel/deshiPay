import assert from "node:assert/strict";
import { test } from "node:test";
import { DeshiQrError } from "../../src/core/errors.ts";
import {
  MAX_FIELD_LENGTH,
  encodeField,
  encodeFields,
  findValue,
  insertFieldSorted,
  parse,
  parseSubfields,
} from "../../src/core/tlv.ts";
import {
  DYNAMIC_PAYLOAD,
  LONG_NAME_PAYLOAD,
  MINIMAL_PAYLOAD,
  OVERLONG_FIELD,
  STATIC_PAYLOAD,
  TRUNCATED_PAYLOAD,
} from "./fixtures.ts";

test("parse splits the static fixture into top-level fields", () => {
  const fields = parse(STATIC_PAYLOAD);
  assert.deepEqual(
    fields.map((field) => field.tag),
    ["00", "01", "26", "52", "53", "58", "59", "60", "62", "80", "81", "63"],
  );
  assert.equal(findValue(fields, "59"), "DEMO STORE");
  assert.equal(findValue(fields, "60"), "Dhaka");
  assert.equal(findValue(fields, "53"), "050");
  assert.equal(findValue(fields, "63"), "295D");
});

test("encodeFields(parse(x)) round-trips every fixture exactly", () => {
  for (const payload of [STATIC_PAYLOAD, DYNAMIC_PAYLOAD, MINIMAL_PAYLOAD, LONG_NAME_PAYLOAD]) {
    assert.equal(encodeFields(parse(payload)), payload);
  }
});

test("nested templates parse into their subtrees", () => {
  const fields = parse(STATIC_PAYLOAD);
  const account = parseSubfields(findValue(fields, "26") ?? "");
  assert.deepEqual(
    account.map((field) => field.tag),
    ["00", "01", "02", "03"],
  );
  assert.equal(findValue(account, "00"), "bd.org.bb.npsb");
  assert.equal(findValue(account, "03"), "01000000000");

  const additional = parseSubfields(findValue(fields, "62") ?? "");
  assert.deepEqual(additional, [{ tag: "06", value: "FT" }]);

  const token = parseSubfields(findValue(fields, "80") ?? "");
  assert.equal(findValue(token, "00"), "bd.org.bb.npsb");
  assert.equal((findValue(token, "01") ?? "").length, 44);
});

test("parse trims surrounding whitespace", () => {
  assert.equal(parse(`  ${STATIC_PAYLOAD}  `).length, 12);
});

test("empty input throws EMPTY_PAYLOAD", () => {
  for (const input of ["", "   ", "\n\t"]) {
    assert.throws(
      () => parse(input),
      (error: unknown) => DeshiQrError.is(error) && error.code === "EMPTY_PAYLOAD",
    );
  }
});

test("malformed TLV throws BAD_TLV with a helpful message", () => {
  const cases: Array<[string, string]> = [
    ["00", "truncated header"],
    ["0002", "missing value"],
    ["0005AB", "declares more bytes than present"],
    ["XX0201", "non-numeric tag"],
    ["0002A", "one character value"],
    [OVERLONG_FIELD, "overlong field"],
  ];
  for (const [payload, label] of cases) {
    assert.throws(
      () => parse(payload),
      (error: unknown) => DeshiQrError.is(error) && error.code === "BAD_TLV",
      label,
    );
  }
});

test("truncated real payload throws BAD_TLV", () => {
  assert.throws(
    () => parse(TRUNCATED_PAYLOAD),
    (error: unknown) => DeshiQrError.is(error) && error.code === "BAD_TLV",
  );
});

test("encodeField enforces the two-digit tag and 99-character value limit", () => {
  assert.equal(encodeField({ tag: "59", value: "DEMO" }), "5904DEMO");
  assert.equal(encodeField({ tag: "62", value: "" }), "6200");
  assert.throws(
    () => encodeField({ tag: "5", value: "x" }),
    (error: unknown) => DeshiQrError.is(error) && error.code === "BAD_TLV",
  );
  assert.throws(
    () => encodeField({ tag: "59", value: "x".repeat(MAX_FIELD_LENGTH + 1) }),
    (error: unknown) => DeshiQrError.is(error) && error.code === "BAD_TLV",
  );
});

test("insertFieldSorted keeps ascending numeric tag order", () => {
  const fields = parse(MINIMAL_PAYLOAD).filter((field) => field.tag !== "63");
  insertFieldSorted(fields, { tag: "54", value: "500.00" });
  const tags = fields.map((field) => field.tag);
  assert.ok(tags.indexOf("54") > tags.indexOf("53"));
  assert.ok(tags.indexOf("54") < tags.indexOf("58"));

  insertFieldSorted(fields, { tag: "62", value: "0602FT" });
  const withAdditional = fields.map((field) => field.tag);
  assert.ok(withAdditional.indexOf("62") > withAdditional.indexOf("60"));
});

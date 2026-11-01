import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_AMOUNT,
  amountToField,
  formatTaka,
  maskAccount,
  parseAmountField,
} from "../../src/core/amount.ts";
import { DeshiQrError } from "../../src/core/errors.ts";

const isCode = (code: string) => (error: unknown) =>
  DeshiQrError.is(error) && error.code === code;

test("amountToField always renders two decimals", () => {
  assert.equal(amountToField(1), "1.00");
  assert.equal(amountToField(500), "500.00");
  assert.equal(amountToField(0.01), "0.01");
  assert.equal(amountToField(1234.5), "1234.50");
  assert.equal(amountToField(MAX_AMOUNT), "99999999.99");
});

test("amountToField rounds to two decimals", () => {
  assert.equal(amountToField(10.994), "10.99");
  assert.equal(amountToField(10.996), "11.00");
});

test("amountToField rejects invalid amounts", () => {
  for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => amountToField(amount), isCode("BAD_AMOUNT"), String(amount));
  }
  assert.throws(() => amountToField(MAX_AMOUNT + 1), isCode("BAD_AMOUNT"));
});

test("parseAmountField accepts valid EMV amounts", () => {
  assert.equal(parseAmountField("500.00"), 500);
  assert.equal(parseAmountField("0.01"), 0.01);
  assert.equal(parseAmountField("99999999.99"), MAX_AMOUNT);
});

test("parseAmountField rejects malformed or out-of-range amounts", () => {
  for (const text of ["", "5,00", "-1", "1.234", "abc", "0", "0.00", "100000000.00"]) {
    assert.throws(() => parseAmountField(text), isCode("BAD_AMOUNT"), text);
  }
});

test("formatTaka formats BDT amounts", () => {
  assert.equal(formatTaka(500), "৳500");
  assert.equal(formatTaka(500.5), "৳500.50");
  assert.equal(formatTaka(1234567.891), "৳1,234,567.89");
  assert.equal(formatTaka(1000, { symbol: false }), "1,000");
  assert.equal(formatTaka(500, { decimals: 2 }), "৳500.00");
});

test("maskAccount hides the middle of an account", () => {
  assert.equal(maskAccount("01000000000"), "01000•••000");
  assert.equal(maskAccount("1234"), "••••");
  assert.equal(maskAccount("123456"), "12••56");
  assert.equal(maskAccount(""), "");
});

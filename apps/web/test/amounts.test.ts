import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_AMOUNT,
  cleanAmountText,
  formatPresets,
  normalizeAmount,
  parseAmountText,
  parsePresets,
  taka,
  validateLockedAmount,
} from "../src/lib/amounts.ts";

test("cleanAmountText strips currency and separators", () => {
  assert.equal(cleanAmountText(" ৳1,250.50 "), "1250.50");
  assert.equal(cleanAmountText("Tk 500"), "500");
  assert.equal(cleanAmountText("BDT 500"), "500");
});

test("parseAmountText accepts real input", () => {
  assert.equal(parseAmountText("500"), 500);
  assert.equal(parseAmountText("৳1,250.50"), 1250.5);
  assert.equal(parseAmountText(" 99 "), 99);
  assert.equal(parseAmountText(""), null);
  assert.equal(parseAmountText(null), null);
  assert.equal(parseAmountText("abc"), null);
  assert.equal(parseAmountText("0"), null);
  assert.equal(parseAmountText("-5"), null);
  assert.equal(parseAmountText("1.234"), null);
  assert.equal(parseAmountText("100000000"), null); // > MAX_AMOUNT (99,999,999.99)
});

test("normalizeAmount rounds to paisa and clamps", () => {
  assert.equal(normalizeAmount(10.126), 10.13);
  assert.equal(normalizeAmount(MAX_AMOUNT), MAX_AMOUNT);
  assert.equal(normalizeAmount(MAX_AMOUNT + 1), null);
  assert.equal(normalizeAmount(0), null);
  assert.equal(normalizeAmount(Number.NaN), null);
  assert.equal(normalizeAmount("250"), 250);
});

test("parsePresets validates, de-duplicates and caps at 6", () => {
  assert.deepEqual(parsePresets("100, 500, 1000"), [100, 500, 1000]);
  assert.deepEqual(parsePresets("100 100 0 -5 abc 99.5"), [100, 99.5]);
  assert.deepEqual(parsePresets("1,2,3,4,5,6,7,8"), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parsePresets("1,2,3", { max: 2 }), [1, 2]);
  assert.deepEqual(parsePresets(null), []);
  assert.deepEqual(parsePresets(""), []);
  assert.equal(formatPresets([100, 500.5]), "100,500.5");
});

test("taka formats amounts and handles missing values", () => {
  assert.match(taka(1250.5), /1,250\.50/);
  assert.match(taka(500), /500/);
  assert.match(taka(1250.5, { symbol: false }), /1,250\.50/);
  assert.equal(taka(null), "—");
  assert.equal(taka(undefined), "—");
});

test("validateLockedAmount guides the wizard", () => {
  assert.equal(validateLockedAmount(null), null);
  assert.match(validateLockedAmount(null, { required: true }) ?? "", /greater than zero/);
  assert.equal(validateLockedAmount(500), null);
  assert.match(validateLockedAmount(100_000_000) ?? "", /99,999,999/);
  assert.equal(validateLockedAmount(0), null); // 0 is treated as "no amount"
});

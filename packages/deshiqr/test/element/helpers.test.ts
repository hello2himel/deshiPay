import { test } from "node:test";
import assert from "node:assert/strict";

import {
  amountSummary,
  buildPayPayload,
  cleanAmountText,
  cleanRefPrefix,
  formatPresets,
  isValidReference,
  normalizeAmount,
  parseAmountText,
  parseBooleanAttribute,
  parseConfig,
  parsePayAttributes,
  parsePresets,
  parseRefLength,
  parseSize,
  parseTheme,
  pngFilename,
  resolveSettings,
  shouldRegenerateReference,
  type PayAttributes,
} from "../../src/element/helpers.ts";

/* Synthetic fixtures only (docs/demo-payloads.md). */
const STATIC_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D";
const DYNAMIC_PAYLOAD =
  "00020101021226470014bd.org.bb.npsb010202020420020311010000000005204601653030505406500.005802BD5910DEMO STORE6005Dhaka62350125DEMOQR0VZeK2MfbVRI6w36osd0602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304F835";
const REFERENCE = "DEMOQR0VZeK2MfbVRI6w36osd";
const ACCOUNT = "01000000000";

function fakeGetter(values: Record<string, string | null>): (name: string) => string | null {
  return (name) => (name in values ? (values[name] ?? null) : null);
}

test("cleanAmountText strips symbols and separators", () => {
  assert.equal(cleanAmountText(" ৳1,250.50 "), "1250.50");
  assert.equal(cleanAmountText("Tk 500"), "500");
  assert.equal(cleanAmountText("BDT500"), "500");
});

test("parseAmountText accepts human input and rejects junk", () => {
  assert.equal(parseAmountText("500"), 500);
  assert.equal(parseAmountText("৳1,250.50"), 1250.5);
  assert.equal(parseAmountText(" 100 "), 100);
  assert.equal(parseAmountText(""), null);
  assert.equal(parseAmountText(null), null);
  assert.equal(parseAmountText("abc"), null);
  assert.equal(parseAmountText("0"), null);
  assert.equal(parseAmountText("0.00"), null);
  assert.equal(parseAmountText("-10"), null);
  assert.equal(parseAmountText("1.234"), null);
  assert.equal(parseAmountText("999999999.99"), null);
});

test("normalizeAmount rounds to paisa and enforces limits", () => {
  assert.equal(normalizeAmount(10.126), 10.13);
  assert.equal(normalizeAmount(12.346), 12.35);
  assert.equal(normalizeAmount(99_999_999.99), 99_999_999.99);
  assert.equal(normalizeAmount(100_000_000), null);
  assert.equal(normalizeAmount(-1), null);
  assert.equal(normalizeAmount(0), null);
  assert.equal(normalizeAmount(Number.NaN), null);
  assert.equal(normalizeAmount("250"), 250);
  assert.equal(normalizeAmount("nope"), null);
});

test("parsePresets de-duplicates, validates and caps", () => {
  assert.deepEqual(parsePresets("100,500,1000"), [100, 500, 1000]);
  assert.deepEqual(parsePresets(" 100 100 0 -5 abc 100.5 "), [100, 100.5]);
  assert.deepEqual(parsePresets("1,2,3,4,5,6,7,8"), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parsePresets("1,2,3", { max: 2 }), [1, 2]);
  assert.deepEqual(parsePresets("100000000"), []);
  assert.deepEqual(parsePresets(null), []);
  assert.deepEqual(parsePresets(""), []);
  assert.equal(formatPresets([100, 500.5]), "100,500.5");
});

test("boolean, theme, ref-length and size attribute parsing", () => {
  assert.equal(parseBooleanAttribute(""), true);
  assert.equal(parseBooleanAttribute("bare"), true);
  assert.equal(parseBooleanAttribute(null), false);
  assert.equal(parseBooleanAttribute("false"), false);
  assert.equal(parseBooleanAttribute("off"), false);

  assert.equal(parseTheme("dark"), "dark");
  assert.equal(parseTheme("LIGHT"), "light");
  assert.equal(parseTheme("auto"), "auto");
  assert.equal(parseTheme("purple"), "auto");
  assert.equal(parseTheme(null), "auto");

  assert.equal(parseRefLength(null), 0);
  assert.equal(parseRefLength("25"), 25);
  assert.equal(parseRefLength("0"), 0);
  assert.equal(parseRefLength("99"), 32);
  assert.equal(parseRefLength("-4"), 0);
  assert.equal(parseRefLength("abc"), 0);
  assert.equal(parseRefLength("abc", 25), 25);

  assert.equal(parseSize(null), 280);
  assert.equal(parseSize("320"), 320);
  assert.equal(parseSize("10"), 96);
  assert.equal(parseSize("99999"), 1024);
  assert.equal(parseSize("nope"), 280);
});

test("parsePayAttributes maps every documented attribute", () => {
  const attributes = parsePayAttributes(
    fakeGetter({
      payload: `  ${STATIC_PAYLOAD}  `,
      "config-url": "https://example.test/config.json",
      amount: "500",
      "lock-amount": "",
      reference: REFERENCE,
      "ref-prefix": "FT80",
      "ref-length": "25",
      title: "DEMO STORE",
      note: "Pay before 6pm",
      presets: "100,500,1000",
      theme: "dark",
      size: "320",
      bare: "",
    }),
  );
  assert.equal(attributes.payload, STATIC_PAYLOAD);
  assert.equal(attributes.configUrl, "https://example.test/config.json");
  assert.equal(attributes.amount, 500);
  assert.equal(attributes.lockAmount, true);
  assert.equal(attributes.reference, REFERENCE);
  assert.equal(attributes.refPrefix, "FT80");
  assert.equal(attributes.refLength, 25);
  assert.equal(attributes.title, "DEMO STORE");
  assert.equal(attributes.note, "Pay before 6pm");
  assert.deepEqual(attributes.presets, [100, 500, 1000]);
  assert.equal(attributes.presetsSpecified, true);
  assert.equal(attributes.theme, "dark");
  assert.equal(attributes.size, 320);
  assert.equal(attributes.bare, true);
});

test("parsePayAttributes rejects an unusable explicit reference", () => {
  const attributes = parsePayAttributes(fakeGetter({ reference: "bad\nref" }));
  assert.equal(attributes.reference, null);
  assert.equal(isValidReference("ABC123"), true);
  assert.equal(isValidReference(""), false);
  assert.equal(isValidReference("x".repeat(33)), false);
  assert.equal(cleanRefPrefix("FT80!"), "");
  assert.equal(cleanRefPrefix("FT80"), "FT80");
});

test("parseConfig accepts documented and camelCase config", () => {
  const config = parseConfig({
    base_payload: STATIC_PAYLOAD,
    title: "DEMO STORE",
    note: "Note",
    presets: [100, 500],
    ref_prefix: "FT80",
    ref_len: 25,
  });
  assert.equal(config.basePayload, STATIC_PAYLOAD);
  assert.equal(config.title, "DEMO STORE");
  assert.equal(config.note, "Note");
  assert.deepEqual(config.presets, [100, 500]);
  assert.equal(config.refPrefix, "FT80");
  assert.equal(config.refLength, 25);

  const camel = parseConfig({
    basePayload: STATIC_PAYLOAD,
    presets: "10,20",
    refPrefix: "AB",
    refLength: "12",
  });
  assert.deepEqual(camel.presets, [10, 20]);
  assert.equal(camel.refPrefix, "AB");
  assert.equal(camel.refLength, 12);

  assert.throws(() => parseConfig(null), /JSON object/);
  assert.throws(() => parseConfig([1, 2]), /JSON object/);
  assert.throws(() => parseConfig("nope"), /JSON object/);
});

test("resolveSettings lets attributes win over config-url", () => {
  const attributes = parsePayAttributes(
    fakeGetter({
      payload: STATIC_PAYLOAD,
      title: "Attribute title",
      presets: "100",
      "ref-prefix": "ATTR",
      "ref-length": "10",
    }),
  );
  const settings = resolveSettings(attributes, {
    basePayload: "ignored",
    title: "Config title",
    note: "Config note",
    presets: [500, 1000],
    refPrefix: "CONF",
    refLength: 25,
  });
  assert.equal(settings.basePayload, STATIC_PAYLOAD);
  assert.equal(settings.title, "Attribute title");
  assert.equal(settings.note, "Config note");
  assert.deepEqual(settings.presets, [100]);
  assert.equal(settings.refPrefix, "ATTR");
  assert.equal(settings.refLength, 10);

  const fallback = parsePayAttributes(fakeGetter({}));
  const configOnly = resolveSettings(fallback, {
    basePayload: STATIC_PAYLOAD,
    title: "Config title",
    note: null,
    presets: [500],
    refPrefix: "CONF",
    refLength: 25,
  });
  assert.equal(configOnly.basePayload, STATIC_PAYLOAD);
  assert.equal(configOnly.title, "Config title");
  assert.deepEqual(configOnly.presets, [500]);
  assert.equal(configOnly.refPrefix, "CONF");
  assert.equal(configOnly.refLength, 25);

  // An empty presets attribute explicitly disables config presets.
  const emptyPresets = parsePayAttributes(fakeGetter({ presets: "" }));
  const emptyConfig = {
    basePayload: STATIC_PAYLOAD,
    title: null,
    note: null,
    presets: [500, 1000],
    refPrefix: "",
    refLength: 0,
  };
  assert.deepEqual(resolveSettings(emptyPresets, emptyConfig).presets, []);
});

test("buildPayPayload matches the demo fixtures byte for byte", () => {
  const staticResult = buildPayPayload({ base: STATIC_PAYLOAD });
  assert.equal(staticResult.payload, STATIC_PAYLOAD);
  assert.equal(staticResult.kind, "static");
  assert.equal(staticResult.amount, null);
  assert.equal(staticResult.reference, null);

  const dynamicResult = buildPayPayload({
    base: STATIC_PAYLOAD,
    amount: 500,
    reference: REFERENCE,
  });
  assert.equal(dynamicResult.payload, DYNAMIC_PAYLOAD);
  assert.equal(dynamicResult.kind, "dynamic");
  assert.equal(dynamicResult.amount, 500);
  assert.equal(dynamicResult.reference, REFERENCE);
});

test("buildPayPayload generates references of the requested length", () => {
  const generated = buildPayPayload({
    base: STATIC_PAYLOAD,
    amount: 250,
    refPrefix: "FT80",
    refLength: 25,
  });
  assert.equal(generated.kind, "dynamic");
  assert.equal(generated.reference?.length, 25);
  assert.ok(generated.reference?.startsWith("FT80"));
  assert.equal(generated.payload.length > 0, true);
  // A generated reference is stable when passed back in.
  const stable = buildPayPayload({
    base: STATIC_PAYLOAD,
    amount: 250,
    refPrefix: "FT80",
    refLength: 25,
    currentReference: generated.reference,
  });
  assert.equal(stable.reference, generated.reference);
  assert.equal(stable.payload, generated.payload);
});

test("buildPayPayload supports no reference and rejects empty payloads", () => {
  const noReference = buildPayPayload({ base: STATIC_PAYLOAD, amount: 99, refLength: 0 });
  assert.equal(noReference.reference, null);
  assert.equal(noReference.amount, 99);

  assert.throws(() => buildPayPayload({ base: "  " }), /payload is required/);
});

test("generated references must be regenerated when the amount changes", () => {
  assert.equal(
    shouldRegenerateReference({ reference: "REF1", amount: 500 }, 500),
    false,
  );
  assert.equal(
    shouldRegenerateReference({ reference: "REF1", amount: 500 }, 600),
    true,
  );
  assert.equal(shouldRegenerateReference({ reference: null, amount: null }, 500), false);
});

test("pngFilename and amountSummary are presentable", () => {
  assert.equal(pngFilename({ amount: null, reference: null }), "deshiqr-pay.png");
  assert.equal(pngFilename({ amount: 500, reference: null }), "deshiqr-pay-500.png");
  assert.equal(
    pngFilename({ amount: 500, reference: "DEMO/123 456" }),
    "deshiqr-pay-500-DEMO123456.png",
  );
  assert.match(amountSummary(null), /No amount/);
  assert.match(amountSummary(500, (value) => `৳${value}`), /৳500/);
});

test("element exposes its tag helpers without a DOM", () => {
  // The helper module must stay importable in Node (no DOM globals touched).
  const attributes: PayAttributes = parsePayAttributes(fakeGetter({}));
  assert.equal(attributes.payload, null);
  assert.equal(attributes.configUrl, null);
  assert.equal(attributes.size, 280);
});

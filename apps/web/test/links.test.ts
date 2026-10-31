import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decodeInlineLink,
  encodeInlineFragment,
  inlineLinkUrl,
  isInlinePayHash,
} from "../src/lib/links.ts";
import { normalizeBase, stripBase, withBase, absoluteUrl } from "../src/lib/base.ts";

/* Synthetic payload only (docs/demo-payloads.md). */
const PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=6304295D";

test("inline links round-trip payload, title, note and presets", () => {
  const fragment = encodeInlineFragment({
    payload: PAYLOAD,
    title: "DEMO STORE",
    note: "Pay before 6pm",
    presets: [100, 500, 1000],
  });
  assert.ok(fragment.startsWith("#p="));
  const decoded = decodeInlineLink(fragment);
  assert.ok(decoded);
  assert.equal(decoded.payload, PAYLOAD);
  assert.equal(decoded.title, "DEMO STORE");
  assert.equal(decoded.note, "Pay before 6pm");
  assert.deepEqual(decoded.presets, [100, 500, 1000]);
  assert.equal(decoded.amount, null);
  assert.equal(decoded.refLen, 0);
});

test("inline links carry an optional locked amount and reference settings", () => {
  const fragment = encodeInlineFragment({
    payload: PAYLOAD,
    amount: 1250.5,
    refPrefix: "FT80",
    refLen: 25,
  });
  const decoded = decodeInlineLink(fragment);
  assert.ok(decoded);
  assert.equal(decoded.amount, 1250.5);
  assert.equal(decoded.refPrefix, "FT80");
  assert.equal(decoded.refLen, 25);
});

test("raw (unencoded) demo links still decode", () => {
  const decoded = decodeInlineLink(`#p=${PAYLOAD}&t=DEMO STORE&pr=100,500`);
  assert.ok(decoded);
  assert.equal(decoded.payload, PAYLOAD);
  assert.equal(decoded.title, "DEMO STORE");
  assert.deepEqual(decoded.presets, [100, 500]);
});

test("decodeInlineLink rejects everything that is not one of our links", () => {
  assert.equal(decodeInlineLink(""), null);
  assert.equal(decodeInlineLink(null), null);
  assert.equal(decodeInlineLink("#"), null);
  assert.equal(decodeInlineLink("#p="), null);
  assert.equal(decodeInlineLink("#/p/demo"), null);
  assert.equal(decodeInlineLink("#access_token=abc"), null);
  assert.equal(decodeInlineLink("#hello=world"), null);
  assert.equal(decodeInlineLink("?m=demo"), null);
});

test("isInlinePayHash matches only payload fragments", () => {
  assert.equal(isInlinePayHash(`#p=${PAYLOAD}`), true);
  assert.equal(isInlinePayHash("#/p/demo"), false);
});

test("inlineLinkUrl respects the deploy base", () => {
  const url = inlineLinkUrl(
    { payload: PAYLOAD, title: "DEMO STORE" },
    "https://deshiqr.example/deshiQR/",
  );
  assert.ok(url.startsWith("https://deshiqr.example/deshiQR/#p="));
  assert.ok(!url.includes("//#"));
});

test("normalizeBase handles Vite base values", () => {
  assert.equal(normalizeBase("/"), "/");
  assert.equal(normalizeBase("/deshiQR/"), "/deshiQR/");
  assert.equal(normalizeBase("/deshiQR"), "/deshiQR/");
  assert.equal(normalizeBase("deshiQR"), "/deshiQR/");
  assert.equal(normalizeBase(""), "/");
  assert.equal(normalizeBase(undefined), "/");
  assert.equal(normalizeBase(null), "/");
});

test("stripBase and withBase are inverses", () => {
  assert.equal(stripBase("/", "/"), "/");
  assert.equal(stripBase("/p/demo", "/"), "/p/demo");
  assert.equal(stripBase("/deshiQR/", "/deshiQR/"), "/");
  assert.equal(stripBase("/deshiQR/p/demo", "/deshiQR/"), "/p/demo");
  assert.equal(stripBase("/deshiQR", "/deshiQR/"), "/");
  assert.equal(withBase("/p/demo", "/deshiQR/"), "/deshiQR/p/demo");
  assert.equal(withBase("p/demo", "/"), "/p/demo");
  assert.equal(withBase("/new", "/deshiQR/"), "/deshiQR/new");
});

test("absoluteUrl builds shareable URLs", () => {
  assert.equal(absoluteUrl("/p/demo", "/", "https://deshiqr.example"), "https://deshiqr.example/p/demo");
  assert.equal(
    absoluteUrl("/p/demo", "/deshiQR/", "https://deshiqr.example/"),
    "https://deshiqr.example/deshiQR/p/demo",
  );
});

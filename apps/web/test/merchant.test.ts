import { test } from "node:test";
import assert from "node:assert/strict";

import {
  attachInvoiceMerchant,
  invoiceFromRow,
  isUsableSlug,
  merchantFromRow,
  relativeTime,
  slugify,
  uniqueSlug,
} from "../src/lib/merchant.ts";

const PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=6304295D";

const MERCHANT_ROW = {
  slug: "demo",
  title: "DEMO STORE",
  note: "Demo merchant",
  base_payload: PAYLOAD,
  name: "DEMO STORE",
  city: "Dhaka",
  account_masked: "01000•••000",
  institution: "bd.org.bb.npsb",
  ref_prefix: "FT80",
  ref_len: 25,
  presets: [100, 500, 1000],
  verified: true,
  status: "published",
  user_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-01-02T03:04:05Z",
  updated_at: "2026-01-02T03:04:06Z",
};

test("merchantFromRow normalises public_merchants rows", () => {
  const merchant = merchantFromRow(MERCHANT_ROW);
  assert.ok(merchant);
  assert.equal(merchant.slug, "demo");
  assert.equal(merchant.title, "DEMO STORE");
  assert.equal(merchant.basePayload, PAYLOAD);
  assert.equal(merchant.accountMasked, "01000•••000");
  assert.equal(merchant.refLen, 25);
  assert.deepEqual(merchant.presets, [100, 500, 1000]);
  assert.equal(merchant.verified, true);
  assert.equal(merchant.status, "published");
  assert.equal(merchant.createdAt, "2026-01-02T03:04:05Z");
  assert.equal("user_id" in merchant, false);
});

test("merchantFromRow accepts camelCase local records", () => {
  const merchant = merchantFromRow({
    slug: "local-shop",
    title: "Local Shop",
    basePayload: PAYLOAD,
    name: "Local Shop",
    presets: "100,500",
    refPrefix: "AB",
    refLen: 12,
    status: "draft",
    updatedAt: "2026-01-02T00:00:00Z",
  });
  assert.ok(merchant);
  assert.equal(merchant.basePayload, PAYLOAD);
  assert.deepEqual(merchant.presets, [100, 500]);
  assert.equal(merchant.refPrefix, "AB");
  assert.equal(merchant.refLen, 12);
  assert.equal(merchant.status, "draft");
  assert.equal(merchant.verified, false);
});

test("merchantFromRow rejects unusable rows and clamps values", () => {
  assert.equal(merchantFromRow(null), null);
  assert.equal(merchantFromRow("nope"), null);
  assert.equal(merchantFromRow({ slug: "demo" }), null);
  assert.equal(merchantFromRow({ base_payload: PAYLOAD }), null);

  const clamped = merchantFromRow({
    slug: "x-shop",
    base_payload: PAYLOAD,
    ref_len: 99,
    presets: [0, -5, 100, "abc"],
    status: "weird",
  });
  assert.ok(clamped);
  assert.equal(clamped.refLen, 32);
  assert.deepEqual(clamped.presets, [100]);
  assert.equal(clamped.status, "published");
});

test("invoiceFromRow normalises edge function invoice objects", () => {
  const invoice = invoiceFromRow({
    token: "a".repeat(64),
    amount: "500.00",
    reference: "DEMOQR0VZeK2MfbVRI6w36osd",
    note: "Order 42",
    status: "claimed",
    expires_at: "2026-01-02T03:34:05Z",
    created_at: "2026-01-02T03:04:05Z",
    claimed_at: "2026-01-02T03:10:00Z",
    merchant: { slug: "demo", title: "DEMO STORE" },
    payload: PAYLOAD,
    qr_svg: "<svg/>",
    pay_url: "https://deshiqr.example/#/i/abc",
  });
  assert.ok(invoice);
  assert.equal(invoice.amount, 500);
  assert.equal(invoice.status, "claimed");
  assert.equal(invoice.merchantSlug, "demo");
  assert.equal(invoice.merchantTitle, "DEMO STORE");
  assert.equal(invoice.payload, PAYLOAD);
  assert.equal(invoice.qrSvg, "<svg/>");
  assert.equal(invoice.payUrl, "https://deshiqr.example/#/i/abc");
});

test("invoiceFromRow rejects missing tokens or amounts", () => {
  assert.equal(invoiceFromRow(null), null);
  assert.equal(invoiceFromRow({ amount: 500 }), null);
  assert.equal(invoiceFromRow({ token: "abc", amount: "not-a-number" }), null);
  const unknownStatus = invoiceFromRow({ token: "abc", amount: 10, status: "mystery" });
  assert.ok(unknownStatus);
  assert.equal(unknownStatus.status, "pending");
});

test("attachInvoiceMerchant fills merchant metadata", () => {
  const invoice = invoiceFromRow({ token: "abc", amount: 10 });
  assert.ok(invoice);
  const attached = attachInvoiceMerchant(invoice, { slug: "demo", title: "DEMO STORE" });
  assert.equal(attached.merchantSlug, "demo");
  assert.equal(attached.merchantTitle, "DEMO STORE");
});

test("slugify and isUsableSlug mirror the SQL rules", () => {
  assert.equal(slugify("DEMO STORE"), "demo-store");
  assert.equal(slugify("  Tea  Stall!!  "), "tea-stall");
  assert.equal(slugify("টাকা"), "");
  assert.equal(slugify("a".repeat(50)).length, 30);
  assert.equal(isUsableSlug("demo-store"), true);
  assert.equal(isUsableSlug("ab"), false); // too short
  assert.equal(isUsableSlug("-bad"), false);
  assert.equal(isUsableSlug("bad-"), false);
  assert.equal(isUsableSlug("has space"), false);
  assert.equal(isUsableSlug("login"), false); // reserved route
  assert.equal(isUsableSlug("bkash"), false); // reserved provider
});

test("uniqueSlug avoids collisions and reserved names", () => {
  assert.equal(uniqueSlug("DEMO STORE", []), "demo-store");
  assert.equal(uniqueSlug("DEMO STORE", ["demo-store"]), "demo-store-2");
  assert.equal(uniqueSlug("DEMO STORE", ["demo-store", "demo-store-2"]), "demo-store-3");
  const reserved = uniqueSlug("login", []);
  assert.notEqual(reserved, "login");
  assert.equal(isUsableSlug(reserved), true);
  const long = uniqueSlug("a very long shop name that goes on and on", ["a-very-long-shop-name-that-go"]);
  assert.ok(long.length <= 30);
  assert.equal(isUsableSlug(long), true);
});

test("relativeTime renders friendly labels", () => {
  const now = new Date("2026-01-02T12:00:00Z");
  assert.equal(relativeTime(null, now), "—");
  assert.equal(relativeTime("not a date", now), "—");
  assert.equal(relativeTime("2026-01-02T11:59:30Z", now), "just now");
  assert.equal(relativeTime("2026-01-02T11:45:00Z", now), "15 min ago");
  assert.equal(relativeTime("2026-01-02T09:00:00Z", now), "3 h ago");
  assert.equal(relativeTime("2025-12-28T12:00:00Z", now), "5 d ago");
});

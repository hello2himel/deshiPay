import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createLocalInvoice,
  deleteLocalMerchant,
  getLocalInvoice,
  getLocalMerchant,
  listLocalInvoices,
  listLocalMerchants,
  randomToken,
  saveLocalInvoice,
  saveLocalMerchant,
  updateLocalInvoiceStatus,
  type StorageLike,
} from "../src/lib/store.ts";
import { DEMO_INVOICE, DEMO_MERCHANT } from "../src/lib/demo.ts";
import type { MerchantView } from "../src/lib/merchant.ts";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function localMerchant(overrides: Partial<MerchantView> = {}): MerchantView {
  return { ...DEMO_MERCHANT, ...overrides };
}

test("local merchants save, list and delete", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(listLocalMerchants(storage), []);

  const saved = saveLocalMerchant(localMerchant({ slug: "tea-stall", title: "Tea Stall" }), storage);
  assert.ok(saved.updatedAt);
  assert.equal(saved.createdAt, saved.updatedAt);

  const list = listLocalMerchants(storage);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.slug, "tea-stall");
  assert.equal(getLocalMerchant("tea-stall", storage)?.title, "Tea Stall");
  assert.equal(getLocalMerchant("nope", storage), null);

  // Upsert by slug, not duplicate.
  saveLocalMerchant(localMerchant({ slug: "tea-stall", title: "Tea Stall 2" }), storage);
  assert.equal(listLocalMerchants(storage).length, 1);
  assert.equal(getLocalMerchant("tea-stall", storage)?.title, "Tea Stall 2");

  deleteLocalMerchant("tea-stall", storage);
  assert.deepEqual(listLocalMerchants(storage), []);
});

test("corrupt local storage degrades to an empty list", () => {
  const storage = new MemoryStorage();
  storage.setItem("deshiqr.merchants.v1", "{not json");
  assert.deepEqual(listLocalMerchants(storage), []);
  storage.setItem("deshiqr.merchants.v1", JSON.stringify([{ slug: "x" }, null, 42]));
  assert.deepEqual(listLocalMerchants(storage), []);
});

test("local invoices save, read and update status", () => {
  const storage = new MemoryStorage();
  const invoice = saveLocalInvoice(DEMO_INVOICE, storage);
  assert.ok(invoice.createdAt);
  assert.equal(listLocalInvoices(storage).length, 1);
  assert.equal(getLocalInvoice(DEMO_INVOICE.token, storage)?.amount, 500);

  const claimed = updateLocalInvoiceStatus(DEMO_INVOICE.token, "claimed", { txid: "TX123456" }, storage);
  assert.ok(claimed);
  assert.equal(claimed?.status, "claimed");
  assert.equal(claimed?.txid, "TX123456");
  assert.ok(claimed?.claimedAt);

  const paid = updateLocalInvoiceStatus(DEMO_INVOICE.token, "paid", {}, storage);
  assert.equal(paid?.status, "paid");
  assert.ok(paid?.paidAt);

  assert.equal(updateLocalInvoiceStatus("missing", "paid", {}, storage), null);
});

test("createLocalInvoice generates a 64-hex token and reference", () => {
  const storage = new MemoryStorage();
  const invoice = createLocalInvoice(
    { merchant: localMerchant(), amount: 250, note: "Order 1" },
    storage,
  );
  assert.match(invoice.token, /^[0-9a-f]{64}$/);
  assert.equal(invoice.amount, 250);
  assert.equal(invoice.status, "pending");
  assert.equal(invoice.merchantSlug, DEMO_MERCHANT.slug);
  assert.ok(invoice.reference.length >= 1 && invoice.reference.length <= 32);
  assert.ok(invoice.expiresAt);
  assert.equal(listLocalInvoices(storage).length, 1);
});

test("randomToken is 64 lowercase hex characters", () => {
  for (let index = 0; index < 10; index += 1) {
    assert.match(randomToken(), /^[0-9a-f]{64}$/);
  }
});

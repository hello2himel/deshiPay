/**
 * Local (no-backend) persistence.
 *
 * Demo mode stores exactly what a hosted deployment would: merchants and invoices.
 * The banner in the UI is explicit that this data lives in this browser only.
 * Functions take a `StorageLike` so tests can pass a fake.
 */
import { newReference } from "deshiqr";
import {
  invoiceFromRow,
  merchantFromRow,
  type InvoiceStatus,
  type InvoiceView,
  type MerchantView,
} from "./merchant.ts";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const MERCHANTS_KEY = "deshiqr.merchants.v1";
export const INVOICES_KEY = "deshiqr.invoices.v1";

function browserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readList(storage: StorageLike, key: string): unknown[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(storage: StorageLike | null, key: string, items: readonly unknown[]): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(items));
  } catch {
    // Quota/private browsing: local mode stays best-effort.
  }
}

function sortNewestFirst<T extends { updatedAt?: string | null; createdAt?: string | null }>(items: T[]): T[] {
  return items.sort((a, b) => {
    const left = Date.parse(a.updatedAt ?? a.createdAt ?? "") || 0;
    const right = Date.parse(b.updatedAt ?? b.createdAt ?? "") || 0;
    return right - left;
  });
}

/* ----------------------------------------------------------------- merchants */

export function listLocalMerchants(storage: StorageLike | null = browserStorage()): MerchantView[] {
  if (!storage) return [];
  return sortNewestFirst(
    readList(storage, MERCHANTS_KEY)
      .map((row) => merchantFromRow(row))
      .filter((row): row is MerchantView => row !== null),
  );
}

export function getLocalMerchant(
  slug: string,
  storage: StorageLike | null = browserStorage(),
): MerchantView | null {
  return listLocalMerchants(storage).find((merchant) => merchant.slug === slug) ?? null;
}

export function saveLocalMerchant(
  merchant: MerchantView,
  storage: StorageLike | null = browserStorage(),
): MerchantView {
  if (!storage) return merchant;
  const now = new Date().toISOString();
  const next: MerchantView = {
    ...merchant,
    createdAt: merchant.createdAt ?? now,
    updatedAt: now,
  };
  const others = listLocalMerchants(storage).filter((item) => item.slug !== merchant.slug);
  writeList(storage, MERCHANTS_KEY, [next, ...others]);
  return next;
}

export function deleteLocalMerchant(
  slug: string,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) return;
  writeList(
    storage,
    MERCHANTS_KEY,
    listLocalMerchants(storage).filter((item) => item.slug !== slug),
  );
}

/* ------------------------------------------------------------------ invoices */

export function listLocalInvoices(storage: StorageLike | null = browserStorage()): InvoiceView[] {
  if (!storage) return [];
  return sortNewestFirst(
    readList(storage, INVOICES_KEY)
      .map((row) => invoiceFromRow(row))
      .filter((row): row is InvoiceView => row !== null),
  );
}

export function getLocalInvoice(
  token: string,
  storage: StorageLike | null = browserStorage(),
): InvoiceView | null {
  return listLocalInvoices(storage).find((invoice) => invoice.token === token) ?? null;
}

export function saveLocalInvoice(
  invoice: InvoiceView,
  storage: StorageLike | null = browserStorage(),
): InvoiceView {
  if (!storage) return invoice;
  const next: InvoiceView = {
    ...invoice,
    createdAt: invoice.createdAt ?? new Date().toISOString(),
  };
  const others = listLocalInvoices(storage).filter((item) => item.token !== invoice.token);
  writeList(storage, INVOICES_KEY, [next, ...others]);
  return next;
}

export function updateLocalInvoiceStatus(
  token: string,
  status: InvoiceStatus,
  options: { txid?: string | null } = {},
  storage: StorageLike | null = browserStorage(),
): InvoiceView | null {
  const invoices = listLocalInvoices(storage);
  const found = invoices.find((invoice) => invoice.token === token);
  if (!found) return null;
  const now = new Date().toISOString();
  const next: InvoiceView = {
    ...found,
    status,
    txid: options.txid ?? found.txid,
    claimedAt: status === "claimed" ? now : found.claimedAt,
    paidAt: status === "paid" ? now : found.paidAt,
  };
  writeList(
    storage,
    INVOICES_KEY,
    [next, ...invoices.filter((invoice) => invoice.token !== token)],
  );
  return next;
}

/** Random, unguessable-looking token in the same 64-hex format the edge function issues. */
export function randomToken(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
    const bytes = new Uint8Array(32);
    cryptoObject.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let token = "";
  while (token.length < 64) token += Math.floor(Math.random() * 16).toString(16);
  return token.slice(0, 64);
}

export interface LocalInvoiceInput {
  merchant: MerchantView;
  amount: number;
  note?: string;
  reference?: string;
  expiresInMinutes?: number;
}

/** Create a demo invoice locally (used when Supabase is not configured). */
export function createLocalInvoice(
  input: LocalInvoiceInput,
  storage: StorageLike | null = browserStorage(),
): InvoiceView {
  const now = new Date();
  const reference =
    input.reference && input.reference.trim()
      ? input.reference.trim()
      : newReference({ prefix: input.merchant.refPrefix, length: input.merchant.refLen || 25 });
  const invoice: InvoiceView = {
    token: randomToken(),
    amount: input.amount,
    reference,
    note: input.note?.trim() ?? "",
    status: "pending",
    txid: null,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + (input.expiresInMinutes ?? 30) * 60_000).toISOString(),
    claimedAt: null,
    paidAt: null,
    merchantSlug: input.merchant.slug,
    merchantTitle: input.merchant.title,
    payload: null,
    qrSvg: null,
    payUrl: null,
  };
  const saved = saveLocalInvoice(invoice, storage);
  return saved;
}

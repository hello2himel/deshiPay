/**
 * Normalisers for merchant and invoice rows.
 *
 * The database uses snake_case; the Supabase JS client returns plain objects; local
 * mode stores its own JSON. Everything funnels through these functions so the UI
 * only ever sees one typed shape (and a missing optional column cannot crash a page).
 */
import { normalizeAmount, parsePresets } from "./amounts.ts";

export type MerchantStatus = "draft" | "published" | "suspended";
export type InvoiceStatus = "pending" | "claimed" | "paid" | "expired" | "canceled";

export interface MerchantView {
  slug: string;
  title: string;
  note: string;
  basePayload: string;
  name: string;
  city: string | null;
  accountMasked: string | null;
  institution: string;
  refPrefix: string;
  refLen: number;
  presets: number[];
  verified: boolean;
  status: MerchantStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface InvoiceView {
  token: string;
  amount: number;
  reference: string;
  note: string;
  status: InvoiceStatus;
  txid: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  claimedAt: string | null;
  paidAt: string | null;
  merchantSlug: string | null;
  merchantTitle: string | null;
  payload: string | null;
  qrSvg: string | null;
  payUrl: string | null;
}

const MERCHANT_STATUSES: readonly MerchantStatus[] = ["draft", "published", "suspended"];
const INVOICE_STATUSES: readonly InvoiceStatus[] = ["pending", "claimed", "paid", "expired", "canceled"];

/** Slugs must match the SQL constraint: lowercase, 3–30 chars, no edge hyphens. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** Route/provider names nobody may claim as a shop slug (mirrors the SQL trigger). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "auth",
  "dashboard",
  "login",
  "new",
  "p",
  "i",
  "m",
  "support",
  "help",
  "about",
  "terms",
  "privacy",
  "docs",
  "status",
  "billing",
  "demo",
  "bkash",
  "nagad",
  "rocket",
  "deshiqr",
]);

function pick(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function dateValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function statusValue(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function refLength(value: unknown): number {
  const number = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number)) return 0;
  return Math.min(32, Math.max(0, Math.round(number)));
}

function presetsValue(value: unknown): number[] {
  if (Array.isArray(value)) {
    return parsePresets(value.map((item) => String(item)).join(","));
  }
  if (typeof value === "string") return parsePresets(value);
  return [];
}

/** Normalise a merchants/public_merchants row. Returns `null` when unusable. */
export function merchantFromRow(row: unknown): MerchantView | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const source = row as Record<string, unknown>;
  const slug = stringValue(pick(source, "slug"));
  const basePayload = stringValue(pick(source, "base_payload", "basePayload", "payload"));
  if (!slug || !basePayload) return null;
  const name = stringValue(pick(source, "name")) ?? stringValue(pick(source, "title")) ?? slug;
  return {
    slug,
    title: stringValue(pick(source, "title")) ?? name,
    note: stringValue(pick(source, "note")) ?? "",
    basePayload,
    name,
    city: stringValue(pick(source, "city")),
    accountMasked: stringValue(pick(source, "account_masked", "accountMasked")),
    institution: stringValue(pick(source, "institution")) ?? "bd.org.bb.npsb",
    refPrefix: stringValue(pick(source, "ref_prefix", "refPrefix")) ?? "",
    refLen: refLength(pick(source, "ref_len", "refLen")),
    presets: presetsValue(pick(source, "presets")),
    verified: booleanValue(pick(source, "verified")),
    status: statusValue(pick(source, "status"), MERCHANT_STATUSES, "published") as MerchantStatus,
    createdAt: dateValue(pick(source, "created_at", "createdAt")),
    updatedAt: dateValue(pick(source, "updated_at", "updatedAt")),
  };
}

/** Normalise an invoices row or edge-function invoice object. */
export function invoiceFromRow(row: unknown): InvoiceView | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const source = row as Record<string, unknown>;
  const token = stringValue(pick(source, "token"));
  if (!token) return null;
  const amount = normalizeAmount(pick(source, "amount"));
  if (amount === null) return null;

  const nestedMerchant = (() => {
    const value = pick(source, "merchant", "merchants");
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  })();

  return {
    token,
    amount,
    reference: stringValue(pick(source, "reference")) ?? "",
    note: stringValue(pick(source, "note")) ?? "",
    status: statusValue(pick(source, "status"), INVOICE_STATUSES, "pending") as InvoiceStatus,
    txid: stringValue(pick(source, "txid")),
    createdAt: dateValue(pick(source, "created_at", "createdAt")),
    expiresAt: dateValue(pick(source, "expires_at", "expiresAt")),
    claimedAt: dateValue(pick(source, "claimed_at", "claimedAt")),
    paidAt: dateValue(pick(source, "paid_at", "paidAt")),
    merchantSlug:
      stringValue(pick(source, "merchant_slug", "merchantSlug")) ??
      stringValue(nestedMerchant?.slug) ??
      null,
    merchantTitle:
      stringValue(pick(source, "merchant_title", "merchantTitle")) ??
      stringValue(nestedMerchant?.title) ??
      null,
    payload: stringValue(pick(source, "payload")),
    qrSvg: stringValue(pick(source, "qr_svg", "qrSvg")),
    payUrl: stringValue(pick(source, "pay_url", "payUrl")),
  };
}

/** Merge the edge function's separate `merchant` object into an invoice view. */
export function attachInvoiceMerchant(invoice: InvoiceView, merchant: unknown): InvoiceView {
  if (typeof merchant !== "object" || merchant === null || Array.isArray(merchant)) return invoice;
  const source = merchant as Record<string, unknown>;
  const slug = stringValue(pick(source, "slug")) ?? invoice.merchantSlug;
  const title = stringValue(pick(source, "title", "name")) ?? invoice.merchantTitle;
  return { ...invoice, merchantSlug: slug, merchantTitle: title };
}

/** URL-safe slug from a title; may return `""` for unusable input. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return slug;
}

/** True when a slug is structurally valid and not reserved/routed. */
export function isUsableSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** Suggest a free slug close to `value`, given slugs already in use. */
export function uniqueSlug(value: string, inUse: readonly string[]): string {
  const taken = new Set(inUse);
  const base = slugify(value) || "shop";
  const candidate = isUsableSlug(base) ? base : base.length < 3 ? `${base}-shop`.slice(0, 30) : `shop-${base}`;
  let slug = isUsableSlug(candidate) ? candidate : "my-shop";
  if (!taken.has(slug)) return slug;
  for (let index = 2; index < 1000; index += 1) {
    const suffix = `-${index}`;
    const next = `${slug.slice(0, 30 - suffix.length)}${suffix}`;
    if (!taken.has(next) && isUsableSlug(next)) return next;
  }
  return `shop-${Date.now().toString(36).slice(-6)}`;
}

/** ISO-ish relative label for created timestamps. */
export function relativeTime(value: string | null, now: Date = new Date()): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

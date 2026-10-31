/**
 * deshiQR `invoice` edge function.
 *
 * Deploy: `supabase functions deploy invoice --no-verify-jwt false`
 * (the function is public by design: payers are anonymous, so keep JWT verification off —
 * `--no-verify-jwt` — or call it with the anon key from the web app).
 *
 * Routes (mounted by Supabase at `/functions/v1/invoice`):
 *
 *   POST /invoice            create an invoice for a published merchant, return payload + QR
 *   GET  /invoice?token=…    public invoice status (+ payload/QR while pending/claimed)
 *   POST /invoice/claim      payer "I paid" signal: pending -> claimed, once, before expiry
 *
 * Design notes
 *  - No npm imports: the payload/QR logic comes from the vendored, dependency-free libraries
 *    (`../_vendor/core`, `../_vendor/qr`) and the database is reached over PostgREST with
 *    `fetch`. That keeps the bundle tiny and cold starts fast.
 *  - Every error response is `{ ok: false, error: { code, message } }` with a stable code.
 *  - Service-role access is server-side only; no user data (user_id, txid, merchant uuid) is
 *    ever returned.
 *  - Money never moves through deshiQR. "Claimed" is a customer signal, not a payment.
 */
import {
  DEFAULT_REFERENCE_LENGTH,
  MAX_AMOUNT,
  build,
  formatTaka,
  referenceFrom,
  validate,
  type BuildOptions,
} from "../_vendor/core/index.ts";
import { encode, toSvg } from "../_vendor/qr/index.ts";

// ---------------------------------------------------------------------------
// Configuration (Supabase injects SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY automatically)
// ---------------------------------------------------------------------------

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Public origin of the hosted web app. Used for `pay_url`. Set DESHIQR_APP_ORIGIN in prod. */
const APP_ORIGIN = (Deno.env.get("DESHIQR_APP_ORIGIN") ?? "http://localhost:5173").replace(/\/+$/, "");

/** CORS: "*" is fine for a public pay API; set DESHIQR_CORS_ORIGIN to your app origin to tighten. */
const CORS_ORIGIN = Deno.env.get("DESHIQR_CORS_ORIGIN") ?? "*";

const RATE_LIMIT_WINDOW_SECONDS = 60;
const CREATE_RATE_LIMIT = numberFromEnv("DESHIQR_CREATE_RATE_LIMIT", 10); // per merchant + IP / window
const CLAIM_RATE_LIMIT = numberFromEnv("DESHIQR_CLAIM_RATE_LIMIT", 20); // per IP / window
const READ_RATE_LIMIT = numberFromEnv("DESHIQR_READ_RATE_LIMIT", 120); // per IP / window

const DEFAULT_EXPIRES_IN_SECONDS = 30 * 60;
const MIN_EXPIRES_IN_SECONDS = 60;
const MAX_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

const SLUG_RE = /^[a-z0-9-]{1,30}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const TXID_RE = /^[A-Za-z0-9._-]{4,64}$/;
const REFERENCE_RE = /^[\x20-\x7E]{1,32}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ErrorCode =
  | "MERCHANT_NOT_FOUND"
  | "INVALID_AMOUNT"
  | "RATE_LIMITED"
  | "INVOICE_NOT_FOUND"
  | "EXPIRED"
  | "ALREADY_PAID"
  | "BAD_REQUEST"
  | "INTERNAL";

interface MerchantRow {
  id: string;
  slug: string;
  title: string;
  note: string;
  base_payload: string;
  name: string | null;
  city: string | null;
  account_masked: string | null;
  institution: string;
  ref_prefix: string;
  ref_len: number;
  presets: number[];
  verified: boolean;
  status: string;
}

interface InvoiceRow {
  id: string;
  merchant_id: string;
  token: string;
  amount: number | string;
  reference: string;
  note: string;
  status: string;
  txid: string | null;
  claimed_at: string | null;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
}

interface PublicMerchant {
  slug: string;
  title: string;
  note: string;
  name: string | null;
  city: string | null;
  account_masked: string | null;
  institution: string;
  ref_prefix: string;
  ref_len: number;
  presets: number[];
  verified: boolean;
}

interface PublicInvoice {
  token: string;
  amount: number;
  reference: string;
  note: string;
  status: string;
  expires_at: string;
  created_at: string;
  claimed_at: string | null;
  paid_at: string | null;
}

class HttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function corsHeaders(): Headers {
  const headers = new Headers();
  headers.set("access-control-allow-origin", CORS_ORIGIN);
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "authorization, apikey, content-type, x-client-info");
  headers.set("access-control-max-age", "86400");
  if (CORS_ORIGIN !== "*") headers.set("vary", "origin");
  return headers;
}

function jsonResponse(body: unknown, status = 200): Response {
  const headers = corsHeaders();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(code: ErrorCode, message: string, status: number): Response {
  return jsonResponse({ ok: false, error: { code, message } }, status);
}

const ERROR_STATUS: Record<ErrorCode, number> = {
  MERCHANT_NOT_FOUND: 404,
  INVALID_AMOUNT: 400,
  RATE_LIMITED: 429,
  INVOICE_NOT_FOUND: 404,
  EXPIRED: 410,
  ALREADY_PAID: 409,
  BAD_REQUEST: 400,
  INTERNAL: 500,
};

function fail(code: ErrorCode, message: string): Response {
  return errorResponse(code, message, ERROR_STATUS[code]);
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

// ---------------------------------------------------------------------------
// PostgREST access (service role, server-side only)
// ---------------------------------------------------------------------------

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }
  return (await response.json()) as T;
}

async function rpc<T>(functionName: string, args: Record<string, unknown>): Promise<T> {
  return rest<T>(`/rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

function requireBackend(): Response | null {
  if (SUPABASE_URL === "" || SUPABASE_SERVICE_ROLE_KEY === "") {
    return fail(
      "INTERNAL",
      "Server is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------------------

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    if (first) return first.trim().slice(0, 64);
  }
  return (request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown").slice(
    0,
    64,
  );
}

/**
 * Fixed-window rate limit, shared across isolates via the `deshiqr.take_rate_limit` table
 * helper. Fails closed: if the limiter itself errors we deny rather than open the floodgates.
 */
async function takeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const allowed = await rpc<boolean>("take_rate_limit", {
      p_key: key.slice(0, 512),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    return allowed === true;
  } catch {
    return false;
  }
}

/** Accept number or numeric string, enforce 2 decimals and the library MAX_AMOUNT. */
function coerceAmount(value: unknown): number | null {
  let numeric: number;
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    numeric = Number(text);
  } else if (typeof value === "number") {
    numeric = value;
  } else {
    return null;
  }
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_AMOUNT) return null;
  const cents = Math.round(numeric * 100);
  // Reject 0.001-style values that silently round; only exact 2dp amounts are accepted.
  if (Math.abs(numeric * 100 - cents) > 1e-6) return null;
  if (cents < 1) return null;
  return cents / 100;
}

function coerceExpiresIn(value: unknown): number | null {
  if (value === undefined || value === null) return DEFAULT_EXPIRES_IN_SECONDS;
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isInteger(numeric)) return null;
  if (numeric < MIN_EXPIRES_IN_SECONDS || numeric > MAX_EXPIRES_IN_SECONDS) return null;
  return numeric;
}

function coerceString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  if (value.length > maxLength) return null;
  return value;
}

function isExpired(invoice: InvoiceRow, now = Date.now()): boolean {
  return new Date(invoice.expires_at).getTime() <= now;
}

/** Effective public status: a pending invoice past its expiry reads as expired. */
function effectiveStatus(invoice: InvoiceRow): string {
  if (invoice.status === "pending" && isExpired(invoice)) return "expired";
  return invoice.status;
}

/**
 * Derive the dynamic invoice payload and its bill number.
 *
 * The reference is generated by `deshiqr` itself (`build()` → `newReference()`), driven by the
 * merchant's stored `ref_prefix` / `ref_len`:
 *   - an explicit customer-supplied reference always wins (and is validated by the library);
 *   - otherwise generate `ref_len` characters (0 = use the library default, 25 — the length
 *     real bKash dynamic QRs use), never shorter than the prefix.
 *
 * The resulting reference is embedded in the payload, and we store it on the invoice, so
 * GET /invoice can rebuild the exact same payload from amount + reference without persisting
 * the payload itself.
 */
function deriveInvoicePayload(
  merchant: MerchantRow,
  amount: number,
  explicitReference: string | null,
): { payload: string; reference: string } {
  const options: BuildOptions = { amount };
  if (explicitReference !== null) {
    options.reference = explicitReference;
  } else {
    const prefix = merchant.ref_prefix ?? "";
    const configured = Number.isInteger(merchant.ref_len) && merchant.ref_len > 0 ? merchant.ref_len : 0;
    options.referencePrefix = prefix;
    options.referenceLength = Math.min(32, Math.max(configured || DEFAULT_REFERENCE_LENGTH, prefix.length));
  }

  const payload = build(merchant.base_payload, options);
  const reference = referenceFrom(payload);
  if (reference === null) {
    throw new Error("The derived payload does not carry an invoice reference.");
  }
  const report = validate(payload);
  if (!report.ok) {
    throw new Error("The derived payload failed validation.");
  }
  return { payload, reference };
}

function publicMerchant(merchant: MerchantRow): PublicMerchant {
  return {
    slug: merchant.slug,
    title: merchant.title,
    note: merchant.note,
    name: merchant.name,
    city: merchant.city,
    account_masked: merchant.account_masked,
    institution: merchant.institution,
    ref_prefix: merchant.ref_prefix,
    ref_len: merchant.ref_len,
    presets: merchant.presets,
    verified: merchant.verified,
  };
}

function publicInvoice(invoice: InvoiceRow): PublicInvoice {
  return {
    token: invoice.token,
    amount: Number(invoice.amount),
    reference: invoice.reference,
    note: invoice.note,
    status: invoice.status,
    expires_at: invoice.expires_at,
    created_at: invoice.created_at,
    claimed_at: invoice.claimed_at,
    paid_at: invoice.paid_at,
  };
}

function payUrl(token: string): string {
  return `${APP_ORIGIN}/#/i/${token}`;
}

function renderQr(payload: string, merchant: MerchantRow, amount: number): string {
  return toSvg(encode(payload), {
    margin: 4,
    scale: 1,
    title: `${merchant.title} — ${formatTaka(amount)}`,
    ariaLabel: `Bangla QR code to pay ${formatTaka(amount, { symbol: true })} to ${merchant.title}`,
  });
}

const MERCHANT_COLUMNS =
  "id,slug,title,note,base_payload,name,city,account_masked,institution,ref_prefix,ref_len,presets,verified,status";
const INVOICE_COLUMNS =
  "id,merchant_id,token,amount,reference,note,status,txid,claimed_at,paid_at,expires_at,created_at";

async function findPublishedMerchant(slug: string): Promise<MerchantRow | null> {
  const rows = await rest<MerchantRow[]>(
    `/merchants?select=${MERCHANT_COLUMNS}&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`,
  );
  return rows[0] ?? null;
}

async function findMerchantById(id: string): Promise<MerchantRow | null> {
  const rows = await rest<MerchantRow[]>(
    `/merchants?select=${MERCHANT_COLUMNS}&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return rows[0] ?? null;
}

async function findInvoiceByToken(token: string): Promise<InvoiceRow | null> {
  const rows = await rest<InvoiceRow[]>(
    `/invoices?select=${INVOICE_COLUMNS}&token=eq.${encodeURIComponent(token)}&limit=1`,
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// POST /invoice — create an invoice
// ---------------------------------------------------------------------------

async function handleCreate(request: Request): Promise<Response> {
  const missingConfig = requireBackend();
  if (missingConfig) return missingConfig;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("BAD_REQUEST", "Request body must be a JSON object.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("BAD_REQUEST", "Request body must be valid JSON.");
  }

  const slug = body.merchant;
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return fail("MERCHANT_NOT_FOUND", "That merchant does not exist.");
  }

  const amount = coerceAmount(body.amount);
  if (amount === null) {
    return fail(
      "INVALID_AMOUNT",
      `Amount must be between 0.01 and ${MAX_AMOUNT.toFixed(2)} BDT with at most 2 decimals.`,
    );
  }

  const note = body.note === undefined ? "" : coerceString(body.note, 160);
  if (note === null) {
    return fail("BAD_REQUEST", "note must be a string of at most 160 characters.");
  }

  const explicitReference = body.reference === undefined || body.reference === null ? null : body.reference;
  if (explicitReference !== null) {
    if (typeof explicitReference !== "string" || !REFERENCE_RE.test(explicitReference)) {
      return fail("BAD_REQUEST", "reference must be 1-32 printable ASCII characters.");
    }
  }

  const expiresIn = coerceExpiresIn(body.expires_in);
  if (expiresIn === null) {
    return fail(
      "BAD_REQUEST",
      `expires_in must be an integer number of seconds between ${MIN_EXPIRES_IN_SECONDS} and ${MAX_EXPIRES_IN_SECONDS}.`,
    );
  }

  const ip = clientIp(request);
  const route = "invoice:create";
  if (!(await takeRateLimit(`${route}:${slug}:${ip}`, CREATE_RATE_LIMIT, RATE_LIMIT_WINDOW_SECONDS))) {
    return fail("RATE_LIMITED", "Too many invoice requests. Please wait a minute and try again.");
  }

  let merchant: MerchantRow | null;
  try {
    merchant = await findPublishedMerchant(slug);
  } catch (error) {
    console.error("invoice: merchant lookup failed", error);
    return fail("INTERNAL", "Could not look up the merchant.");
  }
  if (merchant === null) {
    return fail("MERCHANT_NOT_FOUND", "That merchant does not exist or is not published.");
  }

  // Defence in depth: the database already enforces a valid CRC, but re-validate before
  // deriving so a corrupted row can never produce a QR that sends people to a bad payload.
  const baseReport = validate(merchant.base_payload);
  if (!baseReport.ok) {
    console.error("invoice: stored merchant payload is invalid", merchant.slug, baseReport.errors);
    return fail("INTERNAL", "The merchant's stored payload is invalid. Please contact support.");
  }

  let reference: string;
  let payload: string;
  let qrSvg: string;
  try {
    const derived = deriveInvoicePayload(merchant, amount, explicitReference);
    reference = derived.reference;
    payload = derived.payload;
    qrSvg = renderQr(payload, merchant, amount);
  } catch (error) {
    console.error("invoice: payload/QR derivation failed", error);
    return fail("BAD_REQUEST", "Could not build a payload for this request.");
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  let invoice: InvoiceRow;
  try {
    const rows = await rest<InvoiceRow[]>("/invoices", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        merchant_id: merchant.id,
        amount,
        reference,
        note,
        status: "pending",
        expires_at: expiresAt,
      }),
    });
    const created = rows[0];
    if (!created) throw new Error("The insert returned no row.");
    invoice = created;
  } catch (error) {
    console.error("invoice: insert failed", error);
    return fail("INTERNAL", "Could not create the invoice.");
  }

  return jsonResponse(
    {
      ok: true,
      invoice: publicInvoice(invoice),
      merchant: publicMerchant(merchant),
      payload,
      pay_url: payUrl(invoice.token),
      qr_svg: qrSvg,
    },
    201,
  );
}

// ---------------------------------------------------------------------------
// GET /invoice?token=… — public status
// ---------------------------------------------------------------------------

async function handleGet(request: Request, url: URL): Promise<Response> {
  const missingConfig = requireBackend();
  if (missingConfig) return missingConfig;

  const token = url.searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) {
    return fail("INVOICE_NOT_FOUND", "That invoice does not exist.");
  }

  const ip = clientIp(request);
  if (!(await takeRateLimit(`invoice:read:${ip}`, READ_RATE_LIMIT, RATE_LIMIT_WINDOW_SECONDS))) {
    return fail("RATE_LIMITED", "Too many requests. Please wait a minute and try again.");
  }

  let invoice: InvoiceRow | null;
  try {
    invoice = await findInvoiceByToken(token);
  } catch (error) {
    console.error("invoice: invoice lookup failed", error);
    return fail("INTERNAL", "Could not look up the invoice.");
  }
  if (invoice === null) {
    return fail("INVOICE_NOT_FOUND", "That invoice does not exist.");
  }

  let merchant: MerchantRow | null;
  try {
    merchant = await findMerchantById(invoice.merchant_id);
  } catch (error) {
    console.error("invoice: merchant lookup failed", error);
    return fail("INTERNAL", "Could not look up the merchant.");
  }
  if (merchant === null) {
    return fail("INVOICE_NOT_FOUND", "That invoice no longer exists.");
  }

  const status = effectiveStatus(invoice);
  const payable = status === "pending" || status === "claimed";

  let payload: string | null = null;
  let qrSvg: string | null = null;
  if (payable) {
    try {
      payload = build(merchant.base_payload, {
        amount: Number(invoice.amount),
        reference: invoice.reference,
      });
      const rebuiltReference = referenceFrom(payload);
      if (rebuiltReference !== invoice.reference) {
        throw new Error("Rebuilt payload does not carry the invoice reference.");
      }
      qrSvg = renderQr(payload, merchant, Number(invoice.amount));
    } catch (error) {
      console.error("invoice: payload rebuild failed", token, error);
      return fail("INTERNAL", "Could not rebuild the invoice payload.");
    }
  }

  return jsonResponse({
    ok: true,
    invoice: { ...publicInvoice(invoice), status },
    merchant: publicMerchant(merchant),
    payload,
    pay_url: payUrl(invoice.token),
    qr_svg: qrSvg,
  });
}

// ---------------------------------------------------------------------------
// POST /invoice/claim — customer "I paid" signal
// ---------------------------------------------------------------------------

function mapClaimError(message: string): Response {
  if (/ALREADY_CLAIMED|ALREADY_PAID/.test(message)) {
    return fail("ALREADY_PAID", "This invoice has already been claimed or paid.");
  }
  if (/CANCELED/.test(message)) {
    return fail("EXPIRED", "This invoice was canceled.");
  }
  if (/INVOICE_NOT_FOUND/.test(message)) {
    return fail("INVOICE_NOT_FOUND", "That invoice does not exist.");
  }
  if (/BAD_TXID/.test(message)) {
    return fail("BAD_REQUEST", "txid must be 4-64 characters: letters, digits, dot, dash or underscore.");
  }
  return fail("INTERNAL", "Could not record the claim.");
}

async function handleClaim(request: Request): Promise<Response> {
  const missingConfig = requireBackend();
  if (missingConfig) return missingConfig;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("BAD_REQUEST", "Request body must be a JSON object.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("BAD_REQUEST", "Request body must be valid JSON.");
  }

  const token = body.token;
  if (typeof token !== "string" || !TOKEN_RE.test(token)) {
    return fail("INVOICE_NOT_FOUND", "That invoice does not exist.");
  }
  const txid = body.txid;
  if (typeof txid !== "string" || !TXID_RE.test(txid)) {
    return fail("BAD_REQUEST", "txid must be 4-64 characters: letters, digits, dot, dash or underscore.");
  }

  const ip = clientIp(request);
  if (!(await takeRateLimit(`invoice:claim:${ip}`, CLAIM_RATE_LIMIT, RATE_LIMIT_WINDOW_SECONDS))) {
    return fail("RATE_LIMITED", "Too many claim attempts. Please wait a minute and try again.");
  }

  let status: string;
  try {
    status = await rpc<string>("claim_invoice", { p_token: token, p_txid: txid });
  } catch (error) {
    if (error instanceof HttpError) {
      let message = error.body;
      try {
        const parsed = JSON.parse(error.body) as { message?: unknown; code?: unknown };
        if (typeof parsed.message === "string") message = parsed.message;
      } catch {
        // keep the raw body
      }
      return mapClaimError(message);
    }
    console.error("invoice: claim RPC failed", error);
    return fail("INTERNAL", "Could not record the claim.");
  }

  if (status === "claimed") {
    return jsonResponse({ ok: true, status: "claimed" });
  }
  if (status === "expired") {
    return fail("EXPIRED", "This invoice has expired.");
  }
  return fail("INTERNAL", "Unexpected claim result.");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  // Works at `/functions/v1/invoice` (Supabase) and `/invoice` (local `supabase functions serve`).
  const route = url.pathname.replace(/^.*\/invoice/, "").replace(/\/+$/, "") || "/";

  try {
    if (route === "/claim" && request.method === "POST") {
      return await handleClaim(request);
    }
    if (route === "/" && request.method === "POST") {
      return await handleCreate(request);
    }
    if (route === "/" && request.method === "GET") {
      return await handleGet(request, url);
    }
    return fail("BAD_REQUEST", "Unknown route or method.");
  } catch (error) {
    console.error("invoice: unhandled error", error);
    return fail("INTERNAL", "Unexpected server error.");
  }
}

Deno.serve(handleRequest);

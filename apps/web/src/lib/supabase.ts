/**
 * Supabase integration — loaded lazily.
 *
 * `@supabase/supabase-js` is imported dynamically and only when the app is
 * configured, so demo mode never downloads it. Contract: docs/architecture.md §6–7.
 * Only the anon key is used; RLS + the invoice edge function do the real work.
 */
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "./config.ts";
import {
  invoiceFromRow,
  merchantFromRow,
  type InvoiceView,
  type MerchantView,
} from "./merchant.ts";

export class SupabaseApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SupabaseApiError";
    this.code = code;
  }
}

export function hasSupabase(config: AppConfig): boolean {
  return config.mode === "supabase" && config.supabaseUrl !== null && config.supabaseAnonKey !== null;
}

let clientPromise: Promise<SupabaseClient | null> | null = null;
let clientKey = "";

/** Lazily create the Supabase client (or `null` in local mode). */
export function getSupabase(config: AppConfig): Promise<SupabaseClient | null> {
  if (!hasSupabase(config)) return Promise.resolve(null);
  const key = `${config.supabaseUrl}|${config.supabaseAnonKey}`;
  if (clientPromise && clientKey === key) return clientPromise;
  clientKey = key;
  clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(config.supabaseUrl as string, config.supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  );
  return clientPromise;
}

/* -------------------------------------------------------------------- auth */

export async function getSession(config: AppConfig): Promise<Session | null> {
  const client = await getSupabase(config);
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw new SupabaseApiError("AUTH", error.message);
  return data.session;
}

export async function signInWithMagicLink(
  config: AppConfig,
  email: string,
  redirectTo: string,
): Promise<void> {
  const client = await getSupabase(config);
  if (!client) throw new SupabaseApiError("LOCAL_MODE", "Supabase is not configured.");
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new SupabaseApiError("AUTH", error.message);
}

export async function signOut(config: AppConfig): Promise<void> {
  const client = await getSupabase(config);
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw new SupabaseApiError("AUTH", error.message);
}

/** Subscribe to auth changes. Returns an unsubscribe function. */
export async function onAuthStateChange(
  config: AppConfig,
  callback: (session: Session | null) => void,
): Promise<() => void> {
  const client = await getSupabase(config);
  if (!client) return () => undefined;
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

/* --------------------------------------------------------------- merchants */

export async function fetchPublicMerchant(
  config: AppConfig,
  slug: string,
): Promise<MerchantView | null> {
  const client = await getSupabase(config);
  if (!client) return null;
  const { data, error } = await client
    .from("public_merchants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new SupabaseApiError("MERCHANT_READ", error.message);
  return merchantFromRow(data);
}

export async function listMyMerchants(config: AppConfig): Promise<MerchantView[]> {
  const client = await getSupabase(config);
  if (!client) return [];
  const { data, error } = await client
    .from("merchants")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new SupabaseApiError("MERCHANT_LIST", error.message);
  return (data ?? [])
    .map((row) => merchantFromRow(row))
    .filter((row): row is MerchantView => row !== null);
}

export interface MerchantInput {
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
  status: "draft" | "published" | "suspended";
}

function merchantRow(input: MerchantInput): Record<string, unknown> {
  return {
    slug: input.slug,
    title: input.title,
    note: input.note,
    base_payload: input.basePayload,
    name: input.name,
    city: input.city,
    account_masked: input.accountMasked,
    institution: input.institution,
    ref_prefix: input.refPrefix,
    ref_len: input.refLen,
    presets: input.presets,
    status: input.status,
  };
}

async function requireSession(config: AppConfig): Promise<SupabaseClient> {
  const client = await getSupabase(config);
  if (!client) throw new SupabaseApiError("LOCAL_MODE", "Supabase is not configured.");
  const session = await getSession(config);
  if (!session) throw new SupabaseApiError("AUTH", "Sign in first to manage pay pages.");
  return client;
}

export async function createMerchant(config: AppConfig, input: MerchantInput): Promise<MerchantView> {
  const client = await requireSession(config);
  const { data, error } = await client.from("merchants").insert(merchantRow(input)).select("*").single();
  if (error) throw new SupabaseApiError("MERCHANT_CREATE", error.message);
  const merchant = merchantFromRow(data);
  if (!merchant) throw new SupabaseApiError("MERCHANT_CREATE", "The created pay page could not be read back.");
  return merchant;
}

export interface MerchantPatch {
  title?: string;
  note?: string;
  presets?: number[];
  refPrefix?: string;
  refLen?: number;
  status?: "draft" | "published" | "suspended";
}

export async function updateMerchant(
  config: AppConfig,
  slug: string,
  patch: MerchantPatch,
): Promise<MerchantView> {
  const client = await requireSession(config);
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.presets !== undefined) row.presets = patch.presets;
  if (patch.refPrefix !== undefined) row.ref_prefix = patch.refPrefix;
  if (patch.refLen !== undefined) row.ref_len = patch.refLen;
  if (patch.status !== undefined) row.status = patch.status;
  if (Object.keys(row).length === 0) throw new SupabaseApiError("MERCHANT_UPDATE", "Nothing to update.");
  const { data, error } = await client
    .from("merchants")
    .update(row)
    .eq("slug", slug)
    .select("*")
    .single();
  if (error) throw new SupabaseApiError("MERCHANT_UPDATE", error.message);
  const merchant = merchantFromRow(data);
  if (!merchant) throw new SupabaseApiError("MERCHANT_UPDATE", "The updated pay page could not be read back.");
  return merchant;
}

export async function deleteMerchant(config: AppConfig, slug: string): Promise<void> {
  const client = await requireSession(config);
  const { error } = await client.from("merchants").delete().eq("slug", slug);
  if (error) throw new SupabaseApiError("MERCHANT_DELETE", error.message);
}

/* ---------------------------------------------------------------- invoices */

export async function listMyInvoices(config: AppConfig): Promise<InvoiceView[]> {
  const client = await getSupabase(config);
  if (!client) return [];
  const plain = () => client.from("invoices").select("*").order("created_at", { ascending: false });
  let response = await client
    .from("invoices")
    .select("*, merchant:merchants(slug, title)")
    .order("created_at", { ascending: false });
  if (response.error) response = await plain();
  if (response.error) throw new SupabaseApiError("INVOICE_LIST", response.error.message);
  return (response.data ?? [])
    .map((row) => invoiceFromRow(row))
    .filter((row): row is InvoiceView => row !== null);
}

export interface InvoiceCreateInput {
  merchant: string;
  amount: number;
  note?: string;
  reference?: string;
  expiresInSeconds?: number;
}

export interface InvoiceResult {
  invoice: InvoiceView;
  merchant: MerchantView | null;
  payload: string | null;
  payUrl: string | null;
  qrSvg: string | null;
}

function functionUrl(config: AppConfig, suffix = ""): string {
  return `${config.supabaseUrl}/functions/v1/invoice${suffix}`;
}

async function requestHeaders(config: AppConfig): Promise<Record<string, string>> {
  const session = await getSession(config);
  return {
    apikey: config.supabaseAnonKey as string,
    authorization: `Bearer ${session?.access_token ?? config.supabaseAnonKey}`,
  };
}

interface ApiErrorBody {
  ok?: boolean;
  error?: { code?: string; message?: string };
}

async function readApiError(response: Response): Promise<SupabaseApiError> {
  let code = `HTTP_${response.status}`;
  let message = `Request failed (HTTP ${response.status}).`;
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body.error?.code) code = body.error.code;
    if (body.error?.message) message = body.error.message;
  } catch {
    // non-JSON error body
  }
  return new SupabaseApiError(code, message);
}

function invoiceResult(body: unknown): InvoiceResult {
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const invoice = invoiceFromRow(record.invoice);
  if (!invoice) throw new SupabaseApiError("INVOICE_READ", "The invoice response was not understood.");
  const merchant = merchantFromRow(record.merchant);
  return {
    invoice: {
      ...invoice,
      merchantSlug: invoice.merchantSlug ?? merchant?.slug ?? null,
      merchantTitle: invoice.merchantTitle ?? merchant?.title ?? null,
    },
    merchant,
    payload: typeof record.payload === "string" ? record.payload : null,
    payUrl: typeof record.pay_url === "string" ? record.pay_url : null,
    qrSvg: typeof record.qr_svg === "string" ? record.qr_svg : null,
  };
}

/** Create an invoice through the `invoice` edge function. */
export async function createInvoice(config: AppConfig, input: InvoiceCreateInput): Promise<InvoiceResult> {
  if (!hasSupabase(config)) throw new SupabaseApiError("LOCAL_MODE", "Supabase is not configured.");
  const response = await fetch(functionUrl(config), {
    method: "POST",
    headers: { "content-type": "application/json", ...(await requestHeaders(config)) },
    body: JSON.stringify({
      merchant: input.merchant,
      amount: input.amount,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
      ...(input.expiresInSeconds ? { expires_in: input.expiresInSeconds } : {}),
    }),
  });
  if (!response.ok) throw await readApiError(response);
  return invoiceResult(await response.json());
}

/** Fetch a token-addressed invoice; `null` when it does not exist. */
export async function fetchInvoice(config: AppConfig, token: string): Promise<InvoiceResult | null> {
  if (!hasSupabase(config)) return null;
  const response = await fetch(functionUrl(config, `?token=${encodeURIComponent(token)}`), {
    headers: await requestHeaders(config),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw await readApiError(response);
  return invoiceResult(await response.json());
}

/** Customer "I have paid" claim — the only public write path. */
export async function claimInvoice(
  config: AppConfig,
  token: string,
  txid: string,
): Promise<"claimed" | "expired"> {
  const client = await getSupabase(config);
  if (!client) throw new SupabaseApiError("LOCAL_MODE", "Supabase is not configured.");
  const { data, error } = await client.rpc("claim_invoice", { p_token: token, p_txid: txid });
  if (error) throw new SupabaseApiError("CLAIM", friendlyClaimError(error.message));
  return data === "expired" ? "expired" : "claimed";
}

function friendlyClaimError(message: string): string {
  if (/ALREADY_CLAIMED/.test(message)) return "Your claim was already recorded.";
  if (/ALREADY_PAID/.test(message)) return "This invoice is already marked as paid.";
  if (/INVOICE_NOT_FOUND/.test(message)) return "That invoice does not exist.";
  if (/BAD_TXID/.test(message)) return "Enter a transaction id of 4–64 letters, digits, dots, dashes or underscores.";
  if (/CANCELED/.test(message)) return "This invoice was canceled.";
  return message || "Could not record your claim. Please try again.";
}

/** Merchant confirms a payment manually (dashboard action). */
export async function markInvoicePaid(config: AppConfig, token: string): Promise<void> {
  const client = await requireSession(config);
  const { error } = await client.from("invoices").update({ status: "paid" }).eq("token", token);
  if (error) throw new SupabaseApiError("INVOICE_UPDATE", error.message);
}

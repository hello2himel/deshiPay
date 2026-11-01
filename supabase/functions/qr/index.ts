/**
 * deshiQR `qr` edge function — the amount→QR API.
 *
 * Deploy: `supabase functions deploy qr --no-verify-jwt`
 * (no database, no secrets, no merchant records; JWT verification is optional).
 *
 * Routes (Supabase mounts the function at `/functions/v1/qr`):
 *
 *   POST /qr   { "payload": "00020101021126…", "amount": 500, "reference": "optional" }
 *     200     { ok: true, payload, amount, amountText, reference, qr_svg }
 *
 * Everything is stateless: the function validates TLV + CRC, edits only the
 * amount (and tag 01), re-seals, and renders the QR SVG. Provider identity is
 * irrelevant — see `qr-core.ts`.
 */
import { DeshiQrError } from "../_vendor/core/index.ts";
import { buildAmountQr } from "./qr-core.ts";

const CORS_ORIGIN = Deno.env.get("DESHIQR_CORS_ORIGIN") ?? "*";

/** The request body is one payload + a number; anything larger is abuse. */
const MAX_BODY_BYTES = 16 * 1024;

const ERROR_STATUS: Record<string, number> = {
  EMPTY_PAYLOAD: 400,
  BAD_TLV: 400,
  MISSING_FIELD: 400,
  CHECKSUM_MISMATCH: 400,
  BAD_AMOUNT: 400,
  BAD_REFERENCE: 400,
  UNSUPPORTED: 413,
  INTERNAL: 500,
};

function corsHeaders(): Headers {
  const headers = new Headers();
  headers.set("access-control-allow-origin", CORS_ORIGIN);
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
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

function fail(code: string, message: string): Response {
  return jsonResponse({ ok: false, error: { code, message } }, ERROR_STATUS[code] ?? 400);
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  // Works at `/functions/v1/qr` (Supabase) and `/qr` (local `supabase functions serve`).
  const route = url.pathname.replace(/^.*\/qr/, "").replace(/\/+$/, "") || "/";
  if (route !== "/") return fail("BAD_REQUEST", "Unknown route. POST /qr.");
  if (request.method !== "POST") return fail("BAD_REQUEST", "Use POST /qr with a JSON body.");

  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return fail("UNSUPPORTED", "Request body is too large.");
    }

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return fail("BAD_REQUEST", "Request body must be a JSON object.");
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return fail("BAD_REQUEST", "Request body must be valid JSON.");
    }

    const result = buildAmountQr({
      payload: body.payload,
      amount: body.amount,
      reference: body.reference,
    });

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    if (error instanceof DeshiQrError) {
      return fail(error.code, error.message);
    }
    console.error("qr: unhandled error", error);
    return fail("INTERNAL", "Unexpected server error.");
  }
}

Deno.serve(handleRequest);

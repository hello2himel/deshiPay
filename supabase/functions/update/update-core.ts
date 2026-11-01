/**
 * deshiQR `update` core: the single job of the stateless edge function.
 *
 * Take a Bangla QR payload and edits (named aliases or tag paths), return the
 * updated payload plus the warnings that were surfaced. With empty/omitted edits
 * the function is validate-only: it returns the same payload and its warnings.
 *
 * This module is pure TypeScript (no Deno globals, no I/O) so it can be tested
 * with `node --test` as well as deployed on Supabase. Everything it needs comes
 * from the vendored payload core in `../_vendor/core`.
 */
import {
  DeshiQrError,
  MAX_PAYLOAD_LENGTH,
  update,
  validate,
  type DeshiQrCode,
  type DeshiQrIssue,
} from "../_vendor/core/index.ts";

/** A request body bigger than this is abuse, not a QR payload. */
export const MAX_BODY_BYTES = 16 * 1024;

/** Default CORS origin; can be overridden with `DESHIQR_CORS_ORIGIN`. */
export const CORS_DEFAULT_ORIGIN = "*";

export { MAX_PAYLOAD_LENGTH };

/** Which warnings to return: all, none, or hide matching tag paths. */
export type WarningFilter = boolean | string[];

/** Successful core result (HTTP 200). */
export interface UpdateCoreResult {
  ok: true;
  payload: string;
  warnings: DeshiQrIssue[];
}

/** Failed core result shape (HTTP 4xx/5xx). */
export interface UpdateCoreFailure {
  ok: false;
  error: { code: string; message: string; tag?: string };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceWarnings(value: unknown): WarningFilter | undefined {
  if (value === undefined) return undefined;
  if (value === true || value === false) return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value as string[];
  }
  throw new DeshiQrError("BAD_VALUE", "warnings must be true, false or an array of tag paths.");
}

/**
 * The whole edge-function job, pure and Deno-free.
 *
 * @throws {DeshiQrError} with a stable code for any invalid input. The HTTP
 * wrapper maps `UNSUPPORTED` to 413 and every other code to 400.
 */
export function updateCore(input: unknown): UpdateCoreResult {
  if (!isPlainObject(input)) {
    throw new DeshiQrError("BAD_VALUE", "Request body must be a JSON object.");
  }

  const payload = input.payload;
  if (typeof payload !== "string" || payload.trim().length === 0) {
    throw new DeshiQrError("EMPTY_PAYLOAD", "The payload is empty.");
  }
  const text = payload.trim();
  if (text.length > MAX_PAYLOAD_LENGTH) {
    throw new DeshiQrError("UNSUPPORTED", "The payload is longer than 4096 characters.");
  }

  const warnings = coerceWarnings(input.warnings);
  const edits = input.edits;

  // Empty/omitted edits = validate-only: same payload, filtered warnings.
  const validateOnly =
    edits === undefined || edits === null || (isPlainObject(edits) && Object.keys(edits).length === 0);
  if (validateOnly) {
    const report = validate(text, warnings === undefined ? {} : { warnings });
    const first = report.errors[0];
    if (first) throw new DeshiQrError(first.code as DeshiQrCode, first.message, first.tag);
    return { ok: true, payload: text, warnings: report.warnings };
  }

  if (!isPlainObject(edits)) {
    throw new DeshiQrError("BAD_VALUE", "edits must be an object of tag paths/aliases.");
  }

  const collected: DeshiQrIssue[] = [];
  const result = update(text, edits as Record<string, string | number | null>, {
    warnings: warnings as boolean | string[] | undefined,
    onWarning: (issue) => collected.push(issue),
  });
  return { ok: true, payload: result, warnings: collected };
}

/** Options for the HTTP handler. */
export interface HandlerOptions {
  /** Value for `access-control-allow-origin`. Defaults to `*`. */
  corsOrigin?: string;
}

function corsHeaders(origin: string): Headers {
  const headers = new Headers();
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("access-control-max-age", "86400");
  if (origin !== "*") headers.set("vary", "origin");
  return headers;
}

function jsonResponse(body: unknown, status: number, origin: string): Response {
  const headers = corsHeaders(origin);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  origin: string,
  tag?: string,
): Response {
  const error = tag === undefined ? { code, message } : { code, message, tag };
  return jsonResponse({ ok: false, error }, status, origin);
}

/** `UNSUPPORTED` is the only size-related error and maps to 413. */
function statusFor(code: string): number {
  return code === "UNSUPPORTED" ? 413 : 400;
}

/**
 * HTTP wrapper for `updateCore`: request parsing, CORS, size limits and status
 * mapping. Works at `/functions/v1/update` (Supabase) and `/update` (local
 * `supabase functions serve`).
 */
export async function handleUpdateRequest(
  request: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const origin = options.corsOrigin ?? CORS_DEFAULT_ORIGIN;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const url = new URL(request.url);
  const route = url.pathname.replace(/\/+$/, "");
  if (route !== "" && !route.endsWith("/update")) {
    return errorResponse("NOT_FOUND", "Unknown route. POST /functions/v1/update.", 404, origin);
  }

  if (request.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Use POST with a JSON body.", 405, origin);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return errorResponse("BAD_REQUEST", "Could not read the request body.", 400, origin);
  }
  if (raw.length > MAX_BODY_BYTES || new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return errorResponse("UNSUPPORTED", "Request body is larger than 16 KB.", 413, origin);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse("BAD_REQUEST", "Request body must be valid JSON.", 400, origin);
  }
  if (!isPlainObject(body)) {
    return errorResponse("BAD_REQUEST", "Request body must be a JSON object.", 400, origin);
  }

  try {
    return jsonResponse(updateCore(body), 200, origin);
  } catch (error) {
    if (DeshiQrError.is(error)) {
      return errorResponse(error.code, error.message, statusFor(error.code), origin, error.tag);
    }
    console.error("update: unhandled error", error);
    return errorResponse("INTERNAL", "Unexpected server error.", 500, origin);
  }
}

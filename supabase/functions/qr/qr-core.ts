/**
 * deshiQR amount→QR core: the single job of the `qr` edge function.
 *
 * Take a merchant's **static Bangla QR payload** and an **amount**, return the
 * derived dynamic payload and its QR SVG.
 *
 * Provider-agnostic by construction: derivation edits only
 *
 *   - tag `01` (point of initiation): `11` static → `12` dynamic, and
 *   - tag `54` (amount): inserted/replaced in ascending tag order,
 *   - tag `62/01` (reference): only when an explicit `reference` is supplied.
 *
 * Every other field — account template `26` (including the provider AID and any
 * provider-specific sub-tags), MCC `52`, currency `53`, country `58`, name `59`,
 * city `60`, tokens `80`/`81`, other `62` sub-tags — is carried over verbatim and
 * re-sealed with CRC-16/CCITT-FALSE. There is no bKash/NPSB-specific code here.
 *
 * This module is pure TypeScript (no Deno globals, no I/O) so it can be tested
 * with `node --test` as well as deployed on Supabase.
 */
import {
  DeshiQrError,
  MAX_AMOUNT,
  TAGS,
  amountToField,
  parse,
  referenceFrom,
  verifyChecksum,
  withAmount,
} from "../_vendor/core/index.ts";
import { encode, toSvg } from "../_vendor/qr/index.ts";

/** Payloads are a few hundred characters; anything huge is not a Bangla QR. */
export const MAX_PAYLOAD_LENGTH = 4096;

const REFERENCE_RE = /^[\x20-\x7E]{1,32}$/;

export interface AmountQrInput {
  /** The merchant's static (or any) Bangla QR payload. */
  payload: unknown;
  /** Amount in BDT: number or numeric string, 0.01 – 99,999,999.99, max 2 decimals. */
  amount: unknown;
  /** Optional payment reference (bill number) to embed. Omit to keep whatever the payload has. */
  reference?: unknown;
}

export interface AmountQrResult {
  /** The derived dynamic payload (tag 01 = 12, tag 54 = amount). */
  payload: string;
  amount: number;
  amountText: string;
  reference: string | null;
  /** Self-contained SVG string; render it directly or wrap it in a data URL. */
  qr_svg: string;
}

/**
 * Coerces the amount without silently rounding: `12.345` is rejected rather than
 * turned into `12.35`. Mirrors the TypeScript library's `amountToField` rules.
 */
export function coerceAmount(value: unknown): number {
  let numeric: number;
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) {
      throw new DeshiQrError(
        "BAD_AMOUNT",
        "amount must be a number between 0.01 and 99999999.99 BDT with at most 2 decimals.",
      );
    }
    numeric = Number(text);
  } else if (typeof value === "number") {
    numeric = value;
  } else {
    throw new DeshiQrError(
      "BAD_AMOUNT",
      "amount must be a number between 0.01 and 99999999.99 BDT with at most 2 decimals.",
    );
  }

  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_AMOUNT) {
    throw new DeshiQrError("BAD_AMOUNT", "amount must be a number between 0.01 and 99999999.99 BDT.");
  }
  const cents = Math.round(numeric * 100);
  // Reject 0.001-style values instead of rounding them behind the caller's back.
  if (Math.abs(numeric * 100 - cents) > 1e-6 || cents < 1) {
    throw new DeshiQrError("BAD_AMOUNT", "amount may have at most 2 decimals.");
  }
  return cents / 100;
}

function coerceReference(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !REFERENCE_RE.test(value)) {
    throw new DeshiQrError("BAD_REFERENCE", "reference must be 1–32 printable ASCII characters.");
  }
  return value;
}

/**
 * Builds the dynamic payload and QR SVG for an amount.
 *
 * Validation is intentionally generic: TLV well-formedness + CRC only. It does
 * **not** require a known provider/institution AID, bKash tokens, or an MCC —
 * reading merchant semantics (`decode`) is a separate, provider-verified feature.
 *
 * @throws DeshiQrError with a stable `code` on any invalid input.
 */
export function buildAmountQr(input: AmountQrInput): AmountQrResult {
  const raw = typeof input.payload === "string" ? input.payload : "";
  const payload = raw.trim();

  if (payload.length === 0) {
    throw new DeshiQrError(
      "EMPTY_PAYLOAD",
      "payload is required: send the merchant's static Bangla QR payload.",
    );
  }
  if (payload.length > MAX_PAYLOAD_LENGTH) {
    throw new DeshiQrError(
      "UNSUPPORTED",
      `payload is longer than ${MAX_PAYLOAD_LENGTH} characters; that is not a Bangla QR payload.`,
    );
  }

  // Generic structure checks only — no provider assumptions.
  const fields = parse(payload); // throws BAD_TLV
  const last = fields[fields.length - 1];
  if (!last || last.tag !== TAGS.CRC) {
    throw new DeshiQrError("MISSING_FIELD", "payload does not end with a checksum (tag 63).", TAGS.CRC);
  }
  if (!verifyChecksum(payload)) {
    throw new DeshiQrError(
      "CHECKSUM_MISMATCH",
      "payload checksum does not match; the QR may be damaged or not a Bangla QR.",
      TAGS.CRC,
    );
  }

  const amount = coerceAmount(input.amount);
  const reference = coerceReference(input.reference);

  const derived =
    reference === null
      ? withAmount(payload, amount, { keepExistingReference: true })
      : withAmount(payload, amount, { reference });

  const matrix = encode(derived, { level: "M" });
  const qr_svg = toSvg(matrix, { margin: 4, scale: 8 });

  return {
    payload: derived,
    amount,
    amountText: amountToField(amount),
    reference: referenceFrom(derived),
    qr_svg,
  };
}

// GENERATED FILE - do not edit.
// Source: packages/{core,qr}/src
// Regenerate with: node scripts/vendor-edge.mjs
import { DeshiQrError } from "./errors.ts";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/**
 * Default generated reference length.
 *
 * Real bKash dynamic QRs carry a 25-character bill number (tag 62/01, making the
 * tag 62 field 35 characters long), so that is the shape we generate by default.
 */
export const DEFAULT_REFERENCE_LENGTH = 25;

export interface ReferenceOptions {
  /** Keep this prefix and fill the rest with random characters. */
  prefix?: string;
  /** Total reference length. Defaults to 10 (the length bKash uses in practice). */
  length?: number;
}

function randomIndex(max: number): number {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new DeshiQrError(
      "UNSUPPORTED",
      "crypto.getRandomValues is required to generate references. Pass an explicit reference instead.",
    );
  }
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(256 / max) * max;
  const buffer = new Uint8Array(1);
  let value = 0;
  do {
    cryptoObj.getRandomValues(buffer);
    value = buffer[0] ?? 0;
  } while (value >= limit);
  return value % max;
}

/**
 * Generate a payment reference: a prefix plus cryptographically random
 * alphanumeric characters, e.g. `newReference({ prefix: "FT80" })` → `FT80k2Q9xZ1`.
 *
 * References are what let a merchant match a payment to an order. They are not
 * secrets; they are printed on receipts and encoded in the QR.
 */
export function newReference(options: ReferenceOptions = {}): string {
  const length = options.length ?? DEFAULT_REFERENCE_LENGTH;
  const prefix = options.prefix ?? "";

  if (!Number.isInteger(length) || length < 1 || length > 32) {
    throw new DeshiQrError("BAD_REFERENCE", "Reference length must be an integer between 1 and 32.");
  }
  if (!/^[A-Za-z0-9]{0,32}$/.test(prefix)) {
    throw new DeshiQrError("BAD_REFERENCE", "A reference prefix may only contain letters and digits.");
  }
  if (prefix.length > length) {
    throw new DeshiQrError(
      "BAD_REFERENCE",
      `Reference prefix "${prefix}" is longer than the requested length ${length}.`,
    );
  }

  let reference = prefix;
  while (reference.length < length) {
    reference += ALPHABET[randomIndex(ALPHABET.length)];
  }
  return reference;
}

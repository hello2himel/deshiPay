// GENERATED FILE - do not edit.
// Source: packages/deshiqr/src/{core,qr}
// Regenerate with: node scripts/vendor-edge.mjs
import { DeshiQrError } from "./errors.ts";

/** Largest amount deshiQR will put in a QR (BDT). */
export const MAX_AMOUNT = 99_999_999.99;

const AMOUNT_RE = /^\d{1,10}(?:\.\d{1,2})?$/;

/** Format an amount for tag 54: `500` -> `"500.00"`. */
export function amountToField(amount: number): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new DeshiQrError("BAD_AMOUNT", "Amount must be a finite number.");
  }
  if (amount <= 0) {
    throw new DeshiQrError("BAD_AMOUNT", "Amount must be greater than zero.");
  }
  if (amount > MAX_AMOUNT) {
    throw new DeshiQrError("BAD_AMOUNT", `Amount must not exceed ${MAX_AMOUNT}.`);
  }
  const text = (Math.round(amount * 100) / 100).toFixed(2);
  if (text.length > 13) {
    throw new DeshiQrError("BAD_AMOUNT", "Amount is too large for the format.");
  }
  return text;
}

/** Parse tag 54 back into a number: `"500.00"` -> `500`. */
export function parseAmountField(text: string): number {
  if (typeof text !== "string" || !AMOUNT_RE.test(text)) {
    throw new DeshiQrError("BAD_AMOUNT", `Invalid amount field "${text}".`, text);
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new DeshiQrError("BAD_AMOUNT", `Amount "${text}" is out of range.`, text);
  }
  return amount;
}

export interface FormatTakaOptions {
  /** Include the ৳ symbol. Default true. */
  symbol?: boolean;
  /** Force a number of decimals. Default: none for whole amounts, two otherwise. */
  decimals?: number;
}

/** Human-friendly BDT amount: `formatTaka(1250.5)` -> `"৳1,250.50"`. */
export function formatTaka(amount: number, options: FormatTakaOptions = {}): string {
  const { symbol = true } = options;
  const decimals = options.decimals ?? (Number.isInteger(amount) ? 0 : 2);
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return symbol ? `৳${formatted}` : formatted;
}

/**
 * Mask an account for display: `"01000000000"` -> `"01000•••000"`.
 * The full account stays in the payload (it is printed on shop walls); masking is
 * only about not putting it in screenshots and page titles.
 */
export function maskAccount(account: string): string {
  if (typeof account !== "string" || account.length === 0) return "";
  if (account.length <= 4) return "•".repeat(account.length);
  if (account.length <= 7) return account.slice(0, 2) + "•".repeat(account.length - 4) + account.slice(-2);
  return account.slice(0, 5) + "•••" + account.slice(-3);
}

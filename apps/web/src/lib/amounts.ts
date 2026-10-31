/**
 * Amount and preset parsing for the hosted app.
 *
 * Kept dependency-free (only `deshiqr` for formatting constants) so it can be
 * unit-tested with `node --test` without a DOM.
 */
import { MAX_AMOUNT, formatTaka, type FormatTakaOptions } from "deshiqr";

export { MAX_AMOUNT };
export type { FormatTakaOptions };

export const MAX_PRESETS = 6;

/** Strip currency symbols, thousands separators and whitespace. */
export function cleanAmountText(value: string): string {
  return value.replace(/[\s৳,]/g, "").replace(/^(?:tk|bdt)/i, "");
}

/** Parse "1,250.50", "৳500" or " 100 " into a number; `null` when unusable. */
export function parseAmountText(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = cleanAmountText(String(value));
  if (!text) return null;
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) return null;
  return normalizeAmount(Number(text));
}

/** Round to paisa, reject non-positive/non-finite/too-large amounts. */
export function normalizeAmount(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? parseAmountText(value) : null;
  if (number === null || !Number.isFinite(number)) return null;
  if (number <= 0 || number > MAX_AMOUNT) return null;
  return Math.round(number * 100) / 100;
}

/** `"100, 500, 1000"` → `[100, 500, 1000]` (unique, positive, capped). */
export function parsePresets(
  value: string | null | undefined,
  options: { max?: number; maxAmount?: number } = {},
): number[] {
  if (value === null || value === undefined) return [];
  const max = options.max ?? MAX_PRESETS;
  const maxAmount = options.maxAmount ?? MAX_AMOUNT;
  const out: number[] = [];
  for (const part of value.split(/[\s,]+/)) {
    if (!part) continue;
    const amount = parseAmountText(part);
    if (amount === null || amount > maxAmount || out.includes(amount)) continue;
    out.push(amount);
    if (out.length >= max) break;
  }
  return out;
}

/** `[100, 500]` → `"100,500"`. */
export function formatPresets(presets: readonly number[]): string {
  return presets.map((amount) => String(amount)).join(",");
}

/** Format BDT for UI; never throws. */
export function taka(amount: number | null | undefined, options?: FormatTakaOptions): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  return formatTaka(amount, options);
}

/** Validate the amount a merchant wants to lock into a link. */
export function validateLockedAmount(
  value: number | null,
  options: { required?: boolean } = {},
): string | null {
  if (value === null) {
    return options.required ? "Enter an amount greater than zero." : null;
  }
  if (value > MAX_AMOUNT) return "The largest amount a Bangla QR can carry is ৳99,999,999.99.";
  return null;
}

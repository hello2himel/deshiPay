/**
 * Pure helpers for `<deshiqr-pay>`.
 *
 * Everything in this file is DOM-free and network-free so it can be unit-tested
 * with `node --test` (there is no jsdom in this repo). The custom element in
 * `index.ts` only ever calls into these functions.
 */
import {
  DeshiQrError,
  MAX_AMOUNT,
  assertReference,
  newReference,
  toStatic,
  withAmount,
} from "../core/index.ts";

/** Public copy shown under the panel. Never overclaim provider support. */
export const PROVIDER_FOOTNOTE = "Bangla QR · bKash verified, more providers planned";
export const PROVIDER_HINT = "Pay with bKash or any app that supports Bangla QR.";

export type ThemeName = "auto" | "light" | "dark";

/** Default generated-reference length when `ref-length` is absent: no reference. */
export const DEFAULT_REF_LENGTH = 0;
export const MAX_PRESETS = 6;
export const DEFAULT_QR_SIZE = 280;
export const MIN_QR_SIZE = 96;
export const MAX_QR_SIZE = 1024;

/* ------------------------------------------------------------------------- */
/* Numbers and amounts                                                       */
/* ------------------------------------------------------------------------- */

/** Strip currency symbols, thousands separators and whitespace from user text. */
export function cleanAmountText(value: string): string {
  return value.replace(/[\s৳,]/g, "").replace(/^(?:tk|bdt)/i, "");
}

/**
 * Parse a human amount ("1,250.50", "৳500", " 100 ") into a number.
 * Returns `null` for empty, non-numeric, or out-of-range values — callers decide
 * whether that is an error or "no amount".
 */
export function parseAmountText(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = cleanAmountText(String(value));
  if (!text) return null;
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) return null;
  return normalizeAmount(Number(text));
}

/** Round to 2dp and reject non-positive / non-finite / too-large amounts. */
export function normalizeAmount(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseAmountText(value)
        : null;
  if (number === null || !Number.isFinite(number)) return null;
  if (number <= 0 || number > MAX_AMOUNT) return null;
  return Math.round(number * 100) / 100;
}

/** Parse a `presets` attribute: `"100, 500, 1000"` → `[100, 500, 1000]`. */
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
    if (amount === null || amount > maxAmount) continue;
    if (out.includes(amount)) continue;
    out.push(amount);
    if (out.length >= max) break;
  }
  return out;
}

/** Serialise presets for attributes/links: `[100, 500]` → `"100,500"`. */
export function formatPresets(presets: readonly number[]): string {
  return presets.map((amount) => String(amount)).join(",");
}

/* ------------------------------------------------------------------------- */
/* Attribute parsing                                                         */
/* ------------------------------------------------------------------------- */

/** `bare`, `lock-amount`: presence means true; `"false"`/`"0"` means false. */
export function parseBooleanAttribute(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const text = value.trim().toLowerCase();
  if (text === "" || text === "bare" || text === "lock-amount") return true;
  return text !== "false" && text !== "0" && text !== "no" && text !== "off";
}

/** Clamp the QR pixel size to something sane. Defaults to 280px. */
export function parseSize(value: string | null | undefined, fallback = DEFAULT_QR_SIZE): number {
  if (value === null || value === undefined || value.trim() === "") return fallback;
  const size = Number.parseInt(value, 10);
  if (!Number.isFinite(size)) return fallback;
  return Math.min(MAX_QR_SIZE, Math.max(MIN_QR_SIZE, Math.round(size)));
}

/** Parse `theme`; anything unknown falls back to `auto`. */
export function parseTheme(value: string | null | undefined): ThemeName {
  const text = value?.trim().toLowerCase();
  if (text === "light" || text === "dark") return text;
  return "auto";
}

/** Parse `ref-length`: integer 0–32 (0 disables generated references). */
export function parseRefLength(value: string | null | undefined, fallback = DEFAULT_REF_LENGTH): number {
  if (value === null || value === undefined || value.trim() === "") return fallback;
  const length = Number.parseInt(value, 10);
  if (!Number.isFinite(length)) return fallback;
  return Math.min(32, Math.max(0, length));
}

/** A reference embeds verbatim in tag 62/01: 1–32 printable ASCII characters. */
export function isValidReference(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[\x20-\x7E]{1,32}$/.test(value);
}

/** Normalise an optional string attribute: trimmed, empty becomes `null`. */
export function optionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

/** Same, but for CSS identifiers-ish hints such as ref prefixes. */
export function cleanRefPrefix(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return /^[A-Za-z0-9]{0,32}$/.test(text) ? text : "";
}

/**
 * Everything the element reads off its attributes.
 *
 * `presetsSpecified` distinguishes "attribute missing" (fall back to config)
 * from `presets=""` (explicitly no presets).
 */
export interface PayAttributes {
  payload: string | null;
  configUrl: string | null;
  amount: number | null;
  lockAmount: boolean;
  reference: string | null;
  refPrefix: string;
  refLength: number;
  title: string | null;
  note: string | null;
  presets: number[];
  presetsSpecified: boolean;
  theme: ThemeName;
  size: number;
  bare: boolean;
}

/**
 * Parse attributes through a getter. Used by the element (`this.getAttribute`)
 * and by tests (a plain object lookup).
 */
export function parsePayAttributes(get: (name: string) => string | null): PayAttributes {
  const rawPresets = get("presets");
  const explicitReference = optionalText(get("reference"));
  return {
    payload: optionalText(get("payload")),
    configUrl: optionalText(get("config-url")),
    amount: parseAmountText(get("amount")),
    lockAmount: parseBooleanAttribute(get("lock-amount")),
    reference: isValidReference(explicitReference) ? explicitReference : null,
    refPrefix: cleanRefPrefix(get("ref-prefix")),
    refLength: parseRefLength(get("ref-length")),
    title: optionalText(get("title")),
    note: optionalText(get("note")),
    presets: parsePresets(rawPresets),
    presetsSpecified: rawPresets !== null,
    theme: parseTheme(get("theme")),
    size: parseSize(get("size")),
    bare: parseBooleanAttribute(get("bare")),
  };
}

/* ------------------------------------------------------------------------- */
/* config-url                                                                */
/* ------------------------------------------------------------------------- */

/** JSON shape accepted from `config-url`. Kept tiny on purpose. */
export interface PayConfig {
  basePayload: string | null;
  title: string | null;
  note: string | null;
  presets: number[];
  refPrefix: string;
  refLength: number;
}

function pickString(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/**
 * Tolerant parser for the JSON fetched from `config-url`.
 * Accepts both snake_case (the documented wire format) and camelCase keys.
 * Throws a `DeshiQrError` when the body is not a JSON object.
 */
export function parseConfig(raw: unknown): PayConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DeshiQrError("BAD_TLV", "config-url must return a JSON object.");
  }
  const source = raw as Record<string, unknown>;
  const base = pickString(source, "base_payload", "basePayload", "payload");
  if (base !== null && base.length > 4096) {
    throw new DeshiQrError("UNSUPPORTED", "The config payload is too long to be a Bangla QR.");
  }
  const presetsRaw = source.presets;
  const presets =
    typeof presetsRaw === "string"
      ? parsePresets(presetsRaw)
      : Array.isArray(presetsRaw)
        ? parsePresets(presetsRaw.map((value) => String(value)).join(","))
        : [];
  const refPrefixRaw = pickString(source, "ref_prefix", "refPrefix");
  return {
    basePayload: base,
    title: pickString(source, "title", "name"),
    note: pickString(source, "note"),
    presets,
    refPrefix: refPrefixRaw === null ? "" : cleanRefPrefix(refPrefixRaw),
    refLength: parseRefLength(
      typeof source.ref_len === "number" || typeof source.ref_len === "string"
        ? String(source.ref_len)
        : typeof source.refLength === "number" || typeof source.refLength === "string"
          ? String(source.refLength)
          : null,
    ),
  };
}

/* ------------------------------------------------------------------------- */
/* Effective settings                                                        */
/* ------------------------------------------------------------------------- */

/** Settings after merging attributes over optional config-url JSON. */
export interface PaySettings {
  basePayload: string;
  title: string | null;
  note: string | null;
  presets: number[];
  amount: number | null;
  lockAmount: boolean;
  reference: string | null;
  refPrefix: string;
  refLength: number;
  theme: ThemeName;
  size: number;
  bare: boolean;
}

/** Attribute values win over config-url values; config only fills the gaps. */
export function resolveSettings(attributes: PayAttributes, config: PayConfig | null): PaySettings {
  return {
    basePayload: attributes.payload ?? config?.basePayload ?? "",
    title: attributes.title ?? config?.title ?? null,
    note: attributes.note ?? config?.note ?? null,
    presets:
      attributes.presetsSpecified || config === null
        ? attributes.presets
        : config.presets.length > 0
          ? config.presets
          : attributes.presets,
    amount: attributes.amount,
    lockAmount: attributes.lockAmount,
    reference: attributes.reference,
    refPrefix: attributes.refPrefix || config?.refPrefix || "",
    refLength: attributes.refLength || config?.refLength || 0,
    theme: attributes.theme,
    size: attributes.size,
    bare: attributes.bare,
  };
}

/* ------------------------------------------------------------------------- */
/* Payload derivation                                                        */
/* ------------------------------------------------------------------------- */

export interface PayBuildInput {
  base: string;
  amount?: number | null;
  /** Explicit `reference` attribute / config value. */
  reference?: string | null;
  refPrefix?: string;
  refLength?: number;
  /** A reference already generated for this amount; keeps it stable across renders. */
  currentReference?: string | null;
}

export interface PayBuildResult {
  payload: string;
  amount: number | null;
  reference: string | null;
  kind: "static" | "dynamic";
}

/**
 * Derive the payload for the current amount.
 *
 * - no amount → static payload (`toStatic`), no reference
 * - amount → dynamic payload via core `withAmount`
 * - reference: explicit wins, else `currentReference`, else a fresh generated
 *   one when `refLength > 0`, else none
 */
export function buildPayPayload(input: PayBuildInput): PayBuildResult {
  const base = (input.base ?? "").trim();
  if (!base) {
    throw new DeshiQrError("EMPTY_PAYLOAD", "A Bangla QR payload is required before this panel can render.");
  }

  const amount = normalizeAmount(input.amount ?? null);
  if (amount === null) {
    return { payload: toStatic(base), amount: null, reference: null, kind: "static" };
  }

  let reference: string | null = null;
  if (isValidReference(input.reference)) {
    assertReference(input.reference);
    reference = input.reference;
  } else if (isValidReference(input.currentReference)) {
    assertReference(input.currentReference);
    reference = input.currentReference;
  } else if ((input.refLength ?? 0) > 0) {
    reference = newReference({ prefix: input.refPrefix ?? "", length: input.refLength });
  }

  const payload = withAmount(base, amount, { reference });
  return { payload, amount, reference, kind: "dynamic" };
}

/**
 * Should the existing generated reference be regenerated for a new amount?
 * Generated references identify one order: a different amount is a different
 * order, so it gets a fresh reference.
 */
export function shouldRegenerateReference(
  current: { reference: string | null; amount: number | null },
  nextAmount: number | null,
): boolean {
  return current.reference !== null && current.amount !== nextAmount;
}

/** A safe, short filename for the PNG download. */
export function pngFilename(result: Pick<PayBuildResult, "amount" | "reference">, prefix = "deshiqr-pay"): string {
  const parts = [prefix];
  if (result.amount !== null) parts.push(String(result.amount).replace(".", "-"));
  if (result.reference) parts.push(result.reference.replace(/[^A-Za-z0-9_-]+/g, "").slice(0, 32));
  return `${parts.filter(Boolean).join("-")}.png`;
}

/** Human description of the current amount state, e.g. for aria-live. */
export function amountSummary(amount: number | null, formatted?: (value: number) => string): string {
  if (amount === null) return "No amount set — the customer types the amount.";
  const text = formatted ? formatted(amount) : String(amount);
  return `Amount ${text} BDT.`;
}

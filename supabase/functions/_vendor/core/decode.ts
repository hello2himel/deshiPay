// GENERATED FILE - do not edit.
// Source: packages/{core,qr}/src
// Regenerate with: node scripts/vendor-edge.mjs
import { crc16 } from "./crc.ts";
import { DeshiQrError } from "./errors.ts";
import { type Field, TAGS, findValue, normalize, parse, parseSubfields } from "./tlv.ts";

/** Largest amount accepted by deshiQR (BDT). */
export const MAX_AMOUNT = 99_999_999.99;

const AMOUNT_RE = /^\d{1,10}(?:\.\d{1,2})?$/;

/** ISO 4217 numeric codes seen in Bangla QR payloads. */
const CURRENCIES: Record<string, string> = {
  "050": "BDT",
  "356": "INR",
  "764": "THB",
  "840": "USD",
  "978": "EUR",
};

/**
 * Institutions (tag 26 sub-tag 00) we know about.
 *
 * `verified: true` means deshiQR's decoder has been validated against real
 * payloads from that scheme and the tests pin the behaviour. Today only the NPSB
 * Bangla QR scheme (the one bKash issues) is verified. The parser is generic, but
 * we do not claim support for providers we have not seen real payloads from.
 */
export const KNOWN_INSTITUTIONS: Record<string, { id: string; label: string; verified: boolean }> = {
  "bd.org.bb.npsb": { id: "npsb", label: "NPSB Bangla QR", verified: true },
};

export function institutionOf(qr: DecodedQr): { id: string; label: string; verified: boolean } | null {
  return KNOWN_INSTITUTIONS[qr.merchant.institution] ?? null;
}

/** Merchant (payee) details, taken verbatim from the QR. */
export interface MerchantDetails {
  name: string;
  city: string | null;
  account: string;
  institution: string;
  mcc: string | null;
}

/** A verified, decoded Bangla QR payload. */
export interface DecodedQr {
  payload: string;
  kind: "static" | "dynamic";
  amount: number | null;
  amountText: string | null;
  currency: string | null;
  country: string | null;
  merchant: MerchantDetails;
  reference: string | null;
  customerLabel: string | null;
  additionalData: Field[];
  accountTemplate: Field[];
  tokens: { tag80: string | null; tag81: string | null };
  fields: Field[];
  checksum: string;
}

function readAmount(fields: readonly Field[]): { value: number | null; text: string | null } {
  const text = findValue(fields, TAGS.AMOUNT);
  if (text === null) return { value: null, text: null };
  if (!AMOUNT_RE.test(text)) {
    throw new DeshiQrError("BAD_AMOUNT", `Invalid amount "${text}".`, text);
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) {
    throw new DeshiQrError("BAD_AMOUNT", `Amount "${text}" is out of range.`, text);
  }
  return { value, text };
}

function readAccount(fields: readonly Field[]): { account: string; institution: string; template: Field[] } {
  const templateValue = findValue(fields, TAGS.ACCOUNT);
  if (templateValue === null) {
    throw new DeshiQrError("NOT_A_BANGLA_QR", "Missing the account template (tag 26).", TAGS.ACCOUNT);
  }

  let template: Field[];
  try {
    template = parseSubfields(templateValue);
  } catch {
    throw new DeshiQrError("BAD_TLV", "The account template (tag 26) is not valid TLV.", TAGS.ACCOUNT);
  }

  const institution = findValue(template, "00");
  const account = findValue(template, "03");

  if (!institution) {
    throw new DeshiQrError(
      "NOT_A_BANGLA_QR",
      "The account template has no institution identifier (tag 26/00).",
      TAGS.ACCOUNT,
    );
  }
  if (!account) {
    throw new DeshiQrError(
      "NOT_A_BANGLA_QR",
      "The account template has no account identifier (tag 26/03).",
      TAGS.ACCOUNT,
    );
  }

  return { account, institution, template };
}

/**
 * Decode a payload, verifying its checksum and required fields.
 * Throws `DeshiQrError` on any problem; use `decodeSafe` or `validate` for a
 * non-throwing surface.
 */
export function decode(payload: string): DecodedQr {
  const text = normalize(payload);
  const fields = parse(text);

  const checksumField = fields[fields.length - 1];
  if (!checksumField || checksumField.tag !== TAGS.CRC) {
    throw new DeshiQrError("MISSING_FIELD", "The payload does not end with a checksum (tag 63).", TAGS.CRC);
  }
  if (!/^[0-9A-Fa-f]{4}$/.test(checksumField.value)) {
    throw new DeshiQrError("BAD_TLV", "The checksum must be four hexadecimal characters.", TAGS.CRC);
  }
  const expected = checksumField.value.toUpperCase();
  if (crc16(text.slice(0, -4)) !== expected) {
    throw new DeshiQrError(
      "CHECKSUM_MISMATCH",
      "The checksum does not match. This QR may be damaged or not a Bangla QR.",
      TAGS.CRC,
    );
  }

  const initiation = findValue(fields, TAGS.INITIATION);
  if (initiation === null) {
    throw new DeshiQrError("MISSING_FIELD", "Missing the point-of-initiation tag (tag 01).", TAGS.INITIATION);
  }
  if (initiation !== "11" && initiation !== "12") {
    throw new DeshiQrError("UNSUPPORTED", `Unknown point of initiation "${initiation}".`, initiation);
  }

  const name = findValue(fields, TAGS.NAME);
  if (!name) {
    throw new DeshiQrError("NOT_A_BANGLA_QR", "The payload has no merchant name (tag 59).", TAGS.NAME);
  }

  const { account, institution, template } = readAccount(fields);
  const { value: amount, text: amountText } = readAmount(fields);

  let additionalData: Field[] = [];
  let reference: string | null = null;
  let customerLabel: string | null = null;
  const additionalValue = findValue(fields, TAGS.ADDITIONAL);
  if (additionalValue !== null) {
    try {
      additionalData = parseSubfields(additionalValue);
    } catch {
      throw new DeshiQrError("BAD_TLV", "The additional data template (tag 62) is not valid TLV.", TAGS.ADDITIONAL);
    }
    reference = findValue(additionalData, "01");
    customerLabel = findValue(additionalData, "06");
  }

  const rawCurrency = findValue(fields, TAGS.CURRENCY);
  const currency = rawCurrency === null ? null : (CURRENCIES[rawCurrency] ?? rawCurrency);

  return {
    payload: text,
    kind: initiation === "12" ? "dynamic" : "static",
    amount,
    amountText,
    currency,
    country: findValue(fields, TAGS.COUNTRY),
    merchant: {
      name,
      city: findValue(fields, TAGS.CITY),
      account,
      institution,
      mcc: findValue(fields, TAGS.MCC),
    },
    reference,
    customerLabel,
    additionalData,
    accountTemplate: template,
    tokens: {
      tag80: findValue(fields, TAGS.TOKEN_80),
      tag81: findValue(fields, TAGS.TOKEN_81),
    },
    fields,
    checksum: expected,
  };
}

/** Non-throwing decode. */
export function decodeSafe(
  payload: string,
): { ok: true; qr: DecodedQr } | { ok: false; error: DeshiQrError } {
  try {
    return { ok: true, qr: decode(payload) };
  } catch (error) {
    if (DeshiQrError.is(error)) return { ok: false, error };
    return {
      ok: false,
      error: new DeshiQrError("UNSUPPORTED", error instanceof Error ? error.message : "Unknown error"),
    };
  }
}

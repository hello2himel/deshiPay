import { crc16 } from "./crc.ts";
import { DeshiQrError, type DeshiQrCode } from "./errors.ts";
import { decode, type DecodedQr, KNOWN_INSTITUTIONS } from "./decode.ts";
import { MAX_AMOUNT } from "./amount.ts";
import { TAGS, type Field, findValue, normalize, parse, parseSubfields } from "./tlv.ts";

export interface DeshiQrIssue {
  code: DeshiQrCode;
  message: string;
  tag?: string;
}

export interface ValidationReport {
  /** No errors. Warnings are allowed. */
  ok: boolean;
  errors: DeshiQrIssue[];
  warnings: DeshiQrIssue[];
  /** Best-effort decode; null when the payload could not be decoded at all. */
  qr: DecodedQr | null;
}

const AMOUNT_RE = /^\d{1,10}(?:\.\d{1,2})?$/;
const REFERENCE_RE = /^[\x20-\x7E]{1,32}$/;
const ACCOUNT_RE = /^[0-9A-Za-z]{4,34}$/;

function issue(code: DeshiQrCode, message: string, tag?: string): DeshiQrIssue {
  return tag === undefined ? { code, message } : { code, message, tag };
}

function safeSubfields(value: string): Field[] | null {
  try {
    return parseSubfields(value);
  } catch {
    return null;
  }
}

/**
 * Non-throwing, thorough validation. Collects every problem instead of stopping
 * at the first one, so a form can show everything that is wrong at once.
 */
export function validate(payload: string): ValidationReport {
  const errors: DeshiQrIssue[] = [];
  const warnings: DeshiQrIssue[] = [];
  const result = (qr: DecodedQr | null): ValidationReport => ({
    ok: errors.length === 0,
    errors,
    warnings,
    qr,
  });

  const text = normalize(payload);
  if (text.length === 0) {
    errors.push(issue("EMPTY_PAYLOAD", "Paste a Bangla QR payload first."));
    return result(null);
  }
  if (text.length > 4096) {
    errors.push(issue("UNSUPPORTED", "This is far too long to be a Bangla QR payload."));
    return result(null);
  }

  let fields: Field[];
  try {
    fields = parse(text);
  } catch (error) {
    errors.push(issue("BAD_TLV", error instanceof Error ? error.message : "Malformed payload."));
    return result(null);
  }

  // ---- checksum ---------------------------------------------------------
  const last = fields[fields.length - 1];
  let checksumOk = false;
  if (!last || last.tag !== TAGS.CRC) {
    errors.push(issue("MISSING_FIELD", "The payload does not end with a checksum (tag 63).", TAGS.CRC));
  } else if (!/^[0-9A-Fa-f]{4}$/.test(last.value)) {
    errors.push(issue("BAD_TLV", "The checksum must be four hexadecimal characters.", TAGS.CRC));
  } else if (crc16(text.slice(0, -4)) !== last.value.toUpperCase()) {
    errors.push(
      issue(
        "CHECKSUM_MISMATCH",
        "The checksum does not match, so this QR may be damaged or not a Bangla QR.",
        TAGS.CRC,
      ),
    );
  } else {
    checksumOk = true;
  }

  // ---- duplicates / ordering -------------------------------------------
  const seen = new Set<string>();
  for (const field of fields) {
    if (field.tag === TAGS.CRC) continue;
    if (seen.has(field.tag)) {
      warnings.push(issue("BAD_TLV", `Tag ${field.tag} appears more than once.`, field.tag));
    }
    seen.add(field.tag);
  }

  // ---- required and optional top-level fields --------------------------
  const format = findValue(fields, TAGS.FORMAT);
  if (format === null) warnings.push(issue("MISSING_FIELD", "Missing the format indicator (tag 00).", TAGS.FORMAT));
  else if (format !== "01") warnings.push(issue("UNSUPPORTED", `Unexpected format indicator "${format}".`, TAGS.FORMAT));

  const initiation = findValue(fields, TAGS.INITIATION);
  if (initiation === null) {
    errors.push(issue("MISSING_FIELD", "Missing the point-of-initiation tag (tag 01).", TAGS.INITIATION));
  } else if (initiation !== "11" && initiation !== "12") {
    errors.push(issue("UNSUPPORTED", `Unknown point of initiation "${initiation}".`, TAGS.INITIATION));
  }

  const accountValue = findValue(fields, TAGS.ACCOUNT);
  if (accountValue === null) {
    errors.push(issue("NOT_A_BANGLA_QR", "Missing the account template (tag 26).", TAGS.ACCOUNT));
  } else {
    const template = safeSubfields(accountValue);
    if (template === null) {
      errors.push(issue("BAD_TLV", "The account template (tag 26) is not valid TLV.", TAGS.ACCOUNT));
    } else {
      const institution = findValue(template, "00");
      const account = findValue(template, "03");
      if (!institution) {
        errors.push(
          issue("NOT_A_BANGLA_QR", "The account template has no institution identifier (tag 26/00).", TAGS.ACCOUNT),
        );
      } else if (!(institution in KNOWN_INSTITUTIONS)) {
        warnings.push(
          issue(
            "UNSUPPORTED",
            `Unrecognised institution "${institution}". Decoding generically; support is not verified for this provider yet.`,
            TAGS.ACCOUNT,
          ),
        );
      }
      if (!account) {
        errors.push(
          issue("NOT_A_BANGLA_QR", "The account template has no account identifier (tag 26/03).", TAGS.ACCOUNT),
        );
      } else if (!ACCOUNT_RE.test(account)) {
        errors.push(issue("NOT_A_BANGLA_QR", "The account identifier does not look valid.", TAGS.ACCOUNT));
      }
    }
  }

  const name = findValue(fields, TAGS.NAME);
  if (name === null) {
    errors.push(issue("NOT_A_BANGLA_QR", "The payload has no merchant name (tag 59).", TAGS.NAME));
  } else if (name.length === 0 || name.length > 25) {
    warnings.push(issue("BAD_TLV", "The merchant name should be 1–25 characters.", TAGS.NAME));
  }

  const city = findValue(fields, TAGS.CITY);
  if (city !== null && city.length > 15) {
    warnings.push(issue("BAD_TLV", "The merchant city should be at most 15 characters.", TAGS.CITY));
  }

  const currency = findValue(fields, TAGS.CURRENCY);
  if (currency === null) {
    warnings.push(issue("MISSING_FIELD", "Missing the currency (tag 53).", TAGS.CURRENCY));
  } else if (currency !== "050") {
    warnings.push(issue("UNSUPPORTED", `Currency is "${currency}", not BDT (050).`, TAGS.CURRENCY));
  }

  const country = findValue(fields, TAGS.COUNTRY);
  if (country === null) {
    warnings.push(issue("MISSING_FIELD", "Missing the country (tag 58).", TAGS.COUNTRY));
  } else if (country !== "BD") {
    warnings.push(issue("UNSUPPORTED", `Country is "${country}", not BD.`, TAGS.COUNTRY));
  }

  // ---- amount ----------------------------------------------------------
  const amountText = findValue(fields, TAGS.AMOUNT);
  if (amountText !== null) {
    if (!AMOUNT_RE.test(amountText)) {
      errors.push(issue("BAD_AMOUNT", `Invalid amount "${amountText}".`, TAGS.AMOUNT));
    } else {
      const amount = Number(amountText);
      if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
        errors.push(issue("BAD_AMOUNT", `Amount "${amountText}" is out of range.`, TAGS.AMOUNT));
      }
    }
    if (initiation === "11") {
      warnings.push(issue("BAD_TLV", "A static QR should not carry a fixed amount (tag 54).", TAGS.AMOUNT));
    }
  } else if (initiation === "12") {
    warnings.push(issue("BAD_TLV", "A dynamic QR usually carries an amount (tag 54).", TAGS.AMOUNT));
  }

  // ---- additional data / reference ------------------------------------
  const additionalValue = findValue(fields, TAGS.ADDITIONAL);
  if (additionalValue !== null) {
    const additional = safeSubfields(additionalValue);
    if (additional === null) {
      errors.push(issue("BAD_TLV", "The additional data template (tag 62) is not valid TLV.", TAGS.ADDITIONAL));
    } else if (additional.length === 0) {
      warnings.push(issue("BAD_TLV", "The additional data template (tag 62) is empty.", TAGS.ADDITIONAL));
    } else {
      const reference = findValue(additional, "01");
      if (reference !== null && !REFERENCE_RE.test(reference)) {
        errors.push(
          issue("BAD_REFERENCE", "The reference must be 1–32 printable ASCII characters.", TAGS.ADDITIONAL),
        );
      }
    }
  }

  // ---- opaque NPSB tokens: warn only, never fail ----------------------
  for (const tag of [TAGS.TOKEN_80, TAGS.TOKEN_81] as const) {
    const value = findValue(fields, tag);
    if (value !== null && safeSubfields(value) === null) {
      warnings.push(
        issue("UNSUPPORTED", `The token template (tag ${tag}) is not TLV; it is preserved verbatim.`, tag),
      );
    }
  }

  if (text.length > 800) {
    warnings.push(issue("UNSUPPORTED", "This payload is unusually long; check it before publishing."));
  }

  // ---- full decode for the structured result --------------------------
  let qr: DecodedQr | null = null;
  if (checksumOk && errors.length === 0) {
    try {
      qr = decode(text);
    } catch (error) {
      if (DeshiQrError.is(error)) {
        errors.push(issue(error.code, error.message, error.detail));
      } else {
        errors.push(issue("UNSUPPORTED", error instanceof Error ? error.message : "Unknown error."));
      }
    }
  }

  return result(qr);
}

/** True when the payload is a checksum-valid Bangla QR with the required fields. */
export function isBanglaQr(payload: string): boolean {
  return validate(payload).ok;
}

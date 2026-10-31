// GENERATED FILE - do not edit.
// Source: packages/{core,qr}/src
// Regenerate with: node scripts/vendor-edge.mjs
import { crc16 } from "./crc.ts";
import { DeshiQrError } from "./errors.ts";
import {
  type Field,
  TAGS,
  encodeFields,
  findField,
  findValue,
  insertFieldSorted,
  normalize,
  parse,
  parseSubfields,
} from "./tlv.ts";
import { MAX_AMOUNT, amountToField } from "./amount.ts";
import { newReference } from "./reference.ts";

/** Options for deriving a payload. */
export interface AmountOptions {
  /** Explicit reference to embed (bKash calls this the bill number). */
  reference?: string | null;
  /** Prefix used when descrqr generates a fresh reference. */
  referencePrefix?: string;
  /** Length of a generated reference. 0 disables the reference. Default: keep the existing length. */
  referenceLength?: number;
  /** Reuse the reference already present in the source payload. Default false. */
  keepExistingReference?: boolean;
}

export interface BuildOptions extends AmountOptions {
  /** Amount in BDT. `null`/`undefined` produces a static payload. */
  amount?: number | null;
}

const REFERENCE_RE = /^[\x20-\x7E]{1,32}$/;

/** Validate an explicit reference before it is embedded in a payload. */
export function assertReference(reference: string): void {
  if (!REFERENCE_RE.test(reference)) {
    throw new DeshiQrError(
      "BAD_REFERENCE",
      "A reference must be 1–32 printable ASCII characters.",
      reference,
    );
  }
}

/** Re-assemble fields into a sealed payload (drops any old tag 63 first). */
export function seal(fields: readonly Field[]): string {
  const body = encodeFields(fields.filter((field) => field.tag !== TAGS.CRC)) + TAGS.CRC + "04";
  return body + crc16(body);
}

function fieldsWithoutChecksum(payload: string): Field[] {
  const fields = parse(payload);
  const last = fields[fields.length - 1];
  if (last && last.tag === TAGS.CRC) fields.pop();
  return fields;
}

function requireReferenceReference(value: string, existingPrefix: string | null, length: number | undefined): string | null {
  const target = length === undefined ? (existingPrefix ? existingPrefix.length : 0) : length;
  if (target <= 0) return null;
  if (existingPrefix && existingPrefix.length > target) {
    // Never grow a payload past the reference length it was issued with.
    return existingPrefix.slice(0, target);
  }
  return newReference({ prefix: existingPrefix ?? "", length: target });
}

/**
 * Reduce a payload to its static (no amount, no reference) form.
 * Keeps account, name, city, MCC, currency, NPSB tokens and every other field
 * verbatim, exactly as the original setup app did.
 */
export function toStatic(payload: string): string {
  const fields = fieldsWithoutChecksum(payload);
  const out: Field[] = [];

  for (const field of fields) {
    if (field.tag === TAGS.AMOUNT) continue;

    if (field.tag === TAGS.INITIATION) {
      out.push({ tag: field.tag, value: "11" });
      continue;
    }

    if (field.tag === TAGS.ADDITIONAL) {
      let sub: Field[];
      try {
        sub = parseSubfields(field.value);
      } catch {
        throw new DeshiQrError("BAD_TLV", "The additional data template (tag 62) is not valid TLV.", TAGS.ADDITIONAL);
      }
      const kept = sub.filter((item) => item.tag !== "01");
      if (kept.length > 0) out.push({ tag: field.tag, value: encodeFields(kept) });
      continue;
    }

    out.push(field);
  }

  if (!findField(out, TAGS.INITIATION)) {
    throw new DeshiQrError("MISSING_FIELD", "Missing the point-of-initiation tag (tag 01).", TAGS.INITIATION);
  }

  return seal(out);
}

/**
 * Derive a dynamic payload for the given amount.
 *
 * - strips any old amount and reference, sets tag 01 to "12"
 * - inserts the amount in ascending tag order
 * - embeds an explicit reference, or generates one from the source reference
 *   prefix/length, or leaves the reference out
 * - preserves everything else verbatim and re-seals with CRC-16
 */
export function withAmount(payload: string, amount: number, options: AmountOptions = {}): string {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new DeshiQrError("BAD_AMOUNT", "Amount must be a finite number greater than zero.");
  }
  if (amount > MAX_AMOUNT) {
    throw new DeshiQrError("BAD_AMOUNT", `Amount must not exceed ${MAX_AMOUNT}.`);
  }

  const amountField = amountToField(amount);
  const fields = fieldsWithoutChecksum(payload);

  let existingReference: string | null = null;
  const additionalIndex = fields.findIndex((field) => field.tag === TAGS.ADDITIONAL);
  if (additionalIndex >= 0) {
    try {
      existingReference = findValue(parseSubfields(fields[additionalIndex].value), "01");
    } catch {
      throw new DeshiQrError("BAD_TLV", "The additional data template (tag 62) is not valid TLV.", TAGS.ADDITIONAL);
    }
  }

  if (fields.some((field) => field.tag === TAGS.AMOUNT)) {
    for (let i = fields.length - 1; i >= 0; i--) {
      if (fields[i].tag === TAGS.AMOUNT) fields.splice(i, 1);
    }
  }

  let reference: string | null = null;
  if (options.reference !== undefined && options.reference !== null) {
    assertReference(options.reference);
    reference = options.reference;
  } else if (options.reference === null) {
    reference = null;
  } else if (options.keepExistingReference && existingReference) {
    reference = existingReference;
  } else {
    const prefix =
      options.referencePrefix ?? (existingReference ? existingReference.slice(0, 10) : "");
    const length =
      options.referenceLength ?? (existingReference ? existingReference.length : 0);
    reference = requireReferenceReference(reference ?? "", prefix, length);
  }

  // Point of initiation: static -> dynamic.
  const initiationIndex = fields.findIndex((field) => field.tag === TAGS.INITIATION);
  if (initiationIndex >= 0) {
    fields[initiationIndex] = { tag: TAGS.INITIATION, value: "12" };
  } else {
    insertFieldSorted(fields, { tag: TAGS.INITIATION, value: "12" });
  }

  // Amount in ascending tag order (after 53, before 58).
  insertFieldSorted(fields, { tag: TAGS.AMOUNT, value: amountField });

  // Reference inside the additional data template.
  const subfields: Field[] = [];
  const existingAdditional = findField(fields, TAGS.ADDITIONAL);
  if (existingAdditional) {
    try {
      subfields.push(...parseSubfields(existingAdditional.value).filter((item) => item.tag !== "01"));
    } catch {
      throw new DeshiQrError("BAD_TLV", "The additional data template (tag 62) is not valid TLV.", TAGS.ADDITIONAL);
    }
  }
  if (reference !== null) subfields.unshift({ tag: "01", value: reference });

  if (subfields.length > 0) {
    const value = encodeFields(subfields);
    const index = fields.findIndex((field) => field.tag === TAGS.ADDITIONAL);
    if (index >= 0) fields[index] = { tag: TAGS.ADDITIONAL, value };
    else insertFieldSorted(fields, { tag: TAGS.ADDITIONAL, value });
  } else if (findField(fields, TAGS.ADDITIONAL)) {
    const index = fields.findIndex((field) => field.tag === TAGS.ADDITIONAL);
    fields.splice(index, 1);
  }

  return seal(fields);
}

/** General derivation entry point: amount present → dynamic payload, else static. */
export function build(base: string, options: BuildOptions = {}): string {
  const amount = options.amount ?? null;
  if (amount === null || amount === undefined) return toStatic(base);
  return withAmount(base, amount, options);
}

/** Reference embedded in a payload, or null. */
export function referenceFrom(payload: string): string | null {
  try {
    const fields = parse(normalize(payload));
    const additional = findValue(fields, TAGS.ADDITIONAL);
    if (additional === null) return null;
    return findValue(parseSubfields(additional), "01");
  } catch {
    return null;
  }
}

import { DeshiQrError } from "./errors.ts";

/** Well-known Bangla QR / EMVCo top-level tags. */
export const TAGS = {
  FORMAT: "00",
  INITIATION: "01",
  ACCOUNT: "26",
  MCC: "52",
  CURRENCY: "53",
  AMOUNT: "54",
  COUNTRY: "58",
  NAME: "59",
  CITY: "60",
  ADDITIONAL: "62",
  CRC: "63",
  TOKEN_80: "80",
  TOKEN_81: "81",
} as const;

/** A single `TT LL VV…` field. */
export interface Field {
  tag: string;
  value: string;
}

export const MAX_FIELD_LENGTH = 99;

/** Strip surrounding whitespace. Payloads are pasted from chats and screenshots. */
export function normalize(payload: string): string {
  return typeof payload === "string" ? payload.trim() : "";
}

const TAG_RE = /^\d{2}$/;
const LENGTH_RE = /^\d{2}$/;

/**
 * Parse a Bangla QR payload into top-level fields. Strict: malformed TLV throws
 * `BAD_TLV` instead of silently truncating.
 *
 * No recursion here — nested templates (26, 62, 80, 81) are plain values; call
 * `parse` again on them if you need their subtree.
 */
export function parse(payload: string): Field[] {
  const text = normalize(payload);
  if (text.length === 0) {
    throw new DeshiQrError("EMPTY_PAYLOAD", "The payload is empty.");
  }

  const fields: Field[] = [];
  let offset = 0;

  while (offset < text.length) {
    if (offset + 4 > text.length) {
      throw new DeshiQrError(
        "BAD_TLV",
        `Truncated field header at offset ${offset}.`,
        `offset=${offset}`,
      );
    }

    const tag = text.slice(offset, offset + 2);
    if (!TAG_RE.test(tag)) {
      throw new DeshiQrError("BAD_TLV", `Invalid tag "${tag}" at offset ${offset}.`, tag);
    }

    const rawLength = text.slice(offset + 2, offset + 4);
    if (!LENGTH_RE.test(rawLength)) {
      throw new DeshiQrError(
        "BAD_TLV",
        `Invalid length "${rawLength}" for tag ${tag} at offset ${offset}.`,
        tag,
      );
    }

    const length = Number(rawLength);
    const valueStart = offset + 4;
    const valueEnd = valueStart + length;

    if (valueEnd > text.length) {
      throw new DeshiQrError(
        "BAD_TLV",
        `Tag ${tag} claims ${length} characters but only ${text.length - valueStart} remain.`,
        tag,
      );
    }

    fields.push({ tag, value: text.slice(valueStart, valueEnd) });
    offset = valueEnd;
  }

  return fields;
}

/** Encode one field as `TTLLVV…`. Values are limited to 99 characters by the format. */
export function encodeField(field: Field): string {
  const { tag, value } = field;
  if (!TAG_RE.test(tag)) {
    throw new DeshiQrError("BAD_TLV", `Tag must be two digits, got "${tag}".`, tag);
  }
  if (typeof value !== "string") {
    throw new DeshiQrError("BAD_TLV", `Value for tag ${tag} must be a string.`, tag);
  }
  if (value.length > MAX_FIELD_LENGTH) {
    throw new DeshiQrError(
      "BAD_TLV",
      `Value for tag ${tag} is ${value.length} characters; the format allows at most ${MAX_FIELD_LENGTH}.`,
      tag,
    );
  }
  return tag + String(value.length).padStart(2, "0") + value;
}

/** Encode a list of fields back into a payload body. */
export function encodeFields(fields: readonly Field[]): string {
  let out = "";
  for (const field of fields) out += encodeField(field);
  return out;
}

/** First occurrence of a tag, or undefined. */
export function findField(fields: readonly Field[], tag: string): Field | undefined {
  return fields.find((field) => field.tag === tag);
}

/** Value of the first occurrence of a tag, or null. */
export function findValue(fields: readonly Field[], tag: string): string | null {
  const field = findField(fields, tag);
  return field ? field.value : null;
}

/** Parse a nested template value, returning [] when the value is empty. */
export function parseSubfields(value: string): Field[] {
  if (value.length === 0) return [];
  return parse(value);
}

/** Insert a field so the payload stays in ascending numeric tag order. */
export function insertFieldSorted(fields: Field[], field: Field): void {
  const index = fields.findIndex((existing) => Number(existing.tag) > Number(field.tag));
  if (index === -1) fields.push(field);
  else fields.splice(index, 0, field);
}

// GENERATED FILE - do not edit.
// Source: packages/deshiqr/src/core
// Regenerate with: node scripts/vendor-edge.mjs
import { DeshiQrError } from "./errors.ts";

/** A single `TT LL VV…` field. */
export interface Field {
  tag: string;
  value: string;
}

/** The format allows at most 99 characters in a single field value. */
export const MAX_FIELD_LENGTH = 99;

const TAG_RE = /^\d{2}$/;
const LENGTH_RE = /^\d{2}$/;

/** Strip surrounding whitespace; anything that is not a string is empty. */
export function normalize(payload: unknown): string {
  return typeof payload === "string" ? payload.trim() : "";
}

/** True for a two-digit tag. */
export function isTag(value: string): boolean {
  return TAG_RE.test(value);
}

/**
 * Parse a payload level into its `{tag, value}` fields. Strict: a malformed
 * field throws `BAD_TLV` instead of being silently truncated.
 *
 * Nested templates are plain values here — call `parseSubfields` on them when
 * you need their subtree.
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
      throw new DeshiQrError("BAD_TLV", `Malformed payload: truncated field at offset ${offset}.`);
    }

    const tag = text.slice(offset, offset + 2);
    if (!TAG_RE.test(tag)) {
      throw new DeshiQrError(
        "BAD_TLV",
        `Malformed payload: invalid tag "${tag}" at offset ${offset}.`,
        tag,
      );
    }

    const rawLength = text.slice(offset + 2, offset + 4);
    if (!LENGTH_RE.test(rawLength)) {
      throw new DeshiQrError(
        "BAD_TLV",
        `Malformed payload: invalid length "${rawLength}" for tag ${tag} at offset ${offset}.`,
        tag,
      );
    }

    const length = Number(rawLength);
    const valueStart = offset + 4;
    const valueEnd = valueStart + length;

    if (valueEnd > text.length) {
      throw new DeshiQrError(
        "BAD_TLV",
        `Malformed payload: tag ${tag} claims ${length} characters but only ${text.length - valueStart} remain.`,
        tag,
      );
    }

    fields.push({ tag, value: text.slice(valueStart, valueEnd) });
    offset = valueEnd;
  }

  return fields;
}

/** Encode one field as `TTLLVV…`. */
export function encodeField(field: Field): string {
  const { tag, value } = field;
  if (!TAG_RE.test(tag)) {
    throw new DeshiQrError("BAD_TLV", `Malformed payload: invalid tag "${tag}".`, tag);
  }
  if (typeof value !== "string") {
    throw new DeshiQrError("BAD_VALUE", `Value for tag ${tag} must be a string.`, tag);
  }
  if (value.length > MAX_FIELD_LENGTH) {
    throw new DeshiQrError(
      "BAD_VALUE",
      `Value for tag ${tag} is longer than ${MAX_FIELD_LENGTH} characters.`,
      tag,
    );
  }
  return tag + String(value.length).padStart(2, "0") + value;
}

/** Encode a list of fields back into a payload level. */
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

/** Parse a nested template value; an empty value is an empty (valid) template. */
export function parseSubfields(value: string): Field[] {
  if (value.length === 0) return [];
  return parse(value);
}

/** Insert a field so the level stays in ascending numeric tag order. */
export function insertFieldSorted(fields: Field[], field: Field): void {
  const index = fields.findIndex((existing) => Number(existing.tag) > Number(field.tag));
  if (index === -1) fields.push(field);
  else fields.splice(index, 0, field);
}

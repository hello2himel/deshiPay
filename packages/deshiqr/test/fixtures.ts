/**
 * Synthetic fixtures only. No real merchant data.
 *
 * Fake account `01000000000`, DEMO STORE, dummy base64 tokens. The dynamic
 * payload is exactly what `update(STATIC_PAYLOAD, { amount: 500, reference })`
 * produces — the tests pin that.
 */
import { crc16 } from "../src/core/crc.ts";
import { type Field, encodeFields, parse } from "../src/core/tlv.ts";

export const STATIC_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D";

export const DYNAMIC_500_PAYLOAD =
  "00020101021226470014bd.org.bb.npsb010202020420020311010000000005204601653030505406500.005802BD5910DEMO STORE6005Dhaka62350125DEMOQR0VZeK2MfbVRI6w36osd0602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304F835";

export const MINIMAL_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb0102020204200203110100000000053030505802BD5910DEMO STORE6005Dhaka63049C89";

/** Synthetic "other provider" layout: unknown AID, no tokens, no tag 62. */
export const GENERIC_STATIC_PAYLOAD =
  "00020101021126410022example.org.generic-qr0311017000000005204541153030505802BD5912GENERIC SHOP6006Sylhet6304818D";

export const REFERENCE = "DEMOQR0VZeK2MfbVRI6w36osd";

/** Re-seal a level with a valid CRC-16 (uppercase). */
export function seal(fields: readonly Field[]): string {
  const body = `${encodeFields(fields.filter((field) => field.tag !== "63"))}6304`;
  return body + crc16(body);
}

/** Top-level fields of a payload, without the checksum. */
export function fieldsOf(payload: string): Field[] {
  return parse(payload).filter((field) => field.tag !== "63");
}

/** Rewrite a payload: mutate its fields, then re-seal. */
export function rebuild(payload: string, mutate: (fields: Field[]) => Field[] | void): string {
  const fields = fieldsOf(payload);
  const mutated = mutate(fields);
  return seal(mutated ?? fields);
}

/** Replace one field value or append it when missing. */
export function setField(fields: Field[], tag: string, value: string): void {
  const index = fields.findIndex((field) => field.tag === tag);
  if (index >= 0) fields[index] = { tag, value };
  else fields.push({ tag, value });
}

/** Remove every field with a tag. */
export function removeField(fields: Field[], tag: string): void {
  for (let i = fields.length - 1; i >= 0; i -= 1) {
    if (fields[i]?.tag === tag) fields.splice(i, 1);
  }
}

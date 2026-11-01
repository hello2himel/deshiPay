import { type Field, parse } from "../../src/core/tlv.ts";
import { seal } from "../../src/core/build.ts";

/**
 * Synthetic fixtures only. No real merchant data — see docs/demo-payloads.md.
 * Fake account 01000000000 (unassignable operator prefix), DEMO STORE, dummy tokens.
 */

export const STATIC_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D";

export const DYNAMIC_PAYLOAD =
  "00020101021226470014bd.org.bb.npsb010202020420020311010000000005204601653030505406500.005802BD5910DEMO STORE6005Dhaka62350125DEMOQR0VZeK2MfbVRI6w36osd0602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304F835";

export const MINIMAL_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb0102020204200203110100000000053030505802BD5910DEMO STORE6005Dhaka63049C89";

export const LONG_NAME_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204541153030505802BD5919DEMO SUPER SHOP LTD6010Chattogram630494E0";

/** Synthetic 25-character bill number, the length real bKash dynamic QRs use. */
export const DUMMY_REFERENCE = "DEMOQR0VZeK2MfbVRI6w36osd";

export const DUMMY_TOKEN_A = "ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=";
export const DUMMY_TOKEN_B = "ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=";
/** Raw tag 80/81 field values (nested TLV: AID + token), preserved verbatim. */
export const TAG80_VALUE = `0014bd.org.bb.npsb0144${DUMMY_TOKEN_A}`;
export const TAG81_VALUE = `0014bd.org.bb.npsb0144${DUMMY_TOKEN_B}`;

/** Corrupted checksum: last four characters replaced. */
export const BAD_CHECKSUM_PAYLOAD = STATIC_PAYLOAD.slice(0, -4) + "0000";

/** Truncated TLV: no checksum, incomplete last field. */
export const TRUNCATED_PAYLOAD = STATIC_PAYLOAD.slice(0, -12);

/** TLV that starts fine but declares more bytes than it has. */
export const OVERLONG_FIELD = "0005AB";

/** Rewrite a payload: mutate its fields, then re-seal with a valid checksum. */
export function rebuild(payload: string, mutate: (fields: Field[]) => Field[] | void): string {
  const fields = parse(payload);
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
  for (let i = fields.length - 1; i >= 0; i--) {
    if (fields[i].tag === tag) fields.splice(i, 1);
  }
}

// GENERATED FILE - do not edit.
// Source: packages/deshiqr/src/{core,qr}
// Regenerate with: node scripts/vendor-edge.mjs
/**
 * deshiqr — parse, verify and build Bangla QR (NPSB / EMVCo) payment payloads.
 *
 * Zero dependencies, environment-agnostic (browser, Node, Deno, edge runtimes).
 * Decoding is verified against real bKash payloads today; the parser is
 * provider-agnostic, but support for other Bangla QR providers is not claimed
 * until their real payloads are in the test suite.
 */
import { crc16 } from "./crc.ts";

export { DeshiQrError, type DeshiQrCode } from "./errors.ts";
export { crc16 } from "./crc.ts";
export {
  TAGS,
  MAX_FIELD_LENGTH,
  type Field,
  parse,
  encodeField,
  encodeFields,
  findField,
  findValue,
  parseSubfields,
  insertFieldSorted,
} from "./tlv.ts";
export {
  MAX_AMOUNT,
  amountToField,
  parseAmountField,
  formatTaka,
  maskAccount,
  type FormatTakaOptions,
} from "./amount.ts";
export {
  decode,
  decodeSafe,
  institutionOf,
  KNOWN_INSTITUTIONS,
  type DecodedQr,
  type MerchantDetails,
} from "./decode.ts";
export {
  build,
  withAmount,
  toStatic,
  seal,
  referenceFrom,
  assertReference,
  type AmountOptions,
  type BuildOptions,
} from "./build.ts";
export { newReference, DEFAULT_REFERENCE_LENGTH, type ReferenceOptions } from "./reference.ts";
export {
  validate,
  isBanglaQr,
  type ValidationReport,
  type DeshiQrIssue,
} from "./validate.ts";

/** Package version. Kept in sync with package.json by the release script. */
export const VERSION = "0.1.0";

/** True for any payload whose checksum validates. */
export function verifyChecksum(payload: string): boolean {
  const text = typeof payload === "string" ? payload.trim() : "";
  if (text.length < 8) return false;
  const checksum = text.slice(-4);
  if (!/^[0-9A-Fa-f]{4}$/.test(checksum)) return false;
  return crc16(text.slice(0, -4)) === checksum.toUpperCase();
}


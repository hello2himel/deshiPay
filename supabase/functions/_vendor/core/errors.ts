// GENERATED FILE - do not edit.
// Source: packages/{core,qr}/src
// Regenerate with: node scripts/vendor-edge.mjs
/** Error codes returned by deshiQR. Stable strings, safe to switch on. */
export type DeshiQrCode =
  | "EMPTY_PAYLOAD"
  | "BAD_TLV"
  | "CHECKSUM_MISMATCH"
  | "MISSING_FIELD"
  | "NOT_A_BANGLA_QR"
  | "BAD_AMOUNT"
  | "BAD_REFERENCE"
  | "UNSUPPORTED";

/**
 * Every failure in deshiQR is a `DeshiQrError` with a machine-readable `code`,
 * a human-readable message, and an optional detail (tag / offset / value).
 */
export class DeshiQrError extends Error {
  readonly code: DeshiQrCode;
  readonly detail?: string;

  constructor(code: DeshiQrCode, message: string, detail?: string) {
    super(message);
    this.name = "DeshiQrError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }

  static is(error: unknown): error is DeshiQrError {
    return error instanceof DeshiQrError;
  }
}

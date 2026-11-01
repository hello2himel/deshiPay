// GENERATED FILE - do not edit.
// Source: packages/deshiqr/src/{core,qr}
// Regenerate with: node scripts/vendor-edge.mjs
/**
 * Galois-field GF(2^8) arithmetic and Reed-Solomon error-correction encoding.
 *
 * QR Code uses GF(2^8) with the primitive polynomial
 * x^8 + x^4 + x^3 + x^2 + 1 (0x11D) and the generator element alpha = 2.
 * This file contains no dependency on the rest of the encoder so it can be
 * checked in isolation; the tables are computed once at module load.
 */

const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initTables(): void {
  let value = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = value;
    LOG_TABLE[value] = i;
    value <<= 1;
    // Multiply by alpha; reduce modulo the primitive polynomial when it overflows a byte.
    if (value & 0x100) value ^= 0x11d;
  }
  // Doubling the exponent table lets us add logs without a modulo-255 operation.
  for (let i = 255; i < 512; i++) EXP_TABLE[i] = EXP_TABLE[i - 255];
})();

/** Multiply two elements of GF(256). */
export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

/** alpha raised to `power` (used to build the generator polynomial). */
export function gfExp(power: number): number {
  return EXP_TABLE[power];
}

/**
 * Build the Reed-Solomon generator polynomial
 * g(x) = (x - alpha^0)(x - alpha^1)...(x - alpha^(ecCount-1)).
 *
 * Coefficients are returned highest-degree first, so `gen[0]` is always 1.
 */
export function generatorPolynomial(ecCount: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    // Multiply the current polynomial by (x + alpha^i).
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]; // coefficient * x
      next[j + 1] ^= gfMul(poly[j], gfExp(i)); // coefficient * alpha^i
    }
    poly = next;
  }
  return poly;
}

/**
 * Compute the `ecCount` error-correction codewords for one data block.
 *
 * Synthetic polynomial division: the remainder of
 * `data(x) * x^ecCount` divided by the generator polynomial is exactly the
 * block of EC codewords the standard asks for.
 */
export function rsEncode(data: Uint8Array, ecCount: number): Uint8Array {
  const generator = generatorPolynomial(ecCount);
  const remainder = new Uint8Array(ecCount);

  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    // Shift the remainder one coefficient to the left.
    remainder.copyWithin(0, 1);
    remainder[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) remainder[j] ^= gfMul(generator[j + 1], factor);
    }
  }

  return remainder;
}

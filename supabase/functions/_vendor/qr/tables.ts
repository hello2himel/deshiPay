// GENERATED FILE - do not edit.
// Source: packages/{core,qr}/src
// Regenerate with: node scripts/vendor-edge.mjs
/**
 * Static data and low-level helpers for the QR Code standard (ISO/IEC 18004).
 *
 * The numeric tables below are factual data from the standard (total codeword
 * counts, error-correction block layout, BCH generator parameters). Everything
 * here is implemented from the specification text, not copied from another
 * library's code. The only code dependency is GF(256) multiplication, which
 * lives in `galois.ts`.
 */

import type { EcLevel } from "./types.ts";

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

/** Error-correction levels in the order used by the standard's tables. */
export const EC_LEVELS = ["L", "M", "Q", "H"] as const;

/** Index of each EC level inside a version-major `L, M, Q, H` table row. */
export const EC_LEVEL_INDEX: Record<EcLevel, number> = { L: 0, M: 1, Q: 2, H: 3 };

/**
 * The two-bit EC level value carried in the format information
 * (ISO/IEC 18004 Table 12). Note that this is *not* the table order: L=01, M=00, Q=11, H=10.
 */
export const EC_LEVEL_BITS: Record<EcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/**
 * Total number of codewords (data + error correction) per version,
 * ISO/IEC 18004 Table 1. Index 0 is version 1.
 */
export const TOTAL_CODEWORDS: readonly number[] = [
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346, // versions 1-10
  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085, // versions 11-20
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, // versions 21-30
  2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706, // versions 31-40
];

/**
 * Number of error-correction blocks per (version, level), laid out
 * version-major as L, M, Q, H (ISO/IEC 18004 Table 9).
 */
const EC_BLOCKS_TABLE: readonly number[] = [
  1, 1, 1, 1, // 1
  1, 1, 1, 1, // 2
  1, 1, 2, 2, // 3
  1, 2, 2, 4, // 4
  1, 2, 4, 4, // 5
  2, 4, 4, 4, // 6
  2, 4, 6, 5, // 7
  2, 4, 6, 6, // 8
  2, 5, 8, 8, // 9
  4, 5, 8, 8, // 10
  4, 5, 8, 11, // 11
  4, 8, 10, 11, // 12
  4, 9, 12, 16, // 13
  4, 9, 16, 16, // 14
  6, 10, 12, 18, // 15
  6, 10, 17, 16, // 16
  6, 11, 16, 19, // 17
  6, 13, 18, 21, // 18
  7, 14, 21, 25, // 19
  8, 16, 20, 25, // 20
  8, 17, 23, 25, // 21
  9, 17, 23, 34, // 22
  9, 18, 25, 30, // 23
  10, 20, 27, 32, // 24
  12, 21, 29, 35, // 25
  12, 23, 34, 37, // 26
  12, 25, 34, 40, // 27
  13, 26, 35, 42, // 28
  14, 28, 38, 45, // 29
  15, 29, 40, 48, // 30
  16, 31, 43, 51, // 31
  17, 33, 45, 54, // 32
  18, 35, 48, 57, // 33
  19, 37, 51, 60, // 34
  19, 38, 53, 63, // 35
  20, 40, 56, 66, // 36
  21, 43, 59, 70, // 37
  22, 45, 62, 74, // 38
  24, 47, 65, 77, // 39
  25, 49, 68, 81, // 40
];

/**
 * Total number of error-correction codewords per (version, level),
 * laid out version-major as L, M, Q, H (ISO/IEC 18004 Table 9).
 */
const EC_CODEWORDS_TABLE: readonly number[] = [
  7, 10, 13, 17, // 1
  10, 16, 22, 28, // 2
  15, 26, 36, 44, // 3
  20, 36, 52, 64, // 4
  26, 48, 72, 88, // 5
  36, 64, 96, 112, // 6
  40, 72, 108, 130, // 7
  48, 88, 132, 156, // 8
  60, 110, 160, 192, // 9
  72, 130, 192, 224, // 10
  80, 150, 224, 264, // 11
  96, 176, 260, 308, // 12
  104, 198, 288, 352, // 13
  120, 216, 320, 384, // 14
  132, 240, 360, 432, // 15
  144, 280, 408, 480, // 16
  168, 308, 448, 532, // 17
  180, 338, 504, 588, // 18
  196, 364, 546, 650, // 19
  224, 416, 600, 700, // 20
  224, 442, 644, 750, // 21
  252, 476, 690, 816, // 22
  270, 504, 750, 900, // 23
  300, 560, 810, 960, // 24
  312, 588, 870, 1050, // 25
  336, 644, 952, 1110, // 26
  360, 700, 1020, 1200, // 27
  390, 728, 1050, 1260, // 28
  420, 784, 1140, 1350, // 29
  450, 812, 1200, 1440, // 30
  480, 868, 1290, 1530, // 31
  510, 924, 1350, 1620, // 32
  540, 980, 1440, 1710, // 33
  570, 1036, 1530, 1800, // 34
  570, 1064, 1590, 1890, // 35
  600, 1120, 1680, 1980, // 36
  630, 1204, 1770, 2100, // 37
  660, 1260, 1860, 2220, // 38
  720, 1316, 1950, 2310, // 39
  750, 1372, 2040, 2430, // 40
];

/** Validate and return a QR Code version. */
export function checkVersion(version: number, name = "version"): number {
  if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_VERSION) {
    throw new RangeError(`${name} must be an integer between ${MIN_VERSION} and ${MAX_VERSION}, got ${String(version)}`);
  }
  return version;
}

/** Validate and return an error-correction level. */
export function checkLevel(level: EcLevel): EcLevel {
  if (typeof level !== "string" || !Object.prototype.hasOwnProperty.call(EC_LEVEL_INDEX, level)) {
    throw new RangeError(`level must be one of "L", "M", "Q", "H", got ${String(level)}`);
  }
  return level;
}

/**
 * Size of the character-count indicator for byte mode:
 * 8 bits for versions 1-9 and 16 bits for versions 10-40 (ISO/IEC 18004 Table 3).
 */
export function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/** Total number of error-correction codewords for a version/level. */
export function ecCodewords(version: number, level: EcLevel): number {
  return EC_CODEWORDS_TABLE[(version - 1) * 4 + EC_LEVEL_INDEX[level]];
}

/** Number of error-correction blocks for a version/level. */
export function ecBlockCount(version: number, level: EcLevel): number {
  return EC_BLOCKS_TABLE[(version - 1) * 4 + EC_LEVEL_INDEX[level]];
}

/** Number of data codewords (excluding error correction) for a version/level. */
export function dataCodewords(version: number, level: EcLevel): number {
  return TOTAL_CODEWORDS[version - 1] - ecCodewords(version, level);
}

/** One Reed-Solomon block group: `count` blocks, each with the given sizes. */
export interface BlockGroup {
  /** Number of blocks in this group. */
  count: number;
  /** Data codewords per block. */
  dataCodewords: number;
  /** Error-correction codewords per block. */
  ecCodewords: number;
}

/**
 * Split the data codewords of a symbol into Reed-Solomon blocks.
 *
 * The standard divides a version/level's data codewords into blocks that are as
 * equal as possible; the shorter blocks come first. So if a level has N blocks
 * and D data codewords, `D % N` blocks get one extra data codeword. The EC
 * codewords per block are the same for every block.
 */
export function blockLayout(version: number, level: EcLevel): BlockGroup[] {
  const blockCount = ecBlockCount(version, level);
  const ecTotal = ecCodewords(version, level);
  const dataTotal = dataCodewords(version, level);
  const ecPerBlock = ecTotal / blockCount;
  if (!Number.isInteger(ecPerBlock)) {
    // Defensive: every standard table row divides evenly, so this never fires.
    throw new Error(`internal error: version ${version}-${level} has a non-integral EC block size`);
  }
  const base = Math.floor(dataTotal / blockCount);
  const longBlocks = dataTotal % blockCount;
  const groups: BlockGroup[] = [];
  if (blockCount - longBlocks > 0) {
    groups.push({ count: blockCount - longBlocks, dataCodewords: base, ecCodewords: ecPerBlock });
  }
  if (longBlocks > 0) {
    groups.push({ count: longBlocks, dataCodewords: base + 1, ecCodewords: ecPerBlock });
  }
  return groups;
}

/**
 * Byte-mode capacity of a version/level: how many UTF-8 bytes fit.
 *
 * Layout is `0100` (mode) + 8/16-bit character count + bytes + terminator/pad.
 */
export function getVersionCapacity(version: number, level: EcLevel): number {
  checkVersion(version);
  checkLevel(level);
  const availableBits = dataCodewords(version, level) * 8 - 4 - charCountBits(version);
  return Math.floor(availableBits / 8);
}

/** Number of bits needed to express `value` (0 -> 0). */
function bchDigit(value: number): number {
  let digit = 0;
  while (value !== 0) {
    digit++;
    value >>>= 1;
  }
  return digit;
}

// (15,5) BCH generator polynomial for format information, x^10+x^8+x^5+x^4+x^2+x+1.
const FORMAT_GENERATOR = 0b10100110111; // 0x537
// Format information is XORed with this constant so no valid pattern is all zeros.
const FORMAT_MASK = 0b101010000010010; // 0x5412

/**
 * 15-bit format information for a level/mask pair: 5 data bits (2 EC level,
 * 3 mask) plus 10 BCH check bits, XORed with `0x5412`.
 */
export function formatInfo(level: EcLevel, mask: number): number {
  const data = (EC_LEVEL_BITS[level] << 3) | mask;
  let remainder = data << 10;
  while (bchDigit(remainder) - bchDigit(FORMAT_GENERATOR) >= 0) {
    remainder ^= FORMAT_GENERATOR << (bchDigit(remainder) - bchDigit(FORMAT_GENERATOR));
  }
  return ((data << 10) | remainder) ^ FORMAT_MASK;
}

// (18,6) BCH generator polynomial for version information, x^12+x^11+x^10+x^9+x^8+x^5+x^2+1.
const VERSION_GENERATOR = 0b1111100100101; // 0x1F25

/**
 * 18-bit version information for versions 7-40: 6 version bits plus 12 BCH
 * check bits. Versions 1-6 carry no version information block.
 */
export function versionInfo(version: number): number {
  checkVersion(version);
  if (version < 7) {
    throw new RangeError(`version ${version} has no version-information block (only versions 7-40 do)`);
  }
  let remainder = version << 12;
  while (bchDigit(remainder) - bchDigit(VERSION_GENERATOR) >= 0) {
    remainder ^= VERSION_GENERATOR << (bchDigit(remainder) - bchDigit(VERSION_GENERATOR));
  }
  return (version << 12) | remainder;
}

/**
 * Row/column centre coordinates of the alignment patterns for a version.
 *
 * Positions are symmetric around the diagonal and always start at 6 and end at
 * `size - 7`; version 1 has no alignment patterns. Version 32 is the one
 * special case where the nominal spacing would be 28 but the standard uses 26
 * to keep the last position at `size - 7`.
 */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions: number[] = [6];
  for (let position = size - 7; positions.length < count; position -= step) {
    positions.splice(1, 0, position);
  }
  return positions;
}

/** Returns true when the data mask `mask` (0-7) flips the module at (row, col). */
export function maskCondition(mask: number): (row: number, col: number) => boolean {
  switch (mask) {
    case 0:
      return (row, col) => (row + col) % 2 === 0;
    case 1:
      return (row) => row % 2 === 0;
    case 2:
      return (_row, col) => col % 3 === 0;
    case 3:
      return (row, col) => (row + col) % 3 === 0;
    case 4:
      return (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      throw new RangeError(`mask must be an integer from 0 to 7, got ${String(mask)}`);
  }
}

/**
 * The four mask-evaluation penalty rules (N1=3, N2=3, N3=40, N4=10).
 *
 * The rules are evaluated exactly as the standard describes them; the N4
 * "steps of 5%" reading used here matches the widely deployed reference
 * implementation (round the dark ratio up to the next multiple of 5% before
 * measuring the deviation from 50%).
 */
export function penaltyScore(data: Uint8Array, size: number): number {
  return penaltyN1(data, size) + penaltyN2(data, size) + penaltyN3(data, size) + penaltyN4(data, size);
}

/** Rule 1: runs of five or more same-coloured modules in a row or column. */
function penaltyN1(data: Uint8Array, size: number): number {
  let points = 0;
  for (let index = 0; index < size; index++) {
    // Horizontal run along row `index`.
    let run = 1;
    let previous = data[index * size];
    for (let col = 1; col < size; col++) {
      const current = data[index * size + col];
      if (current === previous) {
        run++;
      } else {
        if (run >= 5) points += 3 + (run - 5);
        run = 1;
        previous = current;
      }
    }
    if (run >= 5) points += 3 + (run - 5);

    // Vertical run along column `index`.
    run = 1;
    previous = data[index];
    for (let row = 1; row < size; row++) {
      const current = data[row * size + index];
      if (current === previous) {
        run++;
      } else {
        if (run >= 5) points += 3 + (run - 5);
        run = 1;
        previous = current;
      }
    }
    if (run >= 5) points += 3 + (run - 5);
  }
  return points;
}

/** Rule 2: every 2x2 block of the same colour scores 3. */
function penaltyN2(data: Uint8Array, size: number): number {
  let points = 0;
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const top = row * size + col;
      const bottom = top + size;
      const colour = data[top];
      if (data[top + 1] === colour && data[bottom] === colour && data[bottom + 1] === colour) {
        points += 3;
      }
    }
  }
  return points;
}

/** Rule 3: 1:1:3:1:1 finder-like patterns preceded or followed by four light modules. */
function penaltyN3(data: Uint8Array, size: number): number {
  let points = 0;
  for (let line = 0; line < size; line++) {
    let rowBits = 0;
    let columnBits = 0;
    for (let position = 0; position < size; position++) {
      rowBits = ((rowBits << 1) & 0x7ff) | data[line * size + position];
      columnBits = ((columnBits << 1) & 0x7ff) | data[position * size + line];
      if (position >= 10) {
        // 10111010000 and 00001011101
        if (rowBits === 0x5d0 || rowBits === 0x05d) points += 40;
        if (columnBits === 0x5d0 || columnBits === 0x05d) points += 40;
      }
    }
  }
  return points;
}

/** Rule 4: deviation of the dark-module proportion from 50%, in 5% steps. */
function penaltyN4(data: Uint8Array, size: number): number {
  let dark = 0;
  for (let i = 0; i < data.length; i++) dark += data[i];
  const total = size * size;
  const steps = Math.abs(Math.ceil((dark * 100) / total / 5) - 10);
  return steps * 10;
}

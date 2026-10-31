/**
 * QR Code symbol construction (ISO/IEC 18004, byte mode).
 *
 * The encoder pipeline is:
 *   1. UTF-8 encode the input text (byte mode always carries a byte count).
 *   2. Pick the smallest version that fits (or honour a forced/minimum version).
 *   3. Build the bit stream: mode indicator, character count, data, terminator, pad bytes.
 *   4. Split the data codewords into Reed-Solomon blocks, add EC codewords, interleave.
 *   5. Lay out function patterns and zig-zag place the codewords.
 *   6. Try every mask pattern (or the forced one) and keep the lowest-penalty symbol.
 */

import { rsEncode } from "./galois.ts";
import {
  alignmentPositions,
  blockLayout,
  charCountBits,
  checkLevel,
  checkVersion,
  dataCodewords,
  formatInfo,
  MAX_VERSION,
  maskCondition,
  penaltyScore,
  versionInfo,
} from "./tables.ts";
import type { EcLevel, EncodeOptions, QrMatrix } from "./types.ts";

/** Byte mode is mode indicator `0100` (ISO/IEC 18004 Table 2). */
const BYTE_MODE_INDICATOR = 0b0100;

/**
 * Encode `text` as a QR Code symbol.
 *
 * The text is converted to UTF-8 bytes and stored in byte mode. A 1-40 version
 * is selected automatically unless {@link EncodeOptions.version} is given, and
 * the data mask is selected automatically using the standard penalty rules
 * unless {@link EncodeOptions.mask} is given.
 *
 * @throws {RangeError} when the text does not fit in the requested version, when
 *   no version up to 40 can hold it, or when an option is out of range.
 */
export function encode(text: string, options: EncodeOptions = {}): QrMatrix {
  if (typeof text !== "string") throw new TypeError("text must be a string");

  const level = checkLevel(options.level ?? "M");
  const forcedMask = options.mask === undefined ? undefined : checkMask(options.mask);
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length, level, options);
  const codewords = interleaveBlocks(buildDataCodewords(bytes, version, level), version, level);

  if (forcedMask !== undefined) return buildMatrix(version, level, codewords, forcedMask);

  // Evaluate all eight masks and keep the one with the lowest penalty score.
  // A strict `<` comparison keeps the lowest-numbered mask on ties, which is
  // what the reference implementations do.
  let best = buildMatrix(version, level, codewords, 0);
  let bestPenalty = penaltyScore(best.data, best.size);
  for (let mask = 1; mask < 8; mask++) {
    const candidate = buildMatrix(version, level, codewords, mask);
    const penalty = penaltyScore(candidate.data, candidate.size);
    if (penalty < bestPenalty) {
      best = candidate;
      bestPenalty = penalty;
    }
  }
  return best;
}

/** Validate a forced mask pattern. */
function checkMask(mask: number): number {
  if (!Number.isInteger(mask) || mask < 0 || mask > 7) {
    throw new RangeError(`mask must be an integer from 0 to 7, got ${String(mask)}`);
  }
  return mask;
}

/** Pick the symbol version, honouring forced/minimum versions and eager mode. */
function chooseVersion(byteLength: number, level: EcLevel, options: EncodeOptions): number {
  if (options.version !== undefined) {
    const version = checkVersion(options.version);
    const capacity = versionCapacity(version, level);
    if (byteLength > capacity) {
      throw new RangeError(
        `data does not fit: ${byteLength} UTF-8 bytes exceed the ${capacity}-byte capacity of version ${version}-${level}`,
      );
    }
    return version;
  }

  if (options.eager) {
    const capacity = versionCapacity(MAX_VERSION, level);
    if (byteLength > capacity) throw tooLongError(byteLength, level);
    return MAX_VERSION;
  }

  const minVersion = options.minVersion === undefined ? 1 : checkVersion(options.minVersion, "minVersion");
  for (let version = minVersion; version <= MAX_VERSION; version++) {
    if (byteLength <= versionCapacity(version, level)) return version;
  }
  throw tooLongError(byteLength, level);
}

/** Capacity lookup without the public validation overhead. */
function versionCapacity(version: number, level: EcLevel): number {
  const availableBits = dataCodewords(version, level) * 8 - 4 - charCountBits(version);
  return Math.floor(availableBits / 8);
}

function tooLongError(byteLength: number, level: EcLevel): RangeError {
  return new RangeError(
    `data is too long: ${byteLength} UTF-8 bytes do not fit in any version (1-40) at error-correction level ${level}`,
  );
}

/** Build the padded data codewords (before error correction). */
function buildDataCodewords(bytes: Uint8Array, version: number, level: EcLevel): Uint8Array {
  const codewordCount = dataCodewords(version, level);
  const capacityBits = codewordCount * 8;
  const bits: number[] = [];

  pushBits(bits, BYTE_MODE_INDICATOR, 4);
  pushBits(bits, bytes.length, charCountBits(version));
  for (let i = 0; i < bytes.length; i++) pushBits(bits, bytes[i], 8);

  // Terminator: up to four zero bits (fewer when the symbol is nearly full).
  const terminator = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < terminator; i++) bits.push(0);

  // Pad with zero bits to the next codeword boundary.
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes 11101100 / 00010001 alternating until the data area is full.
  let padIndex = 0;
  for (let written = bits.length / 8; written < codewordCount; written++, padIndex++) {
    pushBits(bits, padIndex % 2 === 0 ? 0xec : 0x11, 8);
  }

  const codewords = new Uint8Array(codewordCount);
  for (let i = 0; i < codewordCount; i++) {
    let value = 0;
    for (let bit = 0; bit < 8; bit++) value = (value << 1) | bits[i * 8 + bit];
    codewords[i] = value;
  }
  return codewords;
}

/** Append `length` bits of `value`, most-significant bit first. */
function pushBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

/**
 * Split data codewords into blocks, append Reed-Solomon EC codewords and
 * interleave everything into the final codeword sequence.
 */
function interleaveBlocks(data: Uint8Array, version: number, level: EcLevel): Uint8Array {
  const groups = blockLayout(version, level);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const group of groups) {
    for (let i = 0; i < group.count; i++) {
      const block = data.subarray(offset, offset + group.dataCodewords);
      offset += group.dataCodewords;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, group.ecCodewords));
    }
  }

  const blockCount = dataBlocks.length;
  const ecLength = ecBlocks[0].length;
  let maxDataLength = 0;
  for (const block of dataBlocks) maxDataLength = Math.max(maxDataLength, block.length);

  const total = data.length + blockCount * ecLength;
  const result = new Uint8Array(total);
  let index = 0;
  // Data codewords first, one codeword per block per column.
  for (let i = 0; i < maxDataLength; i++) {
    for (let block = 0; block < blockCount; block++) {
      if (i < dataBlocks[block].length) result[index++] = dataBlocks[block][i];
    }
  }
  // Then the error-correction codewords, one per block per column.
  for (let i = 0; i < ecLength; i++) {
    for (let block = 0; block < blockCount; block++) result[index++] = ecBlocks[block][i];
  }
  return result;
}

/**
 * Build one complete symbol for a specific mask.
 *
 * Function modules are laid out first, then the format/version information, and
 * finally the codewords are placed in the zig-zag order defined by the standard.
 * Cells still `null` after the function patterns are the data area.
 */
function buildMatrix(version: number, level: EcLevel, codewords: Uint8Array, mask: number): QrMatrix {
  const size = version * 4 + 17;
  const cells: Array<boolean | null> = new Array<boolean | null>(size * size).fill(null);

  placeFinderPatterns(cells, size);
  placeTimingPatterns(cells, size);
  placeAlignmentPatterns(cells, size, version);
  placeFormatInfo(cells, size, level, mask);
  if (version >= 7) placeVersionInfo(cells, size, version);
  placeData(cells, size, codewords, mask);

  const data = new Uint8Array(size * size);
  for (let i = 0; i < data.length; i++) data[i] = cells[i] === true ? 1 : 0;

  return {
    size,
    version,
    level,
    mask,
    data,
    get(x: number, y: number): boolean {
      if (x < 0 || y < 0 || x >= size || y >= size) return false;
      return data[y * size + x] === 1;
    },
  };
}

/** Finder patterns (7x7) plus their one-module light separators. */
function placeFinderPatterns(cells: Array<boolean | null>, size: number): void {
  const origins: Array<[number, number]> = [
    [0, 0], // top-left
    [0, size - 7], // top-right
    [size - 7, 0], // bottom-left
  ];
  for (const [top, left] of origins) {
    for (let row = -1; row <= 7; row++) {
      for (let col = -1; col <= 7; col++) {
        const y = top + row;
        const x = left + col;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        const dark =
          (row >= 0 && row <= 6 && (col === 0 || col === 6)) ||
          (col >= 0 && col <= 6 && (row === 0 || row === 6)) ||
          (row >= 2 && row <= 4 && col >= 2 && col <= 4);
        cells[y * size + x] = dark;
      }
    }
  }
}

/** Timing patterns: alternating dark/light modules between the finder patterns. */
function placeTimingPatterns(cells: Array<boolean | null>, size: number): void {
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    cells[i * size + 6] = dark;
    cells[6 * size + i] = dark;
  }
}

/** Alignment patterns: 5x5 targets centred on the version's coordinate grid. */
function placeAlignmentPatterns(cells: Array<boolean | null>, size: number, version: number): void {
  const positions = alignmentPositions(version);
  if (positions.length === 0) return;
  const last = positions.length - 1;
  for (let rowIndex = 0; rowIndex <= last; rowIndex++) {
    for (let colIndex = 0; colIndex <= last; colIndex++) {
      // The three finder corners do not get alignment patterns.
      if (
        (rowIndex === 0 && colIndex === 0) ||
        (rowIndex === 0 && colIndex === last) ||
        (rowIndex === last && colIndex === 0)
      ) {
        continue;
      }
      const centreRow = positions[rowIndex];
      const centreCol = positions[colIndex];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          // Dark outer ring, light inner ring, dark centre.
          cells[(centreRow + dr) * size + (centreCol + dc)] = ring === 0 || ring === 2;
        }
      }
    }
  }
}

/** Place the 15 format-information bits around the top-left finder and the copies. */
function placeFormatInfo(cells: Array<boolean | null>, size: number, level: EcLevel, mask: number): void {
  const bits = formatInfo(level, mask);
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;

    // Vertical strip (bit 0 at the top, then skipping the timing row 6).
    const verticalRow = i < 6 ? i : i < 8 ? i + 1 : size - 15 + i;
    cells[verticalRow * size + 8] = dark;

    // Horizontal strip (bit 0 at the right edge, then skipping the timing column 6).
    const horizontalCol = i < 8 ? size - i - 1 : i === 8 ? 7 : 15 - i - 1;
    cells[8 * size + horizontalCol] = dark;
  }

  // The "dark module" directly above the bottom-left finder separator is always dark.
  cells[(size - 8) * size + 8] = true;
}

/** Place the 18 version-information bits for versions 7 and above. */
function placeVersionInfo(cells: Array<boolean | null>, size: number, version: number): void {
  const bits = versionInfo(version);
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >> i) & 1) === 1;
    const row = Math.floor(i / 3);
    const col = (i % 3) + size - 11;
    // Two copies: above the bottom-left finder and left of the top-right finder.
    cells[row * size + col] = dark;
    cells[col * size + row] = dark;
  }
}

/**
 * Place the interleaved codewords in the standard zig-zag order: two-module
 * columns from right to left, alternating upwards/downwards, skipping the
 * vertical timing column (column 6). Remainder bits read as light.
 */
function placeData(cells: Array<boolean | null>, size: number, codewords: Uint8Array, mask: number): void {
  const isMasked = maskCondition(mask);
  let direction = -1;
  let row = size - 1;
  let byteIndex = 0;
  let bitIndex = 7;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (;;) {
      for (let offset = 0; offset < 2; offset++) {
        const x = col - offset;
        const index = row * size + x;
        if (cells[index] !== null) continue;

        let dark = byteIndex < codewords.length ? ((codewords[byteIndex] >>> bitIndex) & 1) === 1 : false;
        if (isMasked(row, x)) dark = !dark;
        cells[index] = dark;

        bitIndex -= 1;
        if (bitIndex < 0) {
          byteIndex += 1;
          bitIndex = 7;
        }
      }
      row += direction;
      if (row < 0 || row >= size) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
}

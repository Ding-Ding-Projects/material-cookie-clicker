/**
 * QR matrix encoding.
 *
 * This module produces the module grid only. Painting it is the surface's job,
 * so nothing here touches a document, a canvas or an image, and no external
 * code-generation service is ever contacted.
 *
 * The encoder implements byte mode at error-correction level M for versions 1
 * to 10, which covers the otpauth URIs this product produces. Longer input is
 * refused with a plain message rather than silently truncated.
 */

export const QR_ERROR_CORRECTION_LEVEL = "M";
export const QR_MIN_VERSION = 1;
export const QR_MAX_VERSION = 10;

/** Total codewords, data codewords and block layout per version at level M. */
type VersionSpec = {
  totalCodewords: number;
  ecCodewordsPerBlock: number;
  group1Blocks: number;
  group1DataCodewords: number;
  group2Blocks: number;
  group2DataCodewords: number;
  alignment: number[];
};

const VERSION_SPECS: Record<number, VersionSpec> = {
  1: { totalCodewords: 26, ecCodewordsPerBlock: 10, group1Blocks: 1, group1DataCodewords: 16, group2Blocks: 0, group2DataCodewords: 0, alignment: [] },
  2: { totalCodewords: 44, ecCodewordsPerBlock: 16, group1Blocks: 1, group1DataCodewords: 28, group2Blocks: 0, group2DataCodewords: 0, alignment: [6, 18] },
  3: { totalCodewords: 70, ecCodewordsPerBlock: 26, group1Blocks: 1, group1DataCodewords: 44, group2Blocks: 0, group2DataCodewords: 0, alignment: [6, 22] },
  4: { totalCodewords: 100, ecCodewordsPerBlock: 18, group1Blocks: 2, group1DataCodewords: 32, group2Blocks: 0, group2DataCodewords: 0, alignment: [6, 26] },
  5: { totalCodewords: 134, ecCodewordsPerBlock: 24, group1Blocks: 2, group1DataCodewords: 43, group2Blocks: 0, group2DataCodewords: 0, alignment: [6, 30] },
  6: { totalCodewords: 172, ecCodewordsPerBlock: 16, group1Blocks: 4, group1DataCodewords: 27, group2Blocks: 0, group2DataCodewords: 0, alignment: [6, 34] },
  7: { totalCodewords: 196, ecCodewordsPerBlock: 18, group1Blocks: 4, group1DataCodewords: 31, group2Blocks: 0, group2DataCodewords: 0, alignment: [6, 22, 38] },
  8: { totalCodewords: 242, ecCodewordsPerBlock: 22, group1Blocks: 2, group1DataCodewords: 38, group2Blocks: 2, group2DataCodewords: 39, alignment: [6, 24, 42] },
  9: { totalCodewords: 292, ecCodewordsPerBlock: 22, group1Blocks: 3, group1DataCodewords: 36, group2Blocks: 2, group2DataCodewords: 37, alignment: [6, 26, 46] },
  10: { totalCodewords: 346, ecCodewordsPerBlock: 26, group1Blocks: 4, group1DataCodewords: 43, group2Blocks: 1, group2DataCodewords: 44, alignment: [6, 28, 50] },
};

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    EXP[index] = value;
    LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) EXP[index] = EXP[index - 255] ?? 0;
}

function gfMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  return EXP[(LOG[left] ?? 0) + (LOG[right] ?? 0)] ?? 0;
}

function generatorPolynomial(degree: number): number[] {
  let poly = [1];
  for (let index = 0; index < degree; index += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let position = 0; position < poly.length; position += 1) {
      const coefficient = poly[position] ?? 0;
      next[position] = (next[position] ?? 0) ^ gfMultiply(coefficient, EXP[index] ?? 0);
      next[position + 1] = (next[position + 1] ?? 0) ^ coefficient;
    }
    poly = next;
  }
  return poly;
}

function errorCorrection(data: readonly number[], degree: number): number[] {
  const generator = generatorPolynomial(degree);
  const remainder = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ (remainder[0] ?? 0);
    remainder.shift();
    remainder.push(0);
    for (let index = 0; index < degree; index += 1) {
      remainder[index] = (remainder[index] ?? 0) ^ gfMultiply(generator[index + 1] ?? 0, factor);
    }
  }
  return remainder;
}

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

function dataCodewordCount(spec: VersionSpec): number {
  return spec.group1Blocks * spec.group1DataCodewords + spec.group2Blocks * spec.group2DataCodewords;
}

function chooseVersion(byteLength: number): { version: number; spec: VersionSpec } {
  for (let version = QR_MIN_VERSION; version <= QR_MAX_VERSION; version += 1) {
    const spec = VERSION_SPECS[version];
    if (!spec) continue;
    const countBits = version <= 9 ? 8 : 16;
    const requiredBits = 4 + countBits + byteLength * 8;
    if (requiredBits <= dataCodewordCount(spec) * 8) return { version, spec };
  }
  throw new Error(
    `The text is too long for a version ${QR_MAX_VERSION} code at error-correction level ${QR_ERROR_CORRECTION_LEVEL}.`,
  );
}

function buildDataCodewords(bytes: readonly number[], version: number, spec: VersionSpec): number[] {
  const bits: number[] = [];
  const pushBits = (value: number, length: number): void => {
    for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) pushBits(byte, 8);

  const capacityBits = dataCodewordCount(spec) * 8;
  for (let index = 0; index < 4 && bits.length < capacityBits; index += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | (bits[index + offset] ?? 0);
    codewords.push(byte);
  }
  const padding = [0xec, 0x11];
  let paddingIndex = 0;
  while (codewords.length < dataCodewordCount(spec)) {
    codewords.push(padding[paddingIndex % 2] ?? 0);
    paddingIndex += 1;
  }
  return codewords;
}

function interleave(codewords: readonly number[], spec: VersionSpec): number[] {
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let cursor = 0;
  const layout: { count: number; size: number }[] = [
    { count: spec.group1Blocks, size: spec.group1DataCodewords },
    { count: spec.group2Blocks, size: spec.group2DataCodewords },
  ];
  for (const group of layout) {
    for (let index = 0; index < group.count; index += 1) {
      const block = codewords.slice(cursor, cursor + group.size);
      cursor += group.size;
      blocks.push(block);
      ecBlocks.push(errorCorrection(block, spec.ecCodewordsPerBlock));
    }
  }
  const output: number[] = [];
  const longestBlock = Math.max(...blocks.map((block) => block.length));
  for (let index = 0; index < longestBlock; index += 1) {
    for (const block of blocks) {
      const value = block[index];
      if (value !== undefined) output.push(value);
    }
  }
  for (let index = 0; index < spec.ecCodewordsPerBlock; index += 1) {
    for (const block of ecBlocks) output.push(block[index] ?? 0);
  }
  return output;
}

function formatBits(mask: number): number {
  // Error-correction level M is 0b00 in the format information.
  const data = (0b00 << 3) | mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function versionInformationBits(version: number): number {
  let remainder = version;
  for (let index = 0; index < 12; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  return (version << 12) | remainder;
}

function maskCondition(mask: number, row: number, column: number): boolean {
  switch (mask) {
    case 0:
      return (row + column) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return column % 3 === 0;
    case 3:
      return (row + column) % 3 === 0;
    case 4:
      return (Math.floor(column / 3) + Math.floor(row / 2)) % 2 === 0;
    case 5:
      return ((row * column) % 2) + ((row * column) % 3) === 0;
    case 6:
      return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
    default:
      return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0;
  }
}

type Grid = {
  size: number;
  modules: boolean[][];
  reserved: boolean[][];
};

function createGrid(size: number): Grid {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function setFunctionModule(grid: Grid, row: number, column: number, dark: boolean): void {
  if (row < 0 || column < 0 || row >= grid.size || column >= grid.size) return;
  const modulesRow = grid.modules[row];
  const reservedRow = grid.reserved[row];
  if (!modulesRow || !reservedRow) return;
  modulesRow[column] = dark;
  reservedRow[column] = true;
}

function drawFinder(grid: Grid, topRow: number, leftColumn: number): void {
  for (let row = -1; row <= 7; row += 1) {
    for (let column = -1; column <= 7; column += 1) {
      const inner = row >= 0 && row <= 6 && column >= 0 && column <= 6;
      const dark =
        inner &&
        (row === 0 || row === 6 || column === 0 || column === 6 ||
          (row >= 2 && row <= 4 && column >= 2 && column <= 4));
      setFunctionModule(grid, topRow + row, leftColumn + column, dark);
    }
  }
}

function drawAlignment(grid: Grid, centreRow: number, centreColumn: number): void {
  for (let row = -2; row <= 2; row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      const distance = Math.max(Math.abs(row), Math.abs(column));
      setFunctionModule(grid, centreRow + row, centreColumn + column, distance !== 1);
    }
  }
}

function drawFunctionPatterns(grid: Grid, version: number, spec: VersionSpec): void {
  const size = grid.size;

  for (let index = 0; index < size; index += 1) {
    setFunctionModule(grid, 6, index, index % 2 === 0);
    setFunctionModule(grid, index, 6, index % 2 === 0);
  }

  drawFinder(grid, 0, 0);
  drawFinder(grid, 0, size - 7);
  drawFinder(grid, size - 7, 0);

  const positions = spec.alignment;
  for (const row of positions) {
    for (const column of positions) {
      const atFinder =
        (row === 6 && column === 6) ||
        (row === 6 && column === size - 7) ||
        (row === size - 7 && column === 6);
      if (!atFinder) drawAlignment(grid, row, column);
    }
  }

  // Reserve exactly the format-information modules; the real bits are written
  // once a mask has been chosen. The timing row and column are not part of
  // that area and keep the values written above.
  drawFormatBits(grid, 0);

  if (version >= 7) {
    const bits = versionInformationBits(version);
    for (let index = 0; index < 18; index += 1) {
      const dark = ((bits >>> index) & 1) === 1;
      const a = size - 11 + (index % 3);
      const b = Math.floor(index / 3);
      setFunctionModule(grid, b, a, dark);
      setFunctionModule(grid, a, b, dark);
    }
  }
}

function drawFormatBits(grid: Grid, mask: number): void {
  const size = grid.size;
  const bits = formatBits(mask);
  const bitAt = (index: number): boolean => ((bits >>> index) & 1) === 1;
  for (let index = 0; index <= 5; index += 1) setFunctionModule(grid, index, 8, bitAt(index));
  setFunctionModule(grid, 7, 8, bitAt(6));
  setFunctionModule(grid, 8, 8, bitAt(7));
  setFunctionModule(grid, 8, 7, bitAt(8));
  for (let index = 9; index < 15; index += 1) setFunctionModule(grid, 8, 14 - index, bitAt(index));
  for (let index = 0; index < 8; index += 1) setFunctionModule(grid, 8, size - 1 - index, bitAt(index));
  for (let index = 8; index < 15; index += 1) setFunctionModule(grid, size - 15 + index, 8, bitAt(index));
  setFunctionModule(grid, size - 8, 8, true);
}

function placeCodewords(grid: Grid, codewords: readonly number[]): void {
  const size = grid.size;
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    const column = right === 6 ? 5 : right;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const currentColumn = column - offset;
        const upward = ((column + 1) & 2) === 0;
        const row = upward ? size - 1 - vertical : vertical;
        if (grid.reserved[row]?.[currentColumn]) continue;
        if (bitIndex >= totalBits) continue;
        const byte = codewords[bitIndex >>> 3] ?? 0;
        const dark = ((byte >>> (7 - (bitIndex & 7))) & 1) === 1;
        const modulesRow = grid.modules[row];
        if (modulesRow) modulesRow[currentColumn] = dark;
        bitIndex += 1;
      }
    }
  }
}

function applyMask(grid: Grid, mask: number): void {
  for (let row = 0; row < grid.size; row += 1) {
    for (let column = 0; column < grid.size; column += 1) {
      if (grid.reserved[row]?.[column]) continue;
      if (!maskCondition(mask, row, column)) continue;
      const modulesRow = grid.modules[row];
      if (modulesRow) modulesRow[column] = !modulesRow[column];
    }
  }
}

function lineRuns(line: readonly boolean[]): number {
  let penalty = 0;
  let runLength = 1;
  for (let index = 1; index < line.length; index += 1) {
    if (line[index] === line[index - 1]) {
      runLength += 1;
      if (runLength === 5) penalty += 3;
      else if (runLength > 5) penalty += 1;
    } else {
      runLength = 1;
    }
  }
  return penalty;
}

function hasFinderLikePattern(line: readonly boolean[], start: number): boolean {
  const core = [true, false, true, true, true, false, true];
  for (let index = 0; index < core.length; index += 1) {
    if (line[start + index] !== core[index]) return false;
  }
  const before = line.slice(Math.max(0, start - 4), start);
  const after = line.slice(start + 7, start + 11);
  const quietBefore = before.length === 4 && before.every((value) => value === false);
  const quietAfter = after.length === 4 && after.every((value) => value === false);
  return quietBefore || quietAfter;
}

function penaltyScore(grid: Grid): number {
  const size = grid.size;
  let penalty = 0;
  const columns: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const value = grid.modules[row]?.[column] ?? false;
      const columnLine = columns[column];
      if (columnLine) columnLine[row] = value;
    }
  }

  for (let row = 0; row < size; row += 1) {
    const line = grid.modules[row] ?? [];
    penalty += lineRuns(line);
    for (let start = 0; start + 7 <= size; start += 1) {
      if (hasFinderLikePattern(line, start)) penalty += 40;
    }
  }
  for (let column = 0; column < size; column += 1) {
    const line = columns[column] ?? [];
    penalty += lineRuns(line);
    for (let start = 0; start + 7 <= size; start += 1) {
      if (hasFinderLikePattern(line, start)) penalty += 40;
    }
  }

  for (let row = 0; row + 1 < size; row += 1) {
    for (let column = 0; column + 1 < size; column += 1) {
      const value = grid.modules[row]?.[column] ?? false;
      if (
        value === grid.modules[row]?.[column + 1] &&
        value === grid.modules[row + 1]?.[column] &&
        value === grid.modules[row + 1]?.[column + 1]
      ) {
        penalty += 3;
      }
    }
  }

  let dark = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) if (grid.modules[row]?.[column]) dark += 1;
  }
  const percent = (dark * 100) / (size * size);
  penalty += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return penalty;
}

function cloneGrid(grid: Grid): Grid {
  return {
    size: grid.size,
    modules: grid.modules.map((row) => [...row]),
    reserved: grid.reserved.map((row) => [...row]),
  };
}

/**
 * Encodes text as a QR module grid. `true` is a dark module. The caller adds
 * the quiet zone when painting.
 */
export function encodeQrMatrix(text: string): boolean[][] {
  if (text.length === 0) throw new Error("There is nothing to encode.");
  const bytes = utf8Bytes(text);
  const { version, spec } = chooseVersion(bytes.length);
  const codewords = interleave(buildDataCodewords(bytes, version, spec), spec);

  const base = createGrid(version * 4 + 17);
  drawFunctionPatterns(base, version, spec);
  placeCodewords(base, codewords);

  let best: Grid | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = cloneGrid(base);
    applyMask(candidate, mask);
    drawFormatBits(candidate, mask);
    const score = penaltyScore(candidate);
    if (score < bestPenalty) {
      bestPenalty = score;
      best = candidate;
    }
  }
  if (!best) throw new Error("No mask pattern could be selected.");
  return best.modules;
}

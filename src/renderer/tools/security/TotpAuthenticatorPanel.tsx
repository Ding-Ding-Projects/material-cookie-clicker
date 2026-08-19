import { useEffect, useId, useMemo, useRef, useState } from 'react';

import type { LanguageMode } from '../../game/app-settings.js';
import { formatBilingual, type Bilingual } from '../../game/copy.js';
import {
  clearTotpSelection,
  createManualTotpProfile,
  createTotpCodeViewModel,
  createTotpListModel,
  importTotpFromClipboard,
  importTotpFromImage,
  invertVisibleTotpSelection,
  formatOtpAuthUri,
  parseOtpAuthUri,
  selectAllVisibleTotp,
  selectedTotpEntries,
  toggleTotpSelection,
  totpGroupSummary,
  visibleTotpEntries,
  asTotpProfile,
  type LocalOtpImageSource,
  type OtpAlgorithm,
  type OtpCryptoPort,
  type OtpDigits,
  type TotpAuthenticatorEntry,
  type TotpClipboardImportAdapter,
  type TotpCodeViewModel,
  type TotpImageImportAdapter,
  type TotpImportRequest,
  type TotpProfile,
} from '../../../shared/security-totp.js';

/**
 * Local QR matrix encoding copied from the surface-kernel implementation.
 *
 * It is intentionally local to this renderer file because both application
 * tsconfigs reject the workspace package's TypeScript extension exports. The
 * focused test compares this function with the kernel implementation so the
 * copies cannot drift silently.
 *
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
export function encodeLocalOtpQrMatrix(text: string): boolean[][] {
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


const CODE_RENDER_LIMIT = 200;

const COPY = {
  title: { en: 'Authenticator', yue: '驗證碼器' },
  description: {
    en: 'Import or create local TOTP entries. Codes are calculated on this device.',
    yue: '匯入或者建立本機 TOTP 項目。驗證碼只會喺呢部機計算。',
  },
  privacy: {
    en: 'Nothing is sent over the network. Secrets are never logged, searched, or included in ordinary exports.',
    yue: '唔會經網絡傳送任何嘢。密鑰唔會寫入記錄、搜尋內容或者一般匯出。',
  },
  importHeading: { en: 'Add an entry', yue: '加入項目' },
  issuer: { en: 'Issuer', yue: '發行者' },
  account: { en: 'Account', yue: '帳戶' },
  secret: { en: 'Base32 secret', yue: 'Base32 密鑰' },
  algorithm: { en: 'Algorithm', yue: '演算法' },
  digits: { en: 'Digits', yue: '位數' },
  period: { en: 'Period in seconds', yue: '週期秒數' },
  group: { en: 'Group', yue: '群組' },
  addManual: { en: 'Add manual entry', yue: '加入手動項目' },
  previewQr: { en: 'Preview pairing QR', yue: '預覽配對 QR' },
  hideQr: { en: 'Hide pairing QR', yue: '收起配對 QR' },
  qrWarning: {
    en: 'This QR contains the secret. Keep it private and do not capture it.',
    yue: '呢個 QR 包含密鑰。請保持私密，唔好擷取畫面。',
  },
  uri: { en: 'Paste an otpauth URI', yue: '貼上 otpauth URI' },
  importUri: { en: 'Import URI', yue: '匯入 URI' },
  importClipboard: { en: 'Read URI from clipboard', yue: '由剪貼簿讀取 URI' },
  importImage: { en: 'Read QR from an image', yue: '由圖片讀取 QR' },
  listHeading: { en: 'Saved entries', yue: '已儲存項目' },
  search: { en: 'Search issuer, account, or group', yue: '搜尋發行者、帳戶或者群組' },
  allGroups: { en: 'All groups', yue: '所有群組' },
  noGroup: { en: 'No group', yue: '冇群組' },
  current: { en: 'Current code', yue: '目前驗證碼' },
  next: { en: 'Next code', yue: '下一個驗證碼' },
  seconds: { en: 'seconds remaining', yue: '秒後更新' },
  copyCode: { en: 'Copy current code', yue: '複製目前驗證碼' },
  selectAll: { en: 'Select all visible', yue: '揀晒目前顯示項目' },
  invert: { en: 'Invert visible selection', yue: '反轉目前顯示選擇' },
  clear: { en: 'Clear selection', yue: '清除選擇' },
  deleteSelected: { en: 'Delete selected', yue: '刪除已選項目' },
  selected: { en: 'selected', yue: '個已選' },
  empty: { en: 'No authenticator entries match this view.', yue: '呢個檢視冇符合嘅驗證碼項目。' },
  truncated: {
    en: `Only the first ${CODE_RENDER_LIMIT} matching codes are rendered at once. Refine the search to see another entry.`,
    yue: `每次只會顯示頭 ${CODE_RENDER_LIMIT} 個符合項目。收窄搜尋就可以睇其他項目。`,
  },
  pending: { en: 'Calculating locally…', yue: '喺本機計算緊…' },
  imported: { en: 'Entry ready to save locally.', yue: '項目已準備好喺本機儲存。' },
} as const satisfies Record<string, Bilingual>;

function text(copy: Bilingual, mode: LanguageMode): string {
  return formatBilingual(copy, mode);
}

function localError(error: unknown): string {
  return error instanceof Error ? error.message : 'The local authenticator operation failed.';
}

function adapterError(copy: Bilingual, mode: LanguageMode): string {
  return `${text(copy, mode)} — ${text({
    en: 'the local adapter could not complete the read.',
    yue: '本機轉接器未能完成讀取。',
  }, mode)}`;
}

function QrMatrix({ matrix, mode }: { readonly matrix: readonly (readonly boolean[])[]; readonly mode: LanguageMode }) {
  const size = matrix.length;
  return (
    <svg
      viewBox={`-4 -4 ${size + 8} ${size + 8}`}
      width="240"
      height="240"
      role="img"
      aria-label={text({ en: 'TOTP pairing QR code containing the secret', yue: '包含 TOTP 密鑰嘅配對 QR code' }, mode)}
      style={{ background: '#fff', color: '#000', maxWidth: '100%', height: 'auto' }}
      shapeRendering="crispEdges"
    >
      <rect x={-4} y={-4} width={size + 8} height={size + 8} fill="#fff" />
      {matrix.flatMap((row, rowIndex) =>
        row.map((dark, columnIndex) =>
          dark ? <rect key={`${rowIndex}-${columnIndex}`} x={columnIndex} y={rowIndex} width="1" height="1" fill="#000" /> : null,
        ),
      )}
    </svg>
  );
}

export interface TotpAuthenticatorPanelProps {
  readonly entries?: readonly TotpAuthenticatorEntry[];
  readonly languageMode?: LanguageMode;
  readonly crypto?: OtpCryptoPort;
  readonly clipboardAdapter?: TotpClipboardImportAdapter;
  readonly imageAdapter?: TotpImageImportAdapter;
  readonly onImport?: (request: TotpImportRequest) => void | Promise<void>;
  readonly onDeleteSelected?: (entries: readonly TotpAuthenticatorEntry[]) => void | Promise<void>;
  readonly onCopyCode?: (code: string) => void | Promise<void>;
}

/**
 * Accessible bilingual authenticator destination. Storage and credential-vault
 * ownership stay outside the renderer; this panel emits import/delete intents
 * and never persists, transmits, or logs a shared secret.
 */
export function TotpAuthenticatorPanel({
  entries: controlledEntries,
  languageMode = 'both',
  crypto,
  clipboardAdapter,
  imageAdapter,
  onImport,
  onDeleteSelected,
  onCopyCode,
}: TotpAuthenticatorPanelProps) {
  const id = useId();
  const localId = useRef(0);
  const [localEntries, setLocalEntries] = useState<readonly TotpAuthenticatorEntry[]>([]);
  const entries = controlledEntries ?? localEntries;
  const [issuer, setIssuer] = useState('');
  const [account, setAccount] = useState('');
  const [secret, setSecret] = useState('');
  const [algorithm, setAlgorithm] = useState<OtpAlgorithm>('SHA1');
  const [digits, setDigits] = useState<OtpDigits>(6);
  const [periodSeconds, setPeriodSeconds] = useState(30);
  const [group, setGroup] = useState('');
  const [uri, setUri] = useState('');
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [preview, setPreview] = useState<TotpProfile | null>(null);
  const [codes, setCodes] = useState<Readonly<Record<string, TotpCodeViewModel>>>({});
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const model = useMemo(
    () => createTotpListModel(entries, { query, group: groupFilter }, selectedIds),
    [entries, groupFilter, query, selectedIds],
  );
  const visible = useMemo(() => visibleTotpEntries(model), [model]);
  const renderedEntries = useMemo(() => visible.slice(0, CODE_RENDER_LIMIT), [visible]);
  const groups = useMemo(() => totpGroupSummary(entries), [entries]);
  const selected = useMemo(() => selectedTotpEntries(model), [model]);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    async function refresh(): Promise<void> {
      const currentGeneration = ++generation;
      const calculated = await Promise.all(
        renderedEntries.map(async (entry) => [entry.id, await createTotpCodeViewModel(entry, Date.now(), crypto)] as const),
      ).catch(() => null);
      if (disposed || currentGeneration !== generation || !calculated) return;
      setCodes(Object.fromEntries(calculated));
    }
    void refresh();
    const timer = globalThis.setInterval(() => void refresh(), 500);
    return () => {
      disposed = true;
      globalThis.clearInterval(timer);
    };
  }, [crypto, renderedEntries]);

  function manualProfile(): TotpProfile {
    return createManualTotpProfile({ issuer, account, secret, algorithm, digits, periodSeconds });
  }

  async function emitImport(profile: TotpProfile): Promise<void> {
    const request = { profile, group: group.trim() } satisfies TotpImportRequest;
    if (onImport) {
      try {
        await onImport(request);
      } catch {
        throw new Error('The local credential store did not save the entry.');
      }
    }
    else {
      localId.current += 1;
      setLocalEntries((current) => [
        ...current,
        { ...profile, group: request.group, id: `local-${Date.now().toString(36)}-${localId.current}` },
      ]);
    }
    setStatus(text(COPY.imported, languageMode));
    setError('');
    setPreview(null);
    setSecret('');
    setUri('');
  }

  async function importUriText(value: string): Promise<void> {
    try {
      await emitImport(asTotpProfile(parseOtpAuthUri(value)));
    } catch (caught) {
      setStatus('');
      setError(localError(caught));
    }
  }

  function updateSelection(next: ReturnType<typeof createTotpListModel>): void {
    setSelectedIds(next.selectedIds);
  }

  return (
    <section className="settings-block totp-authenticator" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{text(COPY.title, languageMode)}</h2>
      <p>{text(COPY.description, languageMode)}</p>
      <p className="settings-note settings-note--honest">{text(COPY.privacy, languageMode)}</p>

      <form
        aria-labelledby={`${id}-add-heading`}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            void emitImport(manualProfile()).catch((caught) => setError(localError(caught)));
          } catch (caught) {
            setStatus('');
            setError(localError(caught));
          }
        }}
      >
        <h3 id={`${id}-add-heading`}>{text(COPY.importHeading, languageMode)}</h3>
        <div className="settings-grid">
          <label htmlFor={`${id}-issuer`}>{text(COPY.issuer, languageMode)}</label>
          <input id={`${id}-issuer`} value={issuer} maxLength={256} autoComplete="off" onChange={(event) => setIssuer(event.target.value)} />

          <label htmlFor={`${id}-account`}>{text(COPY.account, languageMode)}</label>
          <input id={`${id}-account`} value={account} maxLength={256} autoComplete="off" onChange={(event) => setAccount(event.target.value)} />

          <label htmlFor={`${id}-secret`}>{text(COPY.secret, languageMode)}</label>
          <input
            id={`${id}-secret`}
            value={secret}
            type="password"
            maxLength={320}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(event) => {
              setSecret(event.target.value);
              setPreview(null);
            }}
          />

          <label htmlFor={`${id}-algorithm`}>{text(COPY.algorithm, languageMode)}</label>
          <select id={`${id}-algorithm`} value={algorithm} onChange={(event) => setAlgorithm(event.target.value as OtpAlgorithm)}>
            <option value="SHA1">SHA-1</option>
            <option value="SHA256">SHA-256</option>
            <option value="SHA512">SHA-512</option>
          </select>

          <label htmlFor={`${id}-digits`}>{text(COPY.digits, languageMode)}</label>
          <select id={`${id}-digits`} value={digits} onChange={(event) => setDigits(Number(event.target.value) as OtpDigits)}>
            <option value={6}>6</option>
            <option value={7}>7</option>
            <option value={8}>8</option>
          </select>

          <label htmlFor={`${id}-period`}>{text(COPY.period, languageMode)}</label>
          <input
            id={`${id}-period`}
            type="number"
            min={5}
            max={300}
            step={1}
            value={periodSeconds}
            onChange={(event) => setPeriodSeconds(Number(event.target.value))}
          />

          <label htmlFor={`${id}-group`}>{text(COPY.group, languageMode)}</label>
          <input id={`${id}-group`} value={group} maxLength={80} autoComplete="off" onChange={(event) => setGroup(event.target.value)} />
        </div>

        <div className="button-row">
          <button type="submit">{text(COPY.addManual, languageMode)}</button>
          <button
            type="button"
            aria-expanded={preview !== null}
            aria-controls={`${id}-qr-preview`}
            onClick={() => {
              if (preview) {
                setPreview(null);
                return;
              }
              try {
                setPreview(manualProfile());
                setError('');
              } catch (caught) {
                setError(localError(caught));
              }
            }}
          >
            {text(preview ? COPY.hideQr : COPY.previewQr, languageMode)}
          </button>
        </div>
      </form>

      {preview ? (
        <div id={`${id}-qr-preview`} role="region" aria-label={text(COPY.previewQr, languageMode)}>
          <p className="settings-note settings-note--honest">{text(COPY.qrWarning, languageMode)}</p>
          <QrMatrix matrix={encodeLocalOtpQrMatrix(formatOtpAuthUri(preview))} mode={languageMode} />
        </div>
      ) : null}

      <div className="settings-grid" role="group" aria-label={text(COPY.uri, languageMode)}>
        <label htmlFor={`${id}-uri`}>{text(COPY.uri, languageMode)}</label>
        <textarea
          id={`${id}-uri`}
          rows={3}
          maxLength={4_096}
          value={uri}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setUri(event.target.value)}
        />
        <div className="button-row">
          <button type="button" disabled={!uri.trim()} onClick={() => void importUriText(uri)}>
            {text(COPY.importUri, languageMode)}
          </button>
          <button
            type="button"
            disabled={!clipboardAdapter}
            title={clipboardAdapter ? undefined : text({ en: 'Clipboard reading is unavailable here.', yue: '呢度未能讀取剪貼簿。' }, languageMode)}
            onClick={() => {
              if (!clipboardAdapter) return;
              void importTotpFromClipboard(clipboardAdapter)
                .then(emitImport)
                .catch(() => setError(adapterError(COPY.importClipboard, languageMode)));
            }}
          >
            {text(COPY.importClipboard, languageMode)}
          </button>
          <label className="button-like" htmlFor={`${id}-image`}>
            {text(COPY.importImage, languageMode)}
          </label>
          <input
            id={`${id}-image`}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
            disabled={!imageAdapter}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] as LocalOtpImageSource | undefined;
              event.currentTarget.value = '';
              if (!file || !imageAdapter) return;
              void importTotpFromImage(imageAdapter, file)
                .then(emitImport)
                .catch(() => setError(adapterError(COPY.importImage, languageMode)));
            }}
          />
        </div>
      </div>

      <div aria-live="polite" role="status">{status}</div>
      {error ? <p role="alert">{error}</p> : null}

      <section aria-labelledby={`${id}-list-heading`}>
        <h3 id={`${id}-list-heading`}>{text(COPY.listHeading, languageMode)}</h3>
        <div className="settings-grid">
          <label htmlFor={`${id}-search`}>{text(COPY.search, languageMode)}</label>
          <input
            id={`${id}-search`}
            type="search"
            maxLength={256}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <label htmlFor={`${id}-group-filter`}>{text(COPY.group, languageMode)}</label>
          <select
            id={`${id}-group-filter`}
            value={groupFilter ?? '__all__'}
            onChange={(event) => setGroupFilter(event.target.value === '__all__' ? null : event.target.value)}
          >
            <option value="__all__">{text(COPY.allGroups, languageMode)}</option>
            {groups.map(({ group: groupName, count }) => (
              <option key={groupName || '__none__'} value={groupName}>
                {groupName || text(COPY.noGroup, languageMode)} ({count})
              </option>
            ))}
          </select>
        </div>

        <div className="bulk-toolbar" role="region" aria-label={`${selected.length} ${text(COPY.selected, languageMode)}`}>
          <span aria-live="polite">{selected.length} {text(COPY.selected, languageMode)}</span>
          <button type="button" onClick={() => updateSelection(selectAllVisibleTotp(model))}>{text(COPY.selectAll, languageMode)}</button>
          <button type="button" onClick={() => updateSelection(invertVisibleTotpSelection(model))}>{text(COPY.invert, languageMode)}</button>
          <button type="button" disabled={selected.length === 0} onClick={() => updateSelection(clearTotpSelection(model))}>
            {text(COPY.clear, languageMode)}
          </button>
          <button
            type="button"
            disabled={selected.length === 0 || (controlledEntries !== undefined && !onDeleteSelected)}
            onClick={() => {
              if (onDeleteSelected) {
                void Promise.resolve(onDeleteSelected(selected))
                  .then(() => setSelectedIds([]))
                  .catch(() => setError('The local credential store did not delete the selected entries.'));
                return;
              }
              if (controlledEntries !== undefined) return;
              const removed = new Set(selected.map(({ id: selectedId }) => selectedId));
              setLocalEntries((current) => current.filter(({ id: entryId }) => !removed.has(entryId)));
              setSelectedIds([]);
            }}
          >
            {text(COPY.deleteSelected, languageMode)} ({selected.length})
          </button>
        </div>

        {visible.length > CODE_RENDER_LIMIT ? <p role="note">{text(COPY.truncated, languageMode)}</p> : null}
        {renderedEntries.length === 0 ? <p>{text(COPY.empty, languageMode)}</p> : (
          <ul className="totp-entry-list" aria-label={text(COPY.listHeading, languageMode)}>
            {renderedEntries.map((entry) => {
              const code = codes[entry.id];
              const selectedEntry = model.selectedIds.includes(entry.id);
              return (
                <li key={entry.id} className="panel totp-entry-card">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedEntry}
                      aria-label={`${text({ en: 'Select', yue: '選擇' }, languageMode)} ${entry.issuer} ${entry.account}`}
                      onChange={() => updateSelection(toggleTotpSelection(model, entry.id))}
                    />
                    <strong>{entry.issuer}</strong> — {entry.account}
                  </label>
                  <p>{entry.group || text(COPY.noGroup, languageMode)} · {entry.algorithm} · {entry.digits} · {entry.periodSeconds}s</p>
                  {code ? (
                    <>
                      <output aria-label={text(COPY.current, languageMode)} className="totp-code">{code.groupedCurrentCode}</output>
                      <p>{text(COPY.next, languageMode)}: <span aria-hidden="true">{code.groupedNextCode}</span></p>
                      <progress
                        max={code.periodSeconds}
                        value={code.periodSeconds - code.remainingMilliseconds / 1_000}
                        aria-label={text({ en: 'Code period progress', yue: '驗證碼週期進度' }, languageMode)}
                        aria-valuetext={`${code.remainingSeconds} ${text(COPY.seconds, languageMode)}`}
                      />
                      <span>{code.remainingSeconds} {text(COPY.seconds, languageMode)}</span>
                      {onCopyCode ? (
                        <button
                          type="button"
                          onClick={() => {
                            void Promise.resolve(onCopyCode(code.currentCode)).catch(() =>
                              setError('The current code could not be copied locally.'),
                            );
                          }}
                        >
                          {text(COPY.copyCode, languageMode)}
                        </button>
                      ) : null}
                    </>
                  ) : <p role="status">{text(COPY.pending, languageMode)}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

export default TotpAuthenticatorPanel;

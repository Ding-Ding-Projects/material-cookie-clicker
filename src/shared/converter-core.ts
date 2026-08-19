import { getConverterAdapter, type DetectedFileType } from './converter-registry.js';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const UTF8_ENCODER = new TextEncoder();
const PREVIEW_LIMIT = 4096;
const MAX_JSON_DEPTH = 64;
const MAX_STRUCTURAL_TOKENS = 200_000;
const MAX_CSV_ROWS = 10_000;
const MAX_CSV_COLUMNS = 256;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

export interface DetectionResult {
  readonly type: DetectedFileType;
  readonly confidence: 'signature' | 'parsed' | 'text' | 'unknown';
  readonly detail: string;
}

export interface ConversionResult {
  readonly output: Uint8Array;
  readonly targetType: DetectedFileType;
  readonly disclosure: string;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function decodeUtf8(bytes: Uint8Array): string {
  if (bytes.includes(0)) throw new Error('Input contains NUL bytes and is not accepted as UTF-8 text.');
  return UTF8_DECODER.decode(bytes);
}

function ensureJsonBounds(text: string): void {
  let depth = 0;
  let structuralTokens = 0;
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{' || char === '[') { depth += 1; structuralTokens += 1; if (depth > MAX_JSON_DEPTH) throw new Error(`JSON nesting exceeds ${MAX_JSON_DEPTH} levels.`); }
    else if (char === '}' || char === ']') { depth -= 1; structuralTokens += 1; if (depth < 0) throw new Error('JSON closing delimiter is unmatched.'); }
    else if (char === ',' || char === ':') structuralTokens += 1;
    if (structuralTokens > MAX_STRUCTURAL_TOKENS) throw new Error(`JSON structure exceeds ${MAX_STRUCTURAL_TOKENS} bounded tokens.`);
  }
  if (depth !== 0 || inString || escaped) throw new Error('JSON structure is incomplete.');
}

function looksLikeBase64(text: string): boolean {
  const compact = text.replace(/[\r\n\t ]/g, '');
  return compact.length >= 4 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(compact);
}

export function detectFileType(bytes: Uint8Array): DetectionResult {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { type: 'pdf', confidence: 'signature', detail: 'PDF header %PDF- was found.' };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: 'png', confidence: 'signature', detail: 'PNG signature was found.' };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { type: 'jpeg', confidence: 'signature', detail: 'JPEG start-of-image signature was found.' };
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return { type: 'gif', confidence: 'signature', detail: 'GIF signature was found.' };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { type: 'webp', confidence: 'signature', detail: 'RIFF WebP signature was found.' };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x41, 0x56, 0x45], 8)) return { type: 'wav', confidence: 'signature', detail: 'RIFF WAVE signature was found.' };
  if (startsWith(bytes, [0x49, 0x44, 0x33]) || startsWith(bytes, [0xff, 0xfb]) || startsWith(bytes, [0xff, 0xf3]) || startsWith(bytes, [0xff, 0xf2])) return { type: 'mp3', confidence: 'signature', detail: 'MP3 frame or ID3 signature was found.' };
  if (bytes.length >= 12 && startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return { type: 'mp4', confidence: 'signature', detail: 'ISO BMFF ftyp box was found.' };
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { type: 'webm', confidence: 'signature', detail: 'EBML signature was found.' };
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])) return { type: 'zip', confidence: 'signature', detail: 'ZIP signature was found.' };
  if (startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return { type: '7z', confidence: 'signature', detail: '7z signature was found.' };

  try {
    const text = decodeUtf8(bytes);
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { ensureJsonBounds(trimmed); }
        catch (error) { return { type: 'unknown', confidence: 'unknown', detail: error instanceof Error ? error.message : String(error) }; }
      }
      try {
        JSON.parse(trimmed);
        return { type: 'json', confidence: 'parsed', detail: 'The complete UTF-8 payload parsed as JSON.' };
      } catch {
        if (/^[^\r\n,]*(?:,[^\r\n,]*)+(?:\r?\n|$)/.test(text)) return { type: 'csv', confidence: 'text', detail: 'UTF-8 text contains a comma-delimited first row.' };
      }
    }
    return { type: 'text', confidence: 'text', detail: 'The payload is valid UTF-8 text.' };
  } catch {
    return { type: 'unknown', confidence: 'unknown', detail: 'No allowlisted signature or valid UTF-8 text was found.' };
  }
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function jsonScalar(value: unknown): string {
  if (value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new Error('JSON → CSV accepts only flat objects containing scalar values.');
}

function jsonToCsv(text: string): string {
  ensureJsonBounds(text);
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('JSON → CSV requires a top-level array.');
  if (parsed.length === 0) return '';
  if (parsed.some((row) => row === null || Array.isArray(row) || typeof row !== 'object')) throw new Error('Every JSON array item must be an object.');
  const rows = parsed as Record<string, unknown>[];
  const headers = Object.keys(rows[0]);
  if (headers.length === 0) throw new Error('JSON objects must contain at least one field.');
  if (rows.some((row) => Object.keys(row).length !== headers.length || headers.some((header) => !(header in row)))) throw new Error('Every JSON object must contain the same fields.');
  return [headers.map(csvEscape).join(','), ...rows.map((row) => headers.map((header) => csvEscape(jsonScalar(row[header]))).join(','))].join('\r\n');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let quoteClosed = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') { quoted = false; quoteClosed = true; }
      else cell += char;
    } else if (char === '"' && cell.length === 0 && !quoteClosed) quoted = true;
    else if (char === '"') throw new Error('CSV contains a quote inside an unquoted field.');
    else if (char === ',') {
      row.push(cell); cell = ''; quoteClosed = false;
      if (row.length > MAX_CSV_COLUMNS) throw new Error(`CSV exceeds ${MAX_CSV_COLUMNS} columns.`);
    }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); rows.push(row); row = []; cell = ''; quoteClosed = false;
      if (rows.length > MAX_CSV_ROWS) throw new Error(`CSV exceeds ${MAX_CSV_ROWS} rows.`);
    } else {
      if (quoteClosed) throw new Error('CSV contains text after a closing quote.');
      cell += char;
    }
  }
  if (quoted) throw new Error('CSV input ends inside a quoted field.');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.length > MAX_CSV_COLUMNS) throw new Error(`CSV exceeds ${MAX_CSV_COLUMNS} columns.`);
    rows.push(row);
    if (rows.length > MAX_CSV_ROWS) throw new Error(`CSV exceeds ${MAX_CSV_ROWS} rows.`);
  }
  return rows;
}

function csvToJson(text: string): string {
  const rows = parseCsv(text);
  if (rows.length === 0) return '[]\n';
  const headers = rows[0];
  if (new Set(headers).size !== headers.length) throw new Error('CSV headers must be unique.');
  const records = rows.slice(1).map((row, index) => {
    if (row.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${row.length} cells; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, column) => [header, row[column]]));
  });
  return `${JSON.stringify(records, null, 2)}\n`;
}

function strictBase64Decode(text: string): Uint8Array {
  const compact = text.replace(/[\r\n\t ]/g, '');
  if (!looksLikeBase64(compact)) throw new Error('Input is not strict RFC 4648 Base64.');
  const binary = atob(compact);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const roundTrip = encodeBase64(bytes);
  if (roundTrip !== compact) throw new Error('Base64 padding or trailing bits are invalid.');
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length))));
  }
  return btoa(chunks.join(''));
}

export function convertBytes(adapterId: string, input: Uint8Array): ConversionResult {
  const adapter = getConverterAdapter(adapterId);
  if (!adapter) throw new Error(`Unknown converter adapter: ${adapterId}`);
  if (!adapter.enabled || !adapter.bundled) throw new Error(adapter.disabledReason ?? 'This adapter is unavailable.');
  if (input.byteLength > adapter.maximumInputBytes) throw new Error(`Input exceeds the adapter limit of ${adapter.maximumInputBytes} bytes.`);
  if (adapterId === 'pdf-page-tools') throw new Error('PDF page tools require an explicit PDF operation, not a generic conversion.');
  const detected = detectFileType(input);
  if (!adapter.sourceTypes.includes(detected.type)) throw new Error(`${adapter.nameEn} does not accept detected type ${detected.type}. ${detected.detail}`);
  let output: Uint8Array;
  switch (adapterId) {
    case 'json-pretty': { const text = decodeUtf8(input); ensureJsonBounds(text); output = UTF8_ENCODER.encode(`${JSON.stringify(JSON.parse(text), null, 2)}\n`); break; }
    case 'json-minify': { const text = decodeUtf8(input); ensureJsonBounds(text); output = UTF8_ENCODER.encode(JSON.stringify(JSON.parse(text))); break; }
    case 'json-to-csv': output = UTF8_ENCODER.encode(jsonToCsv(decodeUtf8(input))); break;
    case 'csv-to-json': output = UTF8_ENCODER.encode(csvToJson(decodeUtf8(input))); break;
    case 'text-to-lf': output = UTF8_ENCODER.encode(decodeUtf8(input).replace(/\r\n|\r/g, '\n')); break;
    case 'text-to-crlf': output = UTF8_ENCODER.encode(decodeUtf8(input).replace(/\r\n|\r|\n/g, '\n').replaceAll('\n', '\r\n')); break;
    case 'bytes-to-base64': output = UTF8_ENCODER.encode(encodeBase64(input)); break;
    case 'base64-to-bytes': output = strictBase64Decode(decodeUtf8(input)); break;
    default: throw new Error(`Adapter ${adapterId} has no bundled implementation.`);
  }
  if (output.byteLength > MAX_OUTPUT_BYTES) throw new Error(`Converted output exceeds the ${MAX_OUTPUT_BYTES}-byte bound.`);
  return { output, targetType: adapter.targetType, disclosure: adapter.lossless ? adapter.metadataBehavior : `${adapter.metadataBehavior} ${adapter.encodingBehavior}` };
}

export function previewBytes(bytes: Uint8Array): string {
  const detected = detectFileType(bytes);
  if (['json', 'csv', 'text', 'base64'].includes(detected.type)) {
    try { return decodeUtf8(bytes.slice(0, PREVIEW_LIMIT)); } catch { /* fall through */ }
  }
  const shown = bytes.slice(0, Math.min(bytes.length, 64));
  return `${detected.type.toUpperCase()} · ${bytes.length} bytes\n${Array.from(shown, (value) => value.toString(16).padStart(2, '0')).join(' ')}${bytes.length > shown.length ? ' …' : ''}`;
}

export function validateConvertedOutput(adapterId: string, output: Uint8Array): void {
  const adapter = getConverterAdapter(adapterId);
  if (!adapter) throw new Error(`Unknown converter adapter: ${adapterId}`);
  if (adapterId === 'base64-to-bytes' || adapter.targetType === 'unknown') return;
  const text = decodeUtf8(output);
  if (adapter.targetType === 'json') { JSON.parse(text); return; }
  if (adapter.targetType === 'csv') { parseCsv(text); return; }
  if (adapter.targetType === 'base64') { strictBase64Decode(text); return; }
  if (adapter.targetType === 'text') return;
  const detected = detectFileType(output);
  if (detected.type !== adapter.targetType) throw new Error(`Output validation expected ${adapter.targetType}, detected ${detected.type}.`);
}

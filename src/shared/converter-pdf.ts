export const DEFAULT_PDF_LIMITS = Object.freeze({
  maxBytes: 32 * 1024 * 1024,
  maxObjects: 4096,
  maxObjectBytes: 4 * 1024 * 1024,
  maxPages: 512,
  maxInputs: 64,
  maxOutputs: 512,
  maxAggregateOutputBytes: 64 * 1024 * 1024,
});

export interface PdfLimits {
  maxBytes?: number;
  maxObjects?: number;
  maxObjectBytes?: number;
  maxPages?: number;
  maxInputs?: number;
  maxOutputs?: number;
  maxAggregateOutputBytes?: number;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
}

export type PdfMetadataUpdate = {
  [Key in keyof PdfMetadata]?: string | null;
};

export interface PdfInspection {
  version: string;
  byteLength: number;
  objectCount: number;
  pageCount: number;
  pageObjectIds: number[];
  rotations: number[];
  metadata: PdfMetadata;
  capabilities: {
    classicCrossReferenceTable: true;
    flatPageTree: true;
    unfilteredStreams: true;
    encrypted: false;
    incrementalUpdates: false;
    objectStreams: false;
    crossReferenceStreams: false;
    annotationsAndForms: false;
  };
}

export interface PdfRotationRequest {
  pageIndex: number;
  degrees: number;
}

export interface PdfExpectedOutput {
  pageCount?: number;
  pageObjectIds?: readonly number[];
  rotations?: readonly number[];
  metadata?: PdfMetadata;
}

export type PdfErrorCode =
  | "invalid-pdf"
  | "unsupported-pdf"
  | "limit-exceeded"
  | "invalid-operation"
  | "output-validation-failed";

export class PdfOperationError extends Error {
  constructor(
    public readonly code: PdfErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PdfOperationError";
  }
}

interface ResolvedLimits {
  maxBytes: number;
  maxObjects: number;
  maxObjectBytes: number;
  maxPages: number;
  maxInputs: number;
  maxOutputs: number;
  maxAggregateOutputBytes: number;
}

interface PdfObjectRecord {
  id: number;
  body: string;
}

interface ParsedPdf {
  version: string;
  objects: Map<number, PdfObjectRecord>;
  rootId: number;
  infoId?: number;
  pagesRootId: number;
  pageIds: number[];
  rotations: number[];
  metadata: PdfMetadata;
}

interface DictionaryEntry {
  key: string;
  valueStart: number;
  valueEnd: number;
  value: string;
}

const METADATA_KEYS: ReadonlyArray<[keyof PdfMetadata, string]> = [
  ["title", "Title"],
  ["author", "Author"],
  ["subject", "Subject"],
  ["keywords", "Keywords"],
  ["creator", "Creator"],
  ["producer", "Producer"],
];

const WHITESPACE = new Set(["\u0000", "\t", "\n", "\f", "\r", " "]);
const DELIMITERS = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);
const MAX_COMPOSITE_DEPTH = 64;
const INDIRECT_REFERENCE_AT = /(\d+)\s+(\d+)\s+R\b/y;

function fail(code: PdfErrorCode, message: string): never {
  throw new PdfOperationError(code, message);
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    fail("invalid-operation", `${name} must be a positive safe integer.`);
  }
  return resolved;
}

function resolveLimits(limits: PdfLimits = {}): ResolvedLimits {
  return {
    maxBytes: positiveInteger(limits.maxBytes, DEFAULT_PDF_LIMITS.maxBytes, "maxBytes"),
    maxObjects: positiveInteger(limits.maxObjects, DEFAULT_PDF_LIMITS.maxObjects, "maxObjects"),
    maxObjectBytes: positiveInteger(
      limits.maxObjectBytes,
      DEFAULT_PDF_LIMITS.maxObjectBytes,
      "maxObjectBytes",
    ),
    maxPages: positiveInteger(limits.maxPages, DEFAULT_PDF_LIMITS.maxPages, "maxPages"),
    maxInputs: positiveInteger(limits.maxInputs, DEFAULT_PDF_LIMITS.maxInputs, "maxInputs"),
    maxOutputs: positiveInteger(limits.maxOutputs, DEFAULT_PDF_LIMITS.maxOutputs, "maxOutputs"),
    maxAggregateOutputBytes: positiveInteger(
      limits.maxAggregateOutputBytes,
      DEFAULT_PDF_LIMITS.maxAggregateOutputBytes,
      "maxAggregateOutputBytes",
    ),
  };
}

function bytesToBinaryString(bytes: Uint8Array): string {
  let output = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return output;
}

function binaryStringToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && WHITESPACE.has(character);
}

function isDelimiter(character: string | undefined): boolean {
  return character !== undefined && (isWhitespace(character) || DELIMITERS.has(character));
}

function skipSpaceAndComments(text: string, start: number): number {
  let cursor = start;
  while (cursor < text.length) {
    if (isWhitespace(text[cursor])) {
      cursor += 1;
      continue;
    }
    if (text[cursor] === "%") {
      const newline = text.indexOf("\n", cursor + 1);
      cursor = newline < 0 ? text.length : newline + 1;
      continue;
    }
    break;
  }
  return cursor;
}

function scanLiteralString(text: string, start: number): number {
  let depth = 1;
  let cursor = start + 1;
  while (cursor < text.length) {
    const character = text[cursor];
    if (character === "\\") {
      cursor += 2;
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
    cursor += 1;
  }
  fail("invalid-pdf", "A PDF literal string is not terminated.");
}

function scanHexString(text: string, start: number): number {
  const end = text.indexOf(">", start + 1);
  if (end < 0) fail("invalid-pdf", "A PDF hexadecimal string is not terminated.");
  return end + 1;
}

function scanComposite(text: string, start: number, dictionary: boolean, depth = 1): number {
  if (depth > MAX_COMPOSITE_DEPTH) fail("limit-exceeded", `PDF composite nesting exceeds ${MAX_COMPOSITE_DEPTH} levels.`);
  let cursor = start + (dictionary ? 2 : 1);
  while (cursor < text.length) {
    cursor = skipSpaceAndComments(text, cursor);
    if (dictionary && text.startsWith(">>", cursor)) return cursor + 2;
    if (!dictionary && text[cursor] === "]") return cursor + 1;
    if (text.startsWith("<<", cursor)) {
      cursor = scanComposite(text, cursor, true, depth + 1);
    } else if (text[cursor] === "[") {
      cursor = scanComposite(text, cursor, false, depth + 1);
    } else if (text[cursor] === "(") {
      cursor = scanLiteralString(text, cursor);
    } else if (text[cursor] === "<") {
      cursor = scanHexString(text, cursor);
    } else {
      cursor = scanPdfValueEnd(text, cursor, depth + 1);
    }
  }
  fail("invalid-pdf", `A PDF ${dictionary ? "dictionary" : "array"} is not terminated.`);
}

function scanPdfValueEnd(text: string, start: number, depth = 1): number {
  const cursor = skipSpaceAndComments(text, start);
  if (text.startsWith("<<", cursor)) return scanComposite(text, cursor, true, depth);
  if (text[cursor] === "[") return scanComposite(text, cursor, false, depth);
  if (text[cursor] === "(") return scanLiteralString(text, cursor);
  if (text[cursor] === "<") return scanHexString(text, cursor);
  if (text[cursor] === "/") {
    let end = cursor + 1;
    while (end < text.length && !isDelimiter(text[end])) end += 1;
    return end;
  }

  INDIRECT_REFERENCE_AT.lastIndex = cursor;
  const reference = INDIRECT_REFERENCE_AT.exec(text);
  if (reference) return INDIRECT_REFERENCE_AT.lastIndex;

  let end = cursor;
  while (end < text.length && !isDelimiter(text[end])) end += 1;
  if (end === cursor) fail("invalid-pdf", "A PDF dictionary contains an invalid value.");
  return end;
}

function dictionaryEntries(body: string): { entries: DictionaryEntry[]; closeStart: number } {
  const open = body.indexOf("<<");
  if (open < 0) fail("invalid-pdf", "A required PDF dictionary is missing.");
  const dictionaryEnd = scanComposite(body, open, true);
  const closeStart = dictionaryEnd - 2;
  const entries: DictionaryEntry[] = [];
  let cursor = open + 2;
  while (true) {
    cursor = skipSpaceAndComments(body, cursor);
    if (cursor >= closeStart) break;
    if (body[cursor] !== "/") {
      fail("unsupported-pdf", "Only direct-name keys are supported in PDF dictionaries.");
    }
    let keyEnd = cursor + 1;
    while (keyEnd < closeStart && !isDelimiter(body[keyEnd])) keyEnd += 1;
    const key = body.slice(cursor + 1, keyEnd);
    const valueStart = skipSpaceAndComments(body, keyEnd);
    const valueEnd = scanPdfValueEnd(body, valueStart);
    entries.push({ key, valueStart, valueEnd, value: body.slice(valueStart, valueEnd) });
    cursor = valueEnd;
  }
  return { entries, closeStart };
}

function getEntry(body: string, key: string): DictionaryEntry | undefined {
  const matches = dictionaryEntries(body).entries.filter((entry) => entry.key === key);
  if (matches.length > 1) fail("unsupported-pdf", `Duplicate /${key} dictionary entries are unsupported.`);
  return matches[0];
}

function setEntry(body: string, key: string, value: string | null): string {
  const parsed = dictionaryEntries(body);
  const matches = parsed.entries.filter((entry) => entry.key === key);
  if (matches.length > 1) fail("unsupported-pdf", `Duplicate /${key} dictionary entries are unsupported.`);
  const existing = matches[0];
  if (existing) {
    if (value === null) {
      const keyStart = body.lastIndexOf(`/${key}`, existing.valueStart);
      return `${body.slice(0, keyStart)}${body.slice(existing.valueEnd)}`;
    }
    return `${body.slice(0, existing.valueStart)}${value}${body.slice(existing.valueEnd)}`;
  }
  if (value === null) return body;
  return `${body.slice(0, parsed.closeStart)} /${key} ${value} ${body.slice(parsed.closeStart)}`;
}

function parseReference(value: string | undefined, label: string): number {
  const match = value?.trim().match(/^(\d+)\s+0\s+R$/);
  if (!match) fail("unsupported-pdf", `${label} must be a generation-zero indirect reference.`);
  return Number(match[1]);
}

function parseDirectInteger(value: string | undefined, label: string): number {
  if (!value || !/^-?\d+$/.test(value.trim())) {
    fail("unsupported-pdf", `${label} must be a direct integer.`);
  }
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed)) fail("limit-exceeded", `${label} exceeds safe integer bounds.`);
  return parsed;
}

function parseReferenceArray(value: string | undefined, label: string): number[] {
  if (!value || !value.trim().startsWith("[") || !value.trim().endsWith("]")) {
    fail("unsupported-pdf", `${label} must be a direct array of generation-zero references.`);
  }
  const inner = value.trim().slice(1, -1);
  const references = [...inner.matchAll(/(\d+)\s+0\s+R\b/g)].map((match) => Number(match[1]));
  const remainder = inner.replace(/(\d+)\s+0\s+R\b/g, "").replace(/%[^\r\n]*/g, "").trim();
  if (remainder) fail("unsupported-pdf", `${label} contains a non-reference value.`);
  return references;
}

function readLine(text: string, start: number): { line: string; next: number } {
  const newline = text.indexOf("\n", start);
  const raw = newline < 0 ? text.slice(start) : text.slice(start, newline);
  return {
    line: raw.endsWith("\r") ? raw.slice(0, -1) : raw,
    next: newline < 0 ? text.length : newline + 1,
  };
}

function validateStream(body: string): void {
  const streamMatches = [...body.matchAll(/\bstream(?:\r\n|\n|\r)/g)];
  const endMatches = [...body.matchAll(/(?:\r\n|\n|\r)endstream\b/g)];
  if (streamMatches.length === 0 && endMatches.length === 0) return;
  if (streamMatches.length !== 1 || endMatches.length !== 1) {
    fail("unsupported-pdf", "Only one stream per indirect object is supported.");
  }
  if (getEntry(body, "Filter")) fail("unsupported-pdf", "Filtered PDF streams are unsupported.");
  const length = parseDirectInteger(getEntry(body, "Length")?.value, "/Length");
  const payloadStart = streamMatches[0].index! + streamMatches[0][0].length;
  const payloadEnd = endMatches[0].index!;
  if (payloadEnd < payloadStart || payloadEnd - payloadStart !== length) {
    fail("invalid-pdf", "A PDF stream length does not match its direct /Length value.");
  }
}

function protectedSpanEnd(text: string, cursor: number): number | undefined {
  if (text[cursor] === "(") return scanLiteralString(text, cursor);
  if (text[cursor] === "<" && !text.startsWith("<<", cursor)) return scanHexString(text, cursor);
  if (text[cursor] === "%") {
    const newline = text.indexOf("\n", cursor + 1);
    return newline < 0 ? text.length : newline + 1;
  }
  let streamLength = 0;
  if (text.startsWith("stream\r\n", cursor)) streamLength = 8;
  else if (text.startsWith("stream\n", cursor) || text.startsWith("stream\r", cursor)) streamLength = 7;
  if (streamLength > 0) {
    const end = text.indexOf("endstream", cursor + streamLength);
    if (end < 0) fail("invalid-pdf", "A PDF stream is not terminated.");
    return end + "endstream".length;
  }
  return undefined;
}

function scanReferences(body: string): number[] {
  const references: number[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    const protectedEnd = protectedSpanEnd(body, cursor);
    if (protectedEnd !== undefined) {
      cursor = protectedEnd;
      continue;
    }
    INDIRECT_REFERENCE_AT.lastIndex = cursor;
    const reference = INDIRECT_REFERENCE_AT.exec(body);
    if (reference) {
      if (reference[2] !== "0") {
        fail("unsupported-pdf", "Non-zero-generation indirect references are unsupported.");
      }
      references.push(Number(reference[1]));
      cursor = INDIRECT_REFERENCE_AT.lastIndex;
      continue;
    }
    cursor += 1;
  }
  return references;
}

function rewriteReferences(body: string, mapping: ReadonlyMap<number, number>): string {
  let output = "";
  let cursor = 0;
  while (cursor < body.length) {
    const protectedEnd = protectedSpanEnd(body, cursor);
    if (protectedEnd !== undefined) {
      output += body.slice(cursor, protectedEnd);
      cursor = protectedEnd;
      continue;
    }
    INDIRECT_REFERENCE_AT.lastIndex = cursor;
    const reference = INDIRECT_REFERENCE_AT.exec(body);
    if (reference) {
      if (reference[2] !== "0") {
        fail("unsupported-pdf", "Non-zero-generation indirect references are unsupported.");
      }
      const source = Number(reference[1]);
      const target = mapping.get(source);
      if (target === undefined) fail("invalid-pdf", `Object ${source} is referenced but missing.`);
      output += `${target} 0 R`;
      cursor = INDIRECT_REFERENCE_AT.lastIndex;
      continue;
    }
    output += body[cursor];
    cursor += 1;
  }
  return output;
}

function decodePdfText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("(")) {
    if (!trimmed.endsWith(")")) fail("invalid-pdf", "A metadata string is not terminated.");
    let output = "";
    for (let cursor = 1; cursor < trimmed.length - 1; cursor += 1) {
      const character = trimmed[cursor];
      if (character !== "\\") {
        output += character;
        continue;
      }
      cursor += 1;
      const escaped = trimmed[cursor];
      if (escaped === undefined) fail("invalid-pdf", "A metadata escape is incomplete.");
      const standard: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
        "(": "(",
        ")": ")",
        "\\": "\\",
      };
      if (standard[escaped] !== undefined) {
        output += standard[escaped];
      } else if (/[0-7]/.test(escaped)) {
        let octal = escaped;
        while (octal.length < 3 && /[0-7]/.test(trimmed[cursor + 1] ?? "")) {
          cursor += 1;
          octal += trimmed[cursor];
        }
        output += String.fromCharCode(Number.parseInt(octal, 8));
      } else if (escaped === "\r" && trimmed[cursor + 1] === "\n") {
        cursor += 1;
      } else if (escaped !== "\n" && escaped !== "\r") {
        output += escaped;
      }
    }
    return output;
  }
  if (trimmed.startsWith("<") && trimmed.endsWith(">") && !trimmed.startsWith("<<")) {
    const hex = trimmed.slice(1, -1).replace(/\s/g, "");
    if (!/^[0-9a-fA-F]*$/.test(hex)) fail("invalid-pdf", "A metadata hexadecimal string is invalid.");
    const padded = hex.length % 2 === 0 ? hex : `${hex}0`;
    const bytes = new Uint8Array(padded.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(padded.slice(index * 2, index * 2 + 2), 16);
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      let output = "";
      for (let index = 2; index + 1 < bytes.length; index += 2) {
        output += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
      }
      return output;
    }
    return bytesToBinaryString(bytes);
  }
  fail("unsupported-pdf", "Metadata values must be literal or hexadecimal strings.");
}

function encodePdfText(value: string): string {
  if (value.length > 4096) fail("limit-exceeded", "A metadata value exceeds 4096 characters.");
  if (/^[\x20-\x7e\t\r\n]*$/.test(value)) {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t");
    return `(${escaped})`;
  }
  let hex = "FEFF";
  for (let index = 0; index < value.length; index += 1) {
    hex += value.charCodeAt(index).toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

function inspectMetadata(objects: Map<number, PdfObjectRecord>, infoId: number | undefined): PdfMetadata {
  if (infoId === undefined) return {};
  const info = objects.get(infoId);
  if (!info) fail("invalid-pdf", "The trailer /Info object is missing.");
  const metadata: PdfMetadata = {};
  for (const [property, pdfKey] of METADATA_KEYS) {
    const entry = getEntry(info.body, pdfKey);
    if (entry) metadata[property] = decodePdfText(entry.value);
  }
  return metadata;
}

function parsePdf(bytes: Uint8Array, limits: ResolvedLimits): ParsedPdf {
  if (!(bytes instanceof Uint8Array)) fail("invalid-operation", "PDF input must be a Uint8Array.");
  if (bytes.length === 0) fail("invalid-pdf", "PDF input is empty.");
  if (bytes.length > limits.maxBytes) fail("limit-exceeded", "PDF input exceeds the byte limit.");
  const text = bytesToBinaryString(bytes);
  const header = /^%PDF-(1\.[0-7])(?:\r\n|\n|\r)/.exec(text);
  if (!header) fail("invalid-pdf", "PDF input must begin with a supported %PDF-1.x header.");
  if ([...text.matchAll(/\bstartxref\b/g)].length !== 1 || [...text.matchAll(/%%EOF/g)].length !== 1) {
    fail("unsupported-pdf", "Incremental or multi-revision PDFs are unsupported.");
  }
  const tail = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  if (!tail) fail("invalid-pdf", "PDF input has no valid terminal startxref and %%EOF.");
  const xrefOffset = Number(tail[1]);
  if (!Number.isSafeInteger(xrefOffset) || xrefOffset <= 0 || xrefOffset >= text.length) {
    fail("invalid-pdf", "The PDF startxref offset is invalid.");
  }
  let cursor = xrefOffset;
  let line = readLine(text, cursor);
  if (line.line !== "xref") fail("unsupported-pdf", "Cross-reference streams are unsupported.");
  cursor = line.next;
  const inUseOffsets = new Map<number, number>();
  let trailerFound = false;
  while (cursor < text.length) {
    line = readLine(text, cursor);
    cursor = line.next;
    if (!line.line.trim()) continue;
    if (line.line.trim() === "trailer") {
      trailerFound = true;
      break;
    }
    const subsection = /^(\d+)\s+(\d+)$/.exec(line.line.trim());
    if (!subsection) fail("invalid-pdf", "A cross-reference subsection header is invalid.");
    const startId = Number(subsection[1]);
    const count = Number(subsection[2]);
    if (!Number.isSafeInteger(startId) || !Number.isSafeInteger(count) || count < 0) {
      fail("limit-exceeded", "A cross-reference subsection exceeds safe integer bounds.");
    }
    if (startId + count > limits.maxObjects + 1) {
      fail("limit-exceeded", "The PDF cross-reference table exceeds the object limit.");
    }
    for (let index = 0; index < count; index += 1) {
      line = readLine(text, cursor);
      cursor = line.next;
      const entry = /^(\d{10})\s(\d{5})\s([fn])(?:\s*)$/.exec(line.line);
      if (!entry) fail("invalid-pdf", "A cross-reference entry is invalid.");
      const objectId = startId + index;
      if (entry[3] === "n") {
        if (entry[2] !== "00000") fail("unsupported-pdf", "Non-zero object generations are unsupported.");
        if (inUseOffsets.has(objectId)) fail("invalid-pdf", `Object ${objectId} appears twice in xref.`);
        inUseOffsets.set(objectId, Number(entry[1]));
      }
    }
  }
  if (!trailerFound) fail("invalid-pdf", "The PDF trailer is missing.");
  cursor = skipSpaceAndComments(text, cursor);
  if (!text.startsWith("<<", cursor)) fail("invalid-pdf", "The PDF trailer dictionary is missing.");
  const trailerEnd = scanComposite(text, cursor, true);
  const trailer = text.slice(cursor, trailerEnd);
  if (getEntry(trailer, "Encrypt")) fail("unsupported-pdf", "Encrypted PDFs are unsupported.");
  if (getEntry(trailer, "Prev")) fail("unsupported-pdf", "Incremental PDF updates are unsupported.");
  if (getEntry(trailer, "XRefStm")) fail("unsupported-pdf", "Hybrid xref streams are unsupported.");
  const rootId = parseReference(getEntry(trailer, "Root")?.value, "Trailer /Root");
  const infoEntry = getEntry(trailer, "Info");
  const infoId = infoEntry ? parseReference(infoEntry.value, "Trailer /Info") : undefined;

  if (inUseOffsets.size > limits.maxObjects) fail("limit-exceeded", "PDF input exceeds the object limit.");
  const sorted = [...inUseOffsets.entries()]
    .filter(([id]) => id !== 0)
    .sort((left, right) => left[1] - right[1]);
  const objects = new Map<number, PdfObjectRecord>();
  for (let index = 0; index < sorted.length; index += 1) {
    const [expectedId, offset] = sorted[index];
    const nextOffset = sorted[index + 1]?.[1] ?? xrefOffset;
    if (offset <= 0 || offset >= nextOffset || nextOffset > xrefOffset) {
      fail("invalid-pdf", `Object ${expectedId} has an invalid cross-reference offset.`);
    }
    const segment = text.slice(offset, nextOffset);
    const objectHeader = /^(\d+)\s+(\d+)\s+obj\b/.exec(segment);
    if (!objectHeader || Number(objectHeader[1]) !== expectedId) {
      fail("invalid-pdf", `Object ${expectedId} does not begin at its cross-reference offset.`);
    }
    if (objectHeader[2] !== "0") fail("unsupported-pdf", "Non-zero object generations are unsupported.");
    const endObject = segment.lastIndexOf("endobj");
    if (endObject < objectHeader[0].length || segment.slice(endObject + 6).trim()) {
      fail("invalid-pdf", `Object ${expectedId} is not terminated correctly.`);
    }
    const body = segment.slice(objectHeader[0].length, endObject).trim();
    if (body.length > limits.maxObjectBytes) {
      fail("limit-exceeded", `Object ${expectedId} exceeds the per-object byte limit.`);
    }
    if (/\/Type\s*\/ObjStm\b/.test(body)) fail("unsupported-pdf", "PDF object streams are unsupported.");
    if (/\/Type\s*\/XRef\b/.test(body)) fail("unsupported-pdf", "PDF xref streams are unsupported.");
    if (/\/AcroForm\b|\/Annots\b/.test(body)) {
      fail("unsupported-pdf", "PDF forms and annotations are unsupported by this bounded adapter.");
    }
    validateStream(body);
    objects.set(expectedId, { id: expectedId, body });
  }
  if (!objects.has(rootId)) fail("invalid-pdf", "The trailer /Root object is missing.");
  for (const object of objects.values()) {
    for (const reference of scanReferences(object.body)) {
      if (!objects.has(reference)) fail("invalid-pdf", `Object ${reference} is referenced but missing.`);
    }
  }

  const catalog = objects.get(rootId)!;
  if (!/\/Type\s*\/Catalog\b/.test(catalog.body)) fail("invalid-pdf", "The trailer root is not a catalog.");
  const pagesRootId = parseReference(getEntry(catalog.body, "Pages")?.value, "Catalog /Pages");
  const pagesRoot = objects.get(pagesRootId);
  if (!pagesRoot || !/\/Type\s*\/Pages\b/.test(pagesRoot.body)) {
    fail("invalid-pdf", "The catalog /Pages root is missing or invalid.");
  }
  const pageIds = parseReferenceArray(getEntry(pagesRoot.body, "Kids")?.value, "Pages /Kids");
  const declaredCount = parseDirectInteger(getEntry(pagesRoot.body, "Count")?.value, "Pages /Count");
  if (declaredCount !== pageIds.length) fail("unsupported-pdf", "Nested or inconsistent page trees are unsupported.");
  if (pageIds.length > limits.maxPages) fail("limit-exceeded", "PDF input exceeds the page limit.");
  if (new Set(pageIds).size !== pageIds.length) fail("invalid-pdf", "The page tree contains duplicate pages.");
  const rotations: number[] = [];
  for (const pageId of pageIds) {
    const page = objects.get(pageId);
    if (!page || !/\/Type\s*\/Page\b/.test(page.body) || /\/Type\s*\/Pages\b/.test(page.body)) {
      fail("unsupported-pdf", "Only direct page objects in a flat page tree are supported.");
    }
    const parentId = parseReference(getEntry(page.body, "Parent")?.value, `Page ${pageId} /Parent`);
    if (parentId !== pagesRootId) fail("unsupported-pdf", "Inherited or nested page-tree values are unsupported.");
    const rotateEntry = getEntry(page.body, "Rotate");
    const rotation = rotateEntry ? parseDirectInteger(rotateEntry.value, `Page ${pageId} /Rotate`) : 0;
    if (rotation % 90 !== 0) fail("unsupported-pdf", "Page rotations must be multiples of 90 degrees.");
    rotations.push(((rotation % 360) + 360) % 360);
  }
  return {
    version: header[1],
    objects,
    rootId,
    infoId,
    pagesRootId,
    pageIds,
    rotations,
    metadata: inspectMetadata(objects, infoId),
  };
}

function publicInspection(parsed: ParsedPdf, byteLength: number): PdfInspection {
  return {
    version: parsed.version,
    byteLength,
    objectCount: parsed.objects.size,
    pageCount: parsed.pageIds.length,
    pageObjectIds: [...parsed.pageIds],
    rotations: [...parsed.rotations],
    metadata: { ...parsed.metadata },
    capabilities: {
      classicCrossReferenceTable: true,
      flatPageTree: true,
      unfilteredStreams: true,
      encrypted: false,
      incrementalUpdates: false,
      objectStreams: false,
      crossReferenceStreams: false,
      annotationsAndForms: false,
    },
  };
}

function writePdf(
  version: string,
  objects: ReadonlyMap<number, PdfObjectRecord>,
  rootId: number,
  infoId: number | undefined,
): Uint8Array {
  const ids = [...objects.keys()].sort((left, right) => left - right);
  if (ids.length === 0 || !objects.has(rootId)) fail("output-validation-failed", "Output has no root object.");
  const maxId = ids.at(-1)!;
  let output = `%PDF-${version}\n%\xE2\xE3\xCF\xD3\n`;
  const offsets = new Map<number, number>();
  for (const id of ids) {
    const object = objects.get(id)!;
    offsets.set(id, output.length);
    output += `${id} 0 obj\n${object.body.trim()}\nendobj\n`;
  }
  const xrefOffset = output.length;
  output += `xref\n0 ${maxId + 1}\n`;
  output += "0000000000 65535 f \n";
  for (let id = 1; id <= maxId; id += 1) {
    const offset = offsets.get(id);
    output += offset === undefined
      ? "0000000000 00000 f \n"
      : `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${maxId + 1} /Root ${rootId} 0 R`;
  if (infoId !== undefined) output += ` /Info ${infoId} 0 R`;
  output += ` >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return binaryStringToBytes(output);
}

function cloneObjects(parsed: ParsedPdf): Map<number, PdfObjectRecord> {
  return new Map([...parsed.objects].map(([id, object]) => [id, { id, body: object.body }]));
}

function retainReachableSelection(
  parsed: ParsedPdf,
  objects: ReadonlyMap<number, PdfObjectRecord>,
  selectedIds: readonly number[],
): Map<number, PdfObjectRecord> {
  const selected = new Set(selectedIds);
  const excludedPages = new Set(parsed.pageIds.filter((id) => !selected.has(id)));
  const retained = new Map<number, PdfObjectRecord>();
  const pending = [parsed.rootId, parsed.pagesRootId, ...(parsed.infoId === undefined ? [] : [parsed.infoId]), ...selectedIds];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (retained.has(id)) continue;
    if (excludedPages.has(id)) {
      fail("unsupported-pdf", "A document-level structure references a page excluded from extraction.");
    }
    const object = objects.get(id);
    if (!object) fail("invalid-pdf", `Object ${id} is referenced but missing.`);
    retained.set(id, object);
    for (const reference of scanReferences(object.body)) {
      if (!retained.has(reference)) pending.push(reference);
    }
  }
  return retained;
}

function normalizePageIndexes(indexes: readonly number[], pageCount: number, label: string): number[] {
  if (indexes.length === 0) fail("invalid-operation", `${label} must select at least one page.`);
  const normalized = indexes.map((index) => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= pageCount) {
      fail("invalid-operation", `${label} contains an out-of-range page index.`);
    }
    return index;
  });
  if (new Set(normalized).size !== normalized.length) {
    fail("invalid-operation", `${label} cannot contain duplicate page indexes.`);
  }
  return normalized;
}

function compareMetadata(actual: PdfMetadata, expected: PdfMetadata): boolean {
  return METADATA_KEYS.every(([key]) => expected[key] === undefined || actual[key] === expected[key]);
}

function assertArrayEqual(actual: readonly number[], expected: readonly number[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    fail("output-validation-failed", `Reopened PDF ${label} does not match the requested output.`);
  }
}

export function inspectPdf(bytes: Uint8Array, limits: PdfLimits = {}): PdfInspection {
  const resolved = resolveLimits(limits);
  return publicInspection(parsePdf(bytes, resolved), bytes.length);
}

export function validatePdfOutput(
  bytes: Uint8Array,
  expected: PdfExpectedOutput = {},
  limits: PdfLimits = {},
): PdfInspection {
  const resolved = resolveLimits(limits);
  let parsed: ParsedPdf;
  try {
    parsed = parsePdf(bytes, resolved);
  } catch (error) {
    if (error instanceof PdfOperationError && error.code === "limit-exceeded") throw error;
    const reason = error instanceof Error ? error.message : "unknown parse error";
    fail("output-validation-failed", `Generated PDF could not be reopened: ${reason}`);
  }
  const inspection = publicInspection(parsed, bytes.length);
  if (expected.pageCount !== undefined && inspection.pageCount !== expected.pageCount) {
    fail("output-validation-failed", "Reopened PDF page count does not match the requested output.");
  }
  if (expected.pageObjectIds) assertArrayEqual(inspection.pageObjectIds, expected.pageObjectIds, "page order");
  if (expected.rotations) assertArrayEqual(inspection.rotations, expected.rotations, "page rotations");
  if (expected.metadata && !compareMetadata(inspection.metadata, expected.metadata)) {
    fail("output-validation-failed", "Reopened PDF metadata does not match the requested output.");
  }
  return inspection;
}

function buildSelection(
  parsed: ParsedPdf,
  indexes: readonly number[],
  resolved: ResolvedLimits,
): Uint8Array {
  const normalized = normalizePageIndexes(indexes, parsed.pageIds.length, "Page selection");
  const selectedIds = normalized.map((index) => parsed.pageIds[index]);
  const selectedRotations = normalized.map((index) => parsed.rotations[index]);
  const objects = cloneObjects(parsed);
  const pagesRoot = objects.get(parsed.pagesRootId)!;
  let pagesBody = setEntry(pagesRoot.body, "Kids", `[${selectedIds.map((id) => `${id} 0 R`).join(" ")}]`);
  pagesBody = setEntry(pagesBody, "Count", String(selectedIds.length));
  objects.set(parsed.pagesRootId, { id: parsed.pagesRootId, body: pagesBody });
  for (const pageId of selectedIds) {
    const page = objects.get(pageId)!;
    objects.set(pageId, { id: pageId, body: setEntry(page.body, "Parent", `${parsed.pagesRootId} 0 R`) });
  }
  const retained = retainReachableSelection(parsed, objects, selectedIds);
  const output = writePdf(parsed.version, retained, parsed.rootId, parsed.infoId);
  if (output.length > resolved.maxBytes) fail("limit-exceeded", "Generated PDF exceeds the byte limit.");
  validatePdfOutput(output, {
    pageCount: selectedIds.length,
    pageObjectIds: selectedIds,
    rotations: selectedRotations,
    metadata: parsed.metadata,
  }, resolved);
  return output;
}

export function extractPdf(
  bytes: Uint8Array,
  pageIndexes: readonly number[],
  limits: PdfLimits = {},
): Uint8Array {
  const resolved = resolveLimits(limits);
  return buildSelection(parsePdf(bytes, resolved), pageIndexes, resolved);
}

export function splitPdf(
  bytes: Uint8Array,
  groups?: readonly (readonly number[])[],
  limits: PdfLimits = {},
): Uint8Array[] {
  const resolved = resolveLimits(limits);
  const parsed = parsePdf(bytes, resolved);
  const requestedGroups = groups ?? parsed.pageIds.map((_, index) => [index]);
  if (requestedGroups.length === 0) fail("invalid-operation", "PDF split requires at least one output group.");
  if (requestedGroups.length > resolved.maxOutputs) fail("limit-exceeded", "PDF split exceeds the output limit.");
  const outputs: Uint8Array[] = [];
  let aggregateBytes = 0;
  for (const group of requestedGroups) {
    const output = buildSelection(parsed, group, resolved);
    aggregateBytes += output.byteLength;
    if (aggregateBytes > resolved.maxAggregateOutputBytes) {
      fail("limit-exceeded", "PDF split exceeds the aggregate output byte limit.");
    }
    outputs.push(output);
  }
  return outputs;
}

export function reorderPdf(
  bytes: Uint8Array,
  pageOrder: readonly number[],
  limits: PdfLimits = {},
): Uint8Array {
  const resolved = resolveLimits(limits);
  const parsed = parsePdf(bytes, resolved);
  const order = normalizePageIndexes(pageOrder, parsed.pageIds.length, "Page order");
  if (order.length !== parsed.pageIds.length) {
    fail("invalid-operation", "Page reorder must include every page exactly once.");
  }
  return buildSelection(parsed, order, resolved);
}

export function rotatePdf(
  bytes: Uint8Array,
  rotations: readonly PdfRotationRequest[],
  limits: PdfLimits = {},
): Uint8Array {
  const resolved = resolveLimits(limits);
  const parsed = parsePdf(bytes, resolved);
  const objects = cloneObjects(parsed);
  const expectedRotations = [...parsed.rotations];
  const touched = new Set<number>();
  for (const request of rotations) {
    if (!Number.isSafeInteger(request.pageIndex) || request.pageIndex < 0 || request.pageIndex >= parsed.pageIds.length) {
      fail("invalid-operation", "PDF rotation contains an out-of-range page index.");
    }
    if (!Number.isSafeInteger(request.degrees) || request.degrees % 90 !== 0) {
      fail("invalid-operation", "PDF rotation degrees must be a safe-integer multiple of 90.");
    }
    if (touched.has(request.pageIndex)) fail("invalid-operation", "A page may be rotated only once per operation.");
    touched.add(request.pageIndex);
    const pageId = parsed.pageIds[request.pageIndex];
    const nextRotation = ((expectedRotations[request.pageIndex] + request.degrees) % 360 + 360) % 360;
    expectedRotations[request.pageIndex] = nextRotation;
    const page = objects.get(pageId)!;
    objects.set(pageId, { id: pageId, body: setEntry(page.body, "Rotate", String(nextRotation)) });
  }
  const output = writePdf(parsed.version, objects, parsed.rootId, parsed.infoId);
  if (output.length > resolved.maxBytes) fail("limit-exceeded", "Generated PDF exceeds the byte limit.");
  validatePdfOutput(output, {
    pageCount: parsed.pageIds.length,
    pageObjectIds: parsed.pageIds,
    rotations: expectedRotations,
    metadata: parsed.metadata,
  }, resolved);
  return output;
}

export function setPdfMetadata(
  bytes: Uint8Array,
  update: PdfMetadataUpdate,
  limits: PdfLimits = {},
): Uint8Array {
  const resolved = resolveLimits(limits);
  const parsed = parsePdf(bytes, resolved);
  const objects = cloneObjects(parsed);
  let infoId = parsed.infoId;
  if (infoId === undefined) {
    infoId = Math.max(0, ...objects.keys()) + 1;
    if (objects.size + 1 > resolved.maxObjects) fail("limit-exceeded", "Metadata would exceed the object limit.");
    objects.set(infoId, { id: infoId, body: "<< >>" });
  }
  let infoBody = objects.get(infoId)!.body;
  const expectedMetadata: PdfMetadata = { ...parsed.metadata };
  for (const [property, pdfKey] of METADATA_KEYS) {
    const value = update[property];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") {
      fail("invalid-operation", `Metadata ${property} must be a string, null, or undefined.`);
    }
    infoBody = setEntry(infoBody, pdfKey, value === null ? null : encodePdfText(value));
    if (value === null) delete expectedMetadata[property];
    else expectedMetadata[property] = value;
  }
  objects.set(infoId, { id: infoId, body: infoBody });
  const output = writePdf(parsed.version, objects, parsed.rootId, infoId);
  if (output.length > resolved.maxBytes) fail("limit-exceeded", "Generated PDF exceeds the byte limit.");
  validatePdfOutput(output, {
    pageCount: parsed.pageIds.length,
    pageObjectIds: parsed.pageIds,
    rotations: parsed.rotations,
    metadata: expectedMetadata,
  }, resolved);
  return output;
}

export function mergePdfs(inputs: readonly Uint8Array[], limits: PdfLimits = {}): Uint8Array {
  const resolved = resolveLimits(limits);
  if (inputs.length < 2) fail("invalid-operation", "PDF merge requires at least two inputs.");
  if (inputs.length > resolved.maxInputs) fail("limit-exceeded", "PDF merge exceeds the input limit.");
  const parsedInputs = inputs.map((input) => parsePdf(input, resolved));
  const totalPages = parsedInputs.reduce((sum, parsed) => sum + parsed.pageIds.length, 0);
  const totalObjects = parsedInputs.reduce((sum, parsed) => sum + parsed.objects.size, 0) + 2;
  if (totalPages > resolved.maxPages) fail("limit-exceeded", "Merged PDF exceeds the page limit.");
  if (totalObjects > resolved.maxObjects) fail("limit-exceeded", "Merged PDF exceeds the object limit.");

  const objects = new Map<number, PdfObjectRecord>();
  objects.set(1, { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" });
  const mergedPageIds: number[] = [];
  const mergedRotations: number[] = [];
  let nextId = 3;
  let mergedInfoId: number | undefined;
  for (let inputIndex = 0; inputIndex < parsedInputs.length; inputIndex += 1) {
    const parsed = parsedInputs[inputIndex];
    const mapping = new Map<number, number>();
    for (const sourceId of [...parsed.objects.keys()].sort((left, right) => left - right)) {
      mapping.set(sourceId, nextId);
      nextId += 1;
    }
    for (const [sourceId, object] of parsed.objects) {
      const targetId = mapping.get(sourceId)!;
      let body = rewriteReferences(object.body, mapping);
      const pageIndex = parsed.pageIds.indexOf(sourceId);
      if (pageIndex >= 0) {
        body = setEntry(body, "Parent", "2 0 R");
        mergedPageIds.push(targetId);
        mergedRotations.push(parsed.rotations[pageIndex]);
      }
      objects.set(targetId, { id: targetId, body });
    }
    if (inputIndex === 0 && parsed.infoId !== undefined) mergedInfoId = mapping.get(parsed.infoId);
  }
  objects.set(2, {
    id: 2,
    body: `<< /Type /Pages /Kids [${mergedPageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${mergedPageIds.length} >>`,
  });
  const version = parsedInputs.reduce((highest, parsed) =>
    Number(parsed.version.slice(2)) > Number(highest.slice(2)) ? parsed.version : highest,
  parsedInputs[0].version);
  const output = writePdf(version, objects, 1, mergedInfoId);
  if (output.length > resolved.maxBytes) fail("limit-exceeded", "Merged PDF exceeds the byte limit.");
  validatePdfOutput(output, {
    pageCount: mergedPageIds.length,
    pageObjectIds: mergedPageIds,
    rotations: mergedRotations,
    metadata: parsedInputs[0].metadata,
  }, resolved);
  return output;
}

import { link, mkdir, open, readFile, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';

import {
  extractPdf,
  inspectPdf,
  mergePdfs,
  reorderPdf,
  rotatePdf,
  setPdfMetadata,
  validatePdfOutput,
  type PdfInspection,
  type PdfMetadataUpdate,
  type PdfRotationRequest,
} from '../shared/converter-pdf.js';

const MAX_PDF_BYTES = 32 * 1024 * 1024;
const MAX_MERGE_TOTAL_BYTES = 32 * 1024 * 1024;
const STORAGE_HEADROOM = 4 * 1024 * 1024;

export type PdfFileOperationRequest =
  | { readonly kind: 'inspect'; readonly sourcePath: string }
  | { readonly kind: 'extract'; readonly sourcePath: string; readonly destinationPath: string; readonly pages: readonly number[] }
  | { readonly kind: 'split'; readonly sourcePath: string; readonly destinationPaths: readonly string[]; readonly groups?: readonly (readonly number[])[] }
  | { readonly kind: 'reorder'; readonly sourcePath: string; readonly destinationPath: string; readonly order: readonly number[] }
  | { readonly kind: 'rotate'; readonly sourcePath: string; readonly destinationPath: string; readonly rotations: readonly PdfRotationRequest[] }
  | { readonly kind: 'metadata'; readonly sourcePath: string; readonly destinationPath: string; readonly metadata: PdfMetadataUpdate }
  | { readonly kind: 'merge'; readonly sourcePaths: readonly string[]; readonly destinationPath: string };

export interface PdfFileOutput {
  readonly destinationPath: string;
  readonly bytes: number;
  readonly status: 'written' | 'failed';
  readonly message: string;
}

export interface PdfFileOperationOutcome {
  readonly operation: PdfFileOperationRequest['kind'];
  readonly inspection: PdfInspection;
  readonly outputs: readonly PdfFileOutput[];
}

async function readPdf(filename: string): Promise<Uint8Array> {
  const absolute = path.resolve(filename);
  const handle = await open(absolute, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('PDF source is not a regular file.');
    if (info.size > MAX_PDF_BYTES) throw new Error(`PDF source exceeds ${MAX_PDF_BYTES} bytes.`);
    const buffer = Buffer.alloc(MAX_PDF_BYTES + 1);
    let offset = 0;
    while (offset <= MAX_PDF_BYTES) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > MAX_PDF_BYTES) throw new Error(`PDF source grew beyond the ${MAX_PDF_BYTES}-byte limit while it was being read.`);
    return buffer.subarray(0, offset);
  } finally { await handle.close(); }
}

async function preflightDestination(destination: string, bytes: number): Promise<void> {
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true });
  try { await stat(destination); throw new Error('PDF destination already exists; overwrite requires the application super-confirmation flow.'); }
  catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
  const fileSystem = await statfs(directory, { bigint: true });
  const free = fileSystem.bavail * fileSystem.bsize;
  if (free < BigInt(bytes + STORAGE_HEADROOM)) throw new Error(`PDF destination requires ${bytes + STORAGE_HEADROOM} free bytes including safety headroom.`);
}

async function preflightSplitDestinations(destinations: readonly string[]): Promise<void> {
  const resolved = destinations.map((destination) => path.resolve(destination));
  if (new Set(resolved.map((destination) => destination.toLocaleLowerCase('en-US'))).size !== resolved.length) {
    throw new Error('Every PDF split output needs a distinct destination.');
  }
  const volumeCounts = new Map<string, { directory: string; count: number }>();
  for (const destination of resolved) {
    const directory = path.dirname(destination);
    await mkdir(directory, { recursive: true });
    try { await stat(destination); throw new Error('PDF destination already exists; overwrite requires the application super-confirmation flow.'); }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
    const volume = path.parse(destination).root.toLocaleLowerCase('en-US');
    const current = volumeCounts.get(volume);
    volumeCounts.set(volume, { directory, count: (current?.count ?? 0) + 1 });
  }
  for (const { directory, count } of volumeCounts.values()) {
    const fileSystem = await statfs(directory, { bigint: true });
    const free = fileSystem.bavail * fileSystem.bsize;
    const conservativeRequired = BigInt(MAX_PDF_BYTES) * BigInt(count) + BigInt(STORAGE_HEADROOM);
    if (free < conservativeRequired) throw new Error(`PDF split storage preflight requires ${conservativeRequired} bytes on this volume; ${free} are available.`);
  }
}

async function writePdfAtomic(destinationInput: string, bytes: Uint8Array): Promise<PdfFileOutput> {
  const destinationPath = path.resolve(destinationInput);
  const temporary = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  try {
    await preflightDestination(destinationPath, bytes.byteLength);
    const handle = await open(temporary, 'wx');
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    const reopened = await readFile(temporary);
    validatePdfOutput(reopened);
    await link(temporary, destinationPath);
    await rm(temporary);
    return { destinationPath, bytes: bytes.byteLength, status: 'written', message: 'Written atomically and reopened for structural validation.' };
  } catch (error) {
    return { destinationPath, bytes: 0, status: 'failed', message: error instanceof Error ? error.message : String(error) };
  } finally { await rm(temporary, { force: true }).catch(() => undefined); }
}

export async function performPdfFileOperation(request: PdfFileOperationRequest): Promise<PdfFileOperationOutcome> {
  if (request.kind === 'merge') {
    if (request.sourcePaths.length < 2 || request.sourcePaths.length > 64) throw new Error('PDF merge accepts from 2 to 64 inputs.');
    const inputs: Uint8Array[] = [];
    let totalBytes = 0;
    for (const sourcePath of request.sourcePaths) {
      const bytes = await readPdf(sourcePath);
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_MERGE_TOTAL_BYTES) throw new Error(`PDF merge inputs exceed the combined ${MAX_MERGE_TOTAL_BYTES}-byte memory bound.`);
      inputs.push(bytes);
    }
    const output = mergePdfs(inputs, { maxBytes: MAX_PDF_BYTES, maxInputs: 64 });
    const result = await writePdfAtomic(request.destinationPath, output);
    return { operation: request.kind, inspection: inspectPdf(output, { maxBytes: MAX_PDF_BYTES }), outputs: [result] };
  }

  const source = await readPdf(request.sourcePath);
  const sourceInspection = inspectPdf(source, { maxBytes: MAX_PDF_BYTES });
  if (request.kind === 'inspect') return { operation: request.kind, inspection: sourceInspection, outputs: [] };

  if (request.kind === 'split') {
    const groups = request.groups ?? sourceInspection.pageObjectIds.map((_id, pageIndex) => [pageIndex]);
    if (request.destinationPaths.length !== groups.length) throw new Error(`PDF split needs exactly ${groups.length} destination paths.`);
    await preflightSplitDestinations(request.destinationPaths);
    const outputs: PdfFileOutput[] = [];
    for (let index = 0; index < groups.length; index += 1) {
      const generated = extractPdf(source, groups[index], { maxBytes: MAX_PDF_BYTES });
      outputs.push(await writePdfAtomic(request.destinationPaths[index], generated));
    }
    return { operation: request.kind, inspection: sourceInspection, outputs };
  }

  let output: Uint8Array;
  switch (request.kind) {
    case 'extract': output = extractPdf(source, request.pages, { maxBytes: MAX_PDF_BYTES }); break;
    case 'reorder': output = reorderPdf(source, request.order, { maxBytes: MAX_PDF_BYTES }); break;
    case 'rotate': output = rotatePdf(source, request.rotations, { maxBytes: MAX_PDF_BYTES }); break;
    case 'metadata': output = setPdfMetadata(source, request.metadata, { maxBytes: MAX_PDF_BYTES }); break;
  }
  const result = await writePdfAtomic(request.destinationPath, output);
  return { operation: request.kind, inspection: inspectPdf(output, { maxBytes: MAX_PDF_BYTES }), outputs: [result] };
}

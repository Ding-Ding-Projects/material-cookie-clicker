import { link, mkdir, open, readFile, rename, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';

import { convertBytes, detectFileType, previewBytes, validateConvertedOutput, type ConversionResult } from '../shared/converter-core.js';
import type { ConvertFileOutcome, ConvertFileRequest, FileInspection } from '../shared/converter-contracts.js';
import { getConverterAdapter } from '../shared/converter-registry.js';
import type { ConverterQueueItem, ConverterQueueWorker } from '../shared/converter-queue.js';

const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const MAX_INSPECTION_BYTES = 32 * 1024 * 1024;
const STORAGE_HEADROOM_BYTES = 4 * 1024 * 1024;

function ensureDistinctPaths(source: string, destination: string): void {
  if (source.toLocaleLowerCase('en-US') === destination.toLocaleLowerCase('en-US')) {
    throw new Error('The destination must differ from the source; conversion never overwrites its input.');
  }
}

async function readBounded(filename: string, maximumBytes: number): Promise<Uint8Array> {
  const handle = await open(filename, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('The selected source is not a regular file.');
    if (info.size > maximumBytes) throw new Error(`Source is ${info.size} bytes; this operation allows at most ${maximumBytes} bytes.`);
    const buffer = Buffer.alloc(maximumBytes + 1);
    let offset = 0;
    while (offset <= maximumBytes) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maximumBytes) throw new Error(`Source grew beyond the ${maximumBytes}-byte operation limit while it was being read.`);
    return buffer.subarray(0, offset);
  } finally { await handle.close(); }
}

async function availableBytes(directory: string): Promise<number> {
  const info = await statfs(directory, { bigint: true });
  const free = info.bavail * info.bsize;
  return free > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(free);
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try { await rename(source, destination); return; }
    catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (!TRANSIENT_RENAME_CODES.has(code) || attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}

async function validateWrittenOutput(adapterId: string, temporary: string, expected: ConversionResult): Promise<void> {
  const reopened = await readFile(temporary);
  if (reopened.byteLength !== expected.output.byteLength) throw new Error('Output byte count changed during the atomic write.');
  validateConvertedOutput(adapterId, reopened);
}

export async function inspectConverterFile(filename: string): Promise<FileInspection> {
  const absolutePath = path.resolve(filename);
  const bytes = await readBounded(absolutePath, MAX_INSPECTION_BYTES);
  return { absolutePath, bytes: bytes.byteLength, detection: detectFileType(bytes), preview: previewBytes(bytes) };
}

export async function convertFile(request: ConvertFileRequest, signal?: AbortSignal, onProgress?: (processedBytes: number) => Promise<void>): Promise<ConvertFileOutcome> {
  const sourcePath = path.resolve(request.sourcePath);
  const destinationPath = path.resolve(request.destinationPath);
  ensureDistinctPaths(sourcePath, destinationPath);
  const adapter = getConverterAdapter(request.adapterId);
  if (!adapter) throw new Error(`Unknown converter adapter: ${request.adapterId}`);
  if (!adapter.enabled || !adapter.bundled) throw new Error(adapter.disabledReason ?? 'The selected adapter is unavailable.');
  if (signal?.aborted) throw new DOMException('Conversion cancelled.', 'AbortError');
  const input = await readBounded(sourcePath, adapter.maximumInputBytes);
  await onProgress?.(input.byteLength);
  if (signal?.aborted) throw new DOMException('Conversion cancelled.', 'AbortError');
  const detected = detectFileType(input);
  const converted = convertBytes(adapter.id, input);
  const destinationDirectory = path.dirname(destinationPath);
  await mkdir(destinationDirectory, { recursive: true });
  const freeBytes = await availableBytes(destinationDirectory);
  if (freeBytes < converted.output.byteLength + STORAGE_HEADROOM_BYTES) throw new Error(`Destination has ${freeBytes} free bytes; ${converted.output.byteLength + STORAGE_HEADROOM_BYTES} bytes are required including safety headroom.`);
  if (!request.overwriteAuthorized) {
    try { await stat(destinationPath); throw new Error('Destination already exists; overwrite requires explicit super-confirmation authorization.'); }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  const temporary = path.join(destinationDirectory, `.${path.basename(destinationPath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  try {
    const handle = await open(temporary, 'wx');
    try { await handle.writeFile(converted.output); await handle.sync(); } finally { await handle.close(); }
    await validateWrittenOutput(adapter.id, temporary, converted);
    if (signal?.aborted) throw new DOMException('Conversion cancelled.', 'AbortError');
    if (request.overwriteAuthorized) {
      await renameWithRetry(temporary, destinationPath);
    } else {
      try {
        await link(temporary, destinationPath);
        await rm(temporary);
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
          throw new Error('Destination appeared before commit; conversion did not overwrite it.');
        }
        throw error;
      }
    }
    await onProgress?.(input.byteLength + converted.output.byteLength);
    return {
      sourcePath, destinationPath, inputBytes: input.byteLength, outputBytes: converted.output.byteLength,
      detectedType: detected.type, targetType: converted.targetType, disclosure: converted.disclosure,
    };
  } finally { await rm(temporary, { force: true }).catch(() => undefined); }
}

export type { ConvertFileOutcome, ConvertFileRequest, FileInspection } from '../shared/converter-contracts.js';

export class FileConverterQueueWorker implements ConverterQueueWorker {
  async reconcile(item: ConverterQueueItem): Promise<'converted' | 'retry'> {
    const adapter = getConverterAdapter(item.adapterId);
    if (!adapter || !adapter.enabled || !adapter.bundled) throw new Error(adapter?.disabledReason ?? 'Adapter is unavailable.');
    const destination = path.resolve(item.destinationPath);
    try {
      const source = await readBounded(path.resolve(item.sourcePath), adapter.maximumInputBytes);
      const expected = convertBytes(adapter.id, source).output;
      const actual = await readBounded(destination, Math.max(expected.byteLength, adapter.maximumInputBytes) + 1);
      if (actual.byteLength !== expected.byteLength || actual.some((value, index) => value !== expected[index])) {
        throw new Error('Existing destination does not match the deterministic bounded conversion; it was not overwritten.');
      }
      validateConvertedOutput(adapter.id, actual);
      return 'converted';
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return 'retry';
      throw error;
    }
  }

  async preflight(item: ConverterQueueItem): Promise<void> {
    const adapter = getConverterAdapter(item.adapterId);
    if (!adapter || !adapter.enabled || !adapter.bundled) throw new Error(adapter?.disabledReason ?? 'Adapter is unavailable.');
    const source = await stat(path.resolve(item.sourcePath));
    if (!source.isFile()) throw new Error('Queue source is not a regular file.');
    if (source.size > adapter.maximumInputBytes) throw new Error(`Source exceeds the adapter limit of ${adapter.maximumInputBytes} bytes.`);
    const directory = path.dirname(path.resolve(item.destinationPath));
    await mkdir(directory, { recursive: true });
    const free = await availableBytes(directory);
    const estimate = Math.max(item.expectedBytes ?? source.size, source.size) + STORAGE_HEADROOM_BYTES;
    if (free < estimate) throw new Error(`Destination storage preflight requires ${estimate} bytes; ${free} are available.`);
  }

  async convert(item: ConverterQueueItem, signal: AbortSignal, onProgress: (processedBytes: number) => Promise<void>): Promise<void> {
    await convertFile({ sourcePath: item.sourcePath, destinationPath: item.destinationPath, adapterId: item.adapterId }, signal, onProgress);
  }
}

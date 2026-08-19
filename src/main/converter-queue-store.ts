import { opendir, readFile, rename, stat, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { ConverterQueueItem, ConverterQueueStatus, ConverterQueueStore, QueuePage } from '../shared/converter-queue.js';

const RECORD_VERSION = 1;
const MAX_RECORD_BYTES = 64 * 1024;
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const QUEUE_STATUSES = new Set<ConverterQueueStatus>(['queued', 'running', 'paused', 'converted', 'skipped', 'cancelled', 'failed']);

function itemFilename(id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw new Error('Queue item id contains unsupported characters.');
  return `${id}.json`;
}

async function atomicJsonWrite(destination: string, value: unknown): Promise<void> {
  const temporary = `${destination}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: RECORD_VERSION, value }), { encoding: 'utf8', flag: 'wx' });
  try {
    for (let attempt = 0; ; attempt += 1) {
      try { await rename(temporary, destination); return; }
      catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (!TRANSIENT_RENAME_CODES.has(code) || attempt >= 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
      }
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function validateQueueItem(value: unknown, expectedId: string): ConverterQueueItem {
  if (!value || typeof value !== 'object') throw new Error('Queue item is not an object.');
  const item = value as Record<string, unknown>;
  if (item.id !== expectedId) throw new Error('Queue record id does not match its filename.');
  if (typeof item.sourcePath !== 'string' || item.sourcePath.length === 0 || item.sourcePath.length > 32_768) throw new Error('Queue source path is invalid.');
  if (typeof item.destinationPath !== 'string' || item.destinationPath.length === 0 || item.destinationPath.length > 32_768) throw new Error('Queue destination path is invalid.');
  if (typeof item.adapterId !== 'string' || item.adapterId.length === 0 || item.adapterId.length > 128) throw new Error('Queue adapter id is invalid.');
  if (typeof item.addedAt !== 'number' || !Number.isSafeInteger(item.addedAt) || item.addedAt < 0) throw new Error('Queue addedAt is invalid.');
  if (typeof item.status !== 'string' || !QUEUE_STATUSES.has(item.status as ConverterQueueStatus)) throw new Error('Queue status is invalid.');
  if (typeof item.processedBytes !== 'number' || !Number.isSafeInteger(item.processedBytes) || item.processedBytes < 0) throw new Error('Queue processedBytes is invalid.');
  if (item.expectedBytes !== undefined && (typeof item.expectedBytes !== 'number' || !Number.isSafeInteger(item.expectedBytes) || item.expectedBytes < 0)) throw new Error('Queue expectedBytes is invalid.');
  if (item.message !== undefined && (typeof item.message !== 'string' || item.message.length > 4096)) throw new Error('Queue message is invalid.');
  return item as unknown as ConverterQueueItem;
}

async function readItem(filename: string, expectedId: string): Promise<ConverterQueueItem> {
  const info = await stat(filename);
  if (info.size > MAX_RECORD_BYTES) throw new Error(`Queue record exceeds ${MAX_RECORD_BYTES} bytes.`);
  const parsed: unknown = JSON.parse(await readFile(filename, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== RECORD_VERSION || !('value' in parsed)) throw new Error('Queue record schema is invalid.');
  return validateQueueItem(parsed.value, expectedId);
}

export class FileConverterQueueStore implements ConverterQueueStore {
  readonly #directory: string;

  constructor(directory: string) {
    this.#directory = path.resolve(directory);
  }

  async append(items: readonly ConverterQueueItem[]): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    for (const item of items) {
      const target = path.join(this.#directory, itemFilename(item.id));
      try { await stat(target); throw new Error(`Queue item already exists: ${item.id}`); }
      catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
      await atomicJsonWrite(target, item);
    }
  }

  async page(statuses: readonly ConverterQueueStatus[], cursor: string | null, limit: number): Promise<QueuePage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 250) throw new Error('Queue page limit must be from 1 to 250.');
    await mkdir(this.#directory, { recursive: true });
    const candidates: { filename: string; item: ConverterQueueItem }[] = [];
    let matchingAfterCursor = 0;
    const directory = await opendir(this.#directory);
    for await (const entry of directory) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      if (cursor !== null && entry.name.localeCompare(cursor, 'en') <= 0) continue;
      let item: ConverterQueueItem;
      try { item = await readItem(path.join(this.#directory, entry.name), entry.name.slice(0, -5)); }
      catch { await this.#quarantine(entry.name); continue; }
      if (!statuses.includes(item.status)) continue;
      matchingAfterCursor += 1;
      candidates.push({ filename: entry.name, item });
      candidates.sort((left, right) => left.filename.localeCompare(right.filename, 'en'));
      if (candidates.length > limit) candidates.pop();
    }
    const nextCursor = matchingAfterCursor > candidates.length ? candidates.at(-1)?.filename ?? null : null;
    return { items: candidates.map((candidate) => candidate.item), nextCursor };
  }

  async *stream(statuses: readonly ConverterQueueStatus[], pageSize: number): AsyncIterable<QueuePage> {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250) throw new Error('Queue stream page size must be from 1 to 250.');
    await mkdir(this.#directory, { recursive: true });
    const directory = await opendir(this.#directory);
    let items: ConverterQueueItem[] = [];
    for await (const entry of directory) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      let item: ConverterQueueItem;
      try { item = await readItem(path.join(this.#directory, entry.name), entry.name.slice(0, -5)); }
      catch { await this.#quarantine(entry.name); continue; }
      if (!statuses.includes(item.status)) continue;
      items.push(item);
      if (items.length === pageSize) { yield { items, nextCursor: null }; items = []; }
    }
    if (items.length > 0) yield { items, nextCursor: null };
  }

  async #quarantine(filename: string): Promise<void> {
    const quarantine = path.join(this.#directory, 'quarantine');
    await mkdir(quarantine, { recursive: true });
    const source = path.join(this.#directory, filename);
    const destination = path.join(quarantine, `${filename}.${Date.now()}.invalid`);
    await rename(source, destination).catch(() => undefined);
  }

  async update(id: string, patch: Partial<Omit<ConverterQueueItem, 'id'>>): Promise<ConverterQueueItem> {
    const target = path.join(this.#directory, itemFilename(id));
    const item = await readItem(target, id);
    const updated = { ...item, ...patch, id };
    await atomicJsonWrite(target, updated);
    return updated;
  }

  async get(id: string): Promise<ConverterQueueItem | null> {
    try { return await readItem(path.join(this.#directory, itemFilename(id)), id); }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null; throw error; }
  }
}

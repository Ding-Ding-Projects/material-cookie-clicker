import { describe, expect, it } from 'vitest';

import {
  ConverterQueueController,
  MAX_QUEUE_PAGE,
  type ConverterQueueItem,
  type ConverterQueueStatus,
  type ConverterQueueStore,
  type QueuePage,
} from '../src/shared/converter-queue.js';

class MemoryStore implements ConverterQueueStore {
  readonly items = new Map<string, ConverterQueueItem>();
  async append(items: readonly ConverterQueueItem[]) { for (const item of items) this.items.set(item.id, item); }
  async page(statuses: readonly ConverterQueueStatus[], cursor: string | null, limit: number): Promise<QueuePage> {
    const all = [...this.items.values()].filter((item) => statuses.includes(item.status)).sort((a, b) => a.id.localeCompare(b.id));
    const start = cursor ? all.findIndex((item) => item.id === cursor) + 1 : 0;
    const page = all.slice(start, start + limit);
    return { items: page, nextCursor: start + limit < all.length ? page.at(-1)?.id ?? null : null };
  }
  async update(id: string, patch: Partial<Omit<ConverterQueueItem, 'id'>>) { const next = { ...this.items.get(id)!, ...patch, id }; this.items.set(id, next); return next; }
  async get(id: string) { return this.items.get(id) ?? null; }
}

function descriptor(id: string) {
  return { id, sourcePath: `${id}.json`, destinationPath: `${id}.out.json`, adapterId: 'json-pretty', addedAt: 1 };
}

describe('persistent paged converter queue controller', () => {
  it('accepts unlimited total items in bounded discovery pages', async () => {
    const store = new MemoryStore();
    const controller = new ConverterQueueController(store, { async preflight() {}, async convert(_item, _signal, progress) { await progress(1); } });
    for (let page = 0; page < 5; page += 1) await controller.enqueue(Array.from({ length: MAX_QUEUE_PAGE }, (_, index) => descriptor(`${page}-${index}`)));
    expect(store.items.size).toBe(1_250);
    await expect(controller.enqueue(Array.from({ length: MAX_QUEUE_PAGE + 1 }, (_, index) => descriptor(`overflow-${index}`)))).rejects.toThrow(/pages/);
  });

  it('never exceeds configured active concurrency and records per-file outcomes', async () => {
    const store = new MemoryStore();
    let active = 0;
    let peak = 0;
    const controller = new ConverterQueueController(store, {
      async preflight() {},
      async convert(item, _signal, progress) {
        active += 1; peak = Math.max(peak, active); await progress(item.id.length); await new Promise((resolve) => setTimeout(resolve, 2)); active -= 1;
      },
    }, 3);
    await controller.enqueue(Array.from({ length: 12 }, (_, index) => descriptor(String(index).padStart(2, '0'))));
    await controller.start();
    expect(peak).toBeLessThanOrEqual(3);
    expect([...store.items.values()].every((item) => item.status === 'converted' && item.processedBytes === 2)).toBe(true);
  });

  it('recovers running records after restart and reports failures honestly', async () => {
    const store = new MemoryStore();
    await store.append([{ ...descriptor('old'), status: 'running', processedBytes: 4 }]);
    const controller = new ConverterQueueController(store, { async preflight() { throw new Error('storage preflight refused'); }, async convert() { throw new Error('must not run'); } });
    await controller.start();
    expect((await store.get('old'))?.status).toBe('failed');
    expect((await store.get('old'))?.message).toContain('storage preflight');
  });

  it('reconciles an exactly matching committed output after a crash', async () => {
    const store = new MemoryStore();
    await store.append([{ ...descriptor('recovered'), status: 'running', processedBytes: 4 }]);
    let convertedAgain = false;
    const controller = new ConverterQueueController(store, {
      async reconcile() { return 'converted'; },
      async preflight() { throw new Error('preflight must not repeat'); },
      async convert() { convertedAgain = true; },
    });
    await controller.start();
    expect(convertedAgain).toBe(false);
    expect((await store.get('recovered'))?.status).toBe('converted');
    expect((await store.get('recovered'))?.message).toContain('exactly matches');
  });
});

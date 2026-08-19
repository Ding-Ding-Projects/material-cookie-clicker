export type ConverterQueueStatus = 'queued' | 'running' | 'paused' | 'converted' | 'skipped' | 'cancelled' | 'failed';

export interface ConverterQueueItem {
  readonly id: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly adapterId: string;
  readonly addedAt: number;
  readonly expectedBytes?: number;
  readonly status: ConverterQueueStatus;
  readonly processedBytes: number;
  readonly message?: string;
}

export interface QueuePage {
  readonly items: readonly ConverterQueueItem[];
  readonly nextCursor: string | null;
}

export interface ConverterQueueStore {
  append(items: readonly ConverterQueueItem[]): Promise<void>;
  page(statuses: readonly ConverterQueueStatus[], cursor: string | null, limit: number): Promise<QueuePage>;
  update(id: string, patch: Partial<Omit<ConverterQueueItem, 'id'>>): Promise<ConverterQueueItem>;
  get(id: string): Promise<ConverterQueueItem | null>;
  stream?(statuses: readonly ConverterQueueStatus[], pageSize: number): AsyncIterable<QueuePage>;
}

export interface ConverterQueueWorker {
  reconcile?(item: ConverterQueueItem): Promise<'converted' | 'retry'>;
  preflight(item: ConverterQueueItem): Promise<void>;
  convert(item: ConverterQueueItem, signal: AbortSignal, onProgress: (processedBytes: number) => Promise<void>): Promise<void>;
}

export interface ConverterQueueSnapshot {
  readonly running: number;
  readonly paused: boolean;
  readonly cancelled: boolean;
}

export const MAX_QUEUE_PAGE = 250;
export const MAX_QUEUE_CONCURRENCY = 4;

export class ConverterQueueController {
  readonly #store: ConverterQueueStore;
  readonly #worker: ConverterQueueWorker;
  readonly #concurrency: number;
  readonly #abortControllers = new Map<string, AbortController>();
  #paused = false;
  #cancelled = false;
  #running = 0;
  #pump: Promise<void> | null = null;

  constructor(store: ConverterQueueStore, worker: ConverterQueueWorker, concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_QUEUE_CONCURRENCY) {
      throw new Error(`Queue concurrency must be an integer from 1 to ${MAX_QUEUE_CONCURRENCY}.`);
    }
    this.#store = store;
    this.#worker = worker;
    this.#concurrency = concurrency;
  }

  snapshot(): ConverterQueueSnapshot {
    return { running: this.#running, paused: this.#paused, cancelled: this.#cancelled };
  }

  async enqueue(items: readonly Omit<ConverterQueueItem, 'status' | 'processedBytes'>[]): Promise<void> {
    if (items.length > MAX_QUEUE_PAGE) throw new Error(`Add queue items in pages of at most ${MAX_QUEUE_PAGE}; the total queue has no fixed cap.`);
    await this.#store.append(items.map((item) => ({ ...item, status: 'queued', processedBytes: 0 })));
  }

  pause(): void {
    this.#paused = true;
  }

  async resume(): Promise<void> {
    this.#paused = false;
    this.#cancelled = false;
    await this.start();
  }

  async cancel(): Promise<void> {
    this.#cancelled = true;
    for (const controller of this.#abortControllers.values()) controller.abort();
    let cursor: string | null = null;
    do {
      const page = await this.#store.page(['queued', 'paused'], cursor, MAX_QUEUE_PAGE);
      for (const item of page.items) await this.#store.update(item.id, { status: 'cancelled', message: 'Cancelled before conversion.' });
      cursor = page.nextCursor;
    } while (cursor !== null);
  }

  async start(): Promise<void> {
    if (this.#pump) return this.#pump;
    this.#cancelled = false;
    this.#pump = this.#run().finally(() => { this.#pump = null; });
    return this.#pump;
  }

  async #run(): Promise<void> {
    if (this.#store.stream) {
      for await (const page of this.#store.stream(['queued', 'paused', 'running'], this.#concurrency)) {
        if (this.#paused || this.#cancelled) return;
        await Promise.all(page.items.map((item) => this.#runOne(item)));
      }
      return;
    }
    let cursor: string | null = null;
    while (!this.#paused && !this.#cancelled) {
      const page = await this.#store.page(['queued', 'paused', 'running'], cursor, this.#concurrency);
      if (page.items.length === 0) return;
      await Promise.all(page.items.map((item) => this.#runOne(item)));
      cursor = page.nextCursor;
      if (cursor === null) return;
    }
  }

  async #runOne(item: ConverterQueueItem): Promise<void> {
    if (this.#paused || this.#cancelled) return;
    const controller = new AbortController();
    this.#abortControllers.set(item.id, controller);
    this.#running += 1;
    try {
      if (item.status === 'running' && this.#worker.reconcile) {
        const recovery = await this.#worker.reconcile(item);
        if (recovery === 'converted') {
          await this.#store.update(item.id, { status: 'converted', message: 'Recovered after restart; existing output exactly matches a fresh bounded conversion.' });
          return;
        }
      }
      await this.#store.update(item.id, { status: 'running', message: undefined });
      await this.#worker.preflight(item);
      await this.#worker.convert(item, controller.signal, async (processedBytes) => {
        if (!Number.isFinite(processedBytes) || processedBytes < 0) throw new Error('Progress bytes must be a non-negative finite number.');
        await this.#store.update(item.id, { processedBytes });
      });
      await this.#store.update(item.id, { status: 'converted', message: 'Converted and output validated.' });
    } catch (error) {
      if (controller.signal.aborted || this.#cancelled) {
        await this.#store.update(item.id, { status: 'cancelled', message: 'Cancelled during conversion.' });
      } else if (this.#paused) {
        await this.#store.update(item.id, { status: 'paused', message: 'Paused; safe to resume.' });
      } else {
        await this.#store.update(item.id, { status: 'failed', message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      this.#running -= 1;
      this.#abortControllers.delete(item.id);
    }
  }
}

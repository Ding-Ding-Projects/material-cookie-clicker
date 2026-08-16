export type PullQueueItemState =
  | "queued"
  | "preflighting"
  | "pulling"
  | "paused"
  | "cancelled"
  | "completed"
  | "failed"
  | "skipped";

export interface PullQueueItem {
  id: string;
  reference: string;
  expectedSizeBytes: number | null;
  requiredFreeBytes: number | null;
  state: PullQueueItemState;
  status: string;
  completedBytes: number;
  totalBytes: number | null;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export interface PullGateway {
  pull(reference: string, signal: AbortSignal): AsyncIterable<PullProgress>;
  installedReferences(): Promise<Set<string>>;
}

export interface PullQueueStore {
  add(item: PullQueueItem): Promise<void>;
  update(item: PullQueueItem): Promise<void>;
  get(id: string): Promise<PullQueueItem | null>;
  readBatch(states: PullQueueItemState[], afterId: string | null, limit: number): Promise<PullQueueItem[]>;
}

export interface StoragePreflight {
  destinationFreeBytes(): Promise<number>;
}

export interface PullQueueOptions {
  concurrency?: number;
  pageSize?: number;
  now?: () => Date;
  id?: () => string;
}

/**
 * Temporary-file headroom applied to every download estimate. The cart
 * preflight and the queue item use the same factor so the figure a person sees
 * before committing a batch is the figure the queue enforces.
 */
export const PULL_STORAGE_HEADROOM = 1.15;

/** Free bytes a download of `sizeBytes` requires, including headroom. */
export function requiredFreeBytesFor(sizeBytes: number | null): number | null {
  if (sizeBytes === null || !Number.isFinite(sizeBytes)) return null;
  return Math.ceil(sizeBytes * PULL_STORAGE_HEADROOM);
}

export interface PullQueueSummary {
  processed: number;
  completed: number;
  skipped: number;
  cancelled: number;
  failed: number;
}

export class PersistentPullQueue {
  readonly #store: PullQueueStore;
  readonly #gateway: PullGateway;
  readonly #storage: StoragePreflight;
  readonly #concurrency: number;
  readonly #pageSize: number;
  readonly #now: () => Date;
  readonly #id: () => string;
  readonly #controllers = new Map<string, AbortController>();
  #paused = false;

  constructor(store: PullQueueStore, gateway: PullGateway, storage: StoragePreflight, options: PullQueueOptions = {}) {
    this.#store = store;
    this.#gateway = gateway;
    this.#storage = storage;
    this.#concurrency = Math.max(1, Math.min(options.concurrency ?? 2, 4));
    this.#pageSize = Math.max(1, Math.min(options.pageSize ?? 32, 128));
    this.#now = options.now ?? (() => new Date());
    this.#id = options.id ?? (() => globalThis.crypto.randomUUID());
  }

  async enqueue(reference: string, expectedSizeBytes: number | null): Promise<PullQueueItem> {
    const now = this.#now().toISOString();
    const item: PullQueueItem = {
      id: this.#id(),
      reference,
      expectedSizeBytes,
      requiredFreeBytes: requiredFreeBytesFor(expectedSizeBytes),
      state: "queued",
      status: "Waiting for storage preflight",
      completedBytes: 0,
      totalBytes: expectedSizeBytes,
      attempt: 0,
      createdAt: now,
      updatedAt: now,
      error: null,
    };
    await this.#store.add(item);
    return item;
  }

  /**
   * Adds several downloads in one pass so a reviewed batch reaches the store as
   * a single decision. Each entry is persisted with the same headroom rule as a
   * single enqueue, and the caller starts the run loop once afterwards.
   */
  async enqueueBatch(entries: Array<{ reference: string; expectedSizeBytes: number | null }>): Promise<PullQueueItem[]> {
    const created: PullQueueItem[] = [];
    for (const entry of entries) {
      created.push(await this.enqueue(entry.reference, entry.expectedSizeBytes));
    }
    return created;
  }

  pause(): void {
    this.#paused = true;
    for (const controller of this.#controllers.values()) controller.abort("Queue paused");
  }

  async resume(): Promise<void> {
    this.#paused = false;
    let afterId: string | null = null;
    while (true) {
      const batch = await this.#store.readBatch(["paused"], afterId, this.#pageSize);
      if (batch.length === 0) break;
      for (const item of batch) {
        afterId = item.id;
        await this.#store.update(this.#withState(item, "queued", "Resumed and waiting for storage preflight", null));
      }
    }
  }

  async cancel(id: string): Promise<void> {
    this.#controllers.get(id)?.abort("Cancelled by user");
    const item = await this.#store.get(id);
    if (!item || ["completed", "skipped"].includes(item.state)) return;
    await this.#store.update(this.#withState(item, "cancelled", "Cancelled", null));
  }

  async retry(id: string): Promise<void> {
    const item = await this.#store.get(id);
    if (!item || !["failed", "cancelled"].includes(item.state)) return;
    await this.#store.update({
      ...this.#withState(item, "queued", "Waiting for storage preflight", null),
      completedBytes: 0,
    });
  }

  async reconcile(): Promise<void> {
    const installed = await this.#gateway.installedReferences();
    let afterId: string | null = null;
    while (true) {
      const batch = await this.#store.readBatch(["pulling", "preflighting", "paused", "queued"], afterId, this.#pageSize);
      if (batch.length === 0) return;
      for (const item of batch) {
        afterId = item.id;
        if (installed.has(item.reference)) {
          await this.#store.update(this.#withState(item, "completed", "Already installed and reconciled", null));
        } else if (["pulling", "preflighting"].includes(item.state)) {
          await this.#store.update(this.#withState(item, "queued", "Recovered after interruption", null));
        }
      }
    }
  }

  async run(): Promise<PullQueueSummary> {
    const summary: PullQueueSummary = { processed: 0, completed: 0, skipped: 0, cancelled: 0, failed: 0 };
    while (!this.#paused) {
      const batch = await this.#store.readBatch(["queued"], null, this.#pageSize);
      if (batch.length === 0) break;
      for (let index = 0; index < batch.length && !this.#paused; index += this.#concurrency) {
        const chunk = batch.slice(index, index + this.#concurrency);
        const results = await Promise.all(chunk.map((item) => this.#runOne(item)));
        for (const state of results) {
          summary.processed += 1;
          if (state === "completed") summary.completed += 1;
          else if (state === "skipped") summary.skipped += 1;
          else if (state === "cancelled") summary.cancelled += 1;
          else if (state === "failed") summary.failed += 1;
        }
      }
    }
    return summary;
  }

  async #runOne(item: PullQueueItem): Promise<PullQueueItemState> {
    const controller = new AbortController();
    this.#controllers.set(item.id, controller);
    let current = { ...item, attempt: item.attempt + 1 };
    try {
      current = this.#withState(current, "preflighting", "Checking destination storage", null);
      await this.#store.update(current);
      const installed = await this.#gateway.installedReferences();
      if (installed.has(current.reference)) {
        current = this.#withState(current, "skipped", "Already installed", null);
        await this.#store.update(current);
        return current.state;
      }
      const free = await this.#storage.destinationFreeBytes();
      if (current.requiredFreeBytes === null) {
        throw new Error("The official catalog did not report a size, so storage preflight cannot approve this pull.");
      }
      if (free < current.requiredFreeBytes) {
        throw new Error(`Insufficient destination storage: ${free} bytes free; ${current.requiredFreeBytes} bytes required.`);
      }
      current = this.#withState(current, "pulling", "Starting local Ollama pull", null);
      await this.#store.update(current);
      for await (const progress of this.#gateway.pull(current.reference, controller.signal)) {
        current = {
          ...current,
          status: progress.status,
          completedBytes: progress.completed ?? current.completedBytes,
          totalBytes: progress.total ?? current.totalBytes,
          updatedAt: this.#now().toISOString(),
        };
        await this.#store.update(current);
      }
      current = this.#withState(current, "completed", "Pull completed", null);
      await this.#store.update(current);
      return current.state;
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const state: PullQueueItemState = this.#paused ? "paused" : cancelled ? "cancelled" : "failed";
      current = this.#withState(
        current,
        state,
        state === "paused" ? "Paused" : state === "cancelled" ? "Cancelled" : "Pull failed",
        error instanceof Error ? error.message : String(error),
      );
      await this.#store.update(current);
      return current.state;
    } finally {
      this.#controllers.delete(item.id);
    }
  }

  #withState(item: PullQueueItem, state: PullQueueItemState, status: string, error: string | null): PullQueueItem {
    return { ...item, state, status, error, updatedAt: this.#now().toISOString() };
  }
}

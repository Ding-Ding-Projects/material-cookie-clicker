/**
 * Injected doubles for the local Ollama suite tests.
 *
 * Nothing here reaches the network, a real Ollama service, a real file system
 * or a real process. Every port the controller depends on is replaced by a
 * small in-memory implementation that records what it was asked to do, so each
 * regression can assert on behaviour rather than on a live installation.
 */

import type { OfficialCatalogSnapshot, OfficialCatalogVariant } from "../src/catalog.ts";
import type { ChatHistoryStore, ChatStreamChunk, LocalChatSession } from "../src/chat.ts";
import type {
  FolderPicker,
  HardwareEvidenceSource,
  LocalOllamaBridge,
  LocalOllamaSuiteControllerOptions,
  RuntimeProbe,
} from "../src/controller.ts";
import type { HardwareEvidence, ModelFitEvidence } from "../src/hardware-fit.ts";
import {
  AllowlistedHarnessManager,
  type HarnessRuntime,
  type HarnessSnapshot,
  type HarnessSnapshotStore,
  type ResolvedExecutable,
} from "../src/harness.ts";
import type { OfficialCatalogCache } from "../src/catalog.ts";
import type { PullProgress, PullQueueItem, PullQueueItemState, PullQueueStore, StoragePreflight } from "../src/pull-queue.ts";
import type { LocalRuntimeModel } from "../src/view-model.ts";

export function makeVariant(overrides: Partial<OfficialCatalogVariant> & { reference: string }): OfficialCatalogVariant {
  const [model = overrides.reference, tag = "latest"] = overrides.reference.split(":");
  return {
    model,
    tag,
    displayLabel: overrides.reference,
    sizeBytes: 1_000_000,
    parameterSize: "7B",
    quantization: "Q4_K_M",
    capabilities: [],
    officialUrl: `https://ollama.com/library/${overrides.reference}`,
    ...overrides,
  };
}

export function makeSnapshot(
  variants: OfficialCatalogVariant[],
  overrides: Partial<OfficialCatalogSnapshot> = {},
): OfficialCatalogSnapshot {
  const families = new Set(variants.map((variant) => variant.model));
  return {
    schemaVersion: 1,
    source: "ollama-official-library",
    sourceUrl: "https://ollama.com/library",
    sourceIdentity: "test-identity",
    refreshedAt: new Date().toISOString(),
    modelPageCount: 1,
    tagPageCount: 1,
    modelCount: families.size,
    variantCount: variants.length,
    complete: true,
    stale: false,
    staleAfterMs: 24 * 60 * 60 * 1000,
    models: [...families].map((name) => ({
      name,
      description: null,
      capabilities: [],
      officialUrl: `https://ollama.com/library/${name}`,
    })),
    variants,
    warnings: [],
    ...overrides,
  };
}

export class MemoryCatalogCache implements OfficialCatalogCache {
  writes = 0;
  #snapshot: OfficialCatalogSnapshot | null;

  constructor(snapshot: OfficialCatalogSnapshot | null = null) {
    this.#snapshot = snapshot;
  }

  async read(): Promise<OfficialCatalogSnapshot | null> {
    return this.#snapshot;
  }

  async write(snapshot: OfficialCatalogSnapshot): Promise<void> {
    this.writes += 1;
    this.#snapshot = snapshot;
  }
}

export class MemoryPullQueueStore implements PullQueueStore {
  readonly added: PullQueueItem[] = [];
  readonly items = new Map<string, PullQueueItem>();

  async add(item: PullQueueItem): Promise<void> {
    this.added.push(item);
    this.items.set(item.id, item);
  }

  async update(item: PullQueueItem): Promise<void> {
    this.items.set(item.id, item);
  }

  async get(id: string): Promise<PullQueueItem | null> {
    return this.items.get(id) ?? null;
  }

  async readBatch(states: PullQueueItemState[], afterId: string | null, limit: number): Promise<PullQueueItem[]> {
    const ordered = [...this.items.values()].filter((item) => states.includes(item.state));
    const start = afterId === null ? 0 : ordered.findIndex((item) => item.id === afterId) + 1;
    return ordered.slice(start, start + limit);
  }
}

export class MemoryChatHistoryStore implements ChatHistoryStore {
  readonly sessions = new Map<string, LocalChatSession>();

  async create(session: LocalChatSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async read(id: string): Promise<LocalChatSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async update(session: LocalChatSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async list(afterId: string | null, limit: number): Promise<LocalChatSession[]> {
    const ordered = [...this.sessions.values()];
    const start = afterId === null ? 0 : ordered.findIndex((session) => session.id === afterId) + 1;
    return ordered.slice(start, start + limit);
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }
}

export interface FakeBridgeOptions {
  probe?: RuntimeProbe;
  installed?: LocalRuntimeModel[];
  running?: LocalRuntimeModel[];
  chunks?: ChatStreamChunk[];
}

export class FakeBridge implements LocalOllamaBridge {
  chatCalls = 0;
  pullCalls: string[] = [];
  readonly #options: FakeBridgeOptions;

  constructor(options: FakeBridgeOptions = {}) {
    this.#options = options;
  }

  async probe(): Promise<RuntimeProbe> {
    return (
      this.#options.probe ?? {
        health: "healthy",
        version: "0.0.0-test",
        message: "The documented local API is healthy.",
        nextAction: "Browse installed models.",
        failingChecks: [],
      }
    );
  }

  async installedModels(): Promise<LocalRuntimeModel[]> {
    return this.#options.installed ?? [];
  }

  async runningModels(): Promise<LocalRuntimeModel[]> {
    return this.#options.running ?? [];
  }

  async installedReferences(): Promise<Set<string>> {
    return new Set((this.#options.installed ?? []).map((model) => model.reference));
  }

  async *pull(reference: string): AsyncIterable<PullProgress> {
    this.pullCalls.push(reference);
    yield { status: "pulling", completed: 1, total: 1 };
  }

  async copyModel(): Promise<void> {}

  async deleteModel(): Promise<void> {}

  async *chatStream(): AsyncIterable<ChatStreamChunk> {
    this.chatCalls += 1;
    for (const chunk of this.#options.chunks ?? [{ content: "local reply", done: true }]) yield chunk;
  }
}

export function makeModel(reference: string, capabilities: string[] = []): LocalRuntimeModel {
  return {
    reference,
    sizeBytes: 1_000_000,
    digest: "test-digest",
    parameterSize: "7B",
    quantization: "Q4_K_M",
    capabilities,
  };
}

export class FakeHardware implements HardwareEvidenceSource {
  readonly #evidence: Partial<HardwareEvidence>;

  constructor(evidence: Partial<HardwareEvidence> = {}) {
    this.#evidence = evidence;
  }

  async collect(): Promise<HardwareEvidence> {
    return {
      collectedAt: new Date().toISOString(),
      architecture: "test",
      systemRamBytes: 16 * 1024 ** 3,
      availableRamBytes: 8 * 1024 ** 3,
      gpuModel: null,
      usableVramBytes: null,
      driverBackend: null,
      driverSupported: null,
      destinationFreeBytes: 500 * 1024 ** 3,
      ...this.#evidence,
    };
  }

  async modelEvidence(reference: string): Promise<ModelFitEvidence> {
    return {
      reference,
      blobSizeBytes: 1_000_000,
      parameterCount: 7e9,
      quantization: "Q4_K_M",
      contextLength: 4096,
      contextBytesPerToken: 128,
    };
  }
}

export class FixedStorage implements StoragePreflight {
  readonly #free: number;

  constructor(free: number) {
    this.#free = free;
  }

  async destinationFreeBytes(): Promise<number> {
    return this.#free;
  }
}

export class FakeFolderPicker implements FolderPicker {
  readonly #folder: string | null;

  constructor(folder: string | null = null) {
    this.#folder = folder;
  }

  async chooseFolder(): Promise<string | null> {
    return this.#folder;
  }
}

export interface FakeHarnessRuntimeOptions {
  executables?: ResolvedExecutable[];
  workingDirectoryValid?: boolean;
  requiredFilesExist?: boolean;
  portsAvailable?: boolean;
  readyFails?: boolean;
}

export class FakeHarnessRuntime implements HarnessRuntime {
  readonly calls: string[] = [];
  lastLaunch: {
    executablePath: string;
    arguments: string[];
    workingDirectory: string;
    environment: Record<string, string>;
    useShell: false;
  } | null = null;

  readonly #options: FakeHarnessRuntimeOptions;

  constructor(options: FakeHarnessRuntimeOptions = {}) {
    this.#options = options;
  }

  async listExecutables(): Promise<ResolvedExecutable[]> {
    this.calls.push("listExecutables");
    return this.#options.executables ?? [];
  }

  async validateWorkingDirectory(): Promise<boolean> {
    return this.#options.workingDirectoryValid ?? true;
  }

  async requiredFilesExist(): Promise<boolean> {
    return this.#options.requiredFilesExist ?? true;
  }

  async portsAvailable(): Promise<boolean> {
    return this.#options.portsAvailable ?? true;
  }

  async launch(input: {
    executablePath: string;
    arguments: string[];
    workingDirectory: string;
    environment: Record<string, string>;
    useShell: false;
  }): Promise<{ processId: number }> {
    this.calls.push("launch");
    this.lastLaunch = input;
    return { processId: 4242 };
  }

  async waitUntilReady(): Promise<void> {
    this.calls.push("waitUntilReady");
    if (this.#options.readyFails) throw new Error("readiness timed out");
  }

  async stop(): Promise<void> {
    this.calls.push("stop");
  }
}

export class FakeSnapshotStore implements HarnessSnapshotStore {
  readonly calls: string[] = [];
  readonly restored: string[] = [];
  readonly records: HarnessSnapshot[] = [];
  #sequence = 0;

  async create(profileId: string): Promise<HarnessSnapshot> {
    this.calls.push("create");
    this.#sequence += 1;
    const record: HarnessSnapshot = {
      id: `snapshot-${this.#sequence}`,
      profileId,
      createdAt: `2026-01-0${this.#sequence}T00:00:00.000Z`,
      payload: { note: "opaque configuration payload" },
    };
    this.records.unshift(record);
    return record;
  }

  async restore(snapshot: HarnessSnapshot): Promise<void> {
    this.calls.push("restore");
    this.restored.push(snapshot.id);
  }

  async list(profileId: string | null, limit: number): Promise<HarnessSnapshot[]> {
    this.calls.push("list");
    return this.records.filter((record) => profileId === null || record.profileId === profileId).slice(0, limit);
  }
}

export interface ControllerHarness {
  options: LocalOllamaSuiteControllerOptions;
  bridge: FakeBridge;
  catalogCache: MemoryCatalogCache;
  pullStore: MemoryPullQueueStore;
  chatStore: MemoryChatHistoryStore;
  harnessRuntime: FakeHarnessRuntime;
  snapshotStore: FakeSnapshotStore;
}

export function makeControllerOptions(
  overrides: {
    snapshot?: OfficialCatalogSnapshot | null;
    bridge?: FakeBridgeOptions;
    freeBytes?: number;
    harnessRuntime?: FakeHarnessRuntimeOptions;
    hardware?: Partial<HardwareEvidence>;
  } = {},
): ControllerHarness {
  const bridge = new FakeBridge(overrides.bridge ?? {});
  const catalogCache = new MemoryCatalogCache(overrides.snapshot ?? null);
  const pullStore = new MemoryPullQueueStore();
  const chatStore = new MemoryChatHistoryStore();
  const harnessRuntime = new FakeHarnessRuntime(overrides.harnessRuntime ?? {});
  const snapshotStore = new FakeSnapshotStore();
  return {
    bridge,
    catalogCache,
    pullStore,
    chatStore,
    harnessRuntime,
    snapshotStore,
    options: {
      catalogCache,
      bridge,
      hardware: new FakeHardware(overrides.hardware ?? {}),
      pullStore,
      storage: new FixedStorage(overrides.freeBytes ?? 500 * 1024 ** 3),
      chatStore,
      harnesses: new AllowlistedHarnessManager(harnessRuntime, snapshotStore),
      folderPicker: new FakeFolderPicker("/projects/example"),
    },
  };
}

/** Builds a `fetch` double that answers only from a fixed page table. */
export function makePageFetcher(pages: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const html = pages[url];
    if (html === undefined) throw new Error(`The test page table has no entry for ${url}.`);
    const response = new Response(html, { status: 200, headers: { "content-type": "text/html", etag: `"${url}"` } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  }) as unknown as typeof fetch;
}

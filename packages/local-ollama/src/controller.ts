import {
  analyzeSearchPattern,
  compileSearchPattern,
  createSearchState,
  describeSearch,
  insertToken,
  matchesSearch,
  type BuilderToken,
  type SearchState,
} from "@material-cookie-clicker/surface-kernel";

import {
  filterCatalogVariants,
  refreshOfficialCatalog,
  type CatalogRefreshOptions,
  type OfficialCatalogCache,
  type OfficialCatalogSnapshot,
  type OfficialCatalogVariant,
} from "./catalog.ts";
import { DEFAULT_CHAT_LIMITS, LocalChatManager, type ChatHistoryStore, type ChatStreamChunk } from "./chat.ts";
import { assessHardwareFit, type HardwareEvidence, type ModelFitEvidence } from "./hardware-fit.ts";
import {
  AllowlistedHarnessManager,
  PREBUILT_HARNESS_PROFILES,
  type HarnessLaunchSelection,
  type HarnessSnapshot,
} from "./harness.ts";
import {
  PersistentPullQueue,
  requiredFreeBytesFor,
  type PullGateway,
  type PullQueueItem,
  type PullQueueStore,
  type StoragePreflight,
} from "./pull-queue.ts";
import {
  CART_DISCLOSURE,
  RUNTIME_HEALTH_VALUES,
  type CatalogFacetValues,
  type ChatTranscriptEntry,
  type GuidedRecovery,
  type HarnessSnapshotSummary,
  type LocalOllamaSuiteActions,
  type LocalOllamaSuiteState,
  type LocalOllamaTab,
  type LocalRuntimeModel,
  type PreviewHarnessInput,
  type RuntimeHealth,
  type SearchScope,
  type SearchStatus,
  type SendChatInput,
  type TroubleshooterBranch,
} from "./view-model.ts";

export interface RuntimeProbe {
  health: RuntimeHealth;
  version: string | null;
  message: string;
  nextAction: string;
  /** Named local API checks that failed; empty when none did. */
  failingChecks: string[];
}

export interface LocalOllamaBridge extends PullGateway {
  probe(): Promise<RuntimeProbe>;
  installedModels(): Promise<LocalRuntimeModel[]>;
  runningModels(): Promise<LocalRuntimeModel[]>;
  copyModel(source: string, destination: string): Promise<void>;
  deleteModel(reference: string): Promise<void>;
  chatStream(
    request: {
      model: string;
      messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; images?: string[] }>;
      options: Record<string, string | number | boolean>;
    },
    signal: AbortSignal,
  ): AsyncIterable<ChatStreamChunk>;
}

export interface HardwareEvidenceSource {
  collect(): Promise<HardwareEvidence>;
  modelEvidence(reference: string): Promise<ModelFitEvidence>;
}

export interface FolderPicker {
  chooseFolder(): Promise<string | null>;
}

export interface ObservablePullQueueStore extends PullQueueStore {
  subscribe?(listener: () => void): () => void;
}

export interface LocalOllamaSuiteControllerOptions {
  catalogCache: OfficialCatalogCache;
  catalogRefresh?: CatalogRefreshOptions;
  bridge: LocalOllamaBridge;
  hardware: HardwareEvidenceSource;
  pullStore: ObservablePullQueueStore;
  storage: StoragePreflight;
  chatStore: ChatHistoryStore;
  harnesses: AllowlistedHarnessManager;
  folderPicker: FolderPicker;
  now?: () => Date;
  /** How many stored harness snapshots the restore list holds. */
  snapshotListLimit?: number;
}

const RECHECK_LABEL = "Recheck local runtime";

const EMPTY_SEARCH_STATUS: SearchStatus = {
  description: "No search term entered.",
  error: null,
  sampleFeedback: "Enter a pattern to inspect it.",
  sampleMatches: [],
  totalCount: 0,
  visibleCount: 0,
};

const emptyFacets = (): CatalogFacetValues => ({ families: [], capabilities: [], quantizations: [] });

/**
 * One branch per runtime condition. Every next step can be followed with no
 * network access at all, and no branch carries a link to online documentation.
 */
const TROUBLESHOOTER_TEXT: Record<RuntimeHealth, { title: string; summary: string; offlineNextStep: string }> = {
  missing: {
    title: "Ollama is not installed",
    summary: "The local API is unreachable and the privileged installation probe found no installation on this computer.",
    offlineNextStep:
      "Install Ollama from the installation media already obtained for this computer, start it, then select Recheck local runtime. The suite talks only to the loopback address 127.0.0.1:11434 and never falls back to a hosted service.",
  },
  stopped: {
    title: "Ollama is installed but not running",
    summary: "The installation probe found Ollama on this computer, but its local API is not answering.",
    offlineNextStep:
      "Start the installed local Ollama service from the operating system's own service or application list, then select Recheck local runtime.",
  },
  "missing-or-stopped": {
    title: "The local API is unreachable",
    summary:
      "Every documented health check was unreachable. Without a privileged installation probe the HTTP interface alone cannot tell an absent installation from a stopped service, so the suite does not guess.",
    offlineNextStep:
      "Confirm on this computer whether Ollama is installed, then install it or start it and select Recheck local runtime.",
  },
  unhealthy: {
    title: "The local API answered with a failure",
    summary:
      "The local API is reachable but at least one documented check failed. The failing check names are listed with this branch.",
    offlineNextStep:
      "Read the failing check names, correct the reported local API failure on this computer, then select Recheck local runtime.",
  },
  healthy: {
    title: "The local API is healthy",
    summary: "The version, installed-model and running-model checks all succeeded.",
    offlineNextStep:
      "No recovery step is needed. Select Recheck local runtime after changing the local installation or restarting the service.",
  },
};

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function installedHaystack(model: LocalRuntimeModel): string {
  return [model.reference, model.parameterSize, model.quantization, ...model.capabilities]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function queueHaystack(item: PullQueueItem): string {
  return [item.reference, item.state, item.status, item.error]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function transcriptHaystack(entry: ChatTranscriptEntry): string {
  return [entry.role, entry.content, ...entry.attachmentNames].join(" ");
}

function initialState(): LocalOllamaSuiteState {
  return {
    activeTab: "store",
    busy: false,
    runtime: {
      health: "missing",
      version: null,
      message: "The local runtime has not been checked.",
      nextAction: `Select ${RECHECK_LABEL}.`,
      failingChecks: [],
      checkedAt: null,
    },
    catalog: {
      snapshot: null,
      variants: [],
      visibleVariants: [],
      search: createSearchState(),
      searchStatus: { ...EMPTY_SEARCH_STATUS },
      facets: emptyFacets(),
      selectedFacets: emptyFacets(),
      refreshState: "idle",
      refreshMessage: null,
    },
    installed: [],
    visibleInstalled: [],
    installedSearch: createSearchState(),
    installedSearchStatus: { ...EMPTY_SEARCH_STATUS },
    running: [],
    fitByReference: {},
    queue: [],
    visibleQueue: [],
    queueSearch: createSearchState(),
    queueSearchStatus: { ...EMPTY_SEARCH_STATUS },
    cart: {
      references: [],
      totalBytes: null,
      requiredFreeBytes: null,
      freeBytes: null,
      blockers: [],
      disclosure: CART_DISCLOSURE,
    },
    chat: {
      sessionId: null,
      model: "",
      selectableModels: [],
      modelRecovery: null,
      systemPrompt: "",
      transcript: [],
      visibleTranscript: [],
      historySearch: createSearchState(),
      historySearchStatus: { ...EMPTY_SEARCH_STATUS },
      streamingText: "",
      sending: false,
      error: null,
      attachmentsSupported: false,
      attachmentSupportReason: "Choose an installed model to see whether it accepts images.",
      attachmentError: null,
      maxAttachmentBytes: DEFAULT_CHAT_LIMITS.maxAttachmentBytes,
    },
    harness: {
      profiles: [...PREBUILT_HARNESS_PROFILES],
      visibleProfiles: [...PREBUILT_HARNESS_PROFILES],
      profileSearch: createSearchState(),
      profileSearchStatus: { ...EMPTY_SEARCH_STATUS },
      selectedProfileId: PREBUILT_HARNESS_PROFILES[0]?.id ?? null,
      executables: [],
      executablesState: "unchecked",
      executableRecovery: null,
      selectedExecutableId: null,
      selectableModels: [],
      modelRecovery: null,
      selectedModel: null,
      workingDirectory: "",
      preview: null,
      status: null,
      snapshots: [],
      visibleSnapshots: [],
      snapshotSearch: createSearchState(),
      snapshotSearchStatus: { ...EMPTY_SEARCH_STATUS },
      restoreStatus: null,
    },
    troubleshooter: {
      activeHealth: "missing",
      branches: [],
    },
  };
}

/**
 * Holds the suite's state and performs every action against injected ports.
 * It renders nothing: hosts subscribe and draw the state inside their own
 * shell, so the site and the desktop application share behaviour without
 * sharing a widget toolkit.
 */
export class LocalOllamaSuiteController implements LocalOllamaSuiteActions {
  readonly #options: LocalOllamaSuiteControllerOptions;
  readonly #queue: PersistentPullQueue;
  readonly #chat: LocalChatManager;
  readonly #listeners = new Set<(state: LocalOllamaSuiteState) => void>();
  readonly #now: () => Date;
  readonly #snapshotLimit: number;
  /** Full snapshot records stay here; hosts only ever receive identifiers. */
  #snapshotRecords: HarnessSnapshot[] = [];
  #state = initialState();
  #unsubscribeQueue: (() => void) | null = null;
  #pendingHarnessSelection: HarnessLaunchSelection | null = null;
  #chatSessionModel: string | null = null;

  constructor(options: LocalOllamaSuiteControllerOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
    this.#snapshotLimit = Math.max(1, Math.min(options.snapshotListLimit ?? 50, 200));
    this.#queue = new PersistentPullQueue(options.pullStore, options.bridge, options.storage);
    this.#chat = new LocalChatManager(options.chatStore, options.bridge);
    this.#unsubscribeQueue = options.pullStore.subscribe?.(() => void this.#loadQueuePage()) ?? null;
    this.#recompute();
  }

  dispose(): void {
    this.#unsubscribeQueue?.();
    this.#unsubscribeQueue = null;
    this.#listeners.clear();
  }

  snapshot(): LocalOllamaSuiteState {
    return structuredClone(this.#state);
  }

  subscribe(listener: (state: LocalOllamaSuiteState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    const cached = await this.#options.catalogCache.read();
    if (cached) {
      const refreshedAt = Date.parse(cached.refreshedAt);
      const stale = !Number.isFinite(refreshedAt) || this.#now().getTime() - refreshedAt > cached.staleAfterMs;
      this.#applyCatalog(
        { ...cached, stale },
        stale ? "stale-cache" : "idle",
        stale ? "The verified official catalog cache is stale." : null,
      );
    }
    await this.#queue.reconcile();
    await Promise.all([this.refreshRuntime(), this.#loadQueuePage(), this.refreshHarnessSnapshots()]);
  }

  selectTab(tab: LocalOllamaTab): void {
    this.#state.activeTab = tab;
    this.#emit();
  }

  async refreshRuntime(): Promise<void> {
    this.#state.busy = true;
    this.#emit();
    try {
      const probe = await this.#options.bridge.probe();
      this.#state.runtime = { ...probe, checkedAt: this.#now().toISOString() };
      if (probe.health === "healthy") {
        const [installed, running] = await Promise.all([
          this.#options.bridge.installedModels(),
          this.#options.bridge.runningModels(),
        ]);
        this.#state.installed = installed;
        this.#state.running = running;
        if (!this.#state.chat.model && installed[0]) this.#state.chat.model = installed[0].reference;
        if (!this.#state.harness.selectedModel && installed[0]) {
          this.#state.harness.selectedModel = installed[0].reference;
        }
        await this.#refreshFitEvidence();
      } else {
        this.#state.installed = [];
        this.#state.running = [];
      }
    } catch (error) {
      this.#state.runtime = {
        health: "unhealthy",
        version: null,
        message: error instanceof Error ? error.message : String(error),
        nextAction: "Confirm the local Ollama service is running, then recheck. No cloud fallback is used.",
        failingChecks: [],
        checkedAt: this.#now().toISOString(),
      };
    } finally {
      this.#state.busy = false;
      this.#emit();
    }
  }

  async refreshCatalog(): Promise<void> {
    this.#state.catalog.refreshState = "refreshing";
    this.#state.catalog.refreshMessage = "Refreshing every official model and tag page.";
    this.#emit();
    const result = await refreshOfficialCatalog(this.#options.catalogCache, this.#options.catalogRefresh);
    if (result.snapshot) this.#applyCatalog(result.snapshot, result.state, result.reason);
    else {
      this.#state.catalog.refreshState = result.state;
      this.#state.catalog.refreshMessage = result.reason;
      this.#emit();
    }
  }

  setSearch(scope: SearchScope, patch: Partial<SearchState>): void {
    this.#writeSearch(scope, { ...this.#readSearch(scope), ...patch });
    this.#emit();
  }

  insertSearchToken(scope: SearchScope, token: BuilderToken): void {
    this.#writeSearch(scope, insertToken(this.#readSearch(scope), token));
    this.#emit();
  }

  setCatalogFacets(selection: Partial<CatalogFacetValues>): void {
    const available = this.#state.catalog.facets;
    const current = this.#state.catalog.selectedFacets;
    const keep = (chosen: string[] | undefined, allowed: string[], existing: string[]): string[] =>
      chosen === undefined ? existing : chosen.filter((value) => allowed.includes(value));
    this.#state.catalog.selectedFacets = {
      families: keep(selection.families, available.families, current.families),
      capabilities: keep(selection.capabilities, available.capabilities, current.capabilities),
      quantizations: keep(selection.quantizations, available.quantizations, current.quantizations),
    };
    this.#emit();
  }

  async enqueuePull(reference: string): Promise<void> {
    const variant = this.#requireVariant(reference);
    if (variant.sizeBytes === null) {
      throw new Error("The official source did not report a size, so storage preflight cannot approve this pull.");
    }
    await this.#queue.enqueue(reference, variant.sizeBytes);
    await this.#loadQueuePage();
    void this.#queue.run().finally(() => void this.#loadQueuePage());
  }

  async addToCart(reference: string): Promise<void> {
    this.#requireVariant(reference);
    if (!this.#state.cart.references.includes(reference)) {
      this.#state.cart.references = [...this.#state.cart.references, reference].sort((left, right) =>
        left.localeCompare(right),
      );
    }
    await this.#recomputeCart();
  }

  async removeFromCart(reference: string): Promise<void> {
    this.#state.cart.references = this.#state.cart.references.filter((candidate) => candidate !== reference);
    await this.#recomputeCart();
  }

  async clearCart(): Promise<void> {
    this.#state.cart.references = [];
    await this.#recomputeCart();
  }

  /**
   * Enqueues the reviewed batch in one pass. Storage preflight runs again
   * first; when it reports a blocker nothing at all is enqueued and the blocker
   * naming the exact byte shortfall stays on the cart.
   */
  async commitCart(): Promise<void> {
    await this.#recomputeCart();
    if (this.#state.cart.references.length === 0) return;
    if (this.#state.cart.blockers.length > 0) return;
    const entries = this.#state.cart.references.map((reference) => ({
      reference,
      expectedSizeBytes: this.#requireVariant(reference).sizeBytes,
    }));
    await this.#queue.enqueueBatch(entries);
    this.#state.cart.references = [];
    await this.#recomputeCart();
    await this.#loadQueuePage();
    void this.#queue.run().finally(() => void this.#loadQueuePage());
  }

  pauseQueue(): void {
    this.#queue.pause();
  }

  async resumeQueue(): Promise<void> {
    await this.#queue.resume();
    await this.#loadQueuePage();
    void this.#queue.run().finally(() => void this.#loadQueuePage());
  }

  async cancelPull(id: string): Promise<void> {
    await this.#queue.cancel(id);
    await this.#loadQueuePage();
  }

  async retryPull(id: string): Promise<void> {
    await this.#queue.retry(id);
    await this.#loadQueuePage();
    void this.#queue.run().finally(() => void this.#loadQueuePage());
  }

  async copyModel(source: string, destination: string): Promise<void> {
    const normalized = destination.trim();
    if (!normalized) throw new Error("Enter a destination model name.");
    await this.#options.bridge.copyModel(source, normalized);
    await this.refreshRuntime();
  }

  async deleteModel(reference: string): Promise<void> {
    await this.#options.bridge.deleteModel(reference);
    await this.refreshRuntime();
  }

  selectChatModel(reference: string): void {
    if (!this.#state.installed.some((model) => model.reference === reference)) {
      throw new Error("Choose one of the installed local models.");
    }
    if (this.#state.chat.model !== reference) {
      this.#state.chat.model = reference;
      this.#state.chat.attachmentError = null;
    }
    this.#emit();
  }

  async sendChat(input: SendChatInput): Promise<void> {
    const installed = this.#state.installed.find((candidate) => candidate.reference === input.model);
    if (!installed) throw new Error("Choose an installed local model.");
    this.#state.chat.sending = true;
    this.#state.chat.error = null;
    this.#state.chat.attachmentError = null;
    this.#state.chat.streamingText = "";
    this.#state.chat.model = input.model;
    this.#state.chat.systemPrompt = input.systemPrompt;
    this.#emit();
    try {
      if (this.#state.chat.sessionId && this.#chatSessionModel !== input.model) {
        // The capability gate is recorded on the session, so a different model
        // needs a new session rather than an inherited capability list.
        this.#state.chat.sessionId = null;
        this.#state.chat.transcript = [];
      }
      if (!this.#state.chat.sessionId) {
        const session = await this.#chat.createSession({
          title: "Local model chat",
          model: input.model,
          systemPrompt: input.systemPrompt,
          capabilities: installed.capabilities,
        });
        this.#state.chat.sessionId = session.id;
        this.#chatSessionModel = input.model;
      }
      const sessionId = this.#state.chat.sessionId;
      if (!sessionId) throw new Error("The local chat session could not be created.");
      for await (const chunk of this.#chat.send(sessionId, {
        content: input.content,
        attachments: input.attachments,
        containsTaxData: input.containsTaxData,
        ...(input.containsTaxData && input.reviewedTaxData ? { reviewedTaxDataAt: this.#now().toISOString() } : {}),
      })) {
        this.#state.chat.streamingText += chunk.content;
        this.#emit();
      }
      this.#state.chat.transcript.push(
        { role: "user", content: input.content, attachmentNames: input.attachments.map((item) => item.name) },
        { role: "assistant", content: this.#state.chat.streamingText, attachmentNames: [] },
      );
      this.#state.chat.streamingText = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#state.chat.error = message;
      if (input.attachments.length > 0) this.#state.chat.attachmentError = message;
    } finally {
      this.#state.chat.sending = false;
      this.#emit();
    }
  }

  stopChat(): void {
    if (this.#state.chat.sessionId) this.#chat.stop(this.#state.chat.sessionId);
  }

  selectHarnessProfile(profileId: string): void {
    if (!this.#state.harness.profiles.some((profile) => profile.id === profileId)) return;
    this.#state.harness.selectedProfileId = profileId;
    this.#state.harness.preview = null;
    this.#state.harness.status = null;
    this.#emit();
  }

  /**
   * Asks the privileged runtime which allowed executables exist on this
   * computer. An empty result becomes an explicit state with a named next
   * action, never a blank field a person is expected to fill in by hand.
   */
  async refreshHarnessExecutables(): Promise<void> {
    this.#state.harness.executablesState = "checking";
    this.#emit();
    try {
      const executables = await this.#options.harnesses.listExecutables();
      this.#state.harness.executables = executables;
      this.#state.harness.executablesState = executables.length > 0 ? "detected" : "none-detected";
      if (!executables.some((candidate) => candidate.id === this.#state.harness.selectedExecutableId)) {
        this.#state.harness.selectedExecutableId = executables[0]?.id ?? null;
      }
    } catch (error) {
      this.#state.harness.executables = [];
      this.#state.harness.executablesState = "none-detected";
      this.#state.harness.selectedExecutableId = null;
      this.#state.harness.status = error instanceof Error ? error.message : String(error);
    }
    this.#emit();
  }

  selectHarnessExecutable(executableId: string): void {
    if (!this.#state.harness.executables.some((candidate) => candidate.id === executableId)) {
      throw new Error("Choose one of the executables detected on this computer.");
    }
    this.#state.harness.selectedExecutableId = executableId;
    this.#state.harness.preview = null;
    this.#emit();
  }

  selectHarnessModel(reference: string): void {
    if (!this.#state.installed.some((model) => model.reference === reference)) {
      throw new Error("Choose one of the installed local models.");
    }
    this.#state.harness.selectedModel = reference;
    this.#state.harness.preview = null;
    this.#emit();
  }

  async chooseWorkingDirectory(): Promise<string | null> {
    const selected = await this.#options.folderPicker.chooseFolder();
    if (selected) {
      this.#state.harness.workingDirectory = selected;
      this.#state.harness.preview = null;
      this.#emit();
    }
    return selected;
  }

  async previewHarness(input: PreviewHarnessInput): Promise<void> {
    if (!this.#state.harness.executables.some((candidate) => candidate.id === input.executableId)) {
      throw new Error("Choose one of the executables detected on this computer.");
    }
    if (!this.#state.installed.some((model) => model.reference === input.model)) {
      throw new Error("Choose one of the installed local models.");
    }
    const selection: HarnessLaunchSelection = {
      profileId: input.profileId,
      executableId: input.executableId,
      workingDirectory: input.workingDirectory,
      model: input.model,
      environment: { OLLAMA_HOST: "http://127.0.0.1:11434", OLLAMA_MODEL: input.model },
    };
    this.#pendingHarnessSelection = selection;
    this.#state.harness.selectedExecutableId = input.executableId;
    this.#state.harness.selectedModel = input.model;
    this.#state.harness.workingDirectory = input.workingDirectory;
    this.#state.harness.preview = await this.#options.harnesses.preview(selection);
    this.#state.harness.status = this.#state.harness.preview.blockers.length
      ? "Resolve every listed blocker before launch."
      : "Preview ready. Launch will create a snapshot and roll back automatically if readiness fails.";
    this.#emit();
  }

  async launchHarness(): Promise<void> {
    if (!this.#pendingHarnessSelection || !this.#state.harness.preview) throw new Error("Review the harness launch first.");
    this.#state.harness.status = "Launching the reviewed allowlisted harness.";
    this.#emit();
    try {
      const result = await this.#options.harnesses.launch(this.#pendingHarnessSelection);
      this.#state.harness.status = `Harness process ${result.processId} is ready. Snapshot ${result.snapshotId} is available for restore.`;
    } catch (error) {
      this.#state.harness.status = error instanceof Error ? error.message : String(error);
    }
    await this.refreshHarnessSnapshots();
  }

  async refreshHarnessSnapshots(): Promise<void> {
    try {
      this.#snapshotRecords = await this.#options.harnesses.listSnapshots(null, this.#snapshotLimit);
    } catch (error) {
      this.#snapshotRecords = [];
      this.#state.harness.restoreStatus = error instanceof Error ? error.message : String(error);
    }
    this.#state.harness.snapshots = this.#snapshotRecords.map(
      (record): HarnessSnapshotSummary => ({ id: record.id, profileId: record.profileId, createdAt: record.createdAt }),
    );
    this.#emit();
  }

  /**
   * Restores one stored snapshot in a single step. The identifier is resolved
   * against the list this controller loaded; a caller-supplied payload is never
   * accepted.
   */
  async restoreHarnessSnapshot(snapshotId: string): Promise<void> {
    const record = this.#snapshotRecords.find((candidate) => candidate.id === snapshotId);
    if (!record) throw new Error("Choose one of the listed harness snapshots.");
    this.#state.harness.restoreStatus = `Restoring harness snapshot ${record.id}.`;
    this.#emit();
    try {
      await this.#options.harnesses.restore(record);
      this.#state.harness.restoreStatus = `Harness snapshot ${record.id} was restored.`;
    } catch (error) {
      this.#state.harness.restoreStatus = `Restoring harness snapshot ${record.id} failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
    this.#emit();
  }

  #requireVariant(reference: string): OfficialCatalogVariant {
    const variant = this.#state.catalog.variants.find((candidate) => candidate.reference === reference);
    if (!variant) throw new Error("Choose a variant from the verified official catalog.");
    return variant;
  }

  #readSearch(scope: SearchScope): SearchState {
    switch (scope) {
      case "catalog":
        return this.#state.catalog.search;
      case "installed":
        return this.#state.installedSearch;
      case "queue":
        return this.#state.queueSearch;
      case "chat-history":
        return this.#state.chat.historySearch;
      case "harness-profiles":
        return this.#state.harness.profileSearch;
      case "harness-snapshots":
        return this.#state.harness.snapshotSearch;
    }
  }

  #writeSearch(scope: SearchScope, next: SearchState): void {
    switch (scope) {
      case "catalog":
        this.#state.catalog.search = next;
        return;
      case "installed":
        this.#state.installedSearch = next;
        return;
      case "queue":
        this.#state.queueSearch = next;
        return;
      case "chat-history":
        this.#state.chat.historySearch = next;
        return;
      case "harness-profiles":
        this.#state.harness.profileSearch = next;
        return;
      case "harness-snapshots":
        this.#state.harness.snapshotSearch = next;
        return;
    }
  }

  #applyCatalog(
    snapshot: OfficialCatalogSnapshot,
    refreshState: LocalOllamaSuiteState["catalog"]["refreshState"],
    message: string | null,
  ): void {
    this.#state.catalog.snapshot = snapshot;
    this.#state.catalog.variants = [...snapshot.variants];
    this.#state.catalog.refreshState = refreshState;
    this.#state.catalog.refreshMessage = message;
    this.#emit();
    void this.#refreshFitEvidence();
  }

  async #refreshFitEvidence(): Promise<void> {
    const snapshot = this.#state.catalog.snapshot;
    if (!snapshot) return;
    const hardware = await this.#options.hardware.collect();
    const references = new Set([
      ...this.#state.catalog.visibleVariants.map((variant) => variant.reference),
      ...this.#state.installed.map((model) => model.reference),
    ]);
    const fits: Record<string, ReturnType<typeof assessHardwareFit>> = {};
    for (const reference of references) {
      const catalog = snapshot.variants.find((variant) => variant.reference === reference);
      const evidence = await this.#options.hardware.modelEvidence(reference);
      fits[reference] = assessHardwareFit(
        hardware,
        { ...evidence, reference, blobSizeBytes: evidence.blobSizeBytes ?? catalog?.sizeBytes ?? null },
        this.#now(),
      );
    }
    this.#state.fitByReference = fits;
    this.#emit();
  }

  async #loadQueuePage(): Promise<void> {
    this.#state.queue = await this.#options.pullStore.readBatch(
      ["queued", "preflighting", "pulling", "paused", "failed", "cancelled", "completed", "skipped"],
      null,
      100,
    );
    this.#emit();
  }

  /** Recomputes the batch total, the headroom requirement and the blockers. */
  async #recomputeCart(): Promise<void> {
    const cart = this.#state.cart;
    const blockers: string[] = [];
    let total = 0;
    let sizesKnown = true;
    for (const reference of cart.references) {
      const variant = this.#state.catalog.variants.find((candidate) => candidate.reference === reference);
      if (!variant) {
        blockers.push(`${reference} is no longer in the verified official catalog. Remove it from the cart.`);
        sizesKnown = false;
        continue;
      }
      if (variant.sizeBytes === null) {
        blockers.push(
          `The official source did not report a size for ${reference}, so storage cannot be checked before download.`,
        );
        sizesKnown = false;
        continue;
      }
      total += variant.sizeBytes;
    }
    cart.totalBytes = cart.references.length > 0 && sizesKnown ? total : null;
    cart.requiredFreeBytes = cart.totalBytes === null ? null : requiredFreeBytesFor(cart.totalBytes);

    if (cart.references.length === 0) {
      cart.freeBytes = null;
      cart.blockers = [];
      this.#emit();
      return;
    }

    try {
      cart.freeBytes = await this.#options.storage.destinationFreeBytes();
    } catch (error) {
      cart.freeBytes = null;
      blockers.push(
        `Free destination storage could not be measured: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
    if (cart.requiredFreeBytes !== null && cart.freeBytes !== null && cart.freeBytes < cart.requiredFreeBytes) {
      blockers.push(
        `Insufficient destination storage: ${cart.freeBytes} bytes free; ${cart.requiredFreeBytes} bytes required; short by ${
          cart.requiredFreeBytes - cart.freeBytes
        } bytes.`,
      );
    }
    cart.blockers = blockers;
    this.#emit();
  }

  #searchStatus(search: SearchState, totalCount: number, visibleCount: number): SearchStatus {
    let error: string | null = null;
    if (search.regex && search.pattern) {
      const compiled = compileSearchPattern(search, "filter");
      if ("error" in compiled) error = compiled.error;
    }
    const analysis = analyzeSearchPattern(search);
    return {
      description: describeSearch(search),
      error,
      sampleFeedback: analysis.feedback,
      sampleMatches: analysis.matches,
      totalCount,
      visibleCount,
    };
  }

  #troubleshooterBranches(): TroubleshooterBranch[] {
    return RUNTIME_HEALTH_VALUES.map((health) => {
      const text = TROUBLESHOOTER_TEXT[health];
      const active = this.#state.runtime.health === health;
      return {
        health,
        active,
        title: text.title,
        summary: text.summary,
        failingChecks: active ? [...this.#state.runtime.failingChecks] : [],
        offlineNextStep: text.offlineNextStep,
        recheckLabel: RECHECK_LABEL,
      };
    });
  }

  #modelRecovery(): GuidedRecovery {
    return this.#state.runtime.health === "healthy"
      ? {
          message: "No local model is installed yet, so there is nothing to choose. Add one from the model store first.",
          actionLabel: "Open the model store",
          actionId: "open-model-store",
        }
      : {
          message: "Installed models cannot be listed while the local runtime is unavailable.",
          actionLabel: RECHECK_LABEL,
          actionId: "refresh-runtime",
        };
  }

  #executableRecovery(): GuidedRecovery | null {
    switch (this.#state.harness.executablesState) {
      case "unchecked":
        return {
          message: "Allowed harness executables have not been looked for on this computer yet.",
          actionLabel: "Detect allowed executables",
          actionId: "refresh-harness-executables",
        };
      case "none-detected":
        return {
          message:
            "No allowed executable was detected on this computer. Install one of the allowlisted programs, then detect again. A program path cannot be typed in.",
          actionLabel: "Detect allowed executables again",
          actionId: "refresh-harness-executables",
        };
      case "checking":
      case "detected":
        return null;
    }
  }

  /** Rebuilds every derived field. Runs before each notification. */
  #recompute(): void {
    const state = this.#state;

    const variants = state.catalog.variants;
    state.catalog.facets = {
      families: unique(variants.map((variant) => variant.model)),
      capabilities: unique(variants.flatMap((variant) => variant.capabilities)),
      quantizations: unique(variants.map((variant) => variant.quantization)),
    };
    const selected = state.catalog.selectedFacets;
    state.catalog.visibleVariants = filterCatalogVariants(variants, {
      search: state.catalog.search,
      ...(selected.families.length > 0 ? { families: new Set(selected.families) } : {}),
      ...(selected.capabilities.length > 0 ? { capabilities: new Set(selected.capabilities) } : {}),
      ...(selected.quantizations.length > 0 ? { quantizations: new Set(selected.quantizations) } : {}),
    }).slice(0, 200);
    state.catalog.searchStatus = this.#searchStatus(
      state.catalog.search,
      variants.length,
      state.catalog.visibleVariants.length,
    );

    state.visibleInstalled = state.installed.filter((model) =>
      matchesSearch(installedHaystack(model), state.installedSearch),
    );
    state.installedSearchStatus = this.#searchStatus(
      state.installedSearch,
      state.installed.length,
      state.visibleInstalled.length,
    );

    state.visibleQueue = state.queue.filter((item) => matchesSearch(queueHaystack(item), state.queueSearch));
    state.queueSearchStatus = this.#searchStatus(state.queueSearch, state.queue.length, state.visibleQueue.length);

    state.chat.selectableModels = [...state.installed];
    state.chat.modelRecovery = state.installed.length === 0 ? this.#modelRecovery() : null;
    state.chat.visibleTranscript = state.chat.transcript.filter((entry) =>
      matchesSearch(transcriptHaystack(entry), state.chat.historySearch),
    );
    state.chat.historySearchStatus = this.#searchStatus(
      state.chat.historySearch,
      state.chat.transcript.length,
      state.chat.visibleTranscript.length,
    );
    const chatModel = state.installed.find((model) => model.reference === state.chat.model);
    state.chat.attachmentsSupported = chatModel?.capabilities.includes("vision") ?? false;
    state.chat.attachmentSupportReason = chatModel
      ? chatModel.capabilities.includes("vision")
        ? `${chatModel.reference} reports the image capability, so images may be attached to a message sent to it on this computer.`
        : `${chatModel.reference} does not report the image capability, so attachments are unavailable for it. Choose an installed model that reports images.`
      : "Choose an installed model to see whether it accepts images.";

    state.harness.visibleProfiles = state.harness.profiles.filter((profile) =>
      matchesSearch([profile.id, profile.name, profile.description].join(" "), state.harness.profileSearch),
    );
    state.harness.profileSearchStatus = this.#searchStatus(
      state.harness.profileSearch,
      state.harness.profiles.length,
      state.harness.visibleProfiles.length,
    );
    state.harness.visibleSnapshots = state.harness.snapshots.filter((entry) =>
      matchesSearch([entry.id, entry.profileId, entry.createdAt].join(" "), state.harness.snapshotSearch),
    );
    state.harness.snapshotSearchStatus = this.#searchStatus(
      state.harness.snapshotSearch,
      state.harness.snapshots.length,
      state.harness.visibleSnapshots.length,
    );
    state.harness.selectableModels = [...state.installed];
    state.harness.modelRecovery = state.installed.length === 0 ? this.#modelRecovery() : null;
    state.harness.executableRecovery = this.#executableRecovery();

    state.troubleshooter = {
      activeHealth: state.runtime.health,
      branches: this.#troubleshooterBranches(),
    };
  }

  #emit(): void {
    this.#recompute();
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}

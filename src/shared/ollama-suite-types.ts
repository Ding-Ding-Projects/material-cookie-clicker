export interface OllamaSearchState {
  query: string;
  regex: boolean;
  pattern: string;
  flags: string;
  sample: string;
  builderOpen: boolean;
}

export type OllamaSearchScope =
  | 'catalog'
  | 'installed'
  | 'queue'
  | 'chat-history'
  | 'harness-profiles'
  | 'harness-snapshots';

export type OllamaSuiteTab = 'store' | 'queue' | 'chat' | 'harness' | 'troubleshooter';

export interface OllamaTabDescriptor {
  id: OllamaSuiteTab;
  label: string;
  description: string;
}

export const OLLAMA_SUITE_TABS: readonly OllamaTabDescriptor[] = [
  { id: 'store', label: 'Model store', description: 'Browse the verified official catalog and installed local models.' },
  { id: 'queue', label: 'Pull queue', description: 'Watch, pause, retry and cancel local model downloads.' },
  { id: 'chat', label: 'Local chat', description: 'Send a message to an installed local model.' },
  { id: 'harness', label: 'Harnesses', description: 'Review, launch and restore allowlisted local harness profiles.' },
  { id: 'troubleshooter', label: 'Troubleshooter', description: 'Inspect local runtime conditions and offline recovery.' },
] as const;

export interface OllamaRuntimeModel {
  reference: string;
  sizeBytes: number | null;
  digest: string | null;
  parameterSize: string | null;
  quantization: string | null;
  capabilities: string[];
}

export interface OllamaCatalogVariant {
  model: string;
  tag: string;
  reference: string;
  displayLabel: string;
  sizeBytes: number | null;
  parameterSize: string | null;
  quantization: string | null;
  capabilities: string[];
  officialUrl: string;
}

export interface OllamaCatalogSnapshot {
  schemaVersion: 1;
  source: 'ollama-official-library';
  sourceUrl: string;
  sourceIdentity: string;
  refreshedAt: string;
  modelPageCount: number;
  tagPageCount: number;
  modelCount: number;
  variantCount: number;
  complete: boolean;
  stale: boolean;
  staleAfterMs: number;
  variants: OllamaCatalogVariant[];
  warnings: string[];
}

export interface OllamaHardwareFitAssessment {
  verdict: 'Runs well' | 'Runs with limits' | 'Unlikely' | 'Unknown';
  assessedAt: string;
  reference: string;
  evidence: {
    collectedAt: string;
    architecture: string | null;
    systemRamBytes: number | null;
    availableRamBytes: number | null;
    gpuModel: string | null;
    usableVramBytes: number | null;
    driverBackend: string | null;
    driverSupported: boolean | null;
    destinationFreeBytes: number | null;
    blobSizeBytes: number | null;
    parameterCount: number | null;
    quantization: string | null;
    contextLength: number | null;
    contextBytesPerToken: number | null;
  };
  assumptions: string[];
  reasons: string[];
  estimatedRamBytes: number | null;
  estimatedAdditionalDiskBytes: number | null;
}

export interface OllamaPullQueueItem {
  id: string;
  reference: string;
  expectedSizeBytes: number | null;
  requiredFreeBytes: number | null;
  state: 'queued' | 'preflighting' | 'pulling' | 'paused' | 'completed' | 'skipped' | 'cancelled' | 'failed';
  status: string;
  completedBytes: number;
  totalBytes: number | null;
  attempt: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OllamaGuidedRecovery {
  message: string;
  actionLabel: string;
  actionId: 'refresh-runtime' | 'refresh-catalog' | 'refresh-harness-executables' | 'open-model-store';
}

export interface OllamaHarnessProfile {
  id: string;
  name: string;
  description: string;
  allowedExecutableIds: string[];
  argumentTemplate: string[];
  allowedEnvironmentKeys: string[];
  requiredPorts: number[];
  requiredFiles: string[];
  healthTimeoutMs: number;
}

export interface OllamaResolvedExecutable {
  id: string;
  displayName: string;
  absolutePath: string;
}

export interface OllamaHarnessPreview {
  profile: OllamaHarnessProfile;
  executable: OllamaResolvedExecutable;
  model: string;
  arguments: string[];
  workingDirectory: string;
  environmentKeys: string[];
  requiredPorts: number[];
  requiredFiles: string[];
  blockers: string[];
}

export interface OllamaChatAttachment {
  name: string;
  kind: 'image';
  base64: string;
}

export interface OllamaCatalogFacetValues {
  families: string[];
  capabilities: string[];
  quantizations: string[];
}

export interface OllamaSearchStatus {
  description: string;
  error: string | null;
  sampleFeedback: string;
  totalCount: number;
  visibleCount: number;
}

export interface OllamaSuiteState {
  activeTab: OllamaSuiteTab;
  busy: boolean;
  runtime: {
    health: 'missing' | 'stopped' | 'missing-or-stopped' | 'unhealthy' | 'healthy';
    version: string | null;
    message: string;
    nextAction: string;
    failingChecks: string[];
    checkedAt: string | null;
  };
  catalog: {
    snapshot: OllamaCatalogSnapshot | null;
    variants: OllamaCatalogVariant[];
    visibleVariants: OllamaCatalogVariant[];
    search: OllamaSearchState;
    searchStatus: OllamaSearchStatus;
    facets: OllamaCatalogFacetValues;
    selectedFacets: OllamaCatalogFacetValues;
    refreshState: 'idle' | 'refreshing' | 'fresh' | 'stale-cache' | 'incomplete' | 'unavailable';
    refreshMessage: string | null;
  };
  installed: OllamaRuntimeModel[];
  visibleInstalled: OllamaRuntimeModel[];
  installedSearch: OllamaSearchState;
  installedSearchStatus: OllamaSearchStatus;
  running: OllamaRuntimeModel[];
  fitByReference: Record<string, OllamaHardwareFitAssessment>;
  queue: OllamaPullQueueItem[];
  visibleQueue: OllamaPullQueueItem[];
  queueSearch: OllamaSearchState;
  queueSearchStatus: OllamaSearchStatus;
  cart: {
    references: string[];
    totalBytes: number | null;
    requiredFreeBytes: number | null;
    freeBytes: number | null;
    blockers: string[];
    disclosure: string;
  };
  chat: {
    sessionId: string | null;
    model: string;
    selectableModels: OllamaRuntimeModel[];
    modelRecovery: OllamaGuidedRecovery | null;
    systemPrompt: string;
    transcript: Array<{ role: string; content: string; attachmentNames: string[] }>;
    visibleTranscript: Array<{ role: string; content: string; attachmentNames: string[] }>;
    historySearch: OllamaSearchState;
    historySearchStatus: OllamaSearchStatus;
    streamingText: string;
    sending: boolean;
    error: string | null;
    attachmentsSupported: boolean;
    attachmentSupportReason: string;
    attachmentError: string | null;
    maxAttachmentBytes: number;
  };
  harness: {
    profiles: OllamaHarnessProfile[];
    visibleProfiles: OllamaHarnessProfile[];
    profileSearch: OllamaSearchState;
    profileSearchStatus: OllamaSearchStatus;
    selectedProfileId: string | null;
    executables: OllamaResolvedExecutable[];
    executablesState: 'unchecked' | 'checking' | 'none-detected' | 'detected';
    executableRecovery: OllamaGuidedRecovery | null;
    selectedExecutableId: string | null;
    selectableModels: OllamaRuntimeModel[];
    modelRecovery: OllamaGuidedRecovery | null;
    selectedModel: string | null;
    workingDirectory: string;
    preview: OllamaHarnessPreview | null;
    status: string | null;
    snapshots: Array<{ id: string; profileId: string; createdAt: string }>;
    visibleSnapshots: Array<{ id: string; profileId: string; createdAt: string }>;
    snapshotSearch: OllamaSearchState;
    snapshotSearchStatus: OllamaSearchStatus;
    restoreStatus: string | null;
  };
  troubleshooter: {
    activeHealth: OllamaSuiteState['runtime']['health'];
    branches: Array<{
      health: OllamaSuiteState['runtime']['health'];
      active: boolean;
      title: string;
      summary: string;
      failingChecks: string[];
      offlineNextStep: string;
      recheckLabel: string;
    }>;
  };
}

export interface OllamaSuiteActions {
  subscribe(listener: (state: OllamaSuiteState) => void): () => void;
  snapshot(): OllamaSuiteState;
  selectTab(tab: OllamaSuiteTab): void;
  refreshRuntime(): Promise<void>;
  refreshCatalog(): Promise<void>;
  setSearch(scope: OllamaSearchScope, patch: Partial<OllamaSearchState>): void;
  setCatalogFacets(selection: Partial<OllamaCatalogFacetValues>): void;
  enqueuePull(reference: string): Promise<void>;
  addToCart(reference: string): Promise<void>;
  removeFromCart(reference: string): Promise<void>;
  clearCart(): Promise<void>;
  commitCart(): Promise<void>;
  pauseQueue(): void;
  resumeQueue(): Promise<void>;
  cancelPull(id: string): Promise<void>;
  retryPull(id: string): Promise<void>;
  copyModel(source: string, destination: string): Promise<void>;
  deleteModel(reference: string): Promise<void>;
  selectChatModel(reference: string): void;
  sendChat(input: { model: string; systemPrompt: string; content: string; attachments: OllamaChatAttachment[]; containsTaxData: boolean; reviewedTaxData: boolean }): Promise<void>;
  stopChat(): void;
  selectHarnessProfile(profileId: string): void;
  refreshHarnessExecutables(): Promise<void>;
  selectHarnessExecutable(executableId: string): void;
  selectHarnessModel(reference: string): void;
  chooseWorkingDirectory(): Promise<string | null>;
  previewHarness(input: { profileId: string; executableId: string; workingDirectory: string; model: string }): Promise<void>;
  launchHarness(): Promise<void>;
  refreshHarnessSnapshots(): Promise<void>;
  restoreHarnessSnapshot(snapshotId: string): Promise<void>;
}

export function formatOllamaBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return 'Size unavailable';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1000 && index < units.length - 1) { value /= 1000; index += 1; }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function summarizeOllamaRuntime(state: OllamaSuiteState): string {
  const version = state.runtime.version ? ` ${state.runtime.version}` : '';
  return `${state.runtime.health}${version}: ${state.runtime.message}`;
}

export function applyOllamaRecovery(actions: OllamaSuiteActions, recovery: OllamaGuidedRecovery): Promise<void> {
  switch (recovery.actionId) {
    case 'refresh-runtime': return actions.refreshRuntime();
    case 'refresh-catalog': return actions.refreshCatalog();
    case 'refresh-harness-executables': return actions.refreshHarnessExecutables();
    case 'open-model-store': actions.selectTab('store'); return Promise.resolve();
  }
}

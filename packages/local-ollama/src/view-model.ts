/**
 * The portable view-model for the local Ollama suite.
 *
 * This module describes what a host has to render and which actions it may
 * call. It contains no rendering code of its own: there is no DOM access, no
 * element construction, no stylesheet and no framework dependency, so the same
 * state object can drive the documentation site surface and the desktop
 * surface without either one forking the behaviour.
 *
 * Two rules keep the contract honest:
 *
 *   - every filterable collection carries its own search state, taken from the
 *     shared anchored search engine in the surface kernel, so a host can attach
 *     one builder per collection without inventing a second matcher; and
 *   - every choice a person makes is an enumeration built from data that was
 *     actually collected. When a list is empty the state says so explicitly and
 *     names the action that can fill it, instead of leaving a blank field.
 */

import type { BuilderToken, SearchMatch, SearchState } from "@oak-kay/surface-kernel";

import type { OfficialCatalogSnapshot, OfficialCatalogVariant } from "./catalog.ts";
import type { ChatAttachment } from "./chat.ts";
import type { HardwareFitAssessment } from "./hardware-fit.ts";
import type { HarnessLaunchPreview, HarnessProfile, ResolvedExecutable } from "./harness.ts";
import type { PullQueueItem } from "./pull-queue.ts";

/** Every local runtime condition the suite can report. */
export type RuntimeHealth = "missing" | "stopped" | "missing-or-stopped" | "unhealthy" | "healthy";

/** The runtime conditions, in the order the troubleshooter lists them. */
export const RUNTIME_HEALTH_VALUES: readonly RuntimeHealth[] = [
  "missing",
  "stopped",
  "missing-or-stopped",
  "unhealthy",
  "healthy",
];

/** The five destinations a host renders. */
export type LocalOllamaTab = "store" | "queue" | "chat" | "harness" | "troubleshooter";

export interface LocalOllamaTabDescriptor {
  id: LocalOllamaTab;
  label: string;
  description: string;
}

/** Labels and descriptions for the destinations. Hosts own the tab widget. */
export const LOCAL_OLLAMA_TABS: readonly LocalOllamaTabDescriptor[] = [
  { id: "store", label: "Model store", description: "Browse the verified official catalog and the models installed locally." },
  { id: "queue", label: "Pull queue", description: "Watch, pause, retry and cancel local model downloads." },
  { id: "chat", label: "Local chat", description: "Send a message to one installed local model." },
  { id: "harness", label: "Harnesses", description: "Review, launch and restore allowlisted local harness profiles." },
  { id: "troubleshooter", label: "Troubleshooter", description: "Read the current local runtime condition and its offline recovery step." },
];

export interface LocalRuntimeModel {
  reference: string;
  sizeBytes: number | null;
  digest: string | null;
  parameterSize: string | null;
  quantization: string | null;
  capabilities: string[];
}

/** One transcript line, including the names of anything the user attached. */
export interface ChatTranscriptEntry {
  role: string;
  content: string;
  attachmentNames: string[];
}

/** A snapshot record reduced to the facts a host may display. */
export interface HarnessSnapshotSummary {
  id: string;
  profileId: string;
  createdAt: string;
}

/** The collections a host may attach a search builder to. */
export type SearchScope =
  | "catalog"
  | "installed"
  | "queue"
  | "chat-history"
  | "harness-profiles"
  | "harness-snapshots";

export const SEARCH_SCOPES: readonly SearchScope[] = [
  "catalog",
  "installed",
  "queue",
  "chat-history",
  "harness-profiles",
  "harness-snapshots",
];

/**
 * Everything a host needs beside one search field: the plain-language
 * description, the compile error if the pattern is not valid, and the match
 * preview the builder shows for the sample text held in the search state.
 */
export interface SearchStatus {
  description: string;
  error: string | null;
  sampleFeedback: string;
  sampleMatches: SearchMatch[];
  totalCount: number;
  visibleCount: number;
}

/** The action a host offers when a guided list has nothing to choose from. */
export type RecoveryActionId =
  | "refresh-runtime"
  | "refresh-catalog"
  | "refresh-harness-executables"
  | "open-model-store";

export interface GuidedRecovery {
  message: string;
  actionLabel: string;
  actionId: RecoveryActionId;
}

/** How far executable detection has got on this computer. */
export type ExecutableDetectionState = "unchecked" | "checking" | "none-detected" | "detected";

export interface CatalogFacetValues {
  families: string[];
  capabilities: string[];
  quantizations: string[];
}

/** One troubleshooter branch, one per runtime condition. */
export interface TroubleshooterBranch {
  health: RuntimeHealth;
  active: boolean;
  title: string;
  summary: string;
  /** Named checks the local API reported as failing, when this branch is the active one. */
  failingChecks: string[];
  /** A step that can be followed without any network access. */
  offlineNextStep: string;
  recheckLabel: string;
}

export interface RuntimeViewState {
  health: RuntimeHealth;
  version: string | null;
  message: string;
  nextAction: string;
  failingChecks: string[];
  checkedAt: string | null;
}

export interface CatalogViewState {
  snapshot: OfficialCatalogSnapshot | null;
  variants: OfficialCatalogVariant[];
  visibleVariants: OfficialCatalogVariant[];
  search: SearchState;
  searchStatus: SearchStatus;
  facets: CatalogFacetValues;
  selectedFacets: CatalogFacetValues;
  refreshState: "idle" | "refreshing" | "fresh" | "stale-cache" | "incomplete" | "unavailable";
  refreshMessage: string | null;
}

export interface CartViewState {
  references: string[];
  totalBytes: number | null;
  requiredFreeBytes: number | null;
  freeBytes: number | null;
  blockers: string[];
  /** Stated on the cart itself, where the batch decision is made. */
  disclosure: string;
}

export interface ChatViewState {
  sessionId: string | null;
  model: string;
  /** Enumerated from the installed models actually reported by the runtime. */
  selectableModels: LocalRuntimeModel[];
  modelRecovery: GuidedRecovery | null;
  systemPrompt: string;
  transcript: ChatTranscriptEntry[];
  visibleTranscript: ChatTranscriptEntry[];
  historySearch: SearchState;
  historySearchStatus: SearchStatus;
  streamingText: string;
  sending: boolean;
  error: string | null;
  /** True only when the selected installed model reports the image capability. */
  attachmentsSupported: boolean;
  /** Why attachments are or are not available, for the disabled control's label. */
  attachmentSupportReason: string;
  attachmentError: string | null;
  maxAttachmentBytes: number;
}

export interface HarnessViewState {
  profiles: HarnessProfile[];
  visibleProfiles: HarnessProfile[];
  profileSearch: SearchState;
  profileSearchStatus: SearchStatus;
  selectedProfileId: string | null;
  /** Executables detected on this computer, never a typed-in path. */
  executables: ResolvedExecutable[];
  executablesState: ExecutableDetectionState;
  executableRecovery: GuidedRecovery | null;
  selectedExecutableId: string | null;
  selectableModels: LocalRuntimeModel[];
  modelRecovery: GuidedRecovery | null;
  selectedModel: string | null;
  workingDirectory: string;
  preview: HarnessLaunchPreview | null;
  status: string | null;
  snapshots: HarnessSnapshotSummary[];
  visibleSnapshots: HarnessSnapshotSummary[];
  snapshotSearch: SearchState;
  snapshotSearchStatus: SearchStatus;
  restoreStatus: string | null;
}

export interface TroubleshooterViewState {
  activeHealth: RuntimeHealth;
  branches: TroubleshooterBranch[];
}

export interface LocalOllamaSuiteState {
  activeTab: LocalOllamaTab;
  busy: boolean;
  runtime: RuntimeViewState;
  catalog: CatalogViewState;
  installed: LocalRuntimeModel[];
  visibleInstalled: LocalRuntimeModel[];
  installedSearch: SearchState;
  installedSearchStatus: SearchStatus;
  running: LocalRuntimeModel[];
  fitByReference: Record<string, HardwareFitAssessment>;
  queue: PullQueueItem[];
  visibleQueue: PullQueueItem[];
  queueSearch: SearchState;
  queueSearchStatus: SearchStatus;
  cart: CartViewState;
  chat: ChatViewState;
  harness: HarnessViewState;
  troubleshooter: TroubleshooterViewState;
}

export interface SendChatInput {
  model: string;
  systemPrompt: string;
  content: string;
  attachments: ChatAttachment[];
  containsTaxData: boolean;
  reviewedTaxData: boolean;
}

export interface PreviewHarnessInput {
  profileId: string;
  executableId: string;
  workingDirectory: string;
  model: string;
}

export interface LocalOllamaSuiteActions {
  subscribe(listener: (state: LocalOllamaSuiteState) => void): () => void;
  snapshot(): LocalOllamaSuiteState;
  selectTab(tab: LocalOllamaTab): void;

  refreshRuntime(): Promise<void>;
  refreshCatalog(): Promise<void>;

  setSearch(scope: SearchScope, patch: Partial<SearchState>): void;
  insertSearchToken(scope: SearchScope, token: BuilderToken): void;
  setCatalogFacets(selection: Partial<CatalogFacetValues>): void;

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
  sendChat(input: SendChatInput): Promise<void>;
  stopChat(): void;

  selectHarnessProfile(profileId: string): void;
  refreshHarnessExecutables(): Promise<void>;
  selectHarnessExecutable(executableId: string): void;
  selectHarnessModel(reference: string): void;
  chooseWorkingDirectory(): Promise<string | null>;
  previewHarness(input: PreviewHarnessInput): Promise<void>;
  launchHarness(): Promise<void>;
  refreshHarnessSnapshots(): Promise<void>;
  restoreHarnessSnapshot(snapshotId: string): Promise<void>;
}

/**
 * The batch cart's standing statement. It is deliberately worded so the whole
 * package can be scanned for commerce vocabulary and stay clean.
 */
export const CART_DISCLOSURE =
  "This cart only schedules local model downloads on this computer. Nothing is bought, billed or charged, no account is created, and no payment detail is ever requested.";

/**
 * The gate a host must build around local model deletion. The view-model does
 * not render it, so the required steps are stated here instead of being buried
 * in one surface's markup.
 */
export const MODEL_DELETION_GATE = {
  confirmationKeys: 2,
  requiresCompletionSlider: true,
  warning: (reference: string): string =>
    `This removes the local model ${reference} from this computer. Pull it again to restore it.`,
} as const;

/** Human-readable byte size. Hosts may use it or format bytes themselves. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "Size unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** One-line runtime summary suitable for a status region. */
export function runtimeSummary(state: LocalOllamaSuiteState): string {
  const version = state.runtime.version ? ` ${state.runtime.version}` : "";
  return `${state.runtime.health}${version}: ${state.runtime.message}`;
}

/** Reads the search state a scope owns. */
export function searchStateFor(state: LocalOllamaSuiteState, scope: SearchScope): SearchState {
  switch (scope) {
    case "catalog":
      return state.catalog.search;
    case "installed":
      return state.installedSearch;
    case "queue":
      return state.queueSearch;
    case "chat-history":
      return state.chat.historySearch;
    case "harness-profiles":
      return state.harness.profileSearch;
    case "harness-snapshots":
      return state.harness.snapshotSearch;
  }
}

/** Reads the derived status a scope owns. */
export function searchStatusFor(state: LocalOllamaSuiteState, scope: SearchScope): SearchStatus {
  switch (scope) {
    case "catalog":
      return state.catalog.searchStatus;
    case "installed":
      return state.installedSearchStatus;
    case "queue":
      return state.queueSearchStatus;
    case "chat-history":
      return state.chat.historySearchStatus;
    case "harness-profiles":
      return state.harness.profileSearchStatus;
    case "harness-snapshots":
      return state.harness.snapshotSearchStatus;
  }
}

/** Byte shortfall the cart preflight found, or null when there is none. */
export function cartShortfallBytes(cart: CartViewState): number | null {
  if (cart.requiredFreeBytes === null || cart.freeBytes === null) return null;
  const shortfall = cart.requiredFreeBytes - cart.freeBytes;
  return shortfall > 0 ? shortfall : null;
}

/** Runs the named recovery action a guided empty state points at. */
export function applyRecovery(actions: LocalOllamaSuiteActions, recovery: GuidedRecovery): Promise<void> {
  switch (recovery.actionId) {
    case "refresh-runtime":
      return actions.refreshRuntime();
    case "refresh-catalog":
      return actions.refreshCatalog();
    case "refresh-harness-executables":
      return actions.refreshHarnessExecutables();
    case "open-model-store":
      actions.selectTab("store");
      return Promise.resolve();
  }
}

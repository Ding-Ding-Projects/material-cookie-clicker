import type { ConvertFileOutcome, FileInspection } from './converter-contracts.js';
import type { ConverterQueueItem } from './converter-queue.js';
import type { PdfInspection, PdfMetadataUpdate, PdfRotationRequest } from './converter-pdf.js';
import type { IdentityValidation, LogoMetadata } from './identity-model.js';
import type { OllamaSuiteState } from './ollama-suite-types.js';
import type { ChangelogEntry, OfflineDocsBundle } from './security-content.js';
import type { HistoryRecord } from './security-history.js';
import type { ExtendedScheduleRule } from './security-scheduling.js';
import type { TotpImportRequest } from './security-totp.js';

export const CANONICAL_IPC_CHANNELS = {
  readSharedSettings: 'canonical:read-shared-settings',
  writeSharedSettings: 'canonical:write-shared-settings',
  openApplicationData: 'canonical:open-application-data',
  sharedSettingsChanged: 'canonical:shared-settings-changed',
  converterPickSource: 'canonical:converter-pick-source',
  converterPickDestination: 'canonical:converter-pick-destination',
  converterInspect: 'canonical:converter-inspect',
  converterConvert: 'canonical:converter-convert',
  converterEnqueue: 'canonical:converter-enqueue',
  converterQueuePage: 'canonical:converter-queue-page',
  converterQueueAction: 'canonical:converter-queue-action',
  converterPdf: 'canonical:converter-pdf',
  ollamaSnapshot: 'canonical:ollama-snapshot',
  ollamaAction: 'canonical:ollama-action',
  ollamaStateChanged: 'canonical:ollama-state-changed',
  identityInspect: 'canonical:identity-inspect',
  securitySnapshot: 'canonical:security-snapshot',
  securityImportTotp: 'canonical:security-import-totp',
  securityDeleteTotp: 'canonical:security-delete-totp',
  securitySaveSchedule: 'canonical:security-save-schedule',
  securityRestoreHistory: 'canonical:security-restore-history',
  securityExportText: 'canonical:security-export-text',
  securityOpenDataFolder: 'canonical:security-open-data-folder',
} as const;

export interface CanonicalSharedSettings {
  readonly version: 1;
  readonly schoolMode: boolean;
  readonly schoolModeName: string;
  readonly updatedAt: string;
}

export type CanonicalReadResult =
  | { readonly ok: true; readonly settings: CanonicalSharedSettings }
  | { readonly ok: false; readonly reason: string };

export type CanonicalWriteResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export type CanonicalValueResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export interface CanonicalConverterRequest {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly adapterId: string;
}

export interface CanonicalConverterQueuePage {
  readonly items: readonly ConverterQueueItem[];
  readonly nextCursor: string | null;
}

export type PdfFileOperationRequest =
  | { readonly kind: 'inspect'; readonly sourcePath: string }
  | { readonly kind: 'extract'; readonly sourcePath: string; readonly destinationPath: string; readonly pages: readonly number[] }
  | { readonly kind: 'split'; readonly sourcePath: string; readonly destinationPaths: readonly string[]; readonly groups?: readonly (readonly number[])[] }
  | { readonly kind: 'reorder'; readonly sourcePath: string; readonly destinationPath: string; readonly order: readonly number[] }
  | { readonly kind: 'rotate'; readonly sourcePath: string; readonly destinationPath: string; readonly rotations: readonly PdfRotationRequest[] }
  | { readonly kind: 'metadata'; readonly sourcePath: string; readonly destinationPath: string; readonly metadata: PdfMetadataUpdate }
  | { readonly kind: 'merge'; readonly sourcePaths: readonly string[]; readonly destinationPath: string };

export interface PdfFileOperationOutcome {
  readonly operation: PdfFileOperationRequest['kind'];
  readonly inspection: PdfInspection;
  readonly outputs: readonly { destinationPath: string; bytes: number; status: 'written' | 'failed'; message: string }[];
}

export type CanonicalConverterQueueAction = 'pause' | 'resume' | 'cancel';

export type CanonicalOllamaAction =
  | 'selectTab'
  | 'refreshRuntime'
  | 'refreshCatalog'
  | 'setSearch'
  | 'setCatalogFacets'
  | 'enqueuePull'
  | 'addToCart'
  | 'removeFromCart'
  | 'clearCart'
  | 'commitCart'
  | 'pauseQueue'
  | 'resumeQueue'
  | 'cancelPull'
  | 'retryPull'
  | 'copyModel'
  | 'deleteModel'
  | 'selectChatModel'
  | 'sendChat'
  | 'stopChat'
  | 'selectHarnessProfile'
  | 'refreshHarnessExecutables'
  | 'selectHarnessExecutable'
  | 'selectHarnessModel'
  | 'chooseWorkingDirectory'
  | 'previewHarness'
  | 'launchHarness'
  | 'refreshHarnessSnapshots'
  | 'restoreHarnessSnapshot';

export interface CanonicalSecuritySnapshot {
  readonly localDataPath: string;
  readonly timeZone: string;
  readonly storedTotpEntries: readonly { id: string; issuer: string; account: string; group: string }[];
  readonly history: readonly HistoryRecord[];
  readonly changelog: readonly ChangelogEntry[];
  readonly docs: OfflineDocsBundle | null;
  readonly status: string;
}

export interface CanonicalIpcApi {
  readSharedSettings(): Promise<CanonicalReadResult>;
  writeSharedSettings(settings: CanonicalSharedSettings): Promise<CanonicalWriteResult>;
  openApplicationData(): Promise<CanonicalWriteResult>;
  onSharedSettings(listener: (settings: CanonicalSharedSettings) => void): () => void;
  converter: {
    pickSource(): Promise<CanonicalValueResult<string | null>>;
    pickDestination(suggestedName: string): Promise<CanonicalValueResult<string | null>>;
    inspect(sourcePath: string): Promise<CanonicalValueResult<FileInspection>>;
    convert(request: CanonicalConverterRequest): Promise<CanonicalValueResult<ConvertFileOutcome>>;
    enqueue(items: readonly CanonicalConverterRequest[]): Promise<CanonicalWriteResult>;
    queuePage(cursor: string | null, limit: number): Promise<CanonicalValueResult<CanonicalConverterQueuePage>>;
    queueAction(action: CanonicalConverterQueueAction): Promise<CanonicalWriteResult>;
    pdf(request: PdfFileOperationRequest): Promise<CanonicalValueResult<PdfFileOperationOutcome>>;
  };
  ollama: {
    snapshot(): Promise<CanonicalValueResult<OllamaSuiteState>>;
    invoke(action: CanonicalOllamaAction, args: readonly unknown[]): Promise<CanonicalValueResult<unknown>>;
    onState(listener: (state: OllamaSuiteState) => void): () => void;
  };
  identity: {
    inspect(bytes: Uint8Array): Promise<CanonicalValueResult<IdentityValidation<LogoMetadata>>>;
  };
  security: {
    snapshot(): Promise<CanonicalValueResult<CanonicalSecuritySnapshot>>;
    importTotp(request: TotpImportRequest): Promise<CanonicalWriteResult>;
    deleteTotp(ids: readonly string[]): Promise<CanonicalWriteResult>;
    saveSchedule(rule: ExtendedScheduleRule): Promise<CanonicalWriteResult>;
    restoreHistory(revisionId: string): Promise<CanonicalWriteResult>;
    exportText(suggestedName: string, markdown: string): Promise<CanonicalWriteResult>;
    openDataFolder(): Promise<CanonicalWriteResult>;
  };
}

export function normalizeCanonicalSharedSettings(value: unknown): CanonicalSharedSettings {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const name = typeof record.schoolModeName === 'string' ? record.schoolModeName.trim().slice(0, 48) : '';
  return {
    version: 1,
    schoolMode: record.schoolMode === true,
    schoolModeName: name || 'School mode',
    updatedAt: typeof record.updatedAt === 'string' && Number.isFinite(Date.parse(record.updatedAt))
      ? record.updatedAt
      : new Date(0).toISOString(),
  };
}

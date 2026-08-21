import { contextBridge, ipcRenderer } from 'electron';

import {
  DIESEL_IPC_CHANNELS,
  SAVE_HISTORY_IPC_CHANNELS,
  UPDATE_IPC_CHANNELS,
  type UpdateIpcApi,
  type DieselIpcApi,
  type DieselMintRequest,
  type DieselMintResponse,
  type DieselReadResponse,
  type SaveHistoryArchiveResponse,
  type SaveHistoryIpcApi,
  type SaveHistoryListResponse,
  type SaveHistoryReadResponse,
} from '../shared/game/ipc-contracts.js';
import type { SaveDataLatest } from '../shared/game/save-schema.js';
import type { UpdateStatus } from '../shared/game/updates.js';
import {
  CANONICAL_IPC_CHANNELS,
  type CanonicalIpcApi,
  type CanonicalOllamaAction,
  type CanonicalReadResult,
  type CanonicalSecuritySnapshot,
  type CanonicalSharedSettings,
  type CanonicalValueResult,
  type CanonicalWriteResult,
  type CanonicalConverterQueueAction,
  type CanonicalConverterQueuePage,
  type CanonicalConverterRequest,
  type PdfFileOperationOutcome,
  type PdfFileOperationRequest,
} from '../shared/canonical-ipc.js';
import type { ConvertFileOutcome, FileInspection } from '../shared/converter-contracts.js';
import type { IdentityValidation, LogoMetadata } from '../shared/identity-model.js';
import type { OllamaSuiteState } from '../shared/ollama-suite-types.js';
import type { ExtendedScheduleRule } from '../shared/security-scheduling.js';
import type { TotpImportRequest } from '../shared/security-totp.js';

// A deliberately narrow bridge: window-chrome controls, plus the two diesel-exchange calls.
// The game-state save IPC surface is still not exposed here — the renderer persists to
// localStorage today (see src/renderer/game/persistence.ts) and wiring that over is a separate
// change with its own save-migration question to answer.
export interface MaterialCookieClickerWindowApi {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  /**
   * Tells the main process whether the window may be resized at all — the renderer half of the
   * "chrome.resize" control purchase (src/shared/game/control-unlocks.ts). It is a REQUEST, not
   * a decision: the main process owns the window flag, and the window is created not resizable,
   * so a renderer that never calls this can never make the edges live.
   */
  setResizable: (resizable: boolean) => void;
  setCloseAllowed: (allowed: boolean) => void;
  /**
   * Fires when the main process refused a close because the one-cookie exit is not bought yet.
   *
   * The main process has always sent `window:close-refused` "so the renderer can flash the price
   * plate" — but nothing ever listened, so pressing the taskbar's Close window, or Alt+F4, before
   * buying did absolutely nothing and gave no reason. The refusal is deliberate and the exit still
   * costs exactly one cookie; what was missing was any way for the player to find that out.
   *
   * Returns its own unsubscribe, like `updates.onStatus`.
   */
  onCloseRefused: (listener: () => void) => () => void;
}

export interface MaterialCookieClickerApi {
  window: MaterialCookieClickerWindowApi;
  /**
   * Save history. Deleting progress never deletes anything -- the save is committed to a local Git
   * repository owned by the main process and can always be read back. The renderer asks; it holds
   * no file-system access of its own.
   */
  saveHistory: SaveHistoryIpcApi;
  /**
   * The diesel voucher exchange with WinForge (see src/shared/game/diesel-exchange.ts). Two
   * calls, both of which end in the main process: mint a voucher, or read the ledger back. The
   * renderer gets no path, no handle and no `fs` — only these two questions.
   */
  diesel: DieselIpcApi;
  /**
   * Automatic updates. The renderer may listen and it may ask to restart; it cannot start a
   * check, cannot see the feed address and cannot install anything itself. The status object it
   * receives is whatever the main process last decided (src/shared/game/updates.ts).
   */
  updates: UpdateIpcApi;
  canonical: CanonicalIpcApi;
}

const api: MaterialCookieClickerApi = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    setResizable: (resizable: boolean) => ipcRenderer.send('window:set-resizable', resizable === true),
    setCloseAllowed: (allowed: boolean) => ipcRenderer.send('window:set-close-allowed', allowed === true),
    onCloseRefused: (listener: () => void): (() => void) => {
      // The IpcRendererEvent is deliberately not passed through, matching updates.onStatus: the
      // renderer gets the fact that a close was refused and nothing else from the main process.
      const handler = (): void => listener();
      ipcRenderer.on('window:close-refused', handler);
      return () => ipcRenderer.removeListener('window:close-refused', handler);
    },
  },
  saveHistory: {
    archive: (save: SaveDataLatest, summary: string): Promise<SaveHistoryArchiveResponse> =>
      ipcRenderer.invoke(SAVE_HISTORY_IPC_CHANNELS.archive, save, summary) as Promise<SaveHistoryArchiveResponse>,
    list: (): Promise<SaveHistoryListResponse> =>
      ipcRenderer.invoke(SAVE_HISTORY_IPC_CHANNELS.list) as Promise<SaveHistoryListResponse>,
    read: (id: string): Promise<SaveHistoryReadResponse> =>
      ipcRenderer.invoke(SAVE_HISTORY_IPC_CHANNELS.read, id) as Promise<SaveHistoryReadResponse>,
  },
  diesel: {
    mint: (request: DieselMintRequest): Promise<DieselMintResponse> =>
      ipcRenderer.invoke(DIESEL_IPC_CHANNELS.mint, request) as Promise<DieselMintResponse>,
    read: (): Promise<DieselReadResponse> =>
      ipcRenderer.invoke(DIESEL_IPC_CHANNELS.read) as Promise<DieselReadResponse>,
  },
  updates: {
    onStatus: (listener: (status: UpdateStatus) => void): (() => void) => {
      // The IpcRendererEvent is deliberately not passed through: the renderer gets the status
      // value and nothing else — no sender, no ports, no way back up the channel.
      const handler = (_event: unknown, status: UpdateStatus) => listener(status);
      ipcRenderer.on(UPDATE_IPC_CHANNELS.status, handler);
      return () => { ipcRenderer.off(UPDATE_IPC_CHANNELS.status, handler); };
    },
    requestStatus: () => ipcRenderer.send(UPDATE_IPC_CHANNELS.requestStatus),
    restart: () => ipcRenderer.send(UPDATE_IPC_CHANNELS.restart),
  },
  canonical: {
    readSharedSettings: (): Promise<CanonicalReadResult> =>
      ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.readSharedSettings) as Promise<CanonicalReadResult>,
    writeSharedSettings: (settings: CanonicalSharedSettings): Promise<CanonicalWriteResult> =>
      ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.writeSharedSettings, settings) as Promise<CanonicalWriteResult>,
    openApplicationData: (): Promise<CanonicalWriteResult> =>
      ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.openApplicationData) as Promise<CanonicalWriteResult>,
    onSharedSettings: (listener: (settings: CanonicalSharedSettings) => void): (() => void) => {
      const handler = (_event: unknown, settings: CanonicalSharedSettings) => listener(settings);
      ipcRenderer.on(CANONICAL_IPC_CHANNELS.sharedSettingsChanged, handler);
      return () => { ipcRenderer.off(CANONICAL_IPC_CHANNELS.sharedSettingsChanged, handler); };
    },
    converter: {
      pickSource: (): Promise<CanonicalValueResult<string | null>> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.converterPickSource) as Promise<CanonicalValueResult<string | null>>,
      pickDestination: (suggestedName: string): Promise<CanonicalValueResult<string | null>> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.converterPickDestination, suggestedName) as Promise<CanonicalValueResult<string | null>>,
      inspect: (sourcePath: string): Promise<CanonicalValueResult<FileInspection>> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.converterInspect, sourcePath) as Promise<CanonicalValueResult<FileInspection>>,
      convert: (request: CanonicalConverterRequest): Promise<CanonicalValueResult<ConvertFileOutcome>> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.converterConvert, request) as Promise<CanonicalValueResult<ConvertFileOutcome>>,
      enqueue: (items: readonly CanonicalConverterRequest[]): Promise<CanonicalWriteResult> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.converterEnqueue, items) as Promise<CanonicalWriteResult>,
      queuePage: (cursor: string | null, limit: number): Promise<CanonicalValueResult<CanonicalConverterQueuePage>> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.converterQueuePage, cursor, limit) as Promise<CanonicalValueResult<CanonicalConverterQueuePage>>,
      queueAction: (action: CanonicalConverterQueueAction): Promise<CanonicalWriteResult> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.converterQueueAction, action) as Promise<CanonicalWriteResult>,
      pdf: (request: PdfFileOperationRequest): Promise<CanonicalValueResult<PdfFileOperationOutcome>> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.converterPdf, request) as Promise<CanonicalValueResult<PdfFileOperationOutcome>>,
    },
    ollama: {
      snapshot: (): Promise<CanonicalValueResult<OllamaSuiteState>> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.ollamaSnapshot) as Promise<CanonicalValueResult<OllamaSuiteState>>,
      invoke: (action: CanonicalOllamaAction, args: readonly unknown[]): Promise<CanonicalValueResult<unknown>> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.ollamaAction, action, args) as Promise<CanonicalValueResult<unknown>>,
      onState: (listener: (state: OllamaSuiteState) => void): (() => void) => {
        const handler = (_event: unknown, state: OllamaSuiteState) => listener(state);
        ipcRenderer.on(CANONICAL_IPC_CHANNELS.ollamaStateChanged, handler);
        return () => { ipcRenderer.off(CANONICAL_IPC_CHANNELS.ollamaStateChanged, handler); };
      },
    },
    identity: {
      inspect: (bytes: Uint8Array): Promise<CanonicalValueResult<IdentityValidation<LogoMetadata>>> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.identityInspect, bytes) as Promise<CanonicalValueResult<IdentityValidation<LogoMetadata>>>,
    },
    security: {
      snapshot: (): Promise<CanonicalValueResult<CanonicalSecuritySnapshot>> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.securitySnapshot) as Promise<CanonicalValueResult<CanonicalSecuritySnapshot>>,
      importTotp: (request: TotpImportRequest): Promise<CanonicalWriteResult> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.securityImportTotp, request) as Promise<CanonicalWriteResult>,
      deleteTotp: (ids: readonly string[]): Promise<CanonicalWriteResult> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.securityDeleteTotp, ids) as Promise<CanonicalWriteResult>,
      saveSchedule: (rule: ExtendedScheduleRule): Promise<CanonicalWriteResult> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.securitySaveSchedule, rule) as Promise<CanonicalWriteResult>,
      restoreHistory: (revisionId: string): Promise<CanonicalWriteResult> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.securityRestoreHistory, revisionId) as Promise<CanonicalWriteResult>,
      exportText: (suggestedName: string, markdown: string): Promise<CanonicalWriteResult> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.securityExportText, suggestedName, markdown) as Promise<CanonicalWriteResult>,
      openDataFolder: (): Promise<CanonicalWriteResult> => ipcRenderer.invoke(CANONICAL_IPC_CHANNELS.securityOpenDataFolder) as Promise<CanonicalWriteResult>,
    },
  },
};

contextBridge.exposeInMainWorld('materialCookieClicker', Object.freeze(api));

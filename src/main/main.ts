import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { unwatchFile, watchFile } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, type OpenDialogOptions } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';

import { DieselLedgerService } from './diesel-ledger-service.js';
import { UpdateService } from './update-service.js';
import { UPDATE_VERIFICATION_FLAG, UPDATE_VERIFICATION_URL, verificationSquirrelFeedUrl } from '../shared/game/updates.js';
import {
  UPDATE_IPC_CHANNELS,
  DIESEL_IPC_CHANNELS,
  type DieselMintRequest,
  type DieselMintResponse,
  type DieselReadResponse,
} from '../shared/game/ipc-contracts.js';
import {
  CANONICAL_IPC_CHANNELS,
  normalizeCanonicalSharedSettings,
  type CanonicalReadResult,
  type CanonicalSecuritySnapshot,
  type CanonicalSharedSettings,
  type CanonicalValueResult,
  type CanonicalWriteResult,
  type CanonicalConverterQueueAction,
  type CanonicalConverterRequest,
  type CanonicalOllamaAction,
  type PdfFileOperationRequest,
} from '../shared/canonical-ipc.js';
import { convertFile, FileConverterQueueWorker, inspectConverterFile } from './converter-file-service.js';
import { performPdfFileOperation } from './converter-pdf-service.js';
import { FileConverterQueueStore } from './converter-queue-store.js';
import { ConverterQueueController, type ConverterQueueStatus } from '../shared/converter-queue.js';
import { identityImageService } from './identity-image-service.js';
import type { OllamaSearchState, OllamaSuiteState } from '../shared/ollama-suite-types.js';
import { createManualTotpProfile, normalizeTotpGroup, type TotpImportRequest } from '../shared/security-totp.js';
import type { ExtendedScheduleRule } from '../shared/security-scheduling.js';
import type { HistoryRecord, HistoryAction } from '../shared/security-history.js';
import { LocalGitHistoryService } from './security-local-history.js';
import { SafeStorageCredentialVault, type EncryptedCredentialStore } from './security-vault-service.js';

const PRODUCT_NAME = 'Material Cookie Clicker';
const PRODUCT_APP_ID = 'org.dingdingprojects.materialcookieclicker';

const dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;

app.setName(PRODUCT_NAME);
app.setAppUserModelId(PRODUCT_APP_ID);

if (squirrelStartup) app.quit();

// Keep one process as the sole owner of the game window. A second launch
// simply focuses the existing one instead of opening a duplicate.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    // 1440×900 by owner decree — 1024×720 squeezed the rail into one-word-per-line wrapping.
    width: 1440,
    height: 900,
    minWidth: 480,
    minHeight: 420,
    // RESIZING IS A PURCHASE (src/shared/game/control-unlocks.ts, "chrome.resize").
    //
    // Enforced here rather than in CSS, because on a frameless window the resize grips are drawn
    // and handled by the operating system: there is no renderer-side element to disable, and a
    // renderer that merely pretended would still leave the real edges live. The window therefore
    // STARTS not resizable and the renderer asks for it to be made resizable once the unlock is
    // actually in the save — see the 'window:set-resizable' handler below.
    resizable: false,
    show: false,
    title: PRODUCT_NAME,
    icon: path.join(dirname, '..', '..', 'assets', 'material-cookie-clicker.ico'),
    // A frameless window with our own Material title bar, never the OS chrome.
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#FFF8F1',
    webPreferences: {
      preload: path.join(dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    window.setTitle(PRODUCT_NAME);
  });
  window.once('ready-to-show', () => window.showInactive());
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.error(`Material Cookie Clicker renderer failed to load (${errorCode}): ${errorDescription} — ${validatedURL}`);
    window.setTitle(PRODUCT_NAME);
  });
  void window.loadFile(path.join(dirname, '..', 'renderer', 'index.html')).catch((error: unknown) => {
    console.error(`Material Cookie Clicker renderer load failed: ${(error as Error).message}`);
    window.setTitle(PRODUCT_NAME);
  });
  return window;
}

void app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  mainWindow = createWindow();
  mainWindow.on('closed', () => { mainWindow = null; });

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:toggle-maximize', () => {
    if (!mainWindow) return;
    // Electron quirk: maximize() on a non-resizable window does not maximize — on Windows it
    // just moves the window to the top-left corner at its old size (the resize purchase keeps the
    // window non-resizable until bought, so this is the common case). Lift the flag for the
    // operation and put it back, so a bought maximize behaves like a real one without quietly
    // granting the resize purchase.
    const wasResizable = mainWindow.isResizable();
    if (!wasResizable) mainWindow.setResizable(true);
    if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
    if (!wasResizable) mainWindow.setResizable(false);
  });
  // The close CHANNEL always closes — by the time the renderer sends it, the one-cookie exit
  // rung is bought (the locked button is a price plate that does not send). The gate lives on
  // the window's own close event below, covering Alt+F4 and the OS close message.
  ipcMain.on('window:close', () => mainWindow?.close());

  // The renderer half of the resize purchase. It sends the current answer on startup and again
  // whenever the unlock is bought; the main process is the only thing that can actually move the
  // flag. `Boolean(...)` rather than trusting the payload's type, because this channel is
  // reachable from the renderer and a truthy string should not be able to buy anything.
  ipcMain.on('window:set-resizable', (_event, resizable: unknown) => {
    mainWindow?.setResizable(resizable === true);
  });

  // The one-cookie exit (chrome.close). Before it is bought, a close request — the (locked)
  // button would not send one, but Alt+F4 and the OS close message do — is softly refused and
  // the renderer is told so it can flash the price plate. OS shutdown/session end are never
  // fought: Electron cannot veto session-end on Windows, and we do not try.
  let closeAllowed = false;
  ipcMain.on('window:set-close-allowed', (_event, allowed: unknown) => {
    closeAllowed = allowed === true;
  });
  mainWindow.on('close', (event) => {
    if (!closeAllowed) {
      event.preventDefault();
      mainWindow?.webContents.send('window:close-refused');
    }
  });

  // The diesel voucher exchange with WinForge. `app.getPath('appData')` is the OS roaming
  // application-data directory (%APPDATA% on Windows); the service puts the shared ledger at
  // <appData>/DingDingProjects/exchange/diesel-vouchers.json, which is the location both
  // applications agreed on in docs/winforge-diesel-exchange.md. Resolving it HERE, once, is
  // what keeps the path out of the renderer entirely.
  const dieselLedger = new DieselLedgerService(app.getPath('appData'));
  const sharedDataDirectory = path.join(app.getPath('appData'), 'DingDingProjects', 'shared');
  const sharedSettingsPath = path.join(sharedDataDirectory, 'application-settings.json');
  const canonicalDataDirectory = path.join(app.getPath('userData'), 'canonical-tools');
  const converterQueueDirectory = path.join(canonicalDataDirectory, 'converter-queue');
  const securityDirectory = path.join(canonicalDataDirectory, 'security');
  const encryptedStorePath = path.join(securityDirectory, 'credential-vault.json');
  const totpMetadataPath = path.join(securityDirectory, 'totp-metadata.json');
  const historyIndexPath = path.join(securityDirectory, 'history-index.json');
  const schedulePath = path.join(securityDirectory, 'scheduled-settings.json');

  const valueSuccess = <T,>(value: T): CanonicalValueResult<T> => ({ ok: true, value });
  const valueFailure = (error: unknown): CanonicalValueResult<never> => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  });

  const writeJsonAtomic = async (destination: string, value: unknown): Promise<void> => {
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    try {
      for (let attempt = 0; ; attempt += 1) {
        try { await rename(temporary, destination); return; }
        catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (!['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || attempt >= 5) throw error;
          await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
        }
      }
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  };

  const readJson = async <T,>(filename: string, fallback: T): Promise<T> => {
    try { return JSON.parse(await readFile(filename, 'utf8')) as T; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
      throw error;
    }
  };

  const converterStore = new FileConverterQueueStore(converterQueueDirectory);
  const converterQueue = new ConverterQueueController(converterStore, new FileConverterQueueWorker(), 2);
  const grantedReadPaths = new Set<string>();
  const grantedWritePaths = new Set<string>();
  const grantRead = (filename: string): string => { const absolute = path.resolve(filename); grantedReadPaths.add(absolute); return absolute; };
  const grantWrite = (filename: string): string => { const absolute = path.resolve(filename); grantedWritePaths.add(absolute); return absolute; };
  const requireReadGrant = (filename: string): string => {
    const absolute = path.resolve(filename);
    if (!grantedReadPaths.has(absolute)) throw new Error('Select the source with the application file picker before using it.');
    return absolute;
  };
  const requireWriteGrant = (filename: string): string => {
    const absolute = path.resolve(filename);
    if (!grantedWritePaths.has(absolute)) throw new Error('Select the destination with the application file picker before using it.');
    return absolute;
  };

  const emptyOllamaSearch = (): OllamaSearchState => ({ query: '', regex: false, pattern: '', flags: '', sample: '', builderOpen: false });
  const emptySearchStatus = () => ({ description: 'No search term entered.', error: null, sampleFeedback: 'Enter a pattern to inspect it.', totalCount: 0, visibleCount: 0 });
  let ollamaState: OllamaSuiteState = {
    activeTab: 'troubleshooter',
    busy: false,
    runtime: { health: 'missing-or-stopped', version: null, message: 'The privileged local runtime check has not run yet.', nextAction: 'Select Recheck local runtime.', failingChecks: [], checkedAt: null },
    catalog: { snapshot: null, variants: [], visibleVariants: [], search: emptyOllamaSearch(), searchStatus: emptySearchStatus(), facets: { families: [], capabilities: [], quantizations: [] }, selectedFacets: { families: [], capabilities: [], quantizations: [] }, refreshState: 'unavailable', refreshMessage: 'The packaged catalog adapter is unavailable; no model list is guessed.' },
    installed: [], visibleInstalled: [], installedSearch: emptyOllamaSearch(), installedSearchStatus: emptySearchStatus(), running: [], fitByReference: {},
    queue: [], visibleQueue: [], queueSearch: emptyOllamaSearch(), queueSearchStatus: emptySearchStatus(),
    cart: { references: [], totalBytes: null, requiredFreeBytes: null, freeBytes: null, blockers: ['The packaged pull adapter is unavailable.'], disclosure: 'This cart schedules local model pulls only. It has no prices, payments, accounts, or cloud entitlement.' },
    chat: { sessionId: null, model: '', selectableModels: [], modelRecovery: { actionId: 'refresh-runtime', actionLabel: 'Recheck local runtime', message: 'An installed local model is required.' }, systemPrompt: '', transcript: [], visibleTranscript: [], historySearch: emptyOllamaSearch(), historySearchStatus: emptySearchStatus(), streamingText: '', sending: false, error: null, attachmentsSupported: false, attachmentSupportReason: 'Choose a verified installed model first.', attachmentError: null, maxAttachmentBytes: 8 * 1024 * 1024 },
    harness: { profiles: [], visibleProfiles: [], profileSearch: emptyOllamaSearch(), profileSearchStatus: emptySearchStatus(), selectedProfileId: null, executables: [], executablesState: 'unchecked', executableRecovery: { actionId: 'refresh-harness-executables', actionLabel: 'Check registered executables', message: 'No privileged harness adapter is packaged.' }, selectedExecutableId: null, selectableModels: [], modelRecovery: { actionId: 'refresh-runtime', actionLabel: 'Recheck local runtime', message: 'An installed local model is required.' }, selectedModel: null, workingDirectory: '', preview: null, status: 'Harness launch is unavailable until a packaged allowlisted runtime adapter is present.', snapshots: [], visibleSnapshots: [], snapshotSearch: emptyOllamaSearch(), snapshotSearchStatus: emptySearchStatus(), restoreStatus: null },
    troubleshooter: { activeHealth: 'missing-or-stopped', branches: [{ health: 'missing-or-stopped', active: true, title: 'Local Ollama is missing or stopped', summary: 'The privileged loopback check could not reach the documented local API.', failingChecks: [], offlineNextStep: 'Install or start Ollama locally, then select Recheck local runtime. No cloud fallback is used.', recheckLabel: 'Recheck local runtime' }] },
  };

  const broadcastOllamaState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(CANONICAL_IPC_CHANNELS.ollamaStateChanged, ollamaState);
  };
  const refreshOllamaRuntime = async (): Promise<void> => {
    ollamaState = { ...ollamaState, busy: true };
    broadcastOllamaState();
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(4_000), redirect: 'error' });
      if (!response.ok) throw new Error(`Local Ollama returned HTTP ${response.status}.`);
      const body = await response.json() as { version?: unknown };
      const version = typeof body.version === 'string' ? body.version.slice(0, 80) : null;
      ollamaState = { ...ollamaState, busy: false, runtime: { health: 'healthy', version, message: 'The documented local Ollama loopback API answered from 127.0.0.1:11434.', nextAction: 'Full model operations remain unavailable until the packaged privileged adapter is present.', failingChecks: ['Packaged model/catalog/queue adapter unavailable.'], checkedAt }, troubleshooter: { ...ollamaState.troubleshooter, activeHealth: 'healthy', branches: [] } };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const branch = { health: 'missing-or-stopped' as const, active: true, title: 'Local Ollama is missing or stopped', summary: 'The privileged loopback check could not reach the documented local API.', failingChecks: [reason], offlineNextStep: 'Install or start Ollama locally, then select Recheck local runtime. No cloud fallback is used.', recheckLabel: 'Recheck local runtime' };
      ollamaState = { ...ollamaState, busy: false, runtime: { health: 'missing-or-stopped', version: null, message: 'The local API is unavailable. No hosted service was substituted.', nextAction: branch.offlineNextStep, failingChecks: [reason], checkedAt }, troubleshooter: { activeHealth: 'missing-or-stopped', branches: [branch] } };
    }
    broadcastOllamaState();
  };

  type TotpMetadata = { id: string; issuer: string; account: string; group: string; vaultRef: string };
  type EncryptedStoreRecord = Record<string, string>;
  const encryptedStore: EncryptedCredentialStore = {
    get: async (ref) => (await readJson<EncryptedStoreRecord>(encryptedStorePath, {}))[ref] ?? null,
    set: async (ref, value) => { const current = await readJson<EncryptedStoreRecord>(encryptedStorePath, {}); await writeJsonAtomic(encryptedStorePath, { ...current, [ref]: value }); },
    delete: async (ref) => { const current = await readJson<EncryptedStoreRecord>(encryptedStorePath, {}); delete current[ref]; await writeJsonAtomic(encryptedStorePath, current); },
  };
  const credentialVault = new SafeStorageCredentialVault(encryptedStore);
  const securityHistory = new LocalGitHistoryService(path.join(securityDirectory, 'history'));

  const recordSecurityHistory = async (action: HistoryAction, summary: string, snapshot: unknown): Promise<HistoryRecord> => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('The operating-system credential vault is unavailable; local history was not recorded.');
    await securityHistory.initialize();
    const at = new Date().toISOString();
    const id = randomUUID();
    const provisional: HistoryRecord = { id, revisionId: id, action, at, actorSurface: 'desktop', summary, redactedDiff: [] };
    const ciphertext = safeStorage.encryptString(JSON.stringify(snapshot));
    let commit = '';
    try { commit = await securityHistory.appendCommit({ message: summary, record: provisional, encryptedSnapshot: ciphertext.toString('base64') }); }
    finally { ciphertext.fill(0); }
    if (!(await securityHistory.containsCommit(commit))) throw new Error('The local history commit could not be independently verified.');
    const record = { ...provisional, revisionId: commit };
    const current = await readJson<HistoryRecord[]>(historyIndexPath, []);
    await writeJsonAtomic(historyIndexPath, [...current, record].slice(-500));
    return record;
  };

  const writeSharedSettings = async (value: CanonicalSharedSettings): Promise<CanonicalWriteResult> => {
    try {
      await mkdir(sharedDataDirectory, { recursive: true });
      const normalized = { ...normalizeCanonicalSharedSettings(value), updatedAt: new Date().toISOString() };
      const temporary = `${sharedSettingsPath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          await rename(temporary, sharedSettingsPath);
          return { ok: true };
        } catch (error) {
          lastError = error;
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') break;
          await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
        }
      }
      await unlink(temporary).catch(() => undefined);
      throw lastError;
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'Shared settings could not be written.' };
    }
  };

  const readSharedSettings = async (): Promise<CanonicalReadResult> => {
    try {
      const raw = await readFile(sharedSettingsPath, 'utf8');
      return { ok: true, settings: normalizeCanonicalSharedSettings(JSON.parse(raw) as unknown) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: true, settings: normalizeCanonicalSharedSettings(null) };
      }
      return { ok: false, reason: error instanceof Error ? error.message : 'Shared settings could not be read.' };
    }
  };
  ipcMain.handle(CANONICAL_IPC_CHANNELS.readSharedSettings, readSharedSettings);
  ipcMain.handle(CANONICAL_IPC_CHANNELS.writeSharedSettings, async (_event, value: CanonicalSharedSettings): Promise<CanonicalWriteResult> => writeSharedSettings(value));
  ipcMain.handle(CANONICAL_IPC_CHANNELS.openApplicationData, async (): Promise<CanonicalWriteResult> => {
    await mkdir(sharedDataDirectory, { recursive: true });
    const reason = await shell.openPath(sharedDataDirectory);
    return reason ? { ok: false, reason } : { ok: true };
  });

  ipcMain.handle(CANONICAL_IPC_CHANNELS.converterPickSource, async (): Promise<CanonicalValueResult<string | null>> => {
    try {
      const options: OpenDialogOptions = { properties: ['openFile'], title: 'Select a source file' };
      const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
      return valueSuccess(result.canceled || !result.filePaths[0] ? null : grantRead(result.filePaths[0]));
    } catch (error) { return valueFailure(error); }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.converterPickDestination, async (_event, suggestedName: unknown): Promise<CanonicalValueResult<string | null>> => {
    try {
      const safeName = path.basename(typeof suggestedName === 'string' ? suggestedName : 'converted-output.bin').slice(0, 180) || 'converted-output.bin';
      const options = { title: 'Choose a conversion destination', defaultPath: safeName };
      const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
      return valueSuccess(result.canceled || !result.filePath ? null : grantWrite(result.filePath));
    } catch (error) { return valueFailure(error); }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.converterInspect, async (_event, sourcePath: unknown) => {
    try {
      if (typeof sourcePath !== 'string') throw new Error('The converter source path is invalid.');
      return valueSuccess(await inspectConverterFile(requireReadGrant(sourcePath)));
    } catch (error) { return valueFailure(error); }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.converterConvert, async (_event, request: CanonicalConverterRequest) => {
    try { return valueSuccess(await convertFile({ ...request, sourcePath: requireReadGrant(request.sourcePath), destinationPath: requireWriteGrant(request.destinationPath), overwriteAuthorized: false })); }
    catch (error) { return valueFailure(error); }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.converterEnqueue, async (_event, requests: readonly CanonicalConverterRequest[]): Promise<CanonicalWriteResult> => {
    try {
      if (!Array.isArray(requests) || requests.length > 250) throw new Error('Add converter queue items in pages of at most 250.');
      await converterQueue.enqueue(requests.map((request) => ({ id: randomUUID(), ...request, sourcePath: requireReadGrant(request.sourcePath), destinationPath: requireWriteGrant(request.destinationPath), addedAt: Date.now() })));
      void converterQueue.start();
      return { ok: true };
    } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.converterQueuePage, async (_event, cursor: unknown, limit: unknown) => {
    try {
      const statuses: ConverterQueueStatus[] = ['queued', 'running', 'paused', 'converted', 'skipped', 'cancelled', 'failed'];
      return valueSuccess(await converterStore.page(statuses, typeof cursor === 'string' ? cursor : null, Number(limit)));
    } catch (error) { return valueFailure(error); }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.converterQueueAction, async (_event, action: CanonicalConverterQueueAction): Promise<CanonicalWriteResult> => {
    try {
      if (action === 'pause') converterQueue.pause();
      else if (action === 'resume') await converterQueue.resume();
      else if (action === 'cancel') await converterQueue.cancel();
      else throw new Error('Unknown converter queue action.');
      return { ok: true };
    } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.converterPdf, async (_event, request: PdfFileOperationRequest) => {
    try {
      const grantedRequest: PdfFileOperationRequest = request.kind === 'merge'
        ? { ...request, sourcePaths: request.sourcePaths.map(requireReadGrant), destinationPath: requireWriteGrant(request.destinationPath) }
        : request.kind === 'split'
          ? { ...request, sourcePath: requireReadGrant(request.sourcePath), destinationPaths: request.destinationPaths.map(requireWriteGrant) }
          : request.kind === 'inspect'
            ? { ...request, sourcePath: requireReadGrant(request.sourcePath) }
            : { ...request, sourcePath: requireReadGrant(request.sourcePath), destinationPath: requireWriteGrant(request.destinationPath) };
      return valueSuccess(await performPdfFileOperation(grantedRequest));
    }
    catch (error) { return valueFailure(error); }
  });

  ipcMain.handle(CANONICAL_IPC_CHANNELS.ollamaSnapshot, async () => valueSuccess(ollamaState));
  ipcMain.handle(CANONICAL_IPC_CHANNELS.ollamaAction, async (_event, action: CanonicalOllamaAction, args: readonly unknown[]) => {
    try {
      if (!Array.isArray(args) || args.length > 8) throw new Error('The local-model action arguments are invalid.');
      if (action === 'refreshRuntime') await refreshOllamaRuntime();
      else if (action === 'selectTab') {
        const tab = args[0];
        if (!['store', 'queue', 'chat', 'harness', 'troubleshooter'].includes(String(tab))) throw new Error('Unknown local-model tab.');
        ollamaState = { ...ollamaState, activeTab: tab as OllamaSuiteState['activeTab'] };
        broadcastOllamaState();
      } else if (action === 'setSearch') {
        const scope = String(args[0]);
        const patch = args[1] && typeof args[1] === 'object' ? args[1] as Partial<OllamaSearchState> : {};
        const merge = (current: OllamaSearchState): OllamaSearchState => ({ ...current, ...patch });
        if (scope === 'catalog') ollamaState = { ...ollamaState, catalog: { ...ollamaState.catalog, search: merge(ollamaState.catalog.search) } };
        else if (scope === 'installed') ollamaState = { ...ollamaState, installedSearch: merge(ollamaState.installedSearch) };
        else if (scope === 'queue') ollamaState = { ...ollamaState, queueSearch: merge(ollamaState.queueSearch) };
        else if (scope === 'chat-history') ollamaState = { ...ollamaState, chat: { ...ollamaState.chat, historySearch: merge(ollamaState.chat.historySearch) } };
        else if (scope === 'harness-profiles') ollamaState = { ...ollamaState, harness: { ...ollamaState.harness, profileSearch: merge(ollamaState.harness.profileSearch) } };
        else if (scope === 'harness-snapshots') ollamaState = { ...ollamaState, harness: { ...ollamaState.harness, snapshotSearch: merge(ollamaState.harness.snapshotSearch) } };
        else throw new Error('Unknown local-model search scope.');
        broadcastOllamaState();
      } else {
        throw new Error(`The packaged privileged adapter does not yet support ${action}; no network, shell, or fake-success fallback was used.`);
      }
      return valueSuccess(undefined);
    } catch (error) { return valueFailure(error); }
  });

  ipcMain.handle(CANONICAL_IPC_CHANNELS.identityInspect, async (_event, value: unknown) => {
    try {
      if (!(value instanceof Uint8Array)) throw new Error('Logo inspection requires local image bytes.');
      return valueSuccess(identityImageService.inspect(value));
    } catch (error) { return valueFailure(error); }
  });

  const readSecuritySnapshot = async (): Promise<CanonicalSecuritySnapshot> => {
    const metadata = await readJson<TotpMetadata[]>(totpMetadataPath, []);
    const history = await readJson<HistoryRecord[]>(historyIndexPath, []);
    return {
      localDataPath: securityDirectory,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      storedTotpEntries: metadata.map(({ vaultRef: _vaultRef, ...entry }) => entry),
      history,
      changelog: [],
      docs: null,
      status: safeStorage.isEncryptionAvailable()
        ? 'The operating-system credential vault and append-only local history adapter are available.'
        : 'The operating-system credential vault is unavailable; secret mutations are disabled.',
    };
  };
  ipcMain.handle(CANONICAL_IPC_CHANNELS.securitySnapshot, async () => {
    try { return valueSuccess(await readSecuritySnapshot()); }
    catch (error) { return valueFailure(error); }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.securityImportTotp, async (_event, request: TotpImportRequest): Promise<CanonicalWriteResult> => {
    try {
      const profile = createManualTotpProfile(request.profile);
      const group = normalizeTotpGroup(request.group);
      const metadata = await readJson<TotpMetadata[]>(totpMetadataPath, []);
      const id = randomUUID();
      const vaultRef = `totp:${id}`;
      await credentialVault.put(vaultRef, JSON.stringify(profile));
      const next = [...metadata, { id, issuer: profile.issuer, account: profile.account, group, vaultRef }];
      await writeJsonAtomic(totpMetadataPath, next);
      await recordSecurityHistory('create', `Added authenticator entry for ${profile.issuer} / ${profile.account}.`, { id, issuer: profile.issuer, account: profile.account, group })
        .catch(() => console.error('Security history append failed after authenticator import; the encrypted live entry was preserved.'));
      return { ok: true };
    } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.securityDeleteTotp, async (_event, ids: readonly string[]): Promise<CanonicalWriteResult> => {
    try {
      if (!Array.isArray(ids) || ids.length > 500 || ids.some((id) => typeof id !== 'string')) throw new Error('Authenticator deletion selection is invalid.');
      const selected = new Set(ids);
      const metadata = await readJson<TotpMetadata[]>(totpMetadataPath, []);
      for (const entry of metadata.filter((item) => selected.has(item.id))) await credentialVault.delete(entry.vaultRef);
      await writeJsonAtomic(totpMetadataPath, metadata.filter((item) => !selected.has(item.id)));
      await recordSecurityHistory('preference-change', `Removed ${selected.size} authenticator entr${selected.size === 1 ? 'y' : 'ies'}.`, { removedIds: [...selected] })
        .catch(() => console.error('Security history append failed after authenticator removal; the live deletion was preserved.'));
      return { ok: true };
    } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.securitySaveSchedule, async (_event, rule: ExtendedScheduleRule): Promise<CanonicalWriteResult> => {
    try {
      await writeJsonAtomic(schedulePath, { version: 1, rules: [rule] });
      await recordSecurityHistory('schedule-change', `Saved scheduled setting ${String(rule.id).slice(0, 80)}.`, { rule })
        .catch(() => console.error('Security history append failed after schedule save; the live schedule was preserved.'));
      return { ok: true };
    } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.securityRestoreHistory, async (): Promise<CanonicalWriteResult> => ({ ok: false, reason: 'Restore requires the dedicated history credential prompt; this adapter does not pretend the restore occurred.' }));
  ipcMain.handle(CANONICAL_IPC_CHANNELS.securityExportText, async (_event, suggestedName: unknown, markdown: unknown): Promise<CanonicalWriteResult> => {
    try {
      if (typeof markdown !== 'string' || markdown.length > 2 * 1024 * 1024) throw new Error('The export text is invalid or exceeds 2 MiB.');
      const safeName = path.basename(typeof suggestedName === 'string' ? suggestedName : 'material-cookie-clicker-export.md').slice(0, 180);
      const options = { title: 'Export local data', defaultPath: safeName || 'material-cookie-clicker-export.md' };
      const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { ok: false, reason: 'Export cancelled.' };
      await writeFile(result.filePath, markdown, { encoding: 'utf8', flag: 'wx' });
      await recordSecurityHistory('export', `Exported ${safeName || 'local data'}.`, { filename: safeName || 'local data', secretsOmitted: true })
        .catch(() => console.error('Security history append failed after export; the exported file was preserved.'));
      return { ok: true };
    } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle(CANONICAL_IPC_CHANNELS.securityOpenDataFolder, async (): Promise<CanonicalWriteResult> => {
    try {
      await mkdir(securityDirectory, { recursive: true });
      const reason = await shell.openPath(securityDirectory);
      return reason ? { ok: false, reason } : { ok: true };
    } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
  });
  watchFile(sharedSettingsPath, { interval: 1_000 }, () => {
    void readSharedSettings().then((result) => {
      if (result.ok && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(CANONICAL_IPC_CHANNELS.sharedSettingsChanged, result.settings);
      }
    });
  });
  app.on('before-quit', () => unwatchFile(sharedSettingsPath));

  ipcMain.handle(DIESEL_IPC_CHANNELS.mint, async (_event, request: DieselMintRequest): Promise<DieselMintResponse> => {
    const litres = Number((request as DieselMintRequest | undefined)?.litres);
    const cookiesSpent = String((request as DieselMintRequest | undefined)?.cookiesSpent ?? '');
    const result = await dieselLedger.mint(litres, cookiesSpent);
    if (!result.ok) return result;
    return { ok: true, voucher: result.voucher, filePath: dieselLedger.filePath };
  });

  ipcMain.handle(DIESEL_IPC_CHANNELS.read, async (): Promise<DieselReadResponse> => {
    const result = await dieselLedger.read();
    if (!result.ok) return result;
    return { ok: true, ledger: result.ledger, filePath: dieselLedger.filePath };
  });

  // Automatic updates against the unsigned Squirrel.Windows feed the release pipeline publishes
  // (see src/shared/game/updates.ts for what Squirrel does and does not guarantee). The service
  // is started unconditionally: in a development checkout it works out that there is no updater
  // behind it, logs that, and publishes an `unsupported` status the notice never renders.
  const verificationFeed = verificationSquirrelFeedUrl(
    process.env[UPDATE_VERIFICATION_FLAG],
    process.env[UPDATE_VERIFICATION_URL],
  );
  const updates = verificationFeed ? new UpdateService(verificationFeed) : new UpdateService();
  const pushStatus = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(UPDATE_IPC_CHANNELS.status, updates.current);
  };
  updates.onStatus(pushStatus);
  ipcMain.on(UPDATE_IPC_CHANNELS.requestStatus, pushStatus);
  ipcMain.on(UPDATE_IPC_CHANNELS.restart, () => updates.restartAndInstall());
  app.on('before-quit', () => updates.stop());
  updates.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.on('closed', () => { mainWindow = null; });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  console.error(`Material Cookie Clicker startup/runtime exception: ${error.message}`);
});
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(`Material Cookie Clicker startup/runtime rejection: ${message}`);
});

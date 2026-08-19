import { useEffect, useMemo, useState, type ReactNode } from 'react';

import type { CanonicalOllamaAction, CanonicalSecuritySnapshot, CanonicalValueResult, PdfFileOperationRequest } from '../../shared/canonical-ipc.js';
import type { MaterialCookieClickerOllamaSuiteService } from '../../shared/ollama-suite-service.js';
import type { OllamaCatalogFacetValues, OllamaChatAttachment, OllamaSearchScope, OllamaSearchState, OllamaSuiteState, OllamaSuiteTab } from '../../shared/ollama-suite-types.js';
import type { TotpImportRequest } from '../../shared/security-totp.js';
import { resolveDisplayName, type ElementAppearanceTarget, type RainbowSpeedLevel } from '../../shared/identity-model.js';
import { useAppSettings } from '../game/AppSettingsContext.js';
import { CanonicalNarrator } from '../components/CanonicalNarrator.js';
import { CanonicalNotificationCenter } from '../components/CanonicalNotifications.js';
import { CanonicalTabs, type CanonicalPage } from '../components/CanonicalTabs.js';
import { CanonicalVocabulary } from '../components/CanonicalVocabulary.js';
import { bilingualText } from '../game/copy.js';
import { FileConverterScreen, type FileConverterHost } from '../tools/converter/index.js';
import { AppearanceEditor, type ProductAppearanceStore } from '../tools/identity/AppearanceEditor.js';
import { IdentityAppearancePanel } from '../tools/identity/IdentityAppearancePanel.js';
import { OllamaSuiteScreen } from '../tools/ollama/OllamaSuiteScreen.js';
import { SecurityStateToolsPanel } from '../tools/security/StateToolsPanels.js';
import { TotpAuthenticatorPanel } from '../tools/security/TotpAuthenticatorPanel.js';

export interface ApplicationToolsScreenProps {
  readonly converter?: ReactNode;
  readonly ollama?: ReactNode;
  readonly identity?: ReactNode;
  readonly security?: ReactNode;
  readonly teleportTarget?: string | null;
}

async function unwrap<T>(result: Promise<CanonicalValueResult<T>>): Promise<T> {
  const settled = await result;
  if (!settled.ok) throw new Error(settled.reason);
  return settled.value;
}

function converterHost(): FileConverterHost {
  const api = window.materialCookieClicker.canonical.converter;
  return {
    pickSource: () => unwrap(api.pickSource()),
    pickDestination: (suggestedName) => unwrap(api.pickDestination(suggestedName)),
    inspect: (sourcePath) => unwrap(api.inspect(sourcePath)),
    convert: (request) => unwrap(api.convert(request)),
    enqueue: async (items) => { const result = await api.enqueue(items); if (!result.ok) throw new Error(result.reason); },
    queuePage: (cursor, limit) => unwrap(api.queuePage(cursor, limit)),
    pauseQueue: async () => { const result = await api.queueAction('pause'); if (!result.ok) throw new Error(result.reason); },
    resumeQueue: async () => { const result = await api.queueAction('resume'); if (!result.ok) throw new Error(result.reason); },
    cancelQueue: async () => { const result = await api.queueAction('cancel'); if (!result.ok) throw new Error(result.reason); },
  };
}

function parseNumbers(value: string): number[] {
  return value.split(',').map((part) => Number(part.trim())).filter((part) => Number.isInteger(part));
}

function PdfOperationsPanel() {
  const api = window.materialCookieClicker.canonical.converter;
  const [kind, setKind] = useState<PdfFileOperationRequest['kind']>('inspect');
  const [sources, setSources] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [numbers, setNumbers] = useState('0');
  const [metadataTitle, setMetadataTitle] = useState('');
  const [status, setStatus] = useState('Select PDF sources and destinations with the application pickers.');
  const [busy, setBusy] = useState(false);
  async function addSource(): Promise<void> { try { const selected = await unwrap(api.pickSource()); if (selected) setSources((current) => [...current, selected]); } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); } }
  async function addDestination(): Promise<void> { try { const selected = await unwrap(api.pickDestination('converted.pdf')); if (selected) setDestinations((current) => [...current, selected]); } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); } }
  async function run(): Promise<void> {
    if (busy || sources.length === 0) return;
    setBusy(true);
    try {
      const values = parseNumbers(numbers);
      let request: PdfFileOperationRequest;
      if (kind === 'inspect') request = { kind, sourcePath: sources[0]! };
      else if (kind === 'merge') request = { kind, sourcePaths: sources, destinationPath: destinations[0]! };
      else if (kind === 'split') request = { kind, sourcePath: sources[0]!, destinationPaths: destinations, groups: values.map((page) => [page]) };
      else if (kind === 'extract') request = { kind, sourcePath: sources[0]!, destinationPath: destinations[0]!, pages: values };
      else if (kind === 'reorder') request = { kind, sourcePath: sources[0]!, destinationPath: destinations[0]!, order: values };
      else if (kind === 'rotate') request = { kind, sourcePath: sources[0]!, destinationPath: destinations[0]!, rotations: values.map((pageIndex) => ({ pageIndex, degrees: 90 })) };
      else request = { kind, sourcePath: sources[0]!, destinationPath: destinations[0]!, metadata: { title: metadataTitle } };
      const outcome = await unwrap(api.pdf(request));
      const failed = outcome.outputs.find((output) => output.status === 'failed');
      if (failed) throw new Error(failed.message);
      setStatus(`${outcome.operation}: ${outcome.inspection.pageCount} page(s); ${outcome.outputs.length} validated output(s).`);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const needsDestination = kind !== 'inspect';
  const needsNumbers = ['extract', 'split', 'reorder', 'rotate'].includes(kind);
  const destinationReady = !needsDestination || (kind === 'split' ? destinations.length > 0 : Boolean(destinations[0]));
  return <section id="canonical-pdf-tools" className="canonical-tool-card" aria-labelledby="canonical-pdf-tools-title">
    <h3 id="canonical-pdf-tools-title">Dedicated PDF operations · 專用 PDF 操作</h3>
    <p>Inspect, merge, split, extract, reorder, rotate, and metadata writes use the privileged bounded PDF service. Outputs are reopened and validated before success is reported.</p>
    <label>Operation<select value={kind} onChange={(event) => setKind(event.target.value as PdfFileOperationRequest['kind'])}>{(['inspect', 'merge', 'split', 'extract', 'reorder', 'rotate', 'metadata'] as const).map((operation) => <option key={operation}>{operation}</option>)}</select></label>
    <div className="canonical-tools-actions"><button type="button" disabled={busy} onClick={() => void addSource()}>Add PDF source…</button><button type="button" disabled={busy || !needsDestination} onClick={() => void addDestination()}>Add destination…</button><button type="button" onClick={() => { setSources([]); setDestinations([]); }}>Clear selections</button></div>
    <p>{sources.length} source(s) · {destinations.length} destination(s)</p>
    {needsNumbers ? <label>Zero-based page numbers, comma separated<input value={numbers} onChange={(event) => setNumbers(event.target.value)} /></label> : null}
    {kind === 'metadata' ? <label>PDF title<input value={metadataTitle} onChange={(event) => setMetadataTitle(event.target.value)} /></label> : null}
    <button type="button" disabled={busy || sources.length === 0 || !destinationReady || (kind === 'merge' && sources.length < 2)} onClick={() => void run()}>Run PDF operation</button>
    <p role="status">{status}</p>
  </section>;
}

function unavailableOllamaState(): OllamaSuiteState {
  const search = (): OllamaSearchState => ({ query: '', regex: false, pattern: '', flags: '', sample: '', builderOpen: false });
  const searchStatus = () => ({ description: 'No search term entered.', error: null, sampleFeedback: 'Enter a pattern to inspect it.', totalCount: 0, visibleCount: 0 });
  return {
    activeTab: 'troubleshooter', busy: false,
    runtime: { health: 'missing-or-stopped', version: null, message: 'Waiting for the privileged local runtime check.', nextAction: 'Recheck local runtime.', failingChecks: [], checkedAt: null },
    catalog: { snapshot: null, variants: [], visibleVariants: [], search: search(), searchStatus: searchStatus(), facets: { families: [], capabilities: [], quantizations: [] }, selectedFacets: { families: [], capabilities: [], quantizations: [] }, refreshState: 'unavailable', refreshMessage: 'No verified packaged catalog is available.' },
    installed: [], visibleInstalled: [], installedSearch: search(), installedSearchStatus: searchStatus(), running: [], fitByReference: {}, queue: [], visibleQueue: [], queueSearch: search(), queueSearchStatus: searchStatus(),
    cart: { references: [], totalBytes: null, requiredFreeBytes: null, freeBytes: null, blockers: ['Privileged pull adapter unavailable.'], disclosure: 'Local model pulls only; no payment or cloud entitlement.' },
    chat: { sessionId: null, model: '', selectableModels: [], modelRecovery: null, systemPrompt: '', transcript: [], visibleTranscript: [], historySearch: search(), historySearchStatus: searchStatus(), streamingText: '', sending: false, error: null, attachmentsSupported: false, attachmentSupportReason: 'Choose a verified installed model first.', attachmentError: null, maxAttachmentBytes: 8 * 1024 * 1024 },
    harness: { profiles: [], visibleProfiles: [], profileSearch: search(), profileSearchStatus: searchStatus(), selectedProfileId: null, executables: [], executablesState: 'unchecked', executableRecovery: null, selectedExecutableId: null, selectableModels: [], modelRecovery: null, selectedModel: null, workingDirectory: '', preview: null, status: 'No packaged allowlisted harness adapter is available.', snapshots: [], visibleSnapshots: [], snapshotSearch: search(), snapshotSearchStatus: searchStatus(), restoreStatus: null },
    troubleshooter: { activeHealth: 'missing-or-stopped', branches: [] },
  };
}

class RendererOllamaProxy implements MaterialCookieClickerOllamaSuiteService {
  #state = unavailableOllamaState();
  #listeners = new Set<(state: OllamaSuiteState) => void>();
  #off: (() => void) | null = null;
  snapshot(): OllamaSuiteState { return structuredClone(this.#state); }
  subscribe(listener: (state: OllamaSuiteState) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  #update(state: OllamaSuiteState): void { this.#state = structuredClone(state); for (const listener of this.#listeners) listener(this.snapshot()); }
  async #invoke(action: CanonicalOllamaAction, ...args: unknown[]): Promise<unknown> { const result = await window.materialCookieClicker.canonical.ollama.invoke(action, args); if (!result.ok) throw new Error(result.reason); return result.value; }
  #invokeDetached(action: CanonicalOllamaAction, ...args: unknown[]): void {
    void this.#invoke(action, ...args).catch((error) => this.#update({
      ...this.#state,
      runtime: { ...this.#state.runtime, message: error instanceof Error ? error.message : String(error) },
    }));
  }
  async initialize(): Promise<void> { const initial = await unwrap(window.materialCookieClicker.canonical.ollama.snapshot()); this.#update(initial); this.#off ??= window.materialCookieClicker.canonical.ollama.onState((state) => this.#update(state)); }
  dispose(): void { this.#off?.(); this.#off = null; this.#listeners.clear(); }
  selectTab(tab: OllamaSuiteTab): void { this.#update({ ...this.#state, activeTab: tab }); this.#invokeDetached('selectTab', tab); }
  refreshRuntime(): Promise<void> { return this.#invoke('refreshRuntime').then(() => undefined); }
  refreshCatalog(): Promise<void> { return this.#invoke('refreshCatalog').then(() => undefined); }
  setSearch(scope: OllamaSearchScope, patch: Partial<OllamaSearchState>): void { this.#invokeDetached('setSearch', scope, patch); }
  setCatalogFacets(selection: Partial<OllamaCatalogFacetValues>): void { this.#invokeDetached('setCatalogFacets', selection); }
  enqueuePull(reference: string): Promise<void> { return this.#invoke('enqueuePull', reference).then(() => undefined); }
  addToCart(reference: string): Promise<void> { return this.#invoke('addToCart', reference).then(() => undefined); }
  removeFromCart(reference: string): Promise<void> { return this.#invoke('removeFromCart', reference).then(() => undefined); }
  clearCart(): Promise<void> { return this.#invoke('clearCart').then(() => undefined); }
  commitCart(): Promise<void> { return this.#invoke('commitCart').then(() => undefined); }
  pauseQueue(): void { this.#invokeDetached('pauseQueue'); }
  resumeQueue(): Promise<void> { return this.#invoke('resumeQueue').then(() => undefined); }
  cancelPull(id: string): Promise<void> { return this.#invoke('cancelPull', id).then(() => undefined); }
  retryPull(id: string): Promise<void> { return this.#invoke('retryPull', id).then(() => undefined); }
  copyModel(source: string, destination: string): Promise<void> { return this.#invoke('copyModel', source, destination).then(() => undefined); }
  deleteModel(reference: string): Promise<void> { return this.#invoke('deleteModel', reference).then(() => undefined); }
  selectChatModel(reference: string): void { this.#invokeDetached('selectChatModel', reference); }
  sendChat(input: { model: string; systemPrompt: string; content: string; attachments: OllamaChatAttachment[]; containsTaxData: boolean; reviewedTaxData: boolean }): Promise<void> { return this.#invoke('sendChat', input).then(() => undefined); }
  stopChat(): void { this.#invokeDetached('stopChat'); }
  selectHarnessProfile(profileId: string): void { this.#invokeDetached('selectHarnessProfile', profileId); }
  refreshHarnessExecutables(): Promise<void> { return this.#invoke('refreshHarnessExecutables').then(() => undefined); }
  selectHarnessExecutable(executableId: string): void { this.#invokeDetached('selectHarnessExecutable', executableId); }
  selectHarnessModel(reference: string): void { this.#invokeDetached('selectHarnessModel', reference); }
  chooseWorkingDirectory(): Promise<string | null> { return this.#invoke('chooseWorkingDirectory').then((value) => typeof value === 'string' ? value : null); }
  previewHarness(input: { profileId: string; executableId: string; workingDirectory: string; model: string }): Promise<void> { return this.#invoke('previewHarness', input).then(() => undefined); }
  launchHarness(): Promise<void> { return this.#invoke('launchHarness').then(() => undefined); }
  refreshHarnessSnapshots(): Promise<void> { return this.#invoke('refreshHarnessSnapshots').then(() => undefined); }
  restoreHarnessSnapshot(snapshotId: string): Promise<void> { return this.#invoke('restoreHarnessSnapshot', snapshotId).then(() => undefined); }
}

function IntegratedConverter() { const host = useMemo(converterHost, []); return <div id="canonical-converter"><FileConverterScreen host={host} /><PdfOperationsPanel /></div>; }
function IntegratedOllama() { const service = useMemo(() => new RendererOllamaProxy(), []); return <div id="canonical-ollama"><OllamaSuiteScreen service={service} disposeOnUnmount /></div>; }

const APPLICATION_TOOLS_TARGET: ElementAppearanceTarget = {
  id: 'application-tools',
  label: 'Application tools',
  kind: 'panel',
  properties: ['fontFamily', 'fontSize', 'textColor', 'surfaceColor', 'borderColor', 'radius', 'padding', 'gap', 'elevation'],
};
function IntegratedIdentity() {
  const { settings, updateSettings } = useAppSettings();
  const [appearance, setAppearance] = useState<ProductAppearanceStore>(() => { try { return JSON.parse(localStorage.getItem('material-cookie-clicker:product-appearance:v1') ?? '{}') as ProductAppearanceStore; } catch { return {}; } });
  const [rainbowSpeed, setRainbowSpeed] = useState<RainbowSpeedLevel>(3);
  const [editorOpen, setEditorOpen] = useState(false);
  const commitAppearance = (next: ProductAppearanceStore) => { setAppearance(next); localStorage.setItem('material-cookie-clicker:product-appearance:v1', JSON.stringify(next)); };
  return <div id="canonical-identity"><IdentityAppearancePanel onChange={(value) => updateSettings({ displayName: resolveDisplayName(value) })} initialValue={{ version: 1, displayName: settings.displayName, logo: { kind: 'preset', presetId: 'classic-cookie' } }} /><div id="canonical-appearance"><button type="button" onClick={() => setEditorOpen(true)}>Edit application-tools appearance…</button>{editorOpen ? <AppearanceEditor target={APPLICATION_TOOLS_TARGET} store={appearance} installedFonts={[{ stableId: 'system-ui', displayName: 'System UI' }]} reducedMotion={matchMedia('(prefers-reduced-motion: reduce)').matches} rainbowSpeed={rainbowSpeed} onChange={commitAppearance} onRainbowSpeedChange={setRainbowSpeed} onClose={() => setEditorOpen(false)} /> : null}</div></div>;
}

function IntegratedSecurity() {
  const { settings } = useAppSettings();
  const [snapshot, setSnapshot] = useState<CanonicalSecuritySnapshot | null>(null);
  const [status, setStatus] = useState('Loading the privileged local security state…');
  const reload = async () => { try { const next = await unwrap(window.materialCookieClicker.canonical.security.snapshot()); setSnapshot(next); setStatus(next.status); } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); } };
  useEffect(() => { void reload(); }, []);
  const write = async (operation: Promise<{ ok: true } | { ok: false; reason: string }>) => { const result = await operation; if (!result.ok) throw new Error(result.reason); await reload(); };
  return <div id="canonical-security"><section className="canonical-tool-card" aria-labelledby="canonical-security-status-title"><h3 id="canonical-security-status-title">Credential vault status · 憑證保管庫狀態</h3><p role="status">{status}</p><p>{snapshot?.storedTotpEntries.length ?? 0} stored authenticator entr{snapshot?.storedTotpEntries.length === 1 ? 'y' : 'ies'}; secret values never cross the preload boundary.</p></section><div id="canonical-authenticator"><TotpAuthenticatorPanel languageMode={settings.schoolMode ? 'en' : settings.languageMode} onImport={(request: TotpImportRequest) => write(window.materialCookieClicker.canonical.security.importTotp(request))} /></div>{snapshot ? <div id="canonical-history"><SecurityStateToolsPanel showAuthenticator={false} localDataPath={snapshot.localDataPath} timeZone={snapshot.timeZone} history={snapshot.history} changelog={snapshot.changelog} docs={snapshot.docs} onOpenFolder={() => { void write(window.materialCookieClicker.canonical.security.openDataFolder()).catch((error) => setStatus(error.message)); }} onSaveSchedule={(rule) => { void write(window.materialCookieClicker.canonical.security.saveSchedule(rule)).catch((error) => setStatus(error.message)); }} onRestore={(revisionId) => { void write(window.materialCookieClicker.canonical.security.restoreHistory(revisionId)).catch((error) => setStatus(error.message)); }} onExport={(markdown) => { void write(window.materialCookieClicker.canonical.security.exportText('material-cookie-clicker-changelog.md', markdown)).catch((error) => setStatus(error.message)); }} /></div> : null}</div>;
}

function LocalStatusSurface() {
  const { settings } = useAppSettings();
  const [heartbeat, setHeartbeat] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setHeartbeat(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  return <section id="canonical-status" className="canonical-tool-card" aria-labelledby="canonical-status-title"><h3 id="canonical-status-title">{bilingualText({ en: 'Local Status Hub', yue: '本機狀態中心' })}</h3><p>{bilingualText({ en: 'This local surface reports current application state. It does not claim delivery to an external status service.', yue: '呢個本機畫面顯示而家嘅應用程式狀態，唔會聲稱已傳送去外部狀態服務。' })}</p><dl className="canonical-status-grid"><div><dt>State</dt><dd>✅ running</dd></div><div><dt>Last heartbeat</dt><dd><time dateTime={heartbeat.toISOString()}>{heartbeat.toLocaleString()}</time></dd></div><div><dt>Language</dt><dd>{settings.schoolMode ? `English (${settings.schoolModeName})` : settings.languageMode}</dd></div><div><dt>English funny level</dt><dd>{settings.funnyLevelEn}</dd></div><div><dt>Cantonese funny level</dt><dd>{settings.schoolMode ? 'suppressed' : settings.funnyLevelYue}</dd></div><div><dt>Narrator</dt><dd>{settings.narrator.enabled ? 'enabled' : 'off'}</dd></div><div><dt>Vocabulary</dt><dd>{settings.schoolMode ? 'suppressed' : settings.personalVocabulary ? `${Object.keys(settings.personalVocabulary.replacements).length} local replacements` : 'original wording'}</dd></div><div><dt>Notifications</dt><dd>persisted local centre</dd></div></dl></section>;
}

function NavigationSurface() { return <section id="canonical-navigation" className="canonical-tool-card" aria-labelledby="canonical-navigation-title"><h3 id="canonical-navigation-title">{bilingualText({ en: 'Application navigation', yue: '應用程式導覽' })}</h3><p>{bilingualText({ en: 'The surrounding browser-style strip is the live control: dock it to any edge, pin tabs, create and rename groups, search at all four scopes, or preview a bulk close.', yue: '外圍嘅瀏覽器式分頁列係真控制：可以泊去任何邊、釘住分頁、建立同改名群組、用四個範圍搜尋，或者預覽批量關閉。' })}</p></section>; }

function pageForTarget(target: string | null | undefined): string {
  if (!target) return 'general';
  if (target.includes('converter') || target.includes('pdf')) return 'converter';
  if (target.includes('ollama')) return 'ollama';
  if (target.includes('identity') || target.includes('appearance')) return 'identity';
  if (target.includes('security') || target.includes('authenticator') || target.includes('history')) return 'security';
  if (target.includes('vocabulary')) return 'privacy';
  if (target.includes('narrator')) return 'narration';
  if (target.includes('notification')) return 'notifications';
  if (target.includes('status')) return 'status';
  return 'general';
}

export function ApplicationToolsScreen({ converter, ollama, identity, security, teleportTarget = null }: ApplicationToolsScreenProps = {}) {
  const { settings, updateSettings } = useAppSettings();
  const pages: CanonicalPage[] = [
    { id: 'general', label: bilingualText({ en: 'Navigation', yue: '導覽' }), detail: 'Dock, pin, group, search, and bulk-close tabs.', content: <NavigationSurface /> },
    { id: 'narration', label: bilingualText({ en: 'Narrator', yue: '旁白' }), detail: 'Voices, language, rate, pitch, and spoken preview.', content: <CanonicalNarrator /> },
    { id: 'notifications', label: bilingualText({ en: 'Notifications', yue: '通知' }), detail: 'Review and manage persisted non-blocking notices.', content: <CanonicalNotificationCenter /> },
    { id: 'status', label: bilingualText({ en: 'Status', yue: '狀態' }), detail: 'Current local application state and heartbeat.', content: <LocalStatusSurface /> },
    { id: 'converter', label: bilingualText({ en: 'Converter', yue: '轉換器' }), detail: 'Local categorized file and PDF conversion.', content: converter ?? <IntegratedConverter /> },
    { id: 'ollama', label: 'Ollama', detail: 'Privileged local-runtime recovery and explicitly available model operations.', content: ollama ?? <IntegratedOllama /> },
    { id: 'identity', label: bilingualText({ en: 'Identity', yue: '身份與外觀' }), detail: 'Display name, application mark, and per-element appearance.', content: identity ?? <IntegratedIdentity /> },
    { id: 'security', label: bilingualText({ en: 'Security tools', yue: '安全工具' }), detail: 'Credential vault, authenticator, local history, schedules, exports, and recovery.', content: security ?? <IntegratedSecurity /> },
  ];
  if (!settings.schoolMode) pages.splice(2, 0, { id: 'privacy', label: bilingualText({ en: 'Vocabulary', yue: '詞彙' }), detail: 'Private local vocabulary upload, replace, and clear.', content: <CanonicalVocabulary /> });
  const targetPage = pageForTarget(teleportTarget);
  const targetWasClosed = settings.tabs.closedIds.includes(targetPage);
  useEffect(() => {
    if (!teleportTarget || !targetWasClosed) return;
    updateSettings({ tabs: { ...settings.tabs, closedIds: settings.tabs.closedIds.filter((id) => id !== targetPage) } });
  }, [settings.tabs, targetPage, targetWasClosed, teleportTarget, updateSettings]);
  const ordered = [...pages].sort((left, right) => left.id === targetPage ? -1 : right.id === targetPage ? 1 : 0);
  return <CanonicalTabs key={`${targetPage}:${targetWasClosed ? 'reopening' : 'open'}`} pages={ordered} />;
}

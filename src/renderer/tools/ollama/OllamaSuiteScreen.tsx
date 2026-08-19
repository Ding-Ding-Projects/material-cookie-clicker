import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import type { MaterialCookieClickerOllamaSuiteService } from '../../../shared/ollama-suite-service.js';
import {
  OLLAMA_SUITE_TABS,
  applyOllamaRecovery,
  formatOllamaBytes,
  summarizeOllamaRuntime,
  type OllamaCatalogFacetValues,
  type OllamaChatAttachment,
  type OllamaHardwareFitAssessment,
  type OllamaSearchScope,
  type OllamaSuiteState,
  type OllamaSuiteTab,
} from '../../../shared/ollama-suite-types.js';
import { SearchWithRegexBuilder } from '../../components/SearchWithRegexBuilder.js';
import { fitTone, modelIsRunning, sortCatalogVariants, type CatalogSort } from './model-view.js';
import './ollama-suite.css';

const EN_YUE = (en: string, yue: string) => ({ en, yue });

type Notice = { id: number; kind: 'info' | 'error'; text: string };

export interface OllamaSuiteScreenProps {
  readonly service: MaterialCookieClickerOllamaSuiteService;
  readonly disposeOnUnmount?: boolean;
}

function SearchField({
  scope,
  state,
  service,
  label,
}: {
  scope: OllamaSearchScope;
  state: OllamaSuiteState;
  service: MaterialCookieClickerOllamaSuiteService;
  label: string;
}) {
  const search = (() => {
    switch (scope) {
      case 'catalog': return state.catalog.search;
      case 'installed': return state.installedSearch;
      case 'queue': return state.queueSearch;
      case 'chat-history': return state.chat.historySearch;
      case 'harness-profiles': return state.harness.profileSearch;
      case 'harness-snapshots': return state.harness.snapshotSearch;
    }
  })();

  return (
    <SearchWithRegexBuilder
      idPrefix={`ollama-${scope}`}
      state={search}
      onChange={(next) => service.setSearch(scope, next)}
      placeholder={EN_YUE(label, `${label}（本機）`)}
      ariaLabel={EN_YUE(label, `${label}（本機）`)}
    />
  );
}

function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="ollama-empty" role="status">
      <p>{children}</p>
      {action}
    </div>
  );
}

function FitEvidence({ assessment }: { assessment: OllamaHardwareFitAssessment | undefined }) {
  if (!assessment) return <span className="ollama-chip ollama-chip--unknown">Unknown</span>;
  return (
    <details className={`ollama-fit ollama-fit--${fitTone(assessment)}`}>
      <summary>
        <span>{assessment.verdict}</span>
        <span>{assessment.reasons[0]}</span>
      </summary>
      <dl>
        <div><dt>Assessed</dt><dd>{assessment.assessedAt}</dd></div>
        <div><dt>System RAM</dt><dd>{formatOllamaBytes(assessment.evidence.systemRamBytes)}</dd></div>
        <div><dt>Available RAM</dt><dd>{formatOllamaBytes(assessment.evidence.availableRamBytes)}</dd></div>
        <div><dt>GPU</dt><dd>{assessment.evidence.gpuModel ?? 'Not detected'}</dd></div>
        <div><dt>Usable VRAM</dt><dd>{formatOllamaBytes(assessment.evidence.usableVramBytes)}</dd></div>
        <div><dt>Driver/backend</dt><dd>{assessment.evidence.driverBackend ?? 'Unknown'}</dd></div>
        <div><dt>Free storage</dt><dd>{formatOllamaBytes(assessment.evidence.destinationFreeBytes)}</dd></div>
        <div><dt>Model blob</dt><dd>{formatOllamaBytes(assessment.evidence.blobSizeBytes)}</dd></div>
        <div><dt>Parameters</dt><dd>{assessment.evidence.parameterCount?.toLocaleString() ?? 'Unknown'}</dd></div>
        <div><dt>Quantization</dt><dd>{assessment.evidence.quantization ?? 'Unknown'}</dd></div>
        <div><dt>Context</dt><dd>{assessment.evidence.contextLength?.toLocaleString() ?? 'Unknown'}</dd></div>
        <div><dt>Estimated RAM</dt><dd>{formatOllamaBytes(assessment.estimatedRamBytes)}</dd></div>
        <div><dt>Additional storage</dt><dd>{formatOllamaBytes(assessment.estimatedAdditionalDiskBytes)}</dd></div>
      </dl>
      <ul>{assessment.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      <p className="ollama-muted">{assessment.assumptions.join(' ')}</p>
    </details>
  );
}

function InstalledModelActions({
  reference,
  service,
  run,
}: {
  reference: string;
  service: MaterialCookieClickerOllamaSuiteService;
  run: (label: string, operation: () => Promise<void>) => void;
}) {
  const [copyName, setCopyName] = useState(`${reference}-copy`);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [keyOne, setKeyOne] = useState(false);
  const [keyTwo, setKeyTwo] = useState(false);
  const [completion, setCompletion] = useState(0);
  const ready = keyOne && keyTwo && completion === 100;

  function resetDelete(): void {
    setDeleteOpen(false);
    setKeyOne(false);
    setKeyTwo(false);
    setCompletion(0);
  }

  return (
    <div className="ollama-model-actions">
      <details>
        <summary>Copy model</summary>
        <label>
          Destination model name
          <input value={copyName} onChange={(event) => setCopyName(event.target.value)} />
        </label>
        <button type="button" disabled={!copyName.trim()} onClick={() => run('Copy local model', () => service.copyModel(reference, copyName))}>Copy model</button>
      </details>
      <button type="button" className="ollama-danger" onClick={() => setDeleteOpen(true)}>Remove local model…</button>
      {deleteOpen ? (
        <section className="ollama-delete-gate" aria-labelledby={`ollama-delete-${reference}`}>
          <h3 id={`ollama-delete-${reference}`}>Remove {reference}</h3>
          <p>This removes the local model from this computer. Pull it again to restore it.</p>
          <label><input type="checkbox" checked={keyOne} onChange={(event) => setKeyOne(event.target.checked)} /> Key one: I selected the exact model named above.</label>
          <label><input type="checkbox" checked={keyTwo} onChange={(event) => setKeyTwo(event.target.checked)} /> Key two: I understand this removes the local model data.</label>
          <label>
            Completion slider: {completion}%
            <input type="range" min={0} max={100} step={1} value={completion} disabled={!keyOne || !keyTwo} onChange={(event) => setCompletion(Number(event.target.value))} />
          </label>
          <progress max={100} value={completion} aria-label="Removal confirmation progress" />
          <div className="ollama-actions">
            <button type="button" onClick={resetDelete}>Emergency exit</button>
            <button
              type="button"
              className="ollama-danger"
              disabled={!ready}
              onClick={() => run('Remove local model', async () => { await service.deleteModel(reference); resetDelete(); })}
            >
              Remove {reference}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function FacetGroup({
  name,
  values,
  selected,
  onChange,
}: {
  name: keyof OllamaCatalogFacetValues;
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const label = name === 'families' ? 'Families' : name === 'capabilities' ? 'Capabilities' : 'Quantizations';
  return (
    <details className="ollama-facet">
      <summary>{label} · {selected.length ? `${selected.length} selected` : 'Any'}</summary>
      <div className="ollama-check-grid" role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
        {values.length === 0 ? <span className="ollama-muted">No verified values are available yet.</span> : values.map((value) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={(event) => onChange(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))}
            />
            {value}
          </label>
        ))}
      </div>
    </details>
  );
}

function ModelStore({
  state,
  service,
  run,
}: {
  state: OllamaSuiteState;
  service: MaterialCookieClickerOllamaSuiteService;
  run: (label: string, operation: () => Promise<void>) => void;
}) {
  const [sort, setSort] = useState<CatalogSort>('reference');
  const variants = useMemo(
    () => sortCatalogVariants(state.catalog.visibleVariants, sort, state.fitByReference),
    [sort, state.catalog.visibleVariants, state.fitByReference],
  );
  const snapshot = state.catalog.snapshot;

  return (
    <div className="ollama-stack">
      <section className="ollama-card ollama-status-card" aria-labelledby="ollama-catalog-status">
        <div>
          <h2 id="ollama-catalog-status">Official model catalog</h2>
          <p className="ollama-muted">Every model and published tag is followed through the verified official catalog pages. This is not a curated list.</p>
        </div>
        <button type="button" disabled={state.catalog.refreshState === 'refreshing'} onClick={() => run('Catalog refresh', () => service.refreshCatalog())}>
          {state.catalog.refreshState === 'refreshing' ? 'Refreshing every page…' : 'Refresh complete catalog'}
        </button>
        <dl className="ollama-inline-facts">
          <div><dt>State</dt><dd>{state.catalog.refreshState}</dd></div>
          <div><dt>Refreshed</dt><dd>{snapshot?.refreshedAt ?? 'Never'}</dd></div>
          <div><dt>Source identity</dt><dd>{snapshot?.sourceIdentity ?? 'Unavailable'}</dd></div>
          <div><dt>Pages</dt><dd>{snapshot ? `${snapshot.modelPageCount} model · ${snapshot.tagPageCount} tag` : 'Unavailable'}</dd></div>
          <div><dt>Completeness</dt><dd>{snapshot?.complete ? 'Complete' : 'Not verified complete'}</dd></div>
          <div><dt>Variants</dt><dd>{snapshot?.variantCount ?? 0}</dd></div>
        </dl>
        {state.catalog.refreshMessage ? <p role="status">{state.catalog.refreshMessage}</p> : null}
      </section>

      <section className="ollama-card" aria-labelledby="ollama-installed-title">
        <h2 id="ollama-installed-title">Installed and running models</h2>
        <SearchField scope="installed" state={state} service={service} label="Search installed models" />
        {state.visibleInstalled.length === 0 ? (
          <EmptyState>No installed model matches this search. Refresh the local runtime or browse the model store.</EmptyState>
        ) : (
          <ul className="ollama-model-list">
            {state.visibleInstalled.map((model) => (
              <li key={model.reference}>
                <div><strong>{model.reference}</strong><span>{formatOllamaBytes(model.sizeBytes)} · {model.quantization ?? 'quantization unknown'}</span></div>
                <span className={`ollama-chip ${modelIsRunning(model, state.running) ? 'ollama-chip--good' : ''}`}>
                  {modelIsRunning(model, state.running) ? 'Running' : 'Installed'}
                </span>
                <FitEvidence assessment={state.fitByReference[model.reference]} />
                <InstalledModelActions reference={model.reference} service={service} run={run} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ollama-card" aria-labelledby="ollama-store-list-title">
        <h2 id="ollama-store-list-title">All verified variants</h2>
        <SearchField scope="catalog" state={state} service={service} label="Search every official model and tag" />
        <div className="ollama-toolbar" role="group" aria-label="Catalog sorting">
          {([
            ['reference', 'Name'],
            ['size-smallest', 'Smallest'],
            ['size-largest', 'Largest'],
            ['fit', 'Best fit'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>{label}</button>
          ))}
        </div>
        <div className="ollama-facets">
          {(['families', 'capabilities', 'quantizations'] as const).map((name) => (
            <FacetGroup
              key={name}
              name={name}
              values={state.catalog.facets[name]}
              selected={state.catalog.selectedFacets[name]}
              onChange={(next) => service.setCatalogFacets({ [name]: next })}
            />
          ))}
        </div>
        <p role="status">Showing {variants.length} of {state.catalog.variants.length} verified variants.</p>
        {variants.length === 0 ? (
          <EmptyState>
            {snapshot ? 'No variant matches the current search and facets.' : 'Refresh the official catalog to populate every model and tag.'}
          </EmptyState>
        ) : (
          <ul className="ollama-variant-grid">
            {variants.map((variant) => {
              const installed = state.installed.some((model) => model.reference === variant.reference);
              const inCart = state.cart.references.includes(variant.reference);
              return (
                <li key={variant.reference}>
                  <div className="ollama-variant-heading">
                    <strong>{variant.displayLabel}</strong>
                    <span>{variant.reference}</span>
                  </div>
                  <dl>
                    <div><dt>Size</dt><dd>{formatOllamaBytes(variant.sizeBytes)}</dd></div>
                    <div><dt>Parameters</dt><dd>{variant.parameterSize ?? 'Unknown'}</dd></div>
                    <div><dt>Quantization</dt><dd>{variant.quantization ?? 'Unknown'}</dd></div>
                    <div><dt>Capabilities</dt><dd>{variant.capabilities.join(', ') || 'Not reported'}</dd></div>
                  </dl>
                  <FitEvidence assessment={state.fitByReference[variant.reference]} />
                  <button
                    type="button"
                    disabled={installed}
                    onClick={() => run(inCart ? 'Remove from cart' : 'Add to cart', () => inCart ? service.removeFromCart(variant.reference) : service.addToCart(variant.reference))}
                  >
                    {installed ? 'Installed' : inCart ? 'Remove from pull cart' : 'Add to pull cart'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="ollama-card ollama-cart" aria-labelledby="ollama-cart-title">
        <h2 id="ollama-cart-title">Batch pull cart</h2>
        <p>{state.cart.disclosure}</p>
        <dl className="ollama-inline-facts">
          <div><dt>Items</dt><dd>{state.cart.references.length}</dd></div>
          <div><dt>Download</dt><dd>{formatOllamaBytes(state.cart.totalBytes)}</dd></div>
          <div><dt>Required free storage</dt><dd>{formatOllamaBytes(state.cart.requiredFreeBytes)}</dd></div>
          <div><dt>Current free storage</dt><dd>{formatOllamaBytes(state.cart.freeBytes)}</dd></div>
        </dl>
        {state.cart.blockers.length ? <ul className="ollama-errors">{state.cart.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
        <ul>{state.cart.references.map((reference) => <li key={reference}>{reference}</li>)}</ul>
        <div className="ollama-actions">
          <button type="button" disabled={!state.cart.references.length} onClick={() => run('Clear cart', () => service.clearCart())}>Clear cart</button>
          <button type="button" disabled={!state.cart.references.length || Boolean(state.cart.blockers.length)} onClick={() => run('Start batch pull', () => service.commitCart())}>Start reviewed pulls</button>
        </div>
      </section>
    </div>
  );
}

function PullQueue({ state, service, run }: Parameters<typeof ModelStore>[0]) {
  return (
    <section className="ollama-card" aria-labelledby="ollama-queue-title">
      <h2 id="ollama-queue-title">Persistent pull queue</h2>
      <p className="ollama-muted">The queue is paged and resumable. It preflights storage per item and processes bounded chunks instead of loading an unlimited queue into memory.</p>
      <SearchField scope="queue" state={state} service={service} label="Search pull queue" />
      <div className="ollama-actions">
        <button type="button" onClick={() => service.pauseQueue()}>Pause queue</button>
        <button type="button" onClick={() => run('Resume queue', () => service.resumeQueue())}>Resume queue</button>
      </div>
      {state.visibleQueue.length === 0 ? <EmptyState>No queued pull matches this search.</EmptyState> : (
        <ul className="ollama-queue-list">
          {state.visibleQueue.map((item) => {
            const percent = item.totalBytes && item.totalBytes > 0 ? Math.min(100, Math.round(item.completedBytes / item.totalBytes * 100)) : null;
            return (
              <li key={item.id}>
                <div><strong>{item.reference}</strong><span>{item.state} · attempt {item.attempt}</span></div>
                <progress max={100} value={percent ?? 0} aria-label={`${item.reference} pull progress`} />
                <span>{percent === null ? `${formatOllamaBytes(item.completedBytes)} transferred` : `${percent}% · ${formatOllamaBytes(item.completedBytes)} of ${formatOllamaBytes(item.totalBytes)}`}</span>
                <span>{item.status}</span>
                {item.error ? <span role="alert">{item.error}</span> : null}
                <div className="ollama-actions">
                  <button type="button" disabled={!['queued', 'preflighting', 'pulling', 'paused'].includes(item.state)} onClick={() => run('Cancel pull', () => service.cancelPull(item.id))}>Cancel</button>
                  <button type="button" disabled={!['failed', 'cancelled'].includes(item.state)} onClick={() => run('Retry pull', () => service.retryPull(item.id))}>Retry</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function supportedImageSignature(bytes: Uint8Array): boolean {
  const starts = (...expected: number[]) => expected.every((value, index) => bytes[index] === value);
  return (
    starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ||
    starts(0xff, 0xd8, 0xff) ||
    starts(0x47, 0x49, 0x46, 0x38) ||
    (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
  );
}

async function fileToAttachment(file: File, maxBytes: number): Promise<OllamaChatAttachment> {
  if (file.size <= 0 || file.size > maxBytes) throw new Error(`${file.name} exceeds the bounded image attachment size.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!supportedImageSignature(bytes)) throw new Error(`${file.name} is not a verified PNG, JPEG, GIF, or WebP image.`);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return { name: file.name, kind: 'image', base64: btoa(binary) };
}

function LocalChat({ state, service, run }: Parameters<typeof ModelStore>[0]) {
  const [content, setContent] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(state.chat.systemPrompt);
  const [attachments, setAttachments] = useState<OllamaChatAttachment[]>([]);
  const [containsSensitiveData, setContainsSensitiveData] = useState(false);
  const [reviewedSensitiveData, setReviewedSensitiveData] = useState(false);

  async function onFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = [...(event.target.files ?? [])];
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalBytes > state.chat.maxAttachmentBytes) throw new Error(`Selected images exceed ${formatOllamaBytes(state.chat.maxAttachmentBytes)}.`);
    const next = await Promise.all(files.map((file) => fileToAttachment(file, state.chat.maxAttachmentBytes)));
    setAttachments(next);
  }

  const selected = state.chat.selectableModels.find((model) => model.reference === state.chat.model);
  return (
    <div className="ollama-stack">
      <section className="ollama-card" aria-labelledby="ollama-chat-model-title">
        <h2 id="ollama-chat-model-title">Choose an installed local model</h2>
        {state.chat.selectableModels.length === 0 ? (
          <EmptyState action={state.chat.modelRecovery ? <button type="button" onClick={() => run('Chat model recovery', () => applyOllamaRecovery(service, state.chat.modelRecovery!))}>{state.chat.modelRecovery.actionLabel}</button> : undefined}>
            {state.chat.modelRecovery?.message ?? 'No installed model is available for local chat.'}
          </EmptyState>
        ) : (
          <div className="ollama-choice-grid" role="radiogroup" aria-label="Installed chat model">
            {state.chat.selectableModels.map((model) => (
              <button key={model.reference} type="button" role="radio" aria-checked={state.chat.model === model.reference} onClick={() => service.selectChatModel(model.reference)}>
                <strong>{model.reference}</strong><span>{model.capabilities.join(', ') || 'Capabilities not reported'}</span>
              </button>
            ))}
          </div>
        )}
        <p>{state.chat.attachmentSupportReason}</p>
        {selected ? <FitEvidence assessment={state.fitByReference[selected.reference]} /> : null}
      </section>

      <section className="ollama-card" aria-labelledby="ollama-chat-history-title">
        <h2 id="ollama-chat-history-title">Local chat</h2>
        <SearchField scope="chat-history" state={state} service={service} label="Search this chat history" />
        <div className="ollama-transcript" aria-live="polite" aria-label="Local chat transcript">
          {state.chat.visibleTranscript.length === 0 && !state.chat.streamingText ? <p className="ollama-muted">No messages match this search.</p> : null}
          {state.chat.visibleTranscript.map((entry, index) => (
            <article key={`${entry.role}-${index}`} className={`ollama-message ollama-message--${entry.role}`}>
              <strong>{entry.role}</strong><p>{entry.content}</p>
              {entry.attachmentNames.length ? <small>Attachments: {entry.attachmentNames.join(', ')}</small> : null}
            </article>
          ))}
          {state.chat.streamingText ? <article className="ollama-message ollama-message--assistant"><strong>assistant · streaming</strong><p>{state.chat.streamingText}</p></article> : null}
        </div>
        <label>System prompt<textarea rows={3} value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} /></label>
        <label>Message<textarea rows={5} value={content} onChange={(event) => setContent(event.target.value)} /></label>
        <label className={state.chat.attachmentsSupported ? '' : 'ollama-disabled'}>
          Image attachments
          <input type="file" accept="image/*" multiple disabled={!state.chat.attachmentsSupported} onChange={(event) => void onFiles(event).catch((error) => run('Read image attachments', async () => { throw error; }))} />
          <span>{state.chat.attachmentsSupported ? `${attachments.length} selected · maximum ${formatOllamaBytes(state.chat.maxAttachmentBytes)}` : state.chat.attachmentSupportReason}</span>
        </label>
        <label><input type="checkbox" checked={containsSensitiveData} onChange={(event) => { setContainsSensitiveData(event.target.checked); if (!event.target.checked) setReviewedSensitiveData(false); }} /> This message contains sensitive local data.</label>
        {containsSensitiveData ? <label><input type="checkbox" checked={reviewedSensitiveData} onChange={(event) => setReviewedSensitiveData(event.target.checked)} /> I reviewed the exact data and choose to process it with this local model.</label> : null}
        {state.chat.error ? <p role="alert">{state.chat.error}</p> : null}
        {state.chat.attachmentError ? <p role="alert">{state.chat.attachmentError}</p> : null}
        <div className="ollama-actions">
          <button type="button" disabled={!state.chat.sending} onClick={() => service.stopChat()}>Stop</button>
          <button
            type="button"
            disabled={state.chat.sending || !state.chat.model || !content.trim() || (containsSensitiveData && !reviewedSensitiveData)}
            onClick={() => run('Send local chat message', async () => {
              await service.sendChat({ model: state.chat.model, systemPrompt, content, attachments, containsTaxData: containsSensitiveData, reviewedTaxData: reviewedSensitiveData });
              setContent(''); setAttachments([]);
            })}
          >
            {state.chat.sending ? 'Streaming locally…' : 'Send to local model'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Harnesses({ state, service, run }: Parameters<typeof ModelStore>[0]) {
  const harness = state.harness;
  const canPreview = Boolean(harness.selectedProfileId && harness.selectedExecutableId && harness.selectedModel && harness.workingDirectory);
  return (
    <div className="ollama-stack">
      <section className="ollama-card" aria-labelledby="ollama-harness-title">
        <h2 id="ollama-harness-title">Allowlisted local harnesses</h2>
        <p className="ollama-muted">Ollama does not launch programs. The application may launch only a prebuilt profile, a detected allowlisted executable, fixed arguments, and approved environment keys with shell execution disabled.</p>
        <SearchField scope="harness-profiles" state={state} service={service} label="Search harness profiles" />
        <div className="ollama-choice-grid" role="radiogroup" aria-label="Harness profile">
          {harness.visibleProfiles.map((profile) => (
            <button key={profile.id} type="button" role="radio" aria-checked={harness.selectedProfileId === profile.id} onClick={() => service.selectHarnessProfile(profile.id)}>
              <strong>{profile.name}</strong><span>{profile.description}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => run('Detect harness executables', () => service.refreshHarnessExecutables())}>
          {harness.executablesState === 'checking' ? 'Detecting…' : 'Detect allowed executables'}
        </button>
        {harness.executables.length ? (
          <div className="ollama-choice-grid" role="radiogroup" aria-label="Detected executable">
            {harness.executables.map((executable) => (
              <button key={executable.id} type="button" role="radio" aria-checked={harness.selectedExecutableId === executable.id} onClick={() => service.selectHarnessExecutable(executable.id)}>
                <strong>{executable.displayName}</strong><span>Detected locally</span>
              </button>
            ))}
          </div>
        ) : <p role="status">{harness.executableRecovery?.message ?? 'No allowed executable has been detected yet.'}</p>}
        {harness.selectableModels.length ? (
          <div className="ollama-choice-grid" role="radiogroup" aria-label="Harness model">
            {harness.selectableModels.map((model) => <button key={model.reference} type="button" role="radio" aria-checked={harness.selectedModel === model.reference} onClick={() => service.selectHarnessModel(model.reference)}>{model.reference}</button>)}
          </div>
        ) : <p role="status">{harness.modelRecovery?.message ?? 'Install a model before launching a harness.'}</p>}
        <div className="ollama-path-row">
          <label>Working directory<input type="text" readOnly value={harness.workingDirectory} placeholder="Choose with the folder picker" /></label>
          <button type="button" onClick={() => run('Choose working directory', async () => { await service.chooseWorkingDirectory(); })}>Browse for folder</button>
        </div>
        <div className="ollama-actions">
          <button type="button" disabled={!canPreview} onClick={() => run('Preview harness', () => service.previewHarness({ profileId: harness.selectedProfileId!, executableId: harness.selectedExecutableId!, workingDirectory: harness.workingDirectory, model: harness.selectedModel! }))}>Review preflight</button>
          <button type="button" disabled={!harness.preview || Boolean(harness.preview.blockers.length)} onClick={() => run('Launch harness', () => service.launchHarness())}>Launch reviewed harness</button>
        </div>
        {harness.preview ? (
          <section className="ollama-preflight" aria-labelledby="ollama-preflight-title">
            <h3 id="ollama-preflight-title">Launch preflight</h3>
            <dl>
              <div><dt>Profile</dt><dd>{harness.preview.profile.name}</dd></div>
              <div><dt>Executable</dt><dd>{harness.preview.executable.displayName}</dd></div>
              <div><dt>Model</dt><dd>{harness.preview.model}</dd></div>
              <div><dt>Arguments</dt><dd>{harness.preview.arguments.join(' ') || 'None'}</dd></div>
              <div><dt>Working directory</dt><dd>{harness.preview.workingDirectory}</dd></div>
              <div><dt>Environment keys</dt><dd>{harness.preview.environmentKeys.join(', ') || 'None'}</dd></div>
              <div><dt>Required ports</dt><dd>{harness.preview.requiredPorts.join(', ') || 'None'}</dd></div>
            </dl>
            {harness.preview.blockers.length ? <ul className="ollama-errors">{harness.preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p role="status">Ready. Launch creates a configuration snapshot and restores it automatically if readiness fails.</p>}
          </section>
        ) : null}
        {harness.status ? <p role="status">{harness.status}</p> : null}
      </section>

      <section className="ollama-card" aria-labelledby="ollama-snapshot-title">
        <h2 id="ollama-snapshot-title">Configuration snapshots</h2>
        <SearchField scope="harness-snapshots" state={state} service={service} label="Search harness snapshots" />
        <button type="button" onClick={() => run('Refresh snapshots', () => service.refreshHarnessSnapshots())}>Refresh snapshots</button>
        {harness.visibleSnapshots.length === 0 ? <EmptyState>No saved snapshot matches this search.</EmptyState> : (
          <ul className="ollama-snapshot-list">{harness.visibleSnapshots.map((snapshot) => (
            <li key={snapshot.id}><div><strong>{snapshot.profileId}</strong><span>{snapshot.createdAt}</span></div><button type="button" onClick={() => run('Restore snapshot', () => service.restoreHarnessSnapshot(snapshot.id))}>Restore this snapshot</button></li>
          ))}</ul>
        )}
        {harness.restoreStatus ? <p role="status">{harness.restoreStatus}</p> : null}
      </section>
    </div>
  );
}

function Troubleshooter({ state, service, run }: Parameters<typeof ModelStore>[0]) {
  return (
    <section className="ollama-card" aria-labelledby="ollama-troubleshooter-title">
      <h2 id="ollama-troubleshooter-title">Local runtime troubleshooter</h2>
      <p className="ollama-muted">Every route works from bundled guidance and detected local state. There is no cloud fallback and no blank command field.</p>
      <button type="button" onClick={() => run('Recheck local runtime', () => service.refreshRuntime())}>Recheck local runtime</button>
      <div className="ollama-troubleshooter-list">
        {state.troubleshooter.branches.map((branch) => (
          <article key={branch.health} className={branch.active ? 'active' : ''} aria-current={branch.active ? 'step' : undefined}>
            <div><h3>{branch.title}</h3><span className="ollama-chip">{branch.health}</span></div>
            <p>{branch.summary}</p>
            {branch.failingChecks.length ? <ul>{branch.failingChecks.map((check) => <li key={check}>{check}</li>)}</ul> : null}
            <p><strong>Offline next step:</strong> {branch.offlineNextStep}</p>
            {branch.active ? <button type="button" onClick={() => run('Recheck local runtime', () => service.refreshRuntime())}>{branch.recheckLabel}</button> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function OllamaSuiteScreen({ service, disposeOnUnmount = false }: OllamaSuiteScreenProps) {
  const [state, setState] = useState(() => service.snapshot());
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextNoticeId = useRef(1);

  useEffect(() => {
    const unsubscribe = service.subscribe(setState);
    void service.initialize().catch((error) => {
      const text = error instanceof Error ? error.message : 'The local Ollama suite could not initialize.';
      setNotices([{ id: nextNoticeId.current++, kind: 'error', text }]);
    });
    return () => {
      unsubscribe();
      if (disposeOnUnmount) service.dispose();
    };
  }, [disposeOnUnmount, service]);

  function run(label: string, operation: () => Promise<void>): void {
    void operation().then(
      () => setNotices((current) => [...current, { id: nextNoticeId.current++, kind: 'info', text: `${label} completed.` }]),
      (error) => setNotices((current) => [...current, { id: nextNoticeId.current++, kind: 'error', text: error instanceof Error ? error.message : `${label} failed.` }]),
    );
  }

  function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = OLLAMA_SUITE_TABS;
    const index = tabs.findIndex((tab) => tab.id === state.activeTab);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (!next) return;
    event.preventDefault();
    service.selectTab(next.id);
    requestAnimationFrame(() => document.getElementById(`ollama-tab-${next.id}`)?.focus());
  }

  const common = { state, service, run };
  return (
    <div className="screen ollama-suite">
      <header className="ollama-hero">
        <div>
          <span className="ollama-eyebrow">Local-only model workspace</span>
          <h1>Ollama Suite <span className="screen-title-zh">本機模型工具套裝</span></h1>
          <p>Browse every verified model variant, pull in bounded batches, chat locally, and launch only reviewed allowlisted harnesses.</p>
        </div>
        <div className={`ollama-runtime ollama-runtime--${state.runtime.health}`} role="status" aria-live="polite">
          <strong>{summarizeOllamaRuntime(state)}</strong>
          <span>Checked {state.runtime.checkedAt ?? 'not yet'}</span>
          <button type="button" disabled={state.busy} onClick={() => run('Runtime check', () => service.refreshRuntime())}>{state.busy ? 'Checking…' : 'Recheck runtime'}</button>
        </div>
      </header>

      <div className="ollama-tabs" role="tablist" aria-label="Ollama Suite destinations" onKeyDown={onTabsKeyDown}>
        {OLLAMA_SUITE_TABS.map((tab) => (
          <button
            id={`ollama-tab-${tab.id}`}
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={state.activeTab === tab.id}
            aria-controls={`ollama-panel-${tab.id}`}
            tabIndex={state.activeTab === tab.id ? 0 : -1}
            title={tab.description}
            onClick={() => service.selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main id={`ollama-panel-${state.activeTab}`} role="tabpanel" aria-labelledby={`ollama-tab-${state.activeTab}`} tabIndex={0}>
        {state.activeTab === 'store' ? <ModelStore {...common} /> : null}
        {state.activeTab === 'queue' ? <PullQueue {...common} /> : null}
        {state.activeTab === 'chat' ? <LocalChat {...common} /> : null}
        {state.activeTab === 'harness' ? <Harnesses {...common} /> : null}
        {state.activeTab === 'troubleshooter' ? <Troubleshooter {...common} /> : null}
      </main>

      <aside className="ollama-notifications" aria-label="Ollama Suite notifications" aria-live="polite">
        {notices.map((notice) => (
          <div key={notice.id} className={`ollama-notice ollama-notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}>×</button>
          </div>
        ))}
      </aside>
    </div>
  );
}

export type { OllamaSuiteTab };

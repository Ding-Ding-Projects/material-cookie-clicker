import { useMemo, useState } from 'react';

import { converterSearchMatches, createConverterSearchState, type ConverterSearchState } from '../../../shared/converter-search.js';
import {
  CONVERTER_ADAPTERS,
  CONVERTER_CATEGORY_DEFINITIONS,
  type ConverterAdapterDefinition,
  type ConverterCategory,
} from '../../../shared/converter-registry.js';
import type { ConverterQueueItem } from '../../../shared/converter-queue.js';
import type { ConvertFileOutcome, FileInspection } from '../../../shared/converter-contracts.js';
import { bilingualText } from '../../game/copy.js';
import { ConverterCategorySearch } from './ConverterCategorySearch.js';

export interface FileConverterHost {
  pickSource(): Promise<string | null>;
  pickDestination(suggestedName: string): Promise<string | null>;
  inspect(sourcePath: string): Promise<FileInspection>;
  convert(request: { sourcePath: string; destinationPath: string; adapterId: string }): Promise<ConvertFileOutcome>;
  enqueue?(items: readonly { sourcePath: string; destinationPath: string; adapterId: string }[]): Promise<void>;
  queuePage?(cursor: string | null, limit: number): Promise<{ items: readonly ConverterQueueItem[]; nextCursor: string | null }>;
  pauseQueue?(): Promise<void>;
  resumeQueue?(): Promise<void>;
  cancelQueue?(): Promise<void>;
}

function initialSearch(): Record<ConverterCategory, ConverterSearchState> {
  return Object.fromEntries(CONVERTER_CATEGORY_DEFINITIONS.map((category) => [category.id, createConverterSearchState()])) as Record<ConverterCategory, ConverterSearchState>;
}

function suggestedName(sourcePath: string, adapter: ConverterAdapterDefinition): string {
  const leaf = sourcePath.split(/[\\/]/).at(-1) ?? 'converted';
  const stem = leaf.includes('.') ? leaf.slice(0, leaf.lastIndexOf('.')) : leaf;
  const extensions: Partial<Record<string, string>> = { json: 'json', csv: 'csv', text: 'txt', base64: 'b64', pdf: 'pdf' };
  return `${stem}.converted.${extensions[adapter.targetType] ?? 'bin'}`;
}

export function FileConverterScreen({ host }: { readonly host: FileConverterHost }) {
  const [sourcePath, setSourcePath] = useState('');
  const [destinationPath, setDestinationPath] = useState('');
  const [inspection, setInspection] = useState<FileInspection | null>(null);
  const [selectedAdapterId, setSelectedAdapterId] = useState('');
  const [searchByCategory, setSearchByCategory] = useState(initialSearch);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => bilingualText({ en: 'Select a local source to begin.', yue: '揀一個本機來源開始。' }));
  const [queueItems, setQueueItems] = useState<readonly ConverterQueueItem[]>([]);
  const [queueCursor, setQueueCursor] = useState<string | null>(null);
  const [queueState, setQueueState] = useState<'idle' | 'loading' | 'running' | 'paused' | 'cancelled'>('idle');
  const [queueLoaded, setQueueLoaded] = useState(false);

  const selectedAdapter = CONVERTER_ADAPTERS.find((adapter) => adapter.id === selectedAdapterId) ?? null;
  const compatible = useMemo(() => inspection ? new Set(CONVERTER_ADAPTERS.filter((adapter) => adapter.sourceTypes.includes(inspection.detection.type) && inspection.bytes <= adapter.maximumInputBytes).map((adapter) => adapter.id)) : new Set<string>(), [inspection]);

  async function chooseSource(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const selected = await host.pickSource();
      if (!selected) return;
      setSourcePath(''); setInspection(null); setDestinationPath(''); setSelectedAdapterId('');
      const next = await host.inspect(selected);
      setSourcePath(selected); setInspection(next);
      setMessage(bilingualText({ en: `Detected ${next.detection.type} from bytes.`, yue: `從位元組偵測到 ${next.detection.type}。` }));
    } catch (error) { setSourcePath(''); setInspection(null); setDestinationPath(''); setSelectedAdapterId(''); setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function chooseDestination(): Promise<void> {
    if (!selectedAdapter || !sourcePath || busy) return;
    setBusy(true);
    try {
      const selected = await host.pickDestination(suggestedName(sourcePath, selectedAdapter));
      if (selected) { setDestinationPath(selected); setMessage(bilingualText({ en: 'Destination selected locally.', yue: '已揀本機目的地。' })); }
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function runConversion(): Promise<void> {
    if (!selectedAdapter || !sourcePath || !destinationPath) return;
    setBusy(true);
    try {
      const outcome = await host.convert({ sourcePath, destinationPath, adapterId: selectedAdapter.id });
      setMessage(bilingualText({ en: `Converted ${outcome.inputBytes} bytes to ${outcome.outputBytes} validated bytes.`, yue: `已將 ${outcome.inputBytes} 位元組轉成 ${outcome.outputBytes} 個已驗證位元組。` }));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function addToQueue(): Promise<void> {
    if (!host.enqueue || !selectedAdapter || !sourcePath || !destinationPath || busy) return;
    setBusy(true);
    try {
      await host.enqueue([{ sourcePath, destinationPath, adapterId: selectedAdapter.id }]);
      setMessage(bilingualText({ en: 'Added to the persistent bounded-concurrency queue.', yue: '已加入持久化有限並行佇列。' }));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function loadQueuePage(reset = false): Promise<void> {
    if (!host.queuePage || queueState === 'loading') return;
    setQueueState('loading');
    try {
      const page = await host.queuePage(reset ? null : queueCursor, 50);
      setQueueItems(reset ? page.items : [...queueItems, ...page.items]); setQueueCursor(page.nextCursor); setQueueLoaded(true); setMessage(bilingualText({ en: `Loaded ${page.items.length} queue items.`, yue: `已載入 ${page.items.length} 個佇列項目。` }));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setQueueState((current) => current === 'loading' ? 'idle' : current); }
  }

  async function changeQueueState(action: 'pause' | 'resume' | 'cancel'): Promise<void> {
    if (queueState === 'loading') return;
    setQueueState('loading');
    try {
      if (action === 'pause') { await host.pauseQueue?.(); setQueueState('paused'); setMessage(bilingualText({ en: 'Queue paused.', yue: '佇列已暫停。' })); }
      else if (action === 'resume') { setQueueState('running'); await host.resumeQueue?.(); setMessage(bilingualText({ en: 'Queue resumed.', yue: '佇列已繼續。' })); }
      else { await host.cancelQueue?.(); setQueueState('cancelled'); setMessage(bilingualText({ en: 'Pending queue items cancelled.', yue: '等候中嘅佇列項目已取消。' })); }
    } catch (error) { setQueueState('idle'); setMessage(error instanceof Error ? error.message : String(error)); }
  }

  return (
    <main className="file-converter-screen" aria-busy={busy || queueState === 'loading'}>
      <h1>{bilingualText({ en: 'Local File Converter', yue: '本機檔案轉換器' })}</h1>
      <p>{bilingualText({ en: 'Byte detection, preview, conversion, validation, and queue state stay local. No PATH lookup or network service is used.', yue: '位元組偵測、預覽、轉換、驗證同佇列狀態全部留喺本機；唔會查 PATH 或使用網絡服務。' })}</p>
      <section aria-labelledby="converter-source-heading">
        <h2 id="converter-source-heading">{bilingualText({ en: 'Source and destination', yue: '來源同目的地' })}</h2>
        <button type="button" disabled={busy} aria-describedby="converter-source-status" onClick={chooseSource}>{bilingualText({ en: 'Browse for source file…', yue: '瀏覽來源檔案…' })}</button>
        <output id="converter-source-status" aria-live="polite">{sourcePath || bilingualText({ en: 'No source selected', yue: '未揀來源' })}</output>
        {inspection ? <><p>{inspection.bytes} bytes · {inspection.detection.detail}</p><pre aria-label="Bounded source preview · 有限來源預覽">{inspection.preview}</pre></> : null}
        <button type="button" disabled={!selectedAdapter || !sourcePath || busy} aria-describedby="converter-destination-status converter-destination-reason" onClick={chooseDestination}>{bilingualText({ en: 'Browse for destination…', yue: '瀏覽目的地…' })}</button>
        <output id="converter-destination-status" aria-live="polite">{destinationPath || bilingualText({ en: 'No destination selected', yue: '未揀目的地' })}</output>
        <p id="converter-destination-reason">{!sourcePath ? bilingualText({ en: 'Select a source first.', yue: '請先揀來源。' }) : !selectedAdapter ? bilingualText({ en: 'Select an available compatible adapter first.', yue: '請先揀一個可用兼容轉換器。' }) : bilingualText({ en: 'Ready to choose a destination.', yue: '可以揀目的地。' })}</p>
      </section>

      <div className="converter-category-catalog">
        {CONVERTER_CATEGORY_DEFINITIONS.map((category) => {
          const search = searchByCategory[category.id];
          const visible = CONVERTER_ADAPTERS.filter((adapter) => adapter.category === category.id && converterSearchMatches(`${adapter.nameEn} ${adapter.nameYue} ${adapter.disabledReason ?? ''}`, search));
          return (
            <section key={category.id} aria-labelledby={`converter-category-${category.id}`}>
              <h2 id={`converter-category-${category.id}`}>{bilingualText({ en: category.nameEn, yue: category.nameYue })}</h2>
              <p>{bilingualText({ en: category.descriptionEn, yue: category.descriptionYue })}</p>
              <ConverterCategorySearch categoryName={bilingualText({ en: category.nameEn, yue: category.nameYue })} state={search} onChange={(next) => setSearchByCategory((current) => ({ ...current, [category.id]: next }))} />
              {visible.length === 0 ? <p>{bilingualText({ en: 'No matching adapters', yue: '冇配對轉換器' })}</p> : (
                <fieldset><legend>{bilingualText({ en: `Adapters for ${category.nameEn}`, yue: `${category.nameYue}轉換器` })}</legend><ul>{visible.map((adapter) => {
                  const acceptsSource = inspection === null || compatible.has(adapter.id);
                  const disabled = !adapter.enabled || !adapter.bundled || !acceptsSource;
                  const reason = adapter.disabledReason ?? (!acceptsSource ? (inspection && inspection.bytes > adapter.maximumInputBytes ? `Source is ${inspection.bytes} bytes; this adapter allows at most ${adapter.maximumInputBytes} bytes.` : `Detected ${inspection?.detection.type}; this adapter accepts ${adapter.sourceTypes.join(', ')}.`) : null);
                  const descriptionId = `converter-adapter-${adapter.id}-description`;
                  return <li key={adapter.id}>
                    <label><input type="radio" name="converter-adapter" checked={selectedAdapterId === adapter.id} disabled={disabled} aria-describedby={descriptionId} onChange={() => setSelectedAdapterId(adapter.id)} />{bilingualText({ en: adapter.nameEn, yue: adapter.nameYue })}</label>
                    <div id={descriptionId}><p>{adapter.enabled && adapter.bundled ? bilingualText({ en: 'Bundled and offline', yue: '已內置及可離線使用' }) : `${bilingualText({ en: 'Unavailable', yue: '未能使用' })} — ${reason}`}</p><p>{adapter.metadataBehavior} {adapter.encodingBehavior}</p></div>
                  </li>;
                })}</ul></fieldset>
              )}
            </section>
          );
        })}
      </div>

      {selectedAdapter ? <section aria-live="polite"><h2>Conversion disclosure · 轉換披露</h2><p>{selectedAdapter.lossless ? 'Lossless for accepted inputs.' : 'This conversion can change representation.'} {selectedAdapter.metadataBehavior} {selectedAdapter.encodingBehavior}</p></section> : null}
      <button type="button" aria-describedby="converter-action-reason" disabled={!selectedAdapter || !sourcePath || !destinationPath || busy} onClick={runConversion}>Convert locally · 本機轉換</button>
      <button type="button" aria-describedby="converter-action-reason" disabled={!host.enqueue || !selectedAdapter || !sourcePath || !destinationPath || busy} onClick={addToQueue}>Add to queue · 加入佇列</button>
      <p id="converter-action-reason">{!sourcePath ? 'Select a source. · 請揀來源。' : !selectedAdapter ? 'Select an available compatible adapter. · 請揀可用兼容轉換器。' : !destinationPath ? 'Select a destination. · 請揀目的地。' : busy ? 'Another converter action is running. · 另一個轉換操作進行中。' : 'Ready to convert or queue. · 可以轉換或加入佇列。'}</p>
      <p role="status">{message}</p>

      <section aria-labelledby="converter-queue-heading">
        <h2 id="converter-queue-heading">Persistent conversion queue · 持久化轉換佇列</h2>
        <p>The queue has no total item cap; discovery and processing are paged with bounded concurrency and per-file byte limits. · 佇列冇總項目上限；探索同處理會分頁進行，並有限制並行數同每檔位元組上限。</p>
        <p role="status">Queue state: {queueState} · 佇列狀態：{queueState}</p>
        <button type="button" disabled={!host.queuePage || queueState === 'loading'} onClick={() => loadQueuePage(true)}>Refresh first page · 重新載入第一頁</button>
        <button type="button" disabled={!host.queuePage || queueCursor === null || queueState === 'loading'} onClick={() => loadQueuePage(false)}>Load next page · 載入下一頁</button>
        <button type="button" aria-pressed={queueState === 'paused'} disabled={!host.pauseQueue || queueState === 'paused' || queueState === 'loading'} onClick={() => changeQueueState('pause')}>Pause · 暫停</button>
        <button type="button" aria-pressed={queueState === 'running'} disabled={!host.resumeQueue || queueState === 'running' || queueState === 'loading'} onClick={() => changeQueueState('resume')}>Resume · 繼續</button>
        <button type="button" disabled={!host.cancelQueue || queueState === 'cancelled' || queueState === 'loading'} onClick={() => changeQueueState('cancel')}>Cancel pending · 取消等候項目</button>
        {!queueLoaded ? <p>Queue not loaded yet. · 佇列尚未載入。</p> : queueItems.length === 0 ? <p>Queue is empty. · 佇列係空嘅。</p> : <ul>{queueItems.map((item) => <li key={item.id}><strong>{item.sourcePath.split(/[\\/]/).at(-1)}</strong> — {item.status}{item.expectedBytes ? <progress value={Math.min(item.processedBytes, item.expectedBytes)} max={item.expectedBytes} aria-label={`Conversion progress for ${item.sourcePath.split(/[\\/]/).at(-1)}`} /> : item.status === 'running' ? <progress aria-label={`Indeterminate conversion progress for ${item.sourcePath.split(/[\\/]/).at(-1)}`} /> : null} {item.processedBytes} bytes{item.message ? ` — ${item.message}` : ''}</li>)}</ul>}
      </section>
    </main>
  );
}

export { ConverterCategorySearch } from './ConverterCategorySearch.js';

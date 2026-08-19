import { useEffect, useId, useRef, useState } from 'react';

import {
  MAX_CONVERTER_SAMPLE_LENGTH,
  runConverterSearchLab,
  validateConverterPattern,
  type ConverterSearchState,
} from '../../../shared/converter-search.js';

export interface ConverterCategorySearchProps {
  readonly categoryName: string;
  readonly state: ConverterSearchState;
  readonly onChange: (next: ConverterSearchState) => void;
}

const TOKENS = [
  { label: 'Literal · 原文字', token: '\\Qtext\\E', insertion: 'text' },
  { label: 'Character class · 字元類別', token: '[abc]', insertion: '[abc]' },
  { label: 'Start anchor · 開始錨點', token: '^', insertion: '^' },
  { label: 'End anchor · 結束錨點', token: '$', insertion: '$' },
  { label: 'Capture group · 擷取群組', token: '(…)', insertion: '()' },
  { label: 'Alternation · 二選一', token: 'a|b', insertion: '|' },
  { label: 'Optional · 可有可無', token: '?', insertion: '?' },
  { label: 'One or more · 一個或以上', token: '+', insertion: '+' },
  { label: 'Bounded repeat · 有限重複', token: '{1,3}', insertion: '{1,3}' },
] as const;

function toggleFlag(flags: string, flag: string): string {
  return flags.includes(flag) ? flags.replaceAll(flag, '') : `${flags}${flag}`;
}

export function ConverterCategorySearch({ categoryName, state, onChange }: ConverterCategorySearchProps) {
  const id = useId();
  const inputId = `converter-search-${id}`;
  const panelId = `converter-search-builder-${id}`;
  const errorId = `converter-search-error-${id}`;
  const helpId = `converter-search-help-${id}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const patternRef = useRef<HTMLInputElement>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const patternError = state.regex ? validateConverterPattern(state.pattern, state.flags) : null;
  const matches = runConverterSearchLab(state);
  useEffect(() => {
    if (state.builderOpen) patternRef.current?.focus();
  }, [state.builderOpen]);

  function closeBuilder(): void {
    onChange({ ...state, builderOpen: false });
    queueMicrotask(() => triggerRef.current?.focus());
  }

  async function copyPattern(): Promise<void> {
    try { await navigator.clipboard.writeText(state.pattern); setCopyStatus('Pattern copied · 規則已複製'); }
    catch { setCopyStatus('Clipboard refused the copy · 剪貼簿拒絕複製'); }
  }

  function exportPattern(): void {
    const payload = JSON.stringify({ version: 1, engine: 'JavaScript RegExp', pattern: state.pattern, flags: state.flags }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'converter-search-pattern.json'; anchor.click(); URL.revokeObjectURL(url);
    setCopyStatus('Pattern exported · 規則已匯出');
  }
  return (
    <div className="converter-category-search">
      <div className="converter-category-search__field">
        <label htmlFor={inputId}>Search {categoryName} · 搜尋 {categoryName}</label>
        <input
          id={inputId}
          type="search"
          value={state.regex ? state.pattern : state.query}
          onChange={(event) => onChange(state.regex ? { ...state, pattern: event.target.value } : { ...state, query: event.target.value })}
          aria-invalid={Boolean(patternError)}
          aria-errormessage={patternError ? errorId : undefined}
          aria-describedby={helpId}
        />
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={state.builderOpen}
          aria-controls={panelId}
          aria-label={`Open the regex builder for ${categoryName} · 開啟 ${categoryName} 規則運算式建立器`}
          onClick={() => state.builderOpen ? closeBuilder() : onChange({ ...state, builderOpen: true })}
        >
          .*
        </button>
      </div>
      {state.builderOpen ? (
        <section id={panelId} className="converter-regex-builder" aria-label={`Regex builder for ${categoryName} · ${categoryName} 規則運算式建立器`} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeBuilder(); } }}>
          <div role="group" aria-label="Search mode · 搜尋模式">
            <button type="button" aria-pressed={!state.regex} onClick={() => onChange({ ...state, regex: false })}>Plain text · 純文字</button>
            <button type="button" aria-pressed={state.regex} onClick={() => onChange({ ...state, regex: true })}>Regex · 規則運算式</button>
          </div>
          <label>
            Raw pattern · 原始規則
            <input ref={patternRef} value={state.pattern} aria-invalid={Boolean(patternError)} aria-errormessage={patternError ? errorId : undefined} aria-describedby={helpId} onChange={(event) => onChange({ ...state, pattern: event.target.value, regex: true })} />
          </label>
          <div role="group" aria-label="Regex flags · 規則旗標">
            {['i', 'm', 'u'].map((flag) => (
              <label key={flag}><input type="checkbox" checked={state.flags.includes(flag)} onChange={() => onChange({ ...state, flags: toggleFlag(state.flags, flag) })} />{flag}</label>
            ))}
          </div>
          <div role="group" aria-label="Guided regex construction · 引導式規則建立">
            {TOKENS.map((token) => (
              <button key={token.label} type="button" title={token.token} onClick={() => onChange({ ...state, regex: true, pattern: `${state.pattern}${token.insertion}` })}>{token.label}</button>
            ))}
          </div>
          <div role="group" aria-label="Copy or export regex · 複製或匯出規則">
            <button type="button" onClick={copyPattern}>Copy pattern · 複製規則</button>
            <button type="button" onClick={exportPattern}>Export JSON · 匯出 JSON</button>
          </div>
          <label>
            Sample text · 樣本文字
            <textarea maxLength={MAX_CONVERTER_SAMPLE_LENGTH} value={state.sample} onChange={(event) => onChange({ ...state, sample: event.target.value })} />
          </label>
          {patternError ? <p id={errorId} role="alert">{patternError}</p> : <p role="status">{matches.length} live matches · {matches.length} 個即時配對</p>}
          {matches.length > 0 ? <ol aria-label="Bounded live matches · 有限即時配對">{matches.map((match, index) => <li key={`${match.index}-${index}`}><code>{match.text || 'empty match · 空配對'}</code> at index {match.index} · 索引 {match.index}</li>)}</ol> : null}
          {matches.some((match) => match.captures.length > 0) ? (
            <table><caption>Capture groups · 擷取群組</caption><thead><tr><th>Match · 配對</th><th>Capture · 擷取</th></tr></thead><tbody>
              {matches.flatMap((match, matchIndex) => match.captures.map((capture, captureIndex) => <tr key={`${matchIndex}-${captureIndex}`}><td>{match.text}</td><td>{capture ?? '—'}</td></tr>))}
            </tbody></table>
          ) : null}
          <p id={helpId}>JavaScript RegExp; flags i, m, u. Patterns and samples stay local and are bounded. · 使用 JavaScript RegExp；旗標 i、m、u。規則同樣本留喺本機而且有上限。</p>
          <p role="status">{copyStatus}</p>
          <button type="button" onClick={closeBuilder}>Close builder · 關閉建立器</button>
        </section>
      ) : null}
    </div>
  );
}

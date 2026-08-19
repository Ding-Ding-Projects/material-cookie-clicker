import { useId } from 'react';

import {
  BUILDER_TOKENS,
  analyzeSearchPattern,
  describeSearch,
  insertToken,
  type SearchState,
} from '@material-cookie-clicker/surface-kernel';
import { bilingualText } from '../game/copy.js';

export interface CanonicalSearchProps {
  readonly label: string;
  readonly state: SearchState;
  readonly onChange: (next: SearchState) => void;
  readonly placeholder?: string;
}

/**
 * An ungated, local-only search and anchored full regex builder for application
 * chrome. The cookie-economy search component remains separate because its
 * purchasable controls are gameplay; this one is application infrastructure.
 */
export function CanonicalSearch({ label, state, onChange, placeholder = 'Search…' }: CanonicalSearchProps) {
  const id = useId();
  const analysis = state.regex ? analyzeSearchPattern(state) : null;

  return (
    <div className="canonical-search">
      <label htmlFor={`${id}-query`}>{label}</label>
      <div className="canonical-search__row">
        <input
          id={`${id}-query`}
          type="search"
          value={state.regex ? state.pattern : state.query}
          placeholder={placeholder}
          onChange={(event) => onChange(state.regex
            ? { ...state, pattern: event.target.value }
            : { ...state, query: event.target.value })}
        />
        <button
          type="button"
          aria-expanded={state.builderOpen}
          aria-controls={`${id}-builder`}
          onClick={() => onChange({ ...state, builderOpen: !state.builderOpen })}
        >
          {bilingualText({ en: 'Regex builder', yue: '規則運算式產生器' })}
        </button>
      </div>
      {state.builderOpen ? (
        <section className="canonical-search__builder" id={`${id}-builder`} aria-label={`${label} regular expression builder`}>
          <label>
            <input
              type="checkbox"
              checked={state.regex}
              onChange={(event) => onChange({ ...state, regex: event.target.checked })}
            />
            {bilingualText({ en: 'Use regular expression', yue: '使用規則運算式' })}
          </label>
          <label>
            {bilingualText({ en: 'Pattern', yue: '規則' })}
            <input
              type="text"
              value={state.pattern}
              maxLength={256}
              onChange={(event) => onChange({ ...state, pattern: event.target.value })}
            />
          </label>
          <label>
            {bilingualText({ en: 'Flags', yue: '旗標' })}
            <input
              type="text"
              value={state.flags}
              maxLength={8}
              onChange={(event) => onChange({ ...state, flags: event.target.value })}
            />
          </label>
          <div className="canonical-search__tokens" role="group" aria-label="Regular expression fragments">
            {BUILDER_TOKENS.map((token) => (
              <button key={token.id} type="button" title={token.detail} onClick={() => onChange(insertToken(state, token))}>
                {token.label}
              </button>
            ))}
          </div>
          <label>
            {bilingualText({ en: 'Sample text', yue: '樣本文字' })}
            <textarea
              rows={3}
              value={state.sample}
              maxLength={2000}
              onChange={(event) => onChange({ ...state, sample: event.target.value })}
            />
          </label>
          <p role="status">{analysis?.feedback ?? describeSearch(state)}</p>
          {analysis && analysis.matches.length > 0 ? (
            <ol className="canonical-search__matches">
              {analysis.matches.map((match, index) => (
                <li key={`${match.index}-${index}`}>
                  <code>{match.value || 'zero-width match'}</code> at {match.index}
                  {match.groups.length > 0 ? ` · captures: ${match.groups.join(', ')}` : ''}
                </li>
              ))}
            </ol>
          ) : null}
          <p className="canonical-search__privacy">{bilingualText({ en: 'Evaluated locally with bounded input; patterns and samples are not saved or transmitted.', yue: '只會喺本機用有限輸入評估；規則同樣本唔會儲存或者傳送。' })}</p>
        </section>
      ) : null}
    </div>
  );
}

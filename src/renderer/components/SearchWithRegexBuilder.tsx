import { useId } from 'react';
import {
  BUILDER_TOKENS,
  compileSearchPattern,
  createSearchState,
  insertToken,
  type SearchState,
} from '../game/local-regex-search.js';

import { bilingualText, LIST_COPY, type Bilingual } from '../game/copy.js';

export { createSearchState };
export type { SearchState };

const TOGGLE_FLAGS: readonly { flag: string; label: Bilingual }[] = [
  { flag: 'i', label: { en: 'Ignore case', yue: '忽略大小寫' } },
  { flag: 'm', label: { en: 'Multiline', yue: '多行' } },
  { flag: 'u', label: { en: 'Unicode', yue: 'Unicode' } },
];

function toggleFlag(flags: string, flag: string): string {
  return flags.includes(flag) ? flags.replaceAll(flag, '') : `${flags}${flag}`;
}

export interface SearchWithRegexBuilderProps {
  readonly idPrefix: string;
  readonly state: SearchState;
  readonly onChange: (next: SearchState) => void;
  readonly placeholder: Bilingual;
  readonly ariaLabel: Bilingual;
}

/**
 * One search field with its regex builder anchored directly beside it as a popover — never a
 * detached dialog (design/search-regex-builder.html). Every list screen renders its own
 * instance with its own `SearchState`; none share hidden state with another field.
 */
export function SearchWithRegexBuilder({ idPrefix, state, onChange, placeholder, ariaLabel }: SearchWithRegexBuilderProps) {
  const reactId = useId();
  const inputId = `${idPrefix}-${reactId}-query`;
  const patternId = `${idPrefix}-${reactId}-pattern`;

  const compiled = state.regex ? compileSearchPattern(state, 'filter') : null;
  const patternError = compiled && 'error' in compiled ? compiled.error : null;

  return (
    <div className="search-field-wrap">
      <div className={`search-field${state.regex ? ' regex-active' : ''}`}>
        <span aria-hidden="true">🔍</span>
        <input
          id={inputId}
          className="search-field__input"
          type="text"
          placeholder={bilingualText(placeholder)}
          aria-label={state.regex ? `${ariaLabel.en}, regex mode active · ${ariaLabel.yue}，規則運算式模式已啟用` : `${bilingualText(ariaLabel)}`}
          value={state.regex ? state.pattern : state.query}
          onChange={(event) =>
            onChange(state.regex ? { ...state, pattern: event.target.value } : { ...state, query: event.target.value })
          }
        />
        <button
          type="button"
          className="builder-toggle"
          aria-pressed={state.builderOpen}
          aria-label={bilingualText(LIST_COPY.regexBuilderOpen)}
          aria-controls={`${idPrefix}-${reactId}-popover`}
          aria-expanded={state.builderOpen}
          onClick={() => onChange({ ...state, builderOpen: !state.builderOpen })}
        >
          {state.regex ? '.*' : '⚙'}
        </button>
      </div>
      {state.builderOpen && (
        <div className="regex-popover" id={`${idPrefix}-${reactId}-popover`}>
          <div className="mode-row" role="group" aria-label="Search mode · 搜尋模式">
            <button type="button" aria-pressed={!state.regex} onClick={() => onChange({ ...state, regex: false })}>
              Plain text · 純文字
            </button>
            <button type="button" aria-pressed={state.regex} onClick={() => onChange({ ...state, regex: true })}>
              Regex · 規則運算式
            </button>
          </div>
          <div>
            <label htmlFor={patternId}>Pattern · 規則</label>
            <input
              id={patternId}
              type="text"
              value={state.pattern}
              onChange={(event) => onChange({ ...state, pattern: event.target.value, regex: true })}
            />
          </div>
          <div className="flag-row" role="group" aria-label="Flags · 旗標">
            {TOGGLE_FLAGS.map(({ flag, label }) => (
              <label key={flag}>
                <input
                  type="checkbox"
                  checked={state.flags.includes(flag)}
                  onChange={() => onChange({ ...state, flags: toggleFlag(state.flags, flag) })}
                />
                {bilingualText(label)}
              </label>
            ))}
          </div>
          <div className="regex-token-list" role="group" aria-label="Insert token · 插入符號">
            {BUILDER_TOKENS.map((token) => (
              <button
                key={token.id}
                type="button"
                title={`${bilingualText(token.label)} — ${bilingualText(token.detail)}`}
                aria-label={`${bilingualText(token.label)} — ${bilingualText(token.detail)}`}
                onClick={() => onChange(insertToken(state, token))}
              >
                {token.insert}
              </button>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 12 }}>
            {patternError
              ? `⚠ ${bilingualText(patternError)}`
              : 'Evaluated locally, bounded, never transmitted. · 喺本機評估，有上限，唔會傳送出去。'}
          </p>
        </div>
      )}
    </div>
  );
}

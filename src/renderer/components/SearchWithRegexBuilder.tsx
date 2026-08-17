import { useId } from 'react';
import {
  BUILDER_TOKENS,
  compileSearchPattern,
  createSearchState,
  insertToken,
  type SearchState,
} from '../game/local-regex-search.js';

import { bilingualText, LIST_COPY, type Bilingual } from '../game/copy.js';
import { CoinSlot, useControlLevel } from './CoinSlot.js';

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
  /**
   * Which control-unlock ladder gates this particular field (control-unlocks.ts) — one per
   * surface, so the shop rail's search and the Tools panel's search are separate purchases.
   *
   * Omitted means UNGATED, and exactly one field in the application omits it: the search box
   * inside the controls catalogue itself. Charging cookies for the ability to look up what
   * things cost would be a circular lock, so that field is free and says so on the surface.
   */
  readonly controlId?: string;
}

/**
 * One search field with its regex builder anchored directly beside it as a popover — never a
 * detached dialog (design/search-regex-builder.html). Every list screen renders its own
 * instance with its own `SearchState`; none share hidden state with another field.
 *
 * THE LADDER (control-unlocks.ts), when `controlId` is given:
 *   rung 1  the field itself, plain-text matching
 *   rung 2  the gear beside it and the popover behind it, with regex mode
 *   rung 3  the flag toggles and the token palette inside that popover
 *
 * Each unbought rung shows as a coin-slot plate exactly where the control would be, so the
 * whole ladder is legible from the first time a player sees a list: an empty rail with a price
 * on it reads as "there is a search field, and it costs fifty".
 */
export function SearchWithRegexBuilder({
  idPrefix,
  state,
  onChange,
  placeholder,
  ariaLabel,
  controlId,
}: SearchWithRegexBuilderProps) {
  const reactId = useId();
  const inputId = `${idPrefix}-${reactId}-query`;
  const patternId = `${idPrefix}-${reactId}-pattern`;
  // An ungated field behaves as if the whole ladder were bought — which it is, for free.
  const level = useControlLevel(controlId ?? 'search.generators');
  const effectiveLevel = controlId ? level : 3;

  if (effectiveLevel === 0 && controlId) {
    return (
      <div className="search-field-wrap search-field-wrap--locked">
        <CoinSlot
          rungId={`${controlId}`}
          labelEn={placeholder.en.replace(/…$/, '')}
          labelYue={placeholder.yue.replace(/…$/, '')}
        />
      </div>
    );
  }

  // Regex mode cannot be on without the builder that turns it on, but a save could carry a
  // SearchState from before this component was gated. Reading it down here means a locked
  // builder can never leave a field silently filtering by a pattern the player cannot see.
  const regexActive = state.regex && effectiveLevel >= 2;
  const compiled = regexActive ? compileSearchPattern(state, 'filter') : null;
  const patternError = compiled && 'error' in compiled ? compiled.error : null;

  return (
    <div className="search-field-wrap">
      <div className={`search-field${regexActive ? ' regex-active' : ''}`}>
        <span aria-hidden="true">🔍</span>
        <input
          id={inputId}
          className="search-field__input"
          type="text"
          placeholder={bilingualText(placeholder)}
          aria-label={regexActive ? `${ariaLabel.en}, regex mode active · ${ariaLabel.yue}，規則運算式模式已啟用` : `${bilingualText(ariaLabel)}`}
          value={regexActive ? state.pattern : state.query}
          onChange={(event) =>
            onChange(regexActive ? { ...state, pattern: event.target.value } : { ...state, query: event.target.value })
          }
        />
        {effectiveLevel >= 2 ? (
          <button
            type="button"
            className="builder-toggle"
            aria-pressed={state.builderOpen}
            aria-label={bilingualText(LIST_COPY.regexBuilderOpen)}
            aria-controls={`${idPrefix}-${reactId}-popover`}
            aria-expanded={state.builderOpen}
            onClick={() => onChange({ ...state, builderOpen: !state.builderOpen })}
          >
            {regexActive ? '.*' : '⚙'}
          </button>
        ) : (
          <CoinSlot rungId={`${controlId}.builder`} variant="chrome" className="search-field__slot" />
        )}
      </div>
      {state.builderOpen && effectiveLevel >= 2 && (
        <div className="regex-popover" id={`${idPrefix}-${reactId}-popover`}>
          <div className="mode-row" role="group" aria-label={bilingualText({ en: 'Search mode', yue: '搜尋模式' })}>
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
          {effectiveLevel >= 3 ? (
            <>
              <div className="flag-row" role="group" aria-label={bilingualText({ en: 'Flags', yue: '旗標' })}>
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
              <div className="regex-token-list" role="group" aria-label={bilingualText({ en: 'Insert token', yue: '插入符號' })}>
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
            </>
          ) : (
            <CoinSlot rungId={`${controlId}.tokens`} className="regex-popover__slot" />
          )}
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

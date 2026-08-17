import { useId, useState } from 'react';
import {
  appendFragment,
  buildAlternation,
  buildLookaround,
  buildNamedGroup,
  compileSearchPattern,
  createSearchState,
  explainPattern,
  insertToken,
  LOOKAROUND_LABELS,
  MAX_SAMPLE_LENGTH,
  PATTERN_HISTORY_LIMIT,
  pushPatternHistory,
  runLab,
  TOKEN_CATEGORY_LABELS,
  tokensByCategory,
  type LookaroundKind,
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

const LOOKAROUND_KINDS: readonly LookaroundKind[] = ['ahead', 'notAhead', 'behind', 'notBehind'];

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
 * TWO LADDERS MEET IN THIS POPOVER, and the split is the whole design:
 *
 *   THE SURFACE LADDER (`controlId`, one per surface — four of them in the app)
 *     rung 1  the field itself, plain-text matching                              50
 *     rung 2  the gear beside it and the popover behind it, with regex mode     400
 *     rung 3  the flag toggles and the basic token palette                    1,500
 *
 *   THE SHARED LADDER (control id `regex`, bought ONCE for the whole application)
 *     rung 1  Groups and lookarounds — named captures, an alternation
 *             builder, and the four lookaround composers                      4,000
 *     rung 2  The live lab — sample text, live highlighting, a capture
 *             table and a plain-language sentence about the pattern          12,000
 *
 * The surface ladder is furniture: a search field on the shop rail and a search field on the
 * Tools panel are two separate things in two separate rooms. The shared ladder is the BUILDER'S
 * OWN capability, and the builder is one component rendered four times — selling capture groups
 * four separate times would have been eight near-identical rungs, 32,000 cookies for one
 * feature, and a popover that forgot how to do something when you opened it somewhere else. The
 * argument is written out in full in control-unlocks.ts beside the `regex` entry.
 *
 * Each unbought rung of either ladder shows as a coin-slot plate exactly where the control would
 * be, so the whole thing is legible from the first time a player sees a list: an empty rail with
 * a price on it reads as "there is a search field, and it costs fifty", and an empty shelf inside
 * the popover reads as "there is a test lab, and it costs twelve thousand".
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
  const sampleId = `${idPrefix}-${reactId}-sample`;
  const groupNameId = `${idPrefix}-${reactId}-group-name`;
  const alternativesId = `${idPrefix}-${reactId}-alternatives`;
  const lookaroundId = `${idPrefix}-${reactId}-lookaround`;

  // An ungated field behaves as if the whole SURFACE ladder were bought — which it is, for free.
  // The SHARED ladder is read the same way everywhere, ungated field included: selling advanced
  // regex is not the circular lock that selling the price list would be.
  const level = useControlLevel(controlId ?? 'search.generators');
  const effectiveLevel = controlId ? level : 3;
  const advanced = useControlLevel('regex');

  // Local, in-memory, never saved and never transmitted: the last ten patterns this field saw.
  const [history, setHistory] = useState<readonly string[]>([]);
  // The three composers' own scratch fields. They compose a fragment; the pattern stays the one
  // source of truth, so nothing here can filter a list on its own.
  const [groupName, setGroupName] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [lookaround, setLookaround] = useState('');
  const [composerError, setComposerError] = useState<Bilingual | null>(null);

  function remember(pattern: string): void {
    setHistory((current) => pushPatternHistory(current, pattern));
  }

  function compose(built: { ok: true; fragment: string } | { ok: false; reason: Bilingual }): void {
    if (!built.ok) {
      setComposerError(built.reason);
      return;
    }
    setComposerError(null);
    onChange(appendFragment(state, built.fragment));
  }

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
  const lab = advanced >= 2 ? runLab(state) : null;
  const explanation = explainPattern(state.pattern);

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
          onBlur={() => {
            if (regexActive) remember(state.pattern);
          }}
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
              onBlur={() => remember(state.pattern)}
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

              {/* The palette, on labelled shelves. Every shelf is its own keyboard group, so
                  arrowing past twenty-three buttons is not the only way to reach the last one. */}
              {tokensByCategory(advanced).map(({ category, tokens }) => (
                <div
                  key={category}
                  className="regex-token-list"
                  role="group"
                  aria-label={`${bilingualText(TOKEN_CATEGORY_LABELS[category])} — ${bilingualText({ en: 'insert token', yue: '插入符號' })}`}
                >
                  <span className="regex-token-list__heading" aria-hidden="true">
                    {bilingualText(TOKEN_CATEGORY_LABELS[category])}
                  </span>
                  {tokens.map((token) => (
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
              ))}

              {/* ── Tier: groups and lookarounds ─────────────────────────────────────────── */}
              {advanced >= 1 ? (
                <div
                  className="regex-composers"
                  role="group"
                  aria-label={bilingualText({ en: 'Groups and lookarounds', yue: '群組同前後顧' })}
                >
                  <div className="regex-composer">
                    <label htmlFor={groupNameId}>Capture the last part as · 將最後一部分擷取做</label>
                    <input
                      id={groupNameId}
                      type="text"
                      value={groupName}
                      placeholder="year"
                      onChange={(event) => setGroupName(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => compose(buildNamedGroup(groupName, state.pattern))}
                      aria-label={bilingualText({
                        en: 'Wrap the whole pattern in a named capture group',
                        yue: '將成個規則包做一個具名擷取群組',
                      })}
                    >
                      Name it · 改名
                    </button>
                  </div>

                  <div className="regex-composer">
                    <label htmlFor={alternativesId}>Any one of, comma separated · 任何一個，用逗號分開</label>
                    <input
                      id={alternativesId}
                      type="text"
                      value={alternatives}
                      placeholder="cursor, grandma, farm"
                      onChange={(event) => setAlternatives(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => compose(buildAlternation(alternatives.split(',')))}
                      aria-label={bilingualText({
                        en: 'Add an either-or group built from those alternatives',
                        yue: '用嗰啲選項加一個二選一群組',
                      })}
                    >
                      Add · 加
                    </button>
                  </div>

                  <div className="regex-composer">
                    <label htmlFor={lookaroundId}>Look around for · 前後顧睇</label>
                    <input
                      id={lookaroundId}
                      type="text"
                      value={lookaround}
                      placeholder="Bakery"
                      onChange={(event) => setLookaround(event.target.value)}
                    />
                    {LOOKAROUND_KINDS.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => compose(buildLookaround(kind, lookaround))}
                        aria-label={`${bilingualText({ en: 'Match only when', yue: '淨係喺以下情況先配對' })} ${bilingualText(LOOKAROUND_LABELS[kind])}`}
                      >
                        {bilingualText(LOOKAROUND_LABELS[kind])}
                      </button>
                    ))}
                  </div>

                  {composerError ? (
                    <p className="regex-composer__error" role="alert">
                      ⚠ {bilingualText(composerError)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <CoinSlot rungId="regex.groups" className="regex-popover__slot" />
              )}

              {/* ── Tier: the live lab ───────────────────────────────────────────────────── */}
              {lab ? (
                <div className="regex-lab" role="group" aria-label={bilingualText({ en: 'Test lab', yue: '試驗場' })}>
                  <label htmlFor={sampleId}>Test text · 試驗文字</label>
                  <textarea
                    id={sampleId}
                    className="regex-lab__sample"
                    rows={3}
                    maxLength={MAX_SAMPLE_LENGTH}
                    value={state.sample}
                    placeholder={bilingualText({
                      en: 'Type sample text to test the pattern against.',
                      yue: '打啲樣本文字嚟試呢個規則。',
                    })}
                    onChange={(event) => onChange({ ...state, sample: event.target.value })}
                  />
                  <p className="regex-lab__highlight" aria-hidden="true">
                    {lab.segments.map((segment, index) =>
                      segment.matchIndex === null ? (
                        <span key={index}>{segment.text}</span>
                      ) : (
                        <mark key={index}>{segment.text}</mark>
                      ),
                    )}
                  </p>
                  <p className="regex-lab__summary" role="status">
                    {bilingualText(lab.summary)}
                  </p>
                  {lab.matches.some((match) => match.captures.length > 0) ? (
                    <table className="regex-lab__captures">
                      <caption>Captures · 擷取</caption>
                      <thead>
                        <tr>
                          <th scope="col">Match · 配對</th>
                          <th scope="col">Group · 群組</th>
                          <th scope="col">Text · 文字</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lab.matches.flatMap((match, matchIndex) =>
                          match.captures.map((capture) => (
                            <tr key={`${matchIndex}-${capture.number}`}>
                              <td>{matchIndex + 1}</td>
                              <td>{capture.name ? `${capture.number} · ${capture.name}` : capture.number}</td>
                              <td>{capture.value === null ? '—' : capture.value}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  ) : null}
                  <p className="regex-lab__explain">{bilingualText(explanation)}</p>
                </div>
              ) : (
                <CoinSlot rungId="regex.lab" className="regex-popover__slot" />
              )}

              {/* The last ten patterns this field saw, newest first. Memory only — a history
                  that survived a reload would be a record of what somebody searched for. */}
              {history.length > 0 ? (
                <div
                  className="regex-history"
                  role="group"
                  aria-label={bilingualText({
                    en: `Recent patterns, last ${PATTERN_HISTORY_LIMIT}`,
                    yue: `最近嘅規則，最多 ${PATTERN_HISTORY_LIMIT} 個`,
                  })}
                >
                  {history.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => onChange({ ...state, pattern: entry, regex: true })}
                      aria-label={`${bilingualText({ en: 'Use pattern', yue: '用返呢個規則' })} ${entry}`}
                    >
                      {entry}
                    </button>
                  ))}
                </div>
              ) : null}
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

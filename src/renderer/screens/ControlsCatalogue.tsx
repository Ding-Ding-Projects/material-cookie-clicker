import { useState } from 'react';

import { formatExact, formatExactDigits } from '../../shared/game/format-number.js';
import { bnFromNumber } from '../../shared/game/big-number.js';
import {
  ALL_CONTROL_RUNG_IDS,
  CONTROL_UNLOCKS,
  controlRungLevel,
  type ControlGroup,
  type ControlUnlockDefinition,
} from '../../shared/game/control-unlocks.js';
import { CoinSlot } from '../components/CoinSlot.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { bilingualText, CONTROL_COPY, showsCantonese, showsEnglish } from '../game/copy.js';
import { useStructureSnapshot } from '../game/GameProvider.js';
import { matchesSearch } from '../game/local-regex-search.js';

/**
 * THE CONTROLS CATALOGUE — the price list for the control economy (control-unlocks.ts), living
 * inside the Settings panel where the first two purchases a player meets already are.
 *
 * Every control in the registry appears here whether it is bought or not, with every rung of its
 * ladder, its literal price and one line saying what buying it actually does. That is what makes
 * the joke playable rather than merely confusing: the shape of the whole economy is readable
 * from one screen, in order, at the prices printed.
 *
 * The search field at the top is FREE, and says so on the surface. It is one of the three floors
 * this feature holds to — a catalogue you had to buy the ability to read would be a circular
 * lock, and the honest way to say that is to write it under the box rather than to hide the fact
 * that it is an exception.
 */

const GROUP_ORDER: readonly ControlGroup[] = ['chrome', 'settings', 'search', 'regex', 'stepper', 'bulk', 'toggle'];

const GROUP_HEADINGS: Readonly<Record<ControlGroup, { en: string; yue: string }>> = {
  chrome: CONTROL_COPY.groupChrome,
  settings: CONTROL_COPY.groupSettings,
  search: CONTROL_COPY.groupSearch,
  regex: CONTROL_COPY.groupRegex,
  stepper: CONTROL_COPY.groupStepper,
  bulk: CONTROL_COPY.groupBulk,
  toggle: CONTROL_COPY.groupToggle,
};

/** Everything about one control a search could reasonably be expected to match. */
function haystack(control: ControlUnlockDefinition): string {
  return [
    control.nameEn,
    control.nameYue,
    control.whereEn,
    control.whereYue,
    ...control.rungs.flatMap((rung) => [rung.nameEn, rung.nameYue, rung.detailEn, rung.detailYue, String(rung.price)]),
  ].join(' ');
}

export function ControlsCatalogue() {
  const structure = useStructureSnapshot();
  const [search, setSearch] = useState(createSearchState());

  const ownedCount = (structure.controlUnlocks?.purchasedRungIds ?? []).filter((id) =>
    ALL_CONTROL_RUNG_IDS.includes(id),
  ).length;

  const matching = CONTROL_UNLOCKS.filter((control) => matchesSearch(haystack(control), search));

  return (
    <section className="settings-block controls-catalogue" aria-labelledby="controls-catalogue-label">
      <h3 className="settings-block__label" id="controls-catalogue-label">
        {bilingualText(CONTROL_COPY.catalogueTitle)}
        <span className="controls-catalogue__count">
          {bilingualText(CONTROL_COPY.catalogueOwned(ownedCount, ALL_CONTROL_RUNG_IDS.length))}
        </span>
      </h3>
      <p className="settings-caption">{bilingualText(CONTROL_COPY.catalogueIntro)}</p>
      <p className="settings-note settings-note--honest">{bilingualText(CONTROL_COPY.catalogueFloors)}</p>

      {/* No `controlId`: this one field in the whole application is deliberately ungated. */}
      <SearchWithRegexBuilder
        idPrefix="controls-catalogue-search"
        state={search}
        onChange={setSearch}
        placeholder={CONTROL_COPY.catalogueSearch}
        ariaLabel={CONTROL_COPY.catalogueSearch}
      />
      <p className="settings-caption">{bilingualText(CONTROL_COPY.catalogueSearchFree)}</p>

      {matching.length === 0 ? (
        <p className="empty-slot">{bilingualText(CONTROL_COPY.catalogueNoResults)}</p>
      ) : (
        GROUP_ORDER.map((group) => {
          const controls = matching.filter((control) => control.group === group);
          if (controls.length === 0) return null;
          return (
            <div key={group} className="controls-catalogue__group">
              <h4 className="controls-catalogue__group-title">{bilingualText(GROUP_HEADINGS[group])}</h4>
              {controls.map((control) => (
                <CatalogueRow key={control.id} control={control} level={controlRungLevel(structure, control.id)} />
              ))}
            </div>
          );
        })
      )}
    </section>
  );
}

/**
 * One control and its whole ladder, bottom rung first.
 *
 * Each rung is in exactly one of three states and says which: bought, buyable now (the coin-slot
 * plate, which is the same component the real control is replaced by out in the app, so a price
 * looks the same wherever it is met), or waiting on the rung below it. A rung above an unbought
 * one is NOT hidden — seeing that Max costs six thousand is the whole reason to buy ×100.
 */
function CatalogueRow({ control, level }: { control: ControlUnlockDefinition; level: number }) {
  return (
    <div className="controls-catalogue__row">
      <div className="controls-catalogue__names">
        {showsEnglish() ? <span className="controls-catalogue__name">{control.nameEn}</span> : null}
        {showsCantonese() ? <span className="controls-catalogue__name-zh">{control.nameYue}</span> : null}
        <span className="controls-catalogue__where">
          {showsEnglish() ? control.whereEn : null}
          {showsEnglish() && showsCantonese() ? ' · ' : null}
          {showsCantonese() ? control.whereYue : null}
        </span>
      </div>
      <ol className="controls-catalogue__rungs">
        {control.rungs.map((rung, index) => {
          const owned = index < level;
          const next = index === level;
          return (
            <li key={rung.id} className="controls-catalogue__rung" data-state={owned ? 'owned' : next ? 'next' : 'later'}>
              <span className="controls-catalogue__rung-name">
                {showsEnglish() ? rung.nameEn : null}
                {showsEnglish() && showsCantonese() ? ' · ' : null}
                {showsCantonese() ? rung.nameYue : null}
              </span>
              <span className="controls-catalogue__rung-detail">
                {showsEnglish() ? <span>{rung.detailEn}</span> : null}
                {showsCantonese() ? <span lang="zh-HK">{rung.detailYue}</span> : null}
              </span>
              {owned ? (
                <span className="controls-catalogue__rung-state controls-catalogue__rung-state--owned">
                  <span aria-hidden="true">✓</span> {bilingualText(CONTROL_COPY.rungOwned)}
                </span>
              ) : next ? (
                <CoinSlot rungId={rung.id} variant="inline" />
              ) : (
                <span
                  className="controls-catalogue__rung-state"
                  title={formatExactDigits(bnFromNumber(rung.price))}
                >
                  🍪 {formatExact(bnFromNumber(rung.price), 'en')} — {bilingualText(CONTROL_COPY.rungWaiting)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

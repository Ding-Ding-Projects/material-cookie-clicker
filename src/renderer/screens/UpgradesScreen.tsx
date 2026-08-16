import { memo, useMemo, useState } from 'react';

import { bnCompare, bnToNumber } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { getGeneratorDefinition } from '../../shared/game/generators.js';
import {
  isUpgradeUnlocked,
  UPGRADE_DEFINITIONS,
  type UpgradeDefinition,
  type UnlockCondition,
} from '../../shared/game/upgrades.js';
import type { GameState } from '../../shared/game/types.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { LIST_COPY, type Bilingual } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';
import { matchesSearch } from '../game/local-regex-search.js';

/** One of exactly three card states, mirroring design/upgrade-card.html. */
type CardState = 'locked' | 'buyable' | 'owned';

/** A card's glyph comes from what the upgrade actually does, so the icon is never decorative
 *  noise — click upgrades get a finger, per-generator upgrades a bakery, global ones butter. */
function iconFor(def: UpgradeDefinition): string {
  switch (def.effect.kind) {
    case 'clickMultiplier':
      return '👆';
    case 'generatorMultiplier':
      return '🏭';
    case 'globalCpsMultiplier':
      return '🧈';
  }
}

function describeEffect(def: UpgradeDefinition): Bilingual {
  switch (def.effect.kind) {
    case 'clickMultiplier':
      return {
        en: `Click power ×${def.effect.multiplier}.`,
        yue: `每擊力量 ×${def.effect.multiplier}。`,
      };
    case 'generatorMultiplier': {
      const gen = getGeneratorDefinition(def.effect.generatorId);
      return {
        en: `${gen.nameEn} output ×${def.effect.multiplier}.`,
        yue: `${gen.nameYue}產量 ×${def.effect.multiplier}。`,
      };
    }
    case 'globalCpsMultiplier':
      return {
        en: `All production ×${def.effect.multiplier}.`,
        yue: `全局產量 ×${def.effect.multiplier}。`,
      };
  }
}

interface UnlockProgress {
  readonly requirement: Bilingual;
  /** 0..1, for the progress track under a locked card. */
  readonly fraction: number;
  /** "12 / 50" style, already formatted; null when the condition has no meaningful counter. */
  readonly counter: string | null;
}

/** Explains, honestly and in both languages, what a locked card is still waiting for. */
function describeUnlock(condition: UnlockCondition, state: GameState): UnlockProgress | null {
  switch (condition.kind) {
    case 'always':
      return null;
    case 'generatorOwned': {
      const gen = getGeneratorDefinition(condition.generatorId);
      const owned = state.generators.find((g) => g.id === condition.generatorId)?.count ?? 0;
      return {
        requirement: {
          en: `Requires ${condition.atLeast} × ${gen.nameEn}.`,
          yue: `需要擁有 ${condition.atLeast} 個${gen.nameYue}。`,
        },
        fraction: Math.min(1, owned / condition.atLeast),
        counter: `${owned} / ${condition.atLeast}`,
      };
    }
    case 'lifetimeCookies': {
      const have = bnToNumber(state.lifetimeCookies);
      const need = bnToNumber(condition.atLeast);
      return {
        requirement: {
          en: `Requires ${formatBigNum(condition.atLeast, 'en')} lifetime cookies.`,
          yue: `需要一生累積 ${formatBigNum(condition.atLeast, 'yue')} 舊曲奇。`,
        },
        fraction: need > 0 ? Math.min(1, have / need) : 1,
        counter: `${formatBigNum(state.lifetimeCookies, 'en')} / ${formatBigNum(condition.atLeast, 'en')}`,
      };
    }
  }
}

/**
 * The only leaf that reads the fast (per-tick) slice: the cost line and the buy button's
 * enabled state. Keeping the subscription down here means a cookie tick re-renders one button
 * per card rather than the whole grid. The purchase itself goes through the single
 * `applyGameAction` seam via `dispatch` — this component never mutates state itself, and the
 * reducer independently re-checks affordability and the unlock condition.
 */
const UpgradeBuyButton = memo(function UpgradeBuyButton({ def, state }: { def: UpgradeDefinition; state: CardState }) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();

  if (state === 'owned') {
    return (
      <button type="button" className="item-card__buy" disabled>
        {LIST_COPY.alreadyOwned.en} · {LIST_COPY.alreadyOwned.yue}
      </button>
    );
  }

  if (state === 'locked') {
    return (
      <button type="button" className="item-card__buy" disabled>
        {LIST_COPY.locked.en} · {LIST_COPY.locked.yue} — 🍪 {formatBigNum(def.cost, 'en')}
      </button>
    );
  }

  const affordable = bnCompare(fast.cookies, def.cost) >= 0;
  return (
    <button
      type="button"
      className="item-card__buy"
      disabled={!affordable}
      onClick={() => dispatch({ type: 'buyUpgrade', upgradeId: def.id })}
    >
      {LIST_COPY.buy.en} · {LIST_COPY.buy.yue} — 🍪 {formatBigNum(def.cost, 'en')}
    </button>
  );
});

const UpgradeCard = memo(function UpgradeCard({
  def,
  state,
  progress,
}: {
  def: UpgradeDefinition;
  state: CardState;
  progress: UnlockProgress | null;
}) {
  const effect = describeEffect(def);
  const stateLabel: Bilingual =
    state === 'owned' ? LIST_COPY.owned : state === 'locked' ? LIST_COPY.locked : LIST_COPY.buy;

  return (
    <div
      className={`item-card upgrade-card ${state}`}
      role="group"
      aria-label={`${def.nameEn} · ${def.nameYue} — ${stateLabel.en} · ${stateLabel.yue}`}
    >
      {state === 'owned' ? (
        <span className="item-card__badge">
          {LIST_COPY.owned.en} · {LIST_COPY.owned.yue}
        </span>
      ) : null}
      <div className="item-card__icon" aria-hidden="true">
        {state === 'locked' ? '🔒' : iconFor(def)}
      </div>
      <div className="item-card__name-en">{def.nameEn}</div>
      <div className="item-card__name-zh">{def.nameYue}</div>
      <div className="item-card__desc">
        {effect.en} · {effect.yue}
        {state === 'locked' && progress ? (
          <>
            {' '}
            {progress.requirement.en} · {progress.requirement.yue}
          </>
        ) : null}
      </div>
      {state === 'locked' && progress ? (
        <>
          <div className="item-card__progress-line">{progress.counter}</div>
          <div
            className="item-card__progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.fraction * 100)}
            aria-label={`${progress.requirement.en} · ${progress.requirement.yue}`}
          >
            <div className="item-card__progress-fill" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
        </>
      ) : null}
      <UpgradeBuyButton def={def} state={state} />
    </div>
  );
});

/**
 * The Upgrades screen: every one-time upgrade in the shared domain, rendered in one of the three
 * states design/upgrade-card.html specifies (locked / unlocked-buyable / owned).
 *
 * Nothing here asks whether an application feature is available, and nothing here is gated by
 * game progress except the in-game purchase itself: locking an upgrade card only affects that
 * upgrade's own bonus.
 */
export function UpgradesScreen() {
  const structure = useStructureSnapshot();
  const [search, setSearch] = useState(createSearchState());

  const ownedIds = useMemo(() => new Set(structure.upgrades.map((u) => u.id)), [structure.upgrades]);

  const cards = useMemo(
    () =>
      UPGRADE_DEFINITIONS.map((def) => {
        const state: CardState = ownedIds.has(def.id)
          ? 'owned'
          : isUpgradeUnlocked(def.unlockCondition, structure)
            ? 'buyable'
            : 'locked';
        return { def, state, progress: describeUnlock(def.unlockCondition, structure) };
      }),
    [ownedIds, structure],
  );

  const visible = cards.filter((card) => matchesSearch(`${card.def.nameEn} ${card.def.nameYue}`, search));

  return (
    <div className="screen">
      <h1>
        Upgrades<span className="screen-title-zh">升級</span>
      </h1>
      <p className="screen-summary">
        {ownedIds.size} / {UPGRADE_DEFINITIONS.length} owned · 已擁有 {ownedIds.size} / {UPGRADE_DEFINITIONS.length}
      </p>
      <SearchWithRegexBuilder
        idPrefix="upgrades-search"
        state={search}
        onChange={setSearch}
        placeholder={LIST_COPY.searchPlaceholderUpgrades}
        ariaLabel={LIST_COPY.searchPlaceholderUpgrades}
      />
      {visible.length === 0 ? (
        <p>
          {LIST_COPY.noResults.en} · {LIST_COPY.noResults.yue}
        </p>
      ) : (
        <div className="card-grid">
          {visible.map((card) => (
            <UpgradeCard key={card.def.id} def={card.def} state={card.state} progress={card.progress} />
          ))}
        </div>
      )}
    </div>
  );
}

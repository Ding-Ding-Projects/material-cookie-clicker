import { memo, useMemo, useState } from 'react';

import { bnCompare, bnToNumber } from '../../shared/game/big-number.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { getGeneratorDefinition } from '../../shared/game/generators.js';
import {
  isUpgradeUnlocked,
  UPGRADE_DEFINITIONS,
  type UpgradeDefinition,
  type UnlockCondition,
  type RevealSurface,
} from '../../shared/game/upgrades.js';
import type { GameState } from '../../shared/game/types.js';
import { UpgradeIcon, type UpgradeFamily } from '../assets/icons.js';
import { createSearchState, SearchWithRegexBuilder } from '../components/SearchWithRegexBuilder.js';
import { DISCLOSURE_COPY, GAME_SURFACE_COPY, LIST_COPY, type Bilingual } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';
import { matchesSearch } from '../game/local-regex-search.js';

/** One of exactly three card states, mirroring design/upgrade-card.html. */
type CardState = 'locked' | 'buyable' | 'owned';

/** A ticket's illustration comes from what the upgrade actually does, so the art is never
 *  decorative noise — click upgrades get the sparking finger, per-generator upgrades the geared
 *  cookie works, global ones the whole oven. */
function familyFor(def: UpgradeDefinition): UpgradeFamily {
  switch (def.effect.kind) {
    case 'clickMultiplier':
      return 'click';
    case 'generatorMultiplier':
      return 'generator';
    case 'globalCpsMultiplier':
      return 'global';
    // A reveal upgrade buys back a piece of the surface rather than a multiplier, so it wears
    // the golden family: this is the ticket that turns something on.
    case 'reveal':
      return 'golden';
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
    case 'reveal':
      return REVEAL_EFFECT_COPY[def.effect.surface];
  }
}

/** What each reveal upgrade actually turns on, in the ticket's own effect line. */
const REVEAL_EFFECT_COPY: Readonly<Record<RevealSurface, Bilingual>> = {
  shop: DISCLOSURE_COPY.revealShop,
  upgradeStrip: DISCLOSURE_COPY.revealUpgradeStrip,
  holdToClick: DISCLOSURE_COPY.revealHoldToClick,
  dieselDepot: DISCLOSURE_COPY.revealDieselDepot,
};

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
    case 'upgradeOwned': {
      // A reveal chained behind another reveal. There is no counter to show — you either own
      // the previous ticket or you do not — so this is a requirement line with a binary track.
      const previous = UPGRADE_DEFINITIONS.find((u) => u.id === condition.upgradeId);
      const owned = state.upgrades.some((u) => u.id === condition.upgradeId);
      return {
        requirement: {
          en: `Requires ${previous?.nameEn ?? condition.upgradeId}.`,
          yue: `需要先買${previous?.nameYue ?? condition.upgradeId}。`,
        },
        fraction: owned ? 1 : 0,
        counter: null,
      };
    }
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
 * One perforated ticket in the strip under the cookie (design-v2/game-layout.html). The ticket
 * IS the buy control — there is no separate card and no separate buy button, because an upgrade
 * purchase on the game surface has to be a single reach from the cookie.
 *
 * This is also the only leaf that reads the fast (per-tick) slice, so a cookie tick re-renders
 * one ticket's affordability rather than the whole strip. The purchase goes through the single
 * `applyGameAction` seam via `dispatch`; the reducer independently re-checks affordability and
 * the unlock condition.
 */
const UpgradeTicket = memo(function UpgradeTicket({
  def,
  state,
  progress,
}: {
  def: UpgradeDefinition;
  state: CardState;
  progress: UnlockProgress | null;
}) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();

  const effect = describeEffect(def);
  const stateLabel: Bilingual =
    state === 'owned' ? LIST_COPY.alreadyOwned : state === 'locked' ? LIST_COPY.locked : LIST_COPY.buy;
  const affordable = state === 'buyable' && bnCompare(fast.cookies, def.cost) >= 0;

  // The cost line is never colour-only: it literally reads "Owned" or "Locked" when that is the
  // state, so the three states are distinguishable without seeing the ticket's fill.
  const costLine =
    state === 'owned'
      ? `${LIST_COPY.alreadyOwned.en} · ${LIST_COPY.alreadyOwned.yue}`
      : state === 'locked'
        ? `🔒 🍪 ${formatBigNum(def.cost, 'en')}`
        : `🍪 ${formatBigNum(def.cost, 'en')}`;

  return (
    <button
      type="button"
      className={`mini-ticket ${state}`}
      disabled={!affordable}
      title={`${effect.en} · ${effect.yue}`}
      aria-label={`${def.nameEn} · ${def.nameYue} — ${effect.en} · ${effect.yue} — ${stateLabel.en} · ${stateLabel.yue} — 🍪 ${formatBigNum(def.cost, 'en')}${
        state === 'locked' && progress ? ` — ${progress.requirement.en} · ${progress.requirement.yue}` : ''
      }`}
      onClick={() => dispatch({ type: 'buyUpgrade', upgradeId: def.id })}
    >
      <span className="mini-ticket__glyph" aria-hidden="true">
        <UpgradeIcon family={state === 'locked' ? 'locked' : familyFor(def)} />
      </span>
      <span className="mini-ticket__name">{def.nameEn}</span>
      <span className="mini-ticket__name-zh">{def.nameYue}</span>
      {state === 'locked' && progress ? (
        <span
          className="mini-ticket__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.fraction * 100)}
          aria-label={`${progress.requirement.en} · ${progress.requirement.yue}`}
        >
          <span className="mini-ticket__fill" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
        </span>
      ) : null}
      <span className="mini-ticket__cost">{costLine}</span>
    </button>
  );
});

/**
 * The upgrade ticket strip: every one-time upgrade in the shared domain, in one of the three
 * states design-v2/upgrade-card.html specifies (locked / unlocked-buyable / owned), laid out as a
 * horizontally-scrolling strip directly under the cookie on the single game surface. Upgrades are
 * never a page, and never move into the shop drawer — buying a generator and buying an upgrade
 * are two different decisions.
 *
 * Nothing here asks whether an application feature is available, and nothing here is gated by
 * game progress except the in-game purchase itself: locking a ticket only affects that upgrade's
 * own bonus.
 */
export function UpgradeStrip() {
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
    <section className="panel" aria-label={`${GAME_SURFACE_COPY.upgradeStripLabel.en} · ${GAME_SURFACE_COPY.upgradeStripLabel.yue}`}>
      {/* The search sits IN the heading row rather than on its own line: on the game surface every
          vertical pixel it would take is a pixel of ticket the player can no longer see. */}
      <div className="panel__header">
        <h2 className="panel__title">
          <span>{GAME_SURFACE_COPY.upgradesTitle.en}</span>
          <span className="panel__title-zh">{GAME_SURFACE_COPY.upgradesTitle.yue}</span>
          <span className="panel__title-count">
            {ownedIds.size} / {UPGRADE_DEFINITIONS.length}
          </span>
        </h2>
        <div className="panel__header-search">
          <SearchWithRegexBuilder
            idPrefix="upgrades-search"
            state={search}
            onChange={setSearch}
            placeholder={LIST_COPY.searchPlaceholderUpgrades}
            ariaLabel={LIST_COPY.searchPlaceholderUpgrades}
          />
        </div>
      </div>
      {visible.length === 0 ? (
        <p>
          {LIST_COPY.noResults.en} · {LIST_COPY.noResults.yue}
        </p>
      ) : (
        <div className="upgrade-strip upgrade-strip--crumbs">
          {visible.map((card) => (
            <UpgradeTicket key={card.def.id} def={card.def} state={card.state} progress={card.progress} />
          ))}
        </div>
      )}
    </section>
  );
}

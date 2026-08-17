import { memo, useMemo, useState } from 'react';

import { bnCompare, bnToNumber } from '../../shared/game/big-number.js';
import { formatBigNum, formatExact, formatExactDigits } from '../../shared/game/format-number.js';
import { getGeneratorDefinition } from '../../shared/game/generators.js';
import { milkPercent } from '../../shared/game/milk.js';
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
import { showsEnglish, showsCantonese, bilingualText, DISCLOSURE_COPY, GAME_SURFACE_COPY, LIST_COPY, SHELF_COPY, type Bilingual } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';
import { upgradeTargetKey, usePurchaseFxTarget } from '../game/purchase-fx.js';
import { matchesSearch } from '../game/local-regex-search.js';
import { buyableTickets, nearestLocked, ownedStamps, type ShelfCard } from '../game/upgrade-shelf.js';

/** A ticket's illustration comes from what the upgrade actually does, so the art is never
 *  decorative noise — click upgrades get the sparking finger, per-generator upgrades the geared
 *  cookie works, global ones the whole oven. */
function familyFor(def: UpgradeDefinition): UpgradeFamily {
  switch (def.effect.kind) {
    case 'clickMultiplier':
      return 'click';
    case 'generatorMultiplier':
    // A synergy is still a statement about one generator's output, so it wears the works.
    case 'synergy':
      return 'generator';
    case 'globalCpsMultiplier':
    // A kitten multiplies the whole bakery, exactly as a global upgrade does.
    case 'kitten':
      return 'global';
    // A reveal upgrade buys back a piece of the surface rather than a multiplier, so it wears
    // the golden family: this is the ticket that turns something on. The golden-cookie line
    // wears it too, and rather more literally.
    case 'reveal':
    case 'goldenCookie':
      return 'golden';
  }
}

function describeEffect(def: UpgradeDefinition, state: GameState): Bilingual {
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
    case 'synergy': {
      const target = getGeneratorDefinition(def.effect.targetGeneratorId);
      const source = getGeneratorDefinition(def.effect.sourceGeneratorId);
      const percent = (def.effect.percentPerUnit * 100).toFixed(1);
      return {
        en: `${target.nameEn} output +${percent}% per ${source.nameEn} owned.`,
        yue: `每擁有一個${source.nameYue}，${target.nameYue}產量 +${percent}%。`,
      };
    }
    case 'kitten': {
      // A kitten's worth is not a fixed number on a card — it is whatever the milk is right
      // now. Printing today's figure beside the rate is the only honest way to show it.
      const milk = milkPercent(state);
      const now = (1 + (milk / 100) * def.effect.strength).toFixed(2);
      return {
        en: `All production ×${(1 + def.effect.strength).toFixed(3)} at 100% milk — ×${now} right now.`,
        yue: `100% 奶時全局產量 ×${(1 + def.effect.strength).toFixed(3)}，而家係 ×${now}。`,
      };
    }
    case 'goldenCookie': {
      const parts: string[] = [];
      const partsYue: string[] = [];
      if (def.effect.rewardMultiplier !== undefined) {
        parts.push(`Golden cookie payout ×${def.effect.rewardMultiplier}`);
        partsYue.push(`金曲奇獎賞 ×${def.effect.rewardMultiplier}`);
      }
      if (def.effect.frequencyMultiplier !== undefined) {
        const sooner = Math.round((1 - def.effect.frequencyMultiplier) * 100);
        parts.push(`next golden cookie ${sooner}% sooner`);
        partsYue.push(`下一隻金曲奇快 ${sooner}%`);
      }
      return { en: `${parts.join(', ')}.`, yue: `${partsYue.join('，')}。` };
    }
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
    case 'achievementsUnlocked': {
      const owned = state.achievements.length;
      return {
        requirement: {
          en: `Requires ${condition.atLeast} achievements.`,
          yue: `需要解鎖 ${condition.atLeast} 個成就。`,
        },
        fraction: Math.min(1, owned / condition.atLeast),
        counter: `${owned} / ${condition.atLeast}`,
      };
    }
    case 'totalClicks': {
      const owned = state.stats.totalClicks;
      return {
        requirement: {
          en: `Requires ${condition.atLeast.toLocaleString('en-US')} clicks.`,
          yue: `需要撳夠 ${condition.atLeast.toLocaleString('en-US')} 下。`,
        },
        fraction: Math.min(1, owned / condition.atLeast),
        counter: `${owned.toLocaleString('en-US')} / ${condition.atLeast.toLocaleString('en-US')}`,
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
 * One buyable ticket on the shelf. The ticket IS the buy control — there is no separate card and
 * no separate buy button, because an upgrade purchase on the game surface has to be a single
 * reach from the cookie.
 *
 * This is also the only leaf that reads the fast (per-tick) slice, so a cookie tick re-renders
 * one ticket's affordability rather than the whole shelf. The purchase goes through the single
 * `applyGameAction` seam via `dispatch`; the reducer independently re-checks affordability and
 * the unlock condition.
 */
const UpgradeTicket = memo(function UpgradeTicket({
  def,
  effect,
}: {
  def: UpgradeDefinition;
  effect: Bilingual;
}) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();
  const fxRef = usePurchaseFxTarget<HTMLButtonElement>(upgradeTargetKey(def.id));

  const affordable = bnCompare(fast.cookies, def.cost) >= 0;

  return (
    <button
      ref={fxRef}
      type="button"
      className={`shelf-ticket${affordable ? ' shelf-ticket--affordable' : ''}`}
      disabled={!affordable}
      title={`${bilingualText(effect)} — 🍪 ${formatExactDigits(def.cost)}`}
      aria-label={`${def.nameEn} · ${def.nameYue} — ${bilingualText(effect)} — ${bilingualText(LIST_COPY.buy)} — 🍪 ${formatExactDigits(def.cost)}`}
      onClick={() => dispatch({ type: 'buyUpgrade', upgradeId: def.id })}
    >
      <span className="shelf-ticket__glyph" aria-hidden="true">
        <UpgradeIcon family={familyFor(def)} />
      </span>
      <span className="shelf-ticket__body">
        {showsEnglish() ? <span className="shelf-ticket__name">{def.nameEn}</span> : null}
        {showsCantonese() ? <span className="shelf-ticket__name-zh">{def.nameYue}</span> : null}
        <span className="shelf-ticket__cost">{`🍪 ${formatExact(def.cost, 'en')}`}</span>
      </span>
    </button>
  );
});

/**
 * One owned upgrade, collapsed to a stamp.
 *
 * An owned upgrade is a fact, not a decision. It needs no price, no buy affordance and no name
 * on screen — it needs to be countable at a glance and identifiable on demand, which is exactly
 * what a stamp with a tooltip and a real accessible name is. This is what replaced 150 owned
 * cards competing for the same shelf as the six the player can actually act on.
 */
const OwnedStamp = memo(function OwnedStamp({ def, effect }: { def: UpgradeDefinition; effect: Bilingual }) {
  return (
    <span
      className="shelf-stamp"
      title={`${def.nameEn} · ${def.nameYue} — ${bilingualText(effect)}`}
      role="img"
      aria-label={`${def.nameEn} · ${def.nameYue} — ${bilingualText(LIST_COPY.alreadyOwned)}`}
    >
      <UpgradeIcon family={familyFor(def)} />
    </span>
  );
});

/** One locked upgrade, shown as its requirement rather than as a price. */
const LockedRow = memo(function LockedRow({
  def,
  progress,
}: {
  def: UpgradeDefinition;
  progress: UnlockProgress;
}) {
  const percent = Math.round(progress.fraction * 100);
  return (
    <li className="shelf-locked">
      <span className="shelf-locked__glyph" aria-hidden="true">
        <UpgradeIcon family="locked" />
      </span>
      <span className="shelf-locked__text">
        <span className="shelf-locked__name">
          {showsEnglish() ? def.nameEn : null}
          {showsEnglish() && showsCantonese() ? ' · ' : null}
          {showsCantonese() ? <span lang="zh-HK">{def.nameYue}</span> : null}
        </span>
        <span className="shelf-locked__requirement">{bilingualText(progress.requirement)}</span>
      </span>
      <span
        className="shelf-locked__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={bilingualText(progress.requirement)}
      >
        <span className="shelf-locked__fill" style={{ width: `${percent}%` }} />
      </span>
      {progress.counter ? <span className="shelf-locked__counter">{progress.counter}</span> : null}
    </li>
  );
});

/**
 * How many locked upgrades the shelf is willing to name at once.
 *
 * Every locked upgrade in the catalogue would be well over a hundred requirement lines under a
 * shelf of six buyable ones, which is a list nobody reads. The ones shown are the ones CLOSEST
 * to unlocking, which are the only locked ones a player can do anything about today.
 */
const LOCKED_PREVIEW_LIMIT = 8;

/**
 * THE UPGRADE SHELF.
 *
 * It used to be one horizontal strip holding every upgrade in the game in one flat row, scrolled
 * left and right. That was fine at seventy-nine upgrades and became unusable at a hundred and
 * fifty-odd: the six tickets the player could actually buy were somewhere in the middle of a
 * kilometre of owned ones, and finding them meant dragging a scrollbar past your own history.
 *
 * The shelf now says three different things in three different shapes, because they are three
 * different kinds of fact:
 *
 *   OWNED     — a stamp wall. Small, dense, countable, no prices. History, not choices.
 *   BUYABLE   — a wrapping grid, sorted so whatever you can afford next is first, capped at two
 *               rows tall with its own internal scroll past that. These are the choices.
 *   LOCKED    — requirement lines for the handful nearest to unlocking. These are the near
 *               future, and nothing else pretends to be.
 *
 * The search field and its regex builder are untouched and filter all three at once.
 */
export function UpgradeStrip() {
  const structure = useStructureSnapshot();
  const [search, setSearch] = useState(createSearchState());

  const ownedIds = useMemo(() => new Set(structure.upgrades.map((u) => u.id)), [structure.upgrades]);

  const cards = useMemo(
    () =>
      UPGRADE_DEFINITIONS.map((def) => {
        const state = ownedIds.has(def.id)
          ? 'owned'
          : isUpgradeUnlocked(def.unlockCondition, structure)
            ? 'buyable'
            : 'locked';
        const progress = describeUnlock(def.unlockCondition, structure);
        return {
          def,
          state,
          effect: describeEffect(def, structure),
          progress,
          progressFraction: progress?.fraction ?? null,
        };
      }),
    [ownedIds, structure],
  );

  const visible = useMemo(
    () => cards.filter((card) => matchesSearch(`${card.def.nameEn} ${card.def.nameYue}`, search)),
    [cards, search],
  );

  // The three arrangements are pure functions of the cards, and live in game/upgrade-shelf.ts
  // so a test can assert the order without rendering anything.
  const owned = useMemo(() => ownedStamps(visible as readonly ShelfCard[]), [visible]);
  const buyable = useMemo(() => buyableTickets(visible as readonly ShelfCard[]), [visible]);
  const locked = useMemo(() => nearestLocked(visible as readonly ShelfCard[], LOCKED_PREVIEW_LIMIT), [visible]);

  // The arrangement helpers deal in ShelfCard, which deliberately carries no rendered copy; the
  // copy is looked up here by id so the sort has nothing to keep in step with.
  const byId = useMemo(() => new Map(visible.map((c) => [c.def.id, c] as const)), [visible]);
  const effectFor = (id: string): Bilingual => byId.get(id)!.effect;
  const progressFor = (id: string): UnlockProgress | null => byId.get(id)!.progress;

  return (
    <section className="panel upgrade-shelf" aria-label={bilingualText(GAME_SURFACE_COPY.upgradeStripLabel)}>
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

      {visible.length === 0 ? <p>{bilingualText(LIST_COPY.noResults)}</p> : null}

      {buyable.length > 0 ? (
        <div className="shelf-section shelf-section--buyable">
          <h3 className="shelf-section__heading">
            <span>{bilingualText(SHELF_COPY.buyableHeading)}</span>
            <span className="shelf-section__badge">{buyable.length}</span>
          </h3>
          <div className="shelf-grid">
            {buyable.map((card) => (
              <UpgradeTicket key={card.def.id} def={card.def} effect={effectFor(card.def.id)} />
            ))}
          </div>
        </div>
      ) : null}

      {locked.length > 0 ? (
        <div className="shelf-section shelf-section--locked">
          <h3 className="shelf-section__heading">
            <span>{bilingualText(SHELF_COPY.lockedHeading)}</span>
            <span className="shelf-section__badge">{locked.length}</span>
          </h3>
          <ul className="shelf-locked-list">
            {locked.map((card) => (
              <LockedRow key={card.def.id} def={card.def} progress={progressFor(card.def.id)!} />
            ))}
          </ul>
        </div>
      ) : null}

      {owned.length > 0 ? (
        <div className="shelf-section shelf-section--owned">
          <h3 className="shelf-section__heading">
            <span>{bilingualText(SHELF_COPY.ownedHeading)}</span>
            <span className="shelf-section__badge">{owned.length}</span>
          </h3>
          <div className="shelf-stamp-wall">
            {owned.map((card) => (
              <OwnedStamp key={card.def.id} def={card.def} effect={effectFor(card.def.id)} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

import { bnCompare } from '../../shared/game/big-number.js';
import type { UpgradeDefinition } from '../../shared/game/upgrades.js';

/**
 * The upgrade shelf's ARRANGEMENT, extracted from the component that draws it.
 *
 * Sorting a hundred and seventy-nine upgrades into three shapes is the part of the shelf most
 * likely to be quietly wrong, and it is a pure function of definitions and a couple of numbers —
 * so it lives here, where a test can assert it directly without rendering React.
 */

/** One of exactly three card states, mirroring design/upgrade-card.html. */
export type ShelfCardState = 'locked' | 'buyable' | 'owned';

export interface ShelfCard {
  readonly def: UpgradeDefinition;
  readonly state: ShelfCardState;
  /** 0..1 progress toward the unlock condition; null when the card has no condition to show. */
  readonly progressFraction: number | null;
}

/**
 * NEXT-AFFORDABLE-FIRST.
 *
 * Cheapest first IS "what you can buy soonest", and it is a total order over the definitions
 * rather than over the live cookie count — which matters, because the cookie count changes
 * several times a second and a sort keyed to it would reshuffle the shelf under the player's
 * cursor mid-click. The cheapest buyable upgrade is the next one they can afford whether they
 * can afford it this instant or in ten seconds.
 *
 * Ties break on id so the order is stable and never depends on catalogue authoring order.
 */
export function sortByNextAffordable(cards: readonly ShelfCard[]): ShelfCard[] {
  return [...cards].sort((a, b) => {
    const byCost = bnCompare(a.def.cost, b.def.cost);
    if (byCost !== 0) return byCost;
    return a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0;
  });
}

/**
 * The locked cards worth naming: the ones CLOSEST to unlocking, capped.
 *
 * Every locked upgrade would be well over a hundred requirement lines under a shelf of a handful
 * of buyable ones, which is a list nobody reads. A locked card at 2% is not information; a
 * locked card at 90% is the next thing to go and do.
 */
export function nearestLocked(cards: readonly ShelfCard[], limit: number): ShelfCard[] {
  return [...cards]
    .filter((card) => card.state === 'locked' && card.progressFraction !== null)
    .sort((a, b) => {
      const byProgress = (b.progressFraction ?? 0) - (a.progressFraction ?? 0);
      if (byProgress !== 0) return byProgress;
      return a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0;
    })
    .slice(0, Math.max(0, limit));
}

/** The owned cards, in catalogue order — the stamp wall is history, and history has an order. */
export function ownedStamps(cards: readonly ShelfCard[]): ShelfCard[] {
  return cards.filter((card) => card.state === 'owned');
}

/** The buyable cards, already arranged. */
export function buyableTickets(cards: readonly ShelfCard[]): ShelfCard[] {
  return sortByNextAffordable(cards.filter((card) => card.state === 'buyable'));
}

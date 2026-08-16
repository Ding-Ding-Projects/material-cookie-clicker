import { bnCompare, bnMulScalar, bnToNumber } from '../../shared/game/big-number.js';
import { computeDisclosure } from '../../shared/game/disclosure.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { isUpgradeUnlocked, REVEAL_UPGRADE_DEFINITIONS, type UpgradeDefinition } from '../../shared/game/upgrades.js';
import { UpgradeIcon } from '../assets/icons.js';
import { DISCLOSURE_COPY, type Bilingual } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';

/**
 * How close to the price the player has to get before the ticket appears at all. Half the cost
 * is far enough in that it never greets a brand-new save, and near enough that it always
 * arrives while the player is still clicking rather than long after.
 */
const DISCOVERY_REVEAL_FRACTION = 0.5;

const REVEAL_DESCRIPTIONS: Readonly<Record<string, Bilingual>> = {
  reveal_shop_sign: DISCLOSURE_COPY.revealShop,
  reveal_upgrade_catalogue: DISCLOSURE_COPY.revealUpgradeStrip,
  reveal_steady_hand: DISCLOSURE_COPY.revealHoldToClick,
  reveal_fuel_contract: DISCLOSURE_COPY.revealDieselDepot,
};

/**
 * THE BOOTSTRAP.
 *
 * Progressive disclosure hides the upgrade ticket strip behind an upgrade — which leaves an
 * obvious chicken-and-egg: with no strip on screen there is nowhere to buy the thing that
 * brings the strip back. This is the answer. A single ticket, beside the cookie, carrying the
 * next un-owned reveal upgrade, and nothing else — never a second list, never a parallel
 * purchase path. Pressing it dispatches the ordinary `buyUpgrade` action through the one
 * `applyGameAction` seam, exactly as a ticket in the real strip does.
 *
 * It retires itself the moment the strip exists: once Upgrade Catalogue is owned, every
 * remaining reveal is an ordinary ticket in the ordinary strip, and this component renders
 * nothing for the rest of the run.
 *
 * The ticket is mysterious before it is affordable — a shape, a price, and no name. It names
 * itself only when the player can actually act on it, so the reveal and the ability to take it
 * land in the same moment rather than as a taunt followed by a wait.
 *
 * Shaped per design/upgrade-card.html: punched notches, a dashed perforation, and the price as
 * a stub across the bottom.
 */
export function DiscoveryTicket() {
  const structure = useStructureSnapshot();
  const fast = useFastSnapshot();
  const dispatch = useGameDispatch();

  const disclosure = computeDisclosure(structure);
  // Once the strip is on screen it owns every remaining reveal. One purchase surface at a time.
  if (disclosure.upgradeStrip) return null;

  const ownedIds = new Set(structure.upgrades.map((u) => u.id));
  const next: UpgradeDefinition | undefined = REVEAL_UPGRADE_DEFINITIONS.find(
    (def) => !ownedIds.has(def.id) && isUpgradeUnlocked(def.unlockCondition, structure),
  );
  if (!next) return null;

  const threshold = bnMulScalar(next.cost, DISCOVERY_REVEAL_FRACTION);
  if (bnCompare(fast.cookies, threshold) < 0) return null;

  const affordable = bnCompare(fast.cookies, next.cost) >= 0;
  const priceText = `🍪 ${formatBigNum(next.cost, 'en')}`;
  const description = REVEAL_DESCRIPTIONS[next.id] ?? DISCLOSURE_COPY.discoveryMystery;
  const progressPercent = Math.min(
    100,
    Math.round((bnToNumber(fast.cookies) / Math.max(bnToNumber(next.cost), 1)) * 100),
  );

  // Before it is affordable the ticket is a nameless rumour with a price on it, and it is NOT a
  // control: a focusable button that can only ever refuse is a dead stop for the keyboard. The
  // progress track carries the "how close am I" answer instead, and announces it properly.
  if (!affordable) {
    return (
      <section
        className="panel discovery-ticket discovery-ticket--rumour"
        aria-label={`${DISCLOSURE_COPY.discoveryLabel.en} · ${DISCLOSURE_COPY.discoveryLabel.yue}`}
      >
        <span className="discovery-ticket__glyph" aria-hidden="true">
          <UpgradeIcon family="locked" />
        </span>
        <span className="discovery-ticket__name">{DISCLOSURE_COPY.discoveryMystery.en}</span>
        <span className="discovery-ticket__name-zh">{DISCLOSURE_COPY.discoveryMystery.yue}</span>
        <span className="discovery-ticket__desc">
          {DISCLOSURE_COPY.discoveryHint.en} · {DISCLOSURE_COPY.discoveryHint.yue}
        </span>
        <span className="discovery-ticket__perf" aria-hidden="true" />
        <span
          className="discovery-ticket__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          aria-label={`${DISCLOSURE_COPY.discoveryHint.en} ${priceText} · ${DISCLOSURE_COPY.discoveryHint.yue} ${priceText}`}
        >
          <span className="discovery-ticket__fill" style={{ width: `${progressPercent}%` }} />
        </span>
        <span className="discovery-ticket__stub">{priceText}</span>
      </section>
    );
  }

  return (
    <section
      className="panel discovery-ticket"
      aria-label={`${DISCLOSURE_COPY.discoveryLabel.en} · ${DISCLOSURE_COPY.discoveryLabel.yue}`}
    >
      <span className="discovery-ticket__glyph" aria-hidden="true">
        <UpgradeIcon family="golden" />
      </span>
      <span className="discovery-ticket__name">{next.nameEn}</span>
      <span className="discovery-ticket__name-zh">{next.nameYue}</span>
      <span className="discovery-ticket__desc">
        {description.en} · {description.yue}
      </span>
      <span className="discovery-ticket__perf" aria-hidden="true" />
      <button
        type="button"
        className="discovery-ticket__stub discovery-ticket__stub--buy"
        aria-label={`${DISCLOSURE_COPY.discoveryBuy.en} ${next.nameEn} — ${description.en} — ${priceText} · ${DISCLOSURE_COPY.discoveryBuy.yue}${next.nameYue} — ${description.yue} — ${priceText}`}
        onClick={() => dispatch({ type: 'buyUpgrade', upgradeId: next.id })}
      >
        {DISCLOSURE_COPY.discoveryBuy.en} · {DISCLOSURE_COPY.discoveryBuy.yue} — {priceText}
      </button>
    </section>
  );
}

import { bnCompare } from '../../shared/game/big-number.js';
import { costOfLitres, DIESEL_LEDGER_DISPLAY_PATH } from '../../shared/game/diesel-exchange.js';
import { computeDisclosure } from '../../shared/game/disclosure.js';
import { formatBigNum } from '../../shared/game/format-number.js';
import { DieselCanisterIcon } from '../assets/icons.js';
import { DIESEL_COPY } from '../game/copy.js';
import { useDieselExchange, useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';
import { DIESEL_TARGET_KEY, usePurchaseFxTarget } from '../game/purchase-fx.js';

/** One litre a press. The curve is steep enough (15% a litre) that a bulk stepper here would
 *  be a way to spend a fortune by accident, and the whole point is a deliberate purchase. */
const MINT_LITRES = 1;

/**
 * THE DIESEL DEPOT — a fuel counter in the shop rail's footer.
 *
 * Cookies buy litres of diesel for WinForge, a separate application whose PWR simulator runs
 * two emergency diesel generators. Pressing Mint dispatches the ordinary `mintDiesel` action
 * through the one `applyGameAction` seam; the voucher file is written afterwards by
 * GameProvider through the main process (see diesel-exchange.ts for the whole contract).
 *
 * WHAT THIS CARD IS CAREFUL NOT TO SAY. It never claims a litre was delivered, burned, or
 * accepted. It reports three separate facts: how many litres this save has minted, how many
 * vouchers are in the shared ledger, and how many of those carry a `consumedAt` — a field only
 * WinForge ever writes. As of this build no WinForge reader exists, so that last number is
 * zero and is shown as "none yet", with the reason attached.
 *
 * It is not on screen at the start of a run: it arrives with the Fuel Contract reveal upgrade
 * (disclosure.ts#dieselDepot), which itself needs the Shop Sign, because a footer needs a rail.
 */
export function DieselDepot() {
  const structure = useStructureSnapshot();
  const fast = useFastSnapshot();
  const dispatch = useGameDispatch();
  const exchange = useDieselExchange();
  // The card is where the pump sequence plays. Registered unconditionally-shaped (the hook
  // runs before the disclosure early-return) so the rule of hooks holds.
  const fxRef = usePurchaseFxTarget<HTMLElement>(DIESEL_TARGET_KEY);

  if (!computeDisclosure(structure).dieselDepot) return null;

  const depot = structure.dieselDepot;
  const price = costOfLitres(depot.litresMinted, MINT_LITRES);
  const affordable = bnCompare(fast.cookies, price) >= 0;
  const priceText = formatBigNum(price, 'en');
  const mintLabel = DIESEL_COPY.mintButton(MINT_LITRES, priceText);

  // The consumed line reads from the LEDGER, not from game state: game state cannot know what
  // the other application did. With no ledger read yet (no bridge, or a failed read) it says so
  // rather than showing a zero that would look like a fact.
  const consumedText =
    exchange.summary && exchange.summary.consumedCount > 0
      ? String(exchange.summary.consumedCount)
      : `${DIESEL_COPY.consumedNone.en} · ${DIESEL_COPY.consumedNone.yue}`;

  const ledgerPath = exchange.ledgerPath ?? DIESEL_LEDGER_DISPLAY_PATH;

  return (
    <section
      ref={fxRef}
      className="diesel-depot"
      aria-label={`${DIESEL_COPY.title.en} · ${DIESEL_COPY.title.yue}`}
    >
      <header className="diesel-depot__head">
        <span className="diesel-depot__icon" aria-hidden="true">
          <DieselCanisterIcon />
        </span>
        <span className="diesel-depot__names">
          <span className="diesel-depot__name">{DIESEL_COPY.title.en}</span>
          <span className="diesel-depot__name-zh">{DIESEL_COPY.title.yue}</span>
        </span>
      </header>

      <p className="diesel-depot__sub">
        {DIESEL_COPY.subtitle.en} · {DIESEL_COPY.subtitle.yue}
      </p>

      <dl className="diesel-depot__figures">
        <div className="diesel-depot__figure">
          <dt>
            {DIESEL_COPY.litresLabel.en} · {DIESEL_COPY.litresLabel.yue}
          </dt>
          <dd className="diesel-depot__count">{depot.litresMinted} L</dd>
        </div>
        <div className="diesel-depot__figure">
          <dt>
            {DIESEL_COPY.vouchersLabel.en} · {DIESEL_COPY.vouchersLabel.yue}
          </dt>
          <dd className="diesel-depot__count">{exchange.summary?.voucherCount ?? depot.vouchersMinted}</dd>
        </div>
      </dl>

      <p className="diesel-depot__consumed">
        <span className="diesel-depot__consumed-label">
          {DIESEL_COPY.consumedLabel.en} · {DIESEL_COPY.consumedLabel.yue}:
        </span>{' '}
        <span className="diesel-depot__consumed-value">{consumedText}</span>
      </p>

      <button
        type="button"
        className="diesel-depot__mint"
        disabled={!affordable}
        aria-label={`${mintLabel.en} · ${mintLabel.yue}`}
        onClick={() => dispatch({ type: 'mintDiesel', litres: MINT_LITRES })}
      >
        {mintLabel.en} · {mintLabel.yue}
      </button>

      {!affordable ? (
        <p className="diesel-depot__note">
          {DIESEL_COPY.cannotAfford.en} · {DIESEL_COPY.cannotAfford.yue}
        </p>
      ) : null}

      {exchange.error ? (
        <p className="diesel-depot__note diesel-depot__note--problem" role="status">
          {exchange.error.en} · {exchange.error.yue}
        </p>
      ) : null}

      {!exchange.bridgeAvailable ? (
        <p className="diesel-depot__note diesel-depot__note--problem">
          {DIESEL_COPY.noBridge.en} · {DIESEL_COPY.noBridge.yue}
        </p>
      ) : null}

      <p className="diesel-depot__note">
        {DIESEL_COPY.handoffNote.en} · {DIESEL_COPY.handoffNote.yue}
      </p>
      <p className="diesel-depot__path">{DIESEL_COPY.ledgerAt(ledgerPath).en}</p>
    </section>
  );
}

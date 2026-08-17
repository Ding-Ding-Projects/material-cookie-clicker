import { useRef, useState } from 'react';

import { bnCompare, bnFromNumber, bnSub } from '../../shared/game/big-number.js';
import { formatExact, formatExactDigits } from '../../shared/game/format-number.js';
import {
  canBuyControlRung,
  controlRungLevel,
  findControlRung,
  hasControlRung,
  isControlUnlocked,
  needsPurchaseConfirmation,
} from '../../shared/game/control-unlocks.js';
import { bilingualText, CONTROL_COPY, showsCantonese, showsEnglish } from '../game/copy.js';
import { useFastSnapshot, useGameDispatch, useStructureSnapshot } from '../game/GameProvider.js';
import { controlTargetKey, usePurchaseFxTarget } from '../game/purchase-fx.js';

/**
 * THE COIN SLOT — the one shape every unbought control in this application wears.
 *
 * The behavioural floor of the whole control economy (src/shared/game/control-unlocks.ts) is
 * that a control you have not bought does NOT vanish. It sits exactly where the real control
 * would sit, drawn as a slot with the literal price stamped on it, and pressing it is how you
 * buy it. That is the entire joke: you can see the thing, you can see what it costs, and the
 * price tag is the door. A control that disappeared until bought would just look like a feature
 * this build forgot to write.
 *
 * What this component is careful about:
 *
 *   • It is a real `<button>`. Tab reaches it, Enter and Space press it, and its accessible name
 *     says what the control is and what it costs — not "locked", which tells a screen-reader
 *     user nothing they can act on.
 *   • It NEVER renders `disabled`, even when the cookies are not there. A disabled button drops
 *     out of the tab order, and a player who cannot afford a control still deserves to be able
 *     to land on it and hear the price.
 *   • A purchase worth more than one percent of the balance asks first
 *     (control-unlocks.ts#CONTROL_CONFIRM_BALANCE_FRACTION), and so does a purchase that cannot
 *     be afforded at all — in that case the confirmation is where the honest shortfall is
 *     printed rather than the press silently doing nothing.
 *   • The result is announced through its own `role="status"`, so buying a control by keyboard
 *     is not a silent event.
 */

export interface CoinSlotProps {
  /** Which rung of which ladder this plate sells. Must exist in the registry. */
  readonly rungId: string;
  /**
   * How the plate is drawn. `plate` is the default free-standing form; `inline` is the compact
   * one that stands in for a small control in a row; `chrome` is the flat one that fits a title
   * bar cap. All three are the same button with the same semantics.
   */
  readonly variant?: 'plate' | 'inline' | 'chrome';
  /** Overrides the registry's name, for a site where the surrounding copy already says it. */
  readonly labelEn?: string;
  readonly labelYue?: string;
  /**
   * A single decorative glyph drawn in place of the name, for the `chrome` variant where there
   * is no room for words — the title bar's own caps are glyphs for the same reason. Decorative
   * only: the button's accessible name still says what the control is and what it costs.
   */
  readonly glyph?: string;
  readonly className?: string;
  /** Fired after the reducer actually applied the purchase. Never fired on a refusal. */
  readonly onBought?: () => void;
}

export function CoinSlot({ rungId, variant = 'plate', labelEn, labelYue, glyph, className, onBought }: CoinSlotProps) {
  const dispatch = useGameDispatch();
  const fast = useFastSnapshot();
  const structure = useStructureSnapshot();
  const [confirming, setConfirming] = useState(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const fxRef = usePurchaseFxTarget<HTMLSpanElement>(controlTargetKey(rungId));

  const found = findControlRung(rungId);
  // An unknown id is a programming mistake, not a player-facing state. Rendering nothing is
  // better than rendering a plate that can never be bought.
  if (!found) return null;

  const { rung } = found;
  const price = bnFromNumber(rung.price);
  const nameEn = labelEn ?? rung.nameEn;
  const nameYue = labelYue ?? rung.nameYue;
  const priceText = formatExactDigits(price);
  const affordable = bnCompare(fast.cookies, price) >= 0;
  // Read against the LIVE balance from the fast slice, not the structure snapshot, so the
  // threshold reflects what the player can see in the HUD at the moment of the press.
  const askFirst = needsPurchaseConfirmation({ ...structure, cookies: fast.cookies }, rungId);

  function buy(): void {
    const next = dispatch({ type: 'buyControlUnlock', rungId });
    const bought = (next.controlUnlocks?.purchasedRungIds ?? []).includes(rungId);
    setConfirming(false);
    if (bought) {
      setAnnouncement(bilingualText(CONTROL_COPY.bought(nameEn, nameYue)));
      onBought?.();
    } else {
      setAnnouncement(bilingualText(CONTROL_COPY.cannotAfford(formatExactDigits(bnSub(price, fast.cookies)))));
    }
    buttonRef.current?.focus();
  }

  /** Back out of the confirmation and put focus back where it came from. */
  function closeConfirm(): void {
    setConfirming(false);
    buttonRef.current?.focus();
  }

  const confirmId = `coin-slot-confirm-${rungId}`;

  return (
    <span
      className={`coin-slot-wrap${className ? ` ${className}` : ''}`}
      // Escape closes the popup and returns focus to the plate, from anywhere inside it — the
      // trigger included, since focus is on the trigger for the split second after it opens.
      // The popup is absolutely positioned over whatever is behind it, so "Tab to Cancel" was
      // the only way out of something that may be covering the thing you were reading.
      onKeyDown={(event) => {
        if (!confirming || event.key !== 'Escape') return;
        event.stopPropagation();
        closeConfirm();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`coin-slot coin-slot--${variant}${affordable ? '' : ' coin-slot--short'}`}
        aria-label={bilingualText(CONTROL_COPY.slotLabel(nameEn, nameYue, priceText))}
        aria-expanded={confirming}
        aria-controls={confirming ? confirmId : undefined}
        title={`${nameEn} · ${nameYue} — 🍪 ${priceText}`}
        onClick={() => (askFirst ? setConfirming((open) => !open) : buy())}
      >
        <span className="coin-slot__mouth" aria-hidden="true">
          <span className="coin-slot__coin" ref={fxRef} />
        </span>
        {variant === 'chrome' ? (
          glyph ? (
            <span className="coin-slot__glyph" aria-hidden="true">
              {glyph}
            </span>
          ) : null
        ) : (
          <span className="coin-slot__name" aria-hidden="true">
            {showsEnglish() ? <span>{nameEn}</span> : null}
            {showsCantonese() ? <span className="coin-slot__name-zh">{nameYue}</span> : null}
          </span>
        )}
        <span className="coin-slot__price" aria-hidden="true">
          🍪 {formatExact(price, 'en')}
        </span>
      </button>

      {confirming ? (
        <span
          className="coin-slot__confirm"
          id={confirmId}
          role="group"
          aria-label={bilingualText(CONTROL_COPY.confirmTitle)}
        >
          <span className="coin-slot__confirm-body">
            {bilingualText(
              CONTROL_COPY.confirmBody(nameEn, nameYue, priceText, formatExactDigits(fast.cookies)),
            )}
          </span>
          {affordable ? null : (
            <span className="coin-slot__confirm-short">
              {bilingualText(CONTROL_COPY.cannotAfford(formatExactDigits(bnSub(price, fast.cookies))))}
            </span>
          )}
          <span className="coin-slot__confirm-actions">
            {/* The buy action is only offered when it can actually succeed. When it cannot, the
                shortfall above says so in figures and this row is just the way back out — which
                is more use than a button that refuses. */}
            {affordable ? (
              <button type="button" className="coin-slot__confirm-buy" autoFocus onClick={buy}>
                {bilingualText(CONTROL_COPY.confirmBuy)}
              </button>
            ) : null}
            <button
              type="button"
              className="coin-slot__confirm-cancel"
              autoFocus={!affordable}
              onClick={closeConfirm}
            >
              {bilingualText(CONTROL_COPY.confirmCancel)}
            </button>
          </span>
        </span>
      ) : null}

      <span className="coin-slot__status" role="status">
        {announcement}
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * The hooks every gated surface uses. Each is a one-line read of the structure slice through the
 * domain's own predicate, so no screen ever pokes at `state.controlUnlocks` itself.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Whether this control's first rung is bought — i.e. whether the control exists at all. */
export function useControlUnlocked(controlId: string): boolean {
  return isControlUnlocked(useStructureSnapshot(), controlId);
}

/** How many rungs of this control's ladder are bought, counting from the bottom. */
export function useControlLevel(controlId: string): number {
  return controlRungLevel(useStructureSnapshot(), controlId);
}

/** Whether one exact rung is bought. */
export function useControlRung(rungId: string): boolean {
  return hasControlRung(useStructureSnapshot(), rungId);
}

/** Whether one exact rung could be bought right now, for a catalogue row's own affordance. */
export function useCanBuyControlRung(rungId: string): boolean {
  const structure = useStructureSnapshot();
  const fast = useFastSnapshot();
  return canBuyControlRung({ ...structure, cookies: fast.cookies }, rungId);
}

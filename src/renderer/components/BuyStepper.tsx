import { showsEnglish, showsCantonese, bilingualText, CONTROL_COPY, LIST_COPY } from '../game/copy.js';
import { CoinSlot, useControlLevel } from './CoinSlot.js';

export type BuyQuantity = 1 | 10 | 100 | 'max';

const OPTIONS: readonly BuyQuantity[] = [1, 10, 100, 'max'];

/**
 * How many rungs of the `stepper` ladder each option needs (control-unlocks.ts).
 *
 * ×1 IS FREE AND ALWAYS WAS. It is the only way to buy anything at all, so charging for it would
 * not be a gag, it would be a paywall on the core loop. Everything above it is a convenience
 * with a price: ×10, then ×100, then Max, each a rung of one ladder so they are bought in order.
 */
const RUNGS_REQUIRED: Readonly<Record<string, number>> = { '1': 0, '10': 1, '100': 2, max: 3 };

export interface BuyStepperProps {
  readonly value: BuyQuantity;
  readonly onChange: (next: BuyQuantity) => void;
  readonly disabled?: boolean;
  readonly ariaLabelId: string;
}

/**
 * The ×1 / ×10 / ×100 / Max buy-quantity stepper (design/building-row.html), now with its own
 * upgrade ladder.
 *
 * The multiples that are not bought yet do not disappear from the group — exactly ONE of them
 * shows, as a coin-slot plate with its price on it, so the ladder is visible from the first shop
 * row a player ever sees and the next rung always has a door. The ones above that are absent,
 * because three stacked price plates on a shop row would swamp the row it belongs to.
 */
export function BuyStepper({ value, onChange, disabled = false, ariaLabelId }: BuyStepperProps) {
  const level = useControlLevel('stepper');
  const available = OPTIONS.filter((option) => RUNGS_REQUIRED[String(option)] <= level);
  const nextRung = ['stepper.x10', 'stepper.x100', 'stepper.max'][level] ?? null;

  return (
    <div className="stepper" role="group" aria-labelledby={ariaLabelId} aria-disabled={disabled}>
      {available.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          className={[value === option ? 'active' : null, option === 'max' ? 'stepper__max' : null]
            .filter(Boolean)
            .join(' ') || undefined}
          aria-pressed={value === option}
          /* "Max" is the only word on this stepper — ×1/×10/×100 are language-neutral — so it is
             the only one that needs a translation. Both languages are visible AND in the
             accessible name, from the single LIST_COPY.buyMax entry. */
          aria-label={option === 'max' ? bilingualText(LIST_COPY.buyMax) : undefined}
          onClick={() => onChange(option)}
        >
          {option === 'max' ? (
            <>
              {showsEnglish() ? <span>{LIST_COPY.buyMax.en}</span> : null}
              {showsCantonese() ? (
                <span className="stepper__max-zh" aria-hidden="true">
                  {LIST_COPY.buyMax.yue}
                </span>
              ) : null}
            </>
          ) : (
            `×${option}`
          )}
        </button>
      ))}
      {nextRung ? (
        <CoinSlot rungId={nextRung} variant="inline" className="stepper__slot" />
      ) : null}
      {level === 0 ? (
        <span className="stepper__hint" hidden>
          {bilingualText(CONTROL_COPY.stepperLockedHint)}
        </span>
      ) : null}
    </div>
  );
}

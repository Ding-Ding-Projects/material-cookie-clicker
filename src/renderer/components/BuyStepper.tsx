import { showsEnglish, showsCantonese, bilingualText, LIST_COPY } from '../game/copy.js';

export type BuyQuantity = 1 | 10 | 100 | 'max';

const OPTIONS: readonly BuyQuantity[] = [1, 10, 100, 'max'];

export interface BuyStepperProps {
  readonly value: BuyQuantity;
  readonly onChange: (next: BuyQuantity) => void;
  readonly disabled?: boolean;
  readonly ariaLabelId: string;
}

/** The ×1 / ×10 / ×100 / Max buy-quantity stepper (design/building-row.html). */
export function BuyStepper({ value, onChange, disabled = false, ariaLabelId }: BuyStepperProps) {
  return (
    <div className="stepper" role="group" aria-labelledby={ariaLabelId} aria-disabled={disabled}>
      {OPTIONS.map((option) => (
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
    </div>
  );
}

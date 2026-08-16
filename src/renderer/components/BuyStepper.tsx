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
          className={value === option ? 'active' : undefined}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option === 'max' ? 'Max' : `×${option}`}
        </button>
      ))}
    </div>
  );
}

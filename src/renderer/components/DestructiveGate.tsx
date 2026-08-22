import { useRef, useState, type ReactNode } from 'react';

import { PRESTIGE_SCREEN_COPY, type Bilingual } from '../game/copy.js';
import {
  INITIAL_GATE_STATE,
  isSliderEnabled,
  resetGate,
  setSliderValue,
  toggleKey,
  type GateState,
} from '../game/destructive-gate.js';

export interface DestructiveGateProps {
  readonly tone: 'prestige' | 'wipe';
  readonly triggerLabel: Bilingual;
  readonly triggerDisabled?: boolean;
  readonly title: Bilingual;
  /** The reset/carries-forward impact copy — rendered inside `.gate__impact`. */
  readonly impact: ReactNode;
  readonly key1Label: Bilingual;
  readonly key2Label: Bilingual;
  readonly sliderAriaLabel: Bilingual;
  /** Fired exactly once, the instant the slider reaches 100%. */
  readonly onConfirm: () => void;
  /** Set by the parent AFTER `onConfirm` runs, once the real result (e.g. points earned) is known. */
  readonly completionMessage: Bilingual | null;
}

/**
 * The two-key-plus-slider destructive-action super-confirmation gate (design/prestige-gate.html),
 * shared by prestige and full-wipe. The slider genuinely cannot move — see
 * game/destructive-gate.ts#isSliderEnabled — until BOTH keys are on; this component only wires
 * that pure state machine to the DOM and to `onConfirm`.
 */
export function DestructiveGate({
  tone,
  triggerLabel,
  triggerDisabled = false,
  title,
  impact,
  key1Label,
  key2Label,
  sliderAriaLabel,
  onConfirm,
  completionMessage,
}: DestructiveGateProps) {
  const [open, setOpen] = useState(false);
  const [gate, setGate] = useState<GateState>(INITIAL_GATE_STATE);
  // Guards against onConfirm firing more than once while a drag emits several change events
  // as the slider crosses into "completed" — reset alongside the gate itself.
  const confirmedRef = useRef(false);

  function closeAndReset(): void {
    setOpen(false);
    setGate(resetGate());
    confirmedRef.current = false;
  }

  function handleSliderChange(value: number): void {
    setGate((previous) => {
      const next = setSliderValue(previous, value);
      if (next.completed && !confirmedRef.current) {
        confirmedRef.current = true;
        onConfirm();
      }
      return next;
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className={`gate-trigger tone-${tone}`}
        disabled={triggerDisabled}
        onClick={() => setOpen(true)}
      >
        {triggerLabel.en} · {triggerLabel.yue}
      </button>
    );
  }

  const enabled = isSliderEnabled(gate);

  return (
    <div className={`gate tone-${tone}`} role="group" aria-label={`${title.en} · ${title.yue}`}>
      <h2>
        {title.en} <span className="screen-title-zh">{title.yue}</span>
      </h2>
      <div className="gate__impact">{impact}</div>
      <div className="gate__keys">
        <div className="gate__key">
          <button
            type="button"
            className="gate__key-toggle"
            aria-pressed={gate.key1}
            aria-label={`${key1Label.en} · ${key1Label.yue}`}
            disabled={gate.completed}
            onClick={() => setGate((previous) => toggleKey(previous, 1))}
          >
            {key1Label.en} · {key1Label.yue}
          </button>
          <span className="gate__key-label">
            {key1Label.en} · {key1Label.yue}
          </span>
        </div>
        <div className="gate__key">
          <button
            type="button"
            className="gate__key-toggle"
            aria-pressed={gate.key2}
            aria-label={`${key2Label.en} · ${key2Label.yue}`}
            disabled={gate.completed}
            onClick={() => setGate((previous) => toggleKey(previous, 2))}
          >
            {key2Label.en} · {key2Label.yue}
          </button>
          <span className="gate__key-label">
            {key2Label.en} · {key2Label.yue}
          </span>
        </div>
      </div>

      {!gate.completed ? (
        <div className="gate__slider-wrap">
          <input
            type="range"
            min={0}
            max={100}
            value={gate.sliderValue}
            disabled={!enabled}
            aria-label={`${sliderAriaLabel.en} · ${sliderAriaLabel.yue}`}
            onChange={(event) => handleSliderChange(Number(event.target.value))}
          />
          <div className="gate__anim-track">
            <div className="gate__anim-fill" style={{ width: `${gate.sliderValue}%` }} />
          </div>
          <span className="gate__slider-hint">
            {enabled
              ? `${PRESTIGE_SCREEN_COPY.sliderHintEnabled.en} · ${PRESTIGE_SCREEN_COPY.sliderHintEnabled.yue}`
              : `${PRESTIGE_SCREEN_COPY.sliderHintDisabled.en} · ${PRESTIGE_SCREEN_COPY.sliderHintDisabled.yue}`}
          </span>
        </div>
      ) : (
        completionMessage && (
          <div className="gate__completion" role="status">
            {completionMessage.en} · {completionMessage.yue}
          </div>
        )
      )}

      <button type="button" className="gate__exit-btn" onClick={closeAndReset}>
        {PRESTIGE_SCREEN_COPY.emergencyExit.en} · {PRESTIGE_SCREEN_COPY.emergencyExit.yue}
      </button>
    </div>
  );
}

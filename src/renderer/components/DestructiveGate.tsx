import { useEffect, useRef, useState, type ReactNode } from 'react';

import { PRESTIGE_SCREEN_COPY, type Bilingual } from '../game/copy.js';
import {
  INITIAL_GATE_STATE,
  isSliderEnabled,
  resetGate,
  setSliderValue,
  toggleKey,
  type GateState,
} from '../game/destructive-gate.js';

/**
 * The destructive-action super-confirmation gate from `design/prestige-gate.html`, rendered
 * for both of that spec's variants: `prestige` (recoverable, tertiary/primary palette) and
 * `wipe` (severe, error palette).
 *
 * The refusal rule the gate exists for — the slider cannot move at all until BOTH keys are on
 * — lives in `game/destructive-gate.ts` as a pure state machine, not here. This component only
 * renders that machine and owns the DOM-level concerns the machine cannot: the `disabled`
 * attribute (so the slider is not reachable by keyboard either, not merely visually dimmed),
 * Escape-to-cancel, and returning focus to whichever control opened the gate.
 *
 * Deliberately heavier chrome than the rest of the theme: this is the one moment the game
 * wants to feel weighty rather than quick.
 */
export interface DestructiveGateProps {
  readonly tone: 'prestige' | 'wipe';
  readonly title: Bilingual;
  /** Bilingual impact copy — what resets and what carries forward, named explicitly. */
  readonly impact: ReactNode;
  readonly key2Label: Bilingual;
  /** Rendered in place of the slider row once the action has completed. */
  readonly completion: Bilingual | null;
  /** Fired exactly once, when the slider reaches 100 with both keys on. */
  readonly onConfirm: () => void;
  /** The always-available Emergency exit, and the Escape key. Also runs after completion. */
  readonly onExit: () => void;
  /** Focused when the gate mounts; focus is returned to it on exit. */
  readonly returnFocusTo: React.RefObject<HTMLElement | null>;
}

export function DestructiveGate({
  tone,
  title,
  impact,
  key2Label,
  completion,
  onConfirm,
  onExit,
  returnFocusTo,
}: DestructiveGateProps) {
  const [gate, setGate] = useState<GateState>(INITIAL_GATE_STATE);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstKeyRef = useRef<HTMLButtonElement | null>(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    firstKeyRef.current?.focus();
  }, []);

  function exit(): void {
    setGate(resetGate());
    confirmedRef.current = false;
    onExit();
    // Focus must land back on the control that opened the gate rather than being stranded
    // inside markup that is about to unmount.
    returnFocusTo.current?.focus();
  }

  function handleSlider(rawValue: number): void {
    setGate((previous) => {
      const next = setSliderValue(previous, rawValue);
      if (next.completed && !previous.completed && !confirmedRef.current) {
        confirmedRef.current = true;
        onConfirm();
      }
      return next;
    });
  }

  const sliderEnabled = isSliderEnabled(gate);
  const hint = sliderEnabled ? PRESTIGE_SCREEN_COPY.sliderHintEnabled : PRESTIGE_SCREEN_COPY.sliderHintDisabled;
  const headingId = `gate-heading-${tone}`;

  return (
    <div
      ref={containerRef}
      className={`gate tone-${tone}`}
      role="group"
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          exit();
        }
      }}
    >
      <h2 id={headingId}>
        {title.en} · {title.yue}
      </h2>
      <div className="gate__impact">{impact}</div>

      <div className="gate__keys">
        <GateKey
          buttonRef={firstKeyRef}
          index={1}
          pressed={gate.key1}
          label={PRESTIGE_SCREEN_COPY.key1Label}
          disabled={gate.completed}
          onToggle={() => setGate((previous) => toggleKey(previous, 1))}
        />
        <GateKey
          index={2}
          pressed={gate.key2}
          label={key2Label}
          disabled={gate.completed}
          onToggle={() => setGate((previous) => toggleKey(previous, 2))}
        />
      </div>

      {gate.completed && completion ? (
        <p className="gate__completion" role="status">
          {completion.en} · {completion.yue}
        </p>
      ) : (
        <div className="gate__slider-wrap">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={gate.sliderValue}
            disabled={!sliderEnabled}
            aria-label={`${title.en} — ${hint.en} · ${hint.yue}`}
            aria-describedby={`gate-hint-${tone}`}
            onChange={(event) => handleSlider(Number(event.target.value))}
          />
          {/* Decorative echo of the same value the slider already reports; the fill is
              width-animated normally and snaps instantly under prefers-reduced-motion via the
              shared --motion-scale token. */}
          <div className="gate__anim-track" aria-hidden="true">
            <div className="gate__anim-fill" style={{ width: `${gate.sliderValue}%` }} />
          </div>
          <span className="gate__slider-hint" id={`gate-hint-${tone}`}>
            {hint.en} · {hint.yue}
          </span>
        </div>
      )}

      <button type="button" className="gate__exit-btn" onClick={exit}>
        🚪 {PRESTIGE_SCREEN_COPY.emergencyExit.en} · {PRESTIGE_SCREEN_COPY.emergencyExit.yue}
      </button>
    </div>
  );
}

function GateKey({
  buttonRef,
  index,
  pressed,
  label,
  disabled,
  onToggle,
}: {
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  index: 1 | 2;
  pressed: boolean;
  label: Bilingual;
  disabled: boolean;
  onToggle: () => void;
}) {
  const keyName = index === 1 ? 'Key 1 · 鎖匙一' : 'Key 2 · 鎖匙二';
  return (
    <div className="gate__key">
      <button
        ref={buttonRef}
        type="button"
        className="gate__key-toggle"
        aria-pressed={pressed}
        aria-label={`${keyName} — ${label.en} · ${label.yue}`}
        disabled={disabled}
        onClick={onToggle}
      >
        {keyName}
      </button>
      <span className="gate__key-label" aria-hidden="true">
        {label.en}
        <br />
        {label.yue}
      </span>
    </div>
  );
}

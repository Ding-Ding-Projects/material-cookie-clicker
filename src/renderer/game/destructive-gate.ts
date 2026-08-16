/**
 * Pure state machine behind the two-key-plus-slider destructive-action gate (prestige and full
 * wipe both use one of these, per `design/prestige-gate.html`). Kept independent of any
 * rendering so the refusal behaviour — the slider cannot move at all until BOTH keys are on —
 * is directly unit-testable without mounting anything.
 */
export interface GateState {
  readonly key1: boolean;
  readonly key2: boolean;
  readonly sliderValue: number;
  readonly completed: boolean;
}

export const INITIAL_GATE_STATE: GateState = { key1: false, key2: false, sliderValue: 0, completed: false };

export function bothKeysOn(state: GateState): boolean {
  return state.key1 && state.key2;
}

/** Whether the slider is allowed to move at all right now. */
export function isSliderEnabled(state: GateState): boolean {
  return bothKeysOn(state) && !state.completed;
}

export function toggleKey(state: GateState, key: 1 | 2): GateState {
  if (state.completed) return state;
  return key === 1 ? { ...state, key1: !state.key1 } : { ...state, key2: !state.key2 };
}

/**
 * Attempts to move the slider to `value`. Refuses (returns state unchanged) unless both keys
 * are on — this is the load-bearing guarantee the gate exists to provide: a slider that could
 * be dragged with only one key on, or none, would not be a super-confirmation at all.
 */
export function setSliderValue(state: GateState, value: number): GateState {
  if (!isSliderEnabled(state)) return state;
  const clamped = Math.max(0, Math.min(100, value));
  return { ...state, sliderValue: clamped, completed: clamped >= 100 };
}

/** The always-available "Emergency exit" action: returns to the untouched state. */
export function resetGate(): GateState {
  return INITIAL_GATE_STATE;
}

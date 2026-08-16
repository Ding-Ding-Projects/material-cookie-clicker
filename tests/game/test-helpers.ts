import { createInitialGameState } from "../../src/shared/game/reducer";
import type { GameState, RngPort } from "../../src/shared/game/types";

export function freshState(overrides: Partial<GameState> = {}): GameState {
  const base = createInitialGameState("2026-01-01T00:00:00.000Z");
  return { ...base, ...overrides };
}

/** A deterministic RngPort for tests that never actually need randomness to vary. */
export function fixedRng(value = 0.5, streamIndex = 0): RngPort {
  let index = streamIndex;
  return {
    next: () => {
      index += 1;
      return value;
    },
    getStreamIndex: () => index,
  };
}

/**
 * Hold-to-click controller: an accessible alternative to rapid manual clicking. Holding the
 * cookie button repeats a click at a fixed, moderate rate through the SAME dispatch path a
 * discrete click uses (see CookieScreen.tsx, which wires `onClick` to
 * `store.dispatch({ type: "click" }, ctx)` either way) — there is no separate "auto-click"
 * mutation, only the one reducer seam invoked repeatedly.
 *
 * The scheduler is injected so this is testable without real timers: a test can supply a fake
 * scheduler, call `start()`, invoke the recorded callback manually N times, and assert the
 * resulting game state accumulated N clicks via the real reducer.
 */
export interface HoldToClickScheduler {
  schedule(callback: () => void, intervalMs: number): unknown;
  cancel(handle: unknown): void;
}

/**
 * ~4.3 activations/second. Fast enough to feel like a real hold-to-click affordance, slow
 * enough to stay comfortably clear of both the W3C "three flashes" photosensitive-seizure
 * threshold (>3/sec) and any input device's minimum reliable repeat interval.
 */
export const HOLD_TO_CLICK_INTERVAL_MS = 230;

export const defaultHoldToClickScheduler: HoldToClickScheduler = {
  schedule: (callback, intervalMs) => setInterval(callback, intervalMs),
  cancel: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface HoldToClickController {
  start(): void;
  stop(): void;
  isActive(): boolean;
}

export function createHoldToClickController(
  onClick: () => void,
  scheduler: HoldToClickScheduler = defaultHoldToClickScheduler,
  intervalMs: number = HOLD_TO_CLICK_INTERVAL_MS,
): HoldToClickController {
  let handle: unknown = null;
  return {
    start(): void {
      if (handle !== null) return;
      onClick(); // Fire immediately on press so holding never feels like it "missed" the first tap.
      handle = scheduler.schedule(onClick, intervalMs);
    },
    stop(): void {
      if (handle === null) return;
      scheduler.cancel(handle);
      handle = null;
    },
    isActive(): boolean {
      return handle !== null;
    },
  };
}

import { describe, expect, it } from "vitest";
import { bnIsZero, bnMulScalar, bnToNumber } from "../../src/shared/game/big-number";
import { totalCps } from "../../src/shared/game/cps";
import { computeOfflineProgress } from "../../src/shared/game/offline-progress";
import { freshState } from "./test-helpers";

const OPTIONS = { maxOfflineMs: 2 * 60 * 60 * 1000, offlineCpsFactor: 0.5 };

describe("computeOfflineProgress clock protection", () => {
  it("treats a clock moved backwards as ZERO elapsed and increments the anomaly counter via the result flag", () => {
    const state = freshState({
      lastTickAtIso: "2026-01-02T00:00:00.000Z",
      generators: [{ id: "cursor", count: 10 }],
    });
    // "now" is BEFORE lastTickAtIso -- clock moved backwards.
    const result = computeOfflineProgress(state, "2026-01-01T00:00:00.000Z", OPTIONS);
    expect(result.wasClockAnomaly).toBe(true);
    expect(result.effectiveElapsedMs).toBe(0);
    expect(bnIsZero(result.cookiesEarned)).toBe(true);
  });

  it("never uses Math.abs semantics -- a large negative delta is still zero, not a large positive reward", () => {
    const state = freshState({
      lastTickAtIso: "2026-06-01T00:00:00.000Z",
      generators: [{ id: "cursor", count: 100 }],
    });
    const result = computeOfflineProgress(state, "2026-01-01T00:00:00.000Z", OPTIONS);
    expect(result.wasClockAnomaly).toBe(true);
    expect(bnIsZero(result.cookiesEarned)).toBe(true);
  });

  it("clamps an absurd forward jump to maxOfflineMs without flagging it as an anomaly", () => {
    const state = freshState({
      lastTickAtIso: "2020-01-01T00:00:00.000Z",
      generators: [{ id: "cursor", count: 10 }],
    });
    const result = computeOfflineProgress(state, "2026-01-01T00:00:00.000Z", OPTIONS);
    expect(result.wasClockAnomaly).toBe(false);
    expect(result.effectiveElapsedMs).toBe(OPTIONS.maxOfflineMs);
  });

  it("computes ordinary forward elapsed time correctly and without anomaly", () => {
    // Uses "mine" (baseCps 47) deliberately: no Tools tech tree bonus in tools.ts targets
    // this generator, so its CPS stays exactly baseCps * count with no surprise multiplier,
    // keeping this test's expected value independent of Tools-tree balance numbers.
    const state = freshState({
      lastTickAtIso: "2026-01-01T00:00:00.000Z",
      generators: [{ id: "mine", count: 10 }],
    });
    const oneMinuteLater = "2026-01-01T00:01:00.000Z";
    const result = computeOfflineProgress(state, oneMinuteLater, OPTIONS);
    expect(result.wasClockAnomaly).toBe(false);
    expect(result.effectiveElapsedMs).toBe(60000);
    // cps * 60s * 0.5 offline factor
    const expected = bnToNumber(bnMulScalar(totalCps(state), 60 * OPTIONS.offlineCpsFactor));
    expect(bnToNumber(result.cookiesEarned)).toBeCloseTo(expected, 4);
  });

  it("never throws on a malformed timestamp -- returns a zero-elapsed anomaly result instead", () => {
    const state = freshState({ lastTickAtIso: "not-a-real-timestamp" });
    expect(() => computeOfflineProgress(state, "2026-01-01T00:00:00.000Z", OPTIONS)).not.toThrow();
    const result = computeOfflineProgress(state, "2026-01-01T00:00:00.000Z", OPTIONS);
    expect(result.wasClockAnomaly).toBe(true);
  });

  it("respects a zero elapsed exactly at the boundary", () => {
    const state = freshState({ lastTickAtIso: "2026-01-01T00:00:00.000Z" });
    const result = computeOfflineProgress(state, "2026-01-01T00:00:00.000Z", OPTIONS);
    expect(result.wasClockAnomaly).toBe(false);
    expect(result.effectiveElapsedMs).toBe(0);
    expect(bnIsZero(result.cookiesEarned)).toBe(true);
  });
});

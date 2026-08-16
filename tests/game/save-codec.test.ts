import { describe, expect, it } from "vitest";
import { decodeSave, encodeSave } from "../../src/shared/game/save-codec";
import { migrateToLatest, SaveVersionTooNewError } from "../../src/shared/game/migrations";
import { SAVE_SCHEMA_VERSION } from "../../src/shared/game/save-schema";
import { freshState } from "./test-helpers";

describe("migrateToLatest — future schema versions are rejected, never guessed at", () => {
  it("throws SaveVersionTooNewError when fromVersion exceeds SAVE_SCHEMA_VERSION", () => {
    expect(() => migrateToLatest({}, SAVE_SCHEMA_VERSION + 1)).toThrow(SaveVersionTooNewError);
  });

  it("is a no-op when fromVersion already equals SAVE_SCHEMA_VERSION", () => {
    const data = { schemaVersion: SAVE_SCHEMA_VERSION, foo: "bar" };
    const result = migrateToLatest(data, SAVE_SCHEMA_VERSION);
    expect(result.finalVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(result.data).toEqual(data);
  });
});

describe("decodeSave", () => {
  it("round-trips a valid encoded GameState", () => {
    const state = freshState({});
    const encoded = encodeSave(state);
    const result = decodeSave(encoded);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.schemaVersion).toBe(state.schemaVersion);
      expect(result.state.cookies).toEqual(state.cookies);
    }
  });

  it("NEVER throws on malformed input -- returns a discriminated failure result instead", () => {
    const malformedInputs: unknown[] = [
      null,
      undefined,
      42,
      "a string",
      [],
      {},
      { schemaVersion: "not-a-number" },
      { schemaVersion: 1, cookies: "not-a-bignum" },
      { schemaVersion: 1, cookies: { mantissa: "nope", exponent: 0 } },
    ];

    for (const input of malformedInputs) {
      expect(() => decodeSave(input)).not.toThrow();
      const result = decodeSave(input);
      expect(result.ok).toBe(false);
    }
  });

  it("reports 'malformed' for structurally-broken input rather than crashing", () => {
    const result = decodeSave({ schemaVersion: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("malformed");
    }
  });

  it("reports 'future-version' (never guessing a downgrade) for a save from a newer app build", () => {
    const state = freshState({});
    const encoded = { ...encodeSave(state), schemaVersion: SAVE_SCHEMA_VERSION + 1 };
    const result = decodeSave(encoded);
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "future-version") {
      expect(result.foundVersion).toBe(SAVE_SCHEMA_VERSION + 1);
      expect(result.maxSupportedVersion).toBe(SAVE_SCHEMA_VERSION);
    } else {
      throw new Error(`expected reason 'future-version', got ${JSON.stringify(result)}`);
    }
  });
});

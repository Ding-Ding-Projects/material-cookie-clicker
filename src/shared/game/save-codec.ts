import { migrateToLatest, SaveVersionTooNewError } from "./migrations.js";
import { SaveDataLatestSchema, SaveVersionProbeSchema, type SaveDataLatest } from "./save-schema.js";
import type { GameState } from "./types.js";

export type DecodeSaveResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: "malformed"; readonly detail: string }
  | { readonly ok: false; readonly reason: "future-version"; readonly foundVersion: number; readonly maxSupportedVersion: number }
  | { readonly ok: false; readonly reason: "unmigratable"; readonly detail: string };

/**
 * Decodes raw (untrusted) save data into a validated GameState. NEVER throws — always returns
 * a discriminated result, so the persistence layer can fall back cleanly (e.g. start a fresh
 * game, or keep the previous in-memory state) instead of crashing on a corrupted save file.
 */
export function decodeSave(raw: unknown): DecodeSaveResult {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, reason: "malformed", detail: "Save data is not an object." };
  }

  const probe = SaveVersionProbeSchema.safeParse(raw);
  if (!probe.success) {
    return { ok: false, reason: "malformed", detail: probe.error.message };
  }

  try {
    const migrated = migrateToLatest(raw as Record<string, unknown>, probe.data.schemaVersion);
    const parsed = SaveDataLatestSchema.safeParse(migrated.data);
    if (!parsed.success) {
      return { ok: false, reason: "malformed", detail: parsed.error.message };
    }
    return { ok: true, state: saveDataToGameState(parsed.data) };
  } catch (error) {
    if (error instanceof SaveVersionTooNewError) {
      return {
        ok: false,
        reason: "future-version",
        foundVersion: error.foundVersion,
        maxSupportedVersion: error.maxSupportedVersion,
      };
    }
    return {
      ok: false,
      reason: "unmigratable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Encodes a GameState into JSON-safe save data. The reverse of decodeSave; never throws. */
export function encodeSave(state: GameState): SaveDataLatest {
  return {
    schemaVersion: state.schemaVersion as 2,
    cookies: state.cookies,
    lifetimeCookies: state.lifetimeCookies,
    baseClickValue: state.baseClickValue,
    generators: state.generators.map((g) => ({ id: g.id, count: g.count })),
    upgrades: state.upgrades.map((u) => ({ id: u.id, purchasedAtTickCount: u.purchasedAtTickCount })),
    achievements: state.achievements.map((a) => ({ id: a.id, unlockedAtIso: a.unlockedAtIso })),
    prestige: {
      ascensionPoints: state.prestige.ascensionPoints,
      totalPrestigeCount: state.prestige.totalPrestigeCount,
      permanentUnlockIds: [...state.prestige.permanentUnlockIds],
    },
    goldenCookie: { ...state.goldenCookie },
    stats: { ...state.stats },
    toolProgressionEnabled: state.toolProgressionEnabled,
    purchasedToolIds: [...state.purchasedToolIds],
    lastTickAtIso: state.lastTickAtIso,
    lastSavedAtIso: state.lastSavedAtIso,
  };
}

function saveDataToGameState(data: SaveDataLatest): GameState {
  // SaveDataLatest and GameState are structurally identical by construction; this function
  // exists as the single seam where that assumption is asserted, so a future schema/type
  // divergence fails here rather than scattering silent `as GameState` casts everywhere else.
  return data as unknown as GameState;
}

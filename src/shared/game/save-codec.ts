import { migrateToLatest, SaveVersionTooNewError } from "./migrations.js";
import {
  decodeRandomEvents,
  encodeRandomEvents,
  type RandomEventsSaveData,
} from "./random-events.js";
import { SaveDataLatestSchema, SaveVersionProbeSchema, type SaveDataLatest } from "./save-schema.js";
import type { GameState } from "./types.js";
import type { RandomEventsState } from "./random-events.js";

/**
 * What actually goes on disk: the versioned schema plus the random-event scheduler's own
 * optional block (random-events.ts owns that block's schema, its defaulting and its decoding).
 *
 * Random-event state is kept OUT of save-schema.ts and out of the version ladder deliberately.
 * It needs no migration, because "no events have happened" is the correct and complete reading
 * of any older save; it needs no version bump, because a build that does not know the field
 * ignores it and a build that does supplies a fresh scheduler when it is missing. Adding a
 * fifth schema version for a field whose only honest migration is `createInitialRandomEvents-
 * State()` would be ceremony, not safety.
 */
export type SaveDataOnDisk = SaveDataLatest & { readonly randomEvents?: RandomEventsSaveData };

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
    // The random-event block rides alongside the validated payload rather than through it:
    // SaveDataLatestSchema is a strict object and would have stripped an unknown key.
    const randomEvents = decodeRandomEvents((migrated.data as { randomEvents?: unknown }).randomEvents);
    return { ok: true, state: saveDataToGameState(parsed.data, randomEvents) };
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
export function encodeSave(state: GameState): SaveDataOnDisk {
  return {
    randomEvents: encodeRandomEvents(state.randomEvents),
    schemaVersion: state.schemaVersion as 6,
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
      rebornNodeIds: [...(state.prestige.rebornNodeIds ?? [])],
    },
    goldenCookie: { ...state.goldenCookie },
    stats: { ...state.stats },
    dieselDepot: { ...state.dieselDepot },
    dieselFactory: {
      ...state.dieselFactory,
      equipment: state.dieselFactory.equipment.map((e) => ({ id: e.id, count: e.count })),
      upgradeIds: [...state.dieselFactory.upgradeIds],
    },
    toolProgressionEnabled: state.toolProgressionEnabled,
    purchasedToolIds: [...state.purchasedToolIds],
    // The control economy (control-unlocks.ts). A state built without the subtree — a test
    // helper, an older in-memory path — encodes as "nothing bought", which is the truth.
    controlUnlocks: { purchasedRungIds: [...(state.controlUnlocks?.purchasedRungIds ?? [])] },
    lastTickAtIso: state.lastTickAtIso,
    lastSavedAtIso: state.lastSavedAtIso,
  };
}

function saveDataToGameState(data: SaveDataLatest, randomEvents: RandomEventsState): GameState {
  // SaveDataLatest and GameState are structurally identical by construction APART from
  // `randomEvents`, which is decoded separately (see SaveDataOnDisk) and grafted on here. This
  // function stays the single seam where that assumption is asserted, so a future schema/type
  // divergence fails here rather than scattering silent `as GameState` casts everywhere else.
  return { ...(data as unknown as Omit<GameState, "randomEvents">), randomEvents };
}

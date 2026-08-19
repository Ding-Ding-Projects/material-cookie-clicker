import { migrateToLatest, SaveVersionTooNewError } from "./migrations.js";
import {
  decodeRandomEvents,
  encodeRandomEvents,
  type RandomEventsSaveData,
} from "./random-events.js";
import { SaveDataLatestSchema, SaveVersionProbeSchema, type SaveDataLatest } from "./save-schema.js";
import type { GameState } from "./types.js";
import type { RandomEventsState } from "./random-events.js";
import {
  EMPTY_GOLDEN_TOKEN_LEDGER,
  EMPTY_LUCKY_CHANCE_STATE,
  EMPTY_MINIGAME_STATE,
  type GoldenTokenLedger,
  type LuckyChanceState,
  type MinigameScheduleState,
  type MinigameState,
} from "./minigames.js";

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
export type MinigamesSaveData = {
  readonly minigames: MinigameState;
  readonly minigameSchedule: MinigameScheduleState | null;
  readonly goldenTokens: GoldenTokenLedger;
  readonly luckyChance: LuckyChanceState;
  readonly luckyRewards: readonly string[];
};

export type SaveDataOnDisk = SaveDataLatest & {
  readonly randomEvents?: RandomEventsSaveData;
  readonly minigames?: MinigamesSaveData;
};

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
    const minigames = decodeMinigames((migrated.data as { minigames?: unknown }).minigames);
    return { ok: true, state: saveDataToGameState(parsed.data, randomEvents, minigames) };
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
    minigames: {
      minigames: state.minigames,
      minigameSchedule: state.minigameSchedule,
      goldenTokens: state.goldenTokens,
      luckyChance: state.luckyChance,
      luckyRewards: [...state.luckyRewards],
    },
    schemaVersion: state.schemaVersion as 9,
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
    homeConstruction: {
      blueprintIds: [...state.homeConstruction.blueprintIds],
      rooms: state.homeConstruction.rooms.map((r) => ({
        roomId: r.roomId,
        furnitureIds: [...r.furnitureIds],
      })),
      build: state.homeConstruction.build ? { ...state.homeConstruction.build } : null,
      cookiesInvested: state.homeConstruction.cookiesInvested,
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

function saveDataToGameState(
  data: SaveDataLatest,
  randomEvents: RandomEventsState,
  minigames: MinigamesSaveData,
): GameState {
  // SaveDataLatest and GameState are structurally identical by construction APART from
  // `randomEvents`, which is decoded separately (see SaveDataOnDisk) and grafted on here. This
  // function stays the single seam where that assumption is asserted, so a future schema/type
  // divergence fails here rather than scattering silent `as GameState` casts everywhere else.
  return { ...(data as unknown as Omit<GameState, "randomEvents">), randomEvents, ...minigames };
}

function decodeMinigames(raw: unknown): MinigamesSaveData {
  if (!raw || typeof raw !== "object") {
    return {
      minigames: EMPTY_MINIGAME_STATE,
      minigameSchedule: null,
      goldenTokens: EMPTY_GOLDEN_TOKEN_LEDGER,
      luckyChance: EMPTY_LUCKY_CHANCE_STATE,
      luckyRewards: [],
    };
  }
  const candidate = raw as Partial<MinigamesSaveData>;
  return {
    minigames: candidate.minigames && typeof candidate.minigames === "object"
      ? candidate.minigames
      : EMPTY_MINIGAME_STATE,
    minigameSchedule: candidate.minigameSchedule ?? null,
    goldenTokens: candidate.goldenTokens ?? EMPTY_GOLDEN_TOKEN_LEDGER,
    luckyChance: candidate.luckyChance ?? EMPTY_LUCKY_CHANCE_STATE,
    luckyRewards: Array.isArray(candidate.luckyRewards)
      ? candidate.luckyRewards.filter((value): value is string => typeof value === "string")
      : [],
  };
}

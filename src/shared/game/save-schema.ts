import { z } from "zod";

/**
 * Current on-disk save schema version. Bump this whenever `SaveDataLatest`'s shape changes,
 * and add a forward-only migration entry in migrations.ts keyed by the *previous* version.
 */
export const SAVE_SCHEMA_VERSION = 5;

const BigNumSchema = z.object({
  mantissa: z.number(),
  exponent: z.number(),
});

const OwnedGeneratorSchema = z.object({
  id: z.string(),
  count: z.number().int().nonnegative(),
});

const OwnedUpgradeSchema = z.object({
  id: z.string(),
  purchasedAtTickCount: z.number().int().nonnegative(),
});

const UnlockedAchievementSchema = z.object({
  id: z.string(),
  unlockedAtIso: z.string(),
});

const GoldenCookieEffectSchema = z.object({
  kind: z.enum(["frenzy", "clickFrenzy", "windfall"]),
  expiresAtEpochMs: z.number().optional(),
  multiplier: z.number().optional(),
});

const GoldenCookieStateSchema = z.object({
  isSpawned: z.boolean(),
  spawnedAtEpochMs: z.number().optional(),
  rngStreamIndex: z.number().int().nonnegative(),
  activeEffect: GoldenCookieEffectSchema.optional(),
  nextEligibleAtEpochMs: z.number(),
});

/**
 * `rebornNodeIds` (the Reborn tree — see reborn.ts) is a DEFAULTED field rather than a new
 * schema version. A save written before the tree existed simply has none, zod supplies the
 * empty list on read, and a save written after it round-trips unchanged. There is nothing a
 * migration step could add here that the default does not already say correctly, and the
 * version number is reserved for changes that genuinely need one.
 */
const PrestigeStateSchema = z.object({
  ascensionPoints: z.number().int().nonnegative(),
  totalPrestigeCount: z.number().int().nonnegative(),
  permanentUnlockIds: z.array(z.string()),
  rebornNodeIds: z.array(z.string()).default([]),
});

const GameStatsSchema = z.object({
  totalClicks: z.number().int().nonnegative(),
  totalCookiesBaked: BigNumSchema,
  clockAnomalyCount: z.number().int().nonnegative(),
});

/** Schema for save-format version 1. This is also, not coincidentally, the shape of GameState. */
export const SaveDataV1Schema = z.object({
  schemaVersion: z.literal(1),
  cookies: BigNumSchema,
  lifetimeCookies: BigNumSchema,
  baseClickValue: BigNumSchema,
  generators: z.array(OwnedGeneratorSchema),
  upgrades: z.array(OwnedUpgradeSchema),
  achievements: z.array(UnlockedAchievementSchema),
  prestige: PrestigeStateSchema,
  goldenCookie: GoldenCookieStateSchema,
  stats: GameStatsSchema,
  toolProgressionEnabled: z.boolean(),
  lastTickAtIso: z.string(),
  lastSavedAtIso: z.string(),
});

export type SaveDataV1 = z.infer<typeof SaveDataV1Schema>;

/**
 * Schema for save-format version 2. Adds `purchasedToolIds` (Tools shop — see tool-shop.ts):
 * ids of tools bought early with cookies, skipping their natural unlock condition. A version-1
 * save has no such field on disk; `migrations.ts#migrateV1ToV2` supplies `[]` for it.
 */
export const SaveDataV2Schema = SaveDataV1Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(2),
  purchasedToolIds: z.array(z.string()),
});

export type SaveDataV2 = z.infer<typeof SaveDataV2Schema>;

/**
 * Schema for save-format version 3. Structurally identical to version 2 — progressive
 * disclosure (disclosure.ts) is DERIVED from owned upgrades and lifetime progress rather than
 * stored, so it needs no field of its own. The version marks the format boundary at which
 * disclosure began; `migrations.ts#migrateV2ToV3` walks a save across it and deliberately
 * grants NOTHING, because an older save's surfaces are recovered by derivation from the
 * progress it already contains rather than by handing it upgrades it never bought.
 */
export const SaveDataV3Schema = SaveDataV2Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(3),
});

export type SaveDataV3 = z.infer<typeof SaveDataV3Schema>;

/**
 * Schema for save-format version 4. Adds `dieselDepot` — the Diesel Depot's lifetime totals
 * (see diesel-exchange.ts): litres minted, vouchers minted, and cookies spent. The vouchers
 * themselves are NOT stored here; they live in the shared ledger file outside this application,
 * and duplicating them into the save would create a second, divergent record of a thing this
 * application does not own. `migrations.ts#migrateV3ToV4` supplies zeroes for an older save,
 * which is the truth: it never minted anything.
 */
export const SaveDataV4Schema = SaveDataV3Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(4),
  dieselDepot: z.object({
    litresMinted: z.number().int().nonnegative(),
    vouchersMinted: z.number().int().nonnegative(),
    cookiesSpent: BigNumSchema,
  }),
});

export type SaveDataV4 = z.infer<typeof SaveDataV4Schema>;

/**
 * Schema for save-format version 5. Adds `dieselFactory` — the nested production economy that
 * now MAKES the diesel the depot ships (diesel-factory.ts): the equipment on the floor, the
 * factory upgrades bought, the crude in the yard, the litres in the tanks, and the lifetime
 * totals the amortized receipt is derived from.
 *
 * The stock levels are stored as plain fractional numbers rather than big numbers on purpose:
 * they are bounded by tank capacity, which is a physical quantity in the tens of thousands, not
 * a cookie count that outgrows IEEE-754. `migrations.ts#migrateV4ToV5` supplies an empty floor
 * for an older save, which is the truth — that build had no factory, so nothing was ever built.
 */
export const SaveDataV5Schema = SaveDataV4Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(5),
  dieselFactory: z.object({
    equipment: z.array(z.object({ id: z.string(), count: z.number().int().nonnegative() })),
    upgradeIds: z.array(z.string()),
    crude: z.number().nonnegative(),
    litres: z.number().nonnegative(),
    lifetimeCrude: z.number().nonnegative(),
    lifetimeLitres: z.number().nonnegative(),
    cookiesInvested: BigNumSchema,
    autoShipEnabled: z.boolean(),
    stalledSeconds: z.number().nonnegative(),
  }),
});

export type SaveDataV5 = z.infer<typeof SaveDataV5Schema>;

/** The schema alias that always points at the current (latest) version's shape. */
export const SaveDataLatestSchema = SaveDataV5Schema;
export type SaveDataLatest = SaveDataV5;

/** Minimal shape used only to read `schemaVersion` off of otherwise-unvalidated input. */
export const SaveVersionProbeSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
});

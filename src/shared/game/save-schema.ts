import { z } from "zod";

/**
 * Current on-disk save schema version. Bump this whenever `SaveDataLatest`'s shape changes,
 * and add a forward-only migration entry in migrations.ts keyed by the *previous* version.
 */
export const SAVE_SCHEMA_VERSION = 4;

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

const PrestigeStateSchema = z.object({
  ascensionPoints: z.number().int().nonnegative(),
  totalPrestigeCount: z.number().int().nonnegative(),
  permanentUnlockIds: z.array(z.string()),
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
 * stored, so it needs no field of its own. The version exists purely so `migrations.ts#
 * migrateV2ToV3` runs once over every older save and grants it the three reveal upgrades it
 * could never have bought, which is what keeps a pre-disclosure save from losing surfaces it
 * always had.
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

/** The schema alias that always points at the current (latest) version's shape. */
export const SaveDataLatestSchema = SaveDataV4Schema;
export type SaveDataLatest = SaveDataV4;

/** Minimal shape used only to read `schemaVersion` off of otherwise-unvalidated input. */
export const SaveVersionProbeSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
});

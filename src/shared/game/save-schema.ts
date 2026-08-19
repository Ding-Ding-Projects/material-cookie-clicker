import { z } from "zod";

/**
 * Current on-disk save schema version. Bump this whenever `SaveDataLatest`'s shape changes,
 * and add a forward-only migration entry in migrations.ts keyed by the *previous* version.
 */
export const SAVE_SCHEMA_VERSION = 9;

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

/**
 * The open Oven Dial. Optional on purpose: a save written while no golden cookie is caught simply
 * has no dial.
 *
 * NO SAVE EVER CARRIES AN OPEN MINIGAME ACROSS A VERSION, and that is a decision rather than an
 * oversight. This is the third redemption mechanic in this slot — a ten-press countdown, then the
 * Odd Cookie Out tile grid, now the dial — and each one's fields are simply gone from this schema
 * when the next arrives. Zod drops what it does not recognise, the loaded cookie is then a spawn
 * with no position, the renderer treats that as nothing on the stage, and the schedule hands out a
 * fresh spawn on the next tick. There is deliberately no migration step: a golden cookie in flight
 * is worth seconds, a half-finished round of a game that no longer exists cannot be translated
 * into a round of the game that replaced it, and inventing one would be the dishonest option.
 *
 * `roundStartedAtEpochMs` is a wall-clock moment, so a dial reloaded long after it was saved has
 * an enormous elapsed time. That is harmless: the needle position is periodic in elapsed time, so
 * it is still a real position on the track — and the window it belongs to will have expired
 * anyway, which despawns the cookie on the first tick.
 */
const GoldenDialSchema = z.object({
  roundsWon: z.number().int().nonnegative(),
  zoneCentre: z.number(),
  roundStartedAtEpochMs: z.number(),
  misses: z.number().int().nonnegative(),
  stepped: z.boolean(),
});

const GoldenCookieStateSchema = z.object({
  isSpawned: z.boolean(),
  spawnXPct: z.number().optional(),
  spawnYPct: z.number().optional(),
  dial: GoldenDialSchema.optional(),
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

/**
 * `homeConstruction` (the bakery-home — see home-construction.ts) is a DEFAULTED field rather
 * than a schema version of its own, following exactly the precedent `rebornNodeIds` set above.
 *
 * The reasoning is worth restating. A version bump exists to carry a save across a change a
 * reader cannot work out for itself. This is not one of those: a save written before the house
 * existed has no house, and "no blueprints, no rooms, nothing being built, nothing invested" is
 * the complete and honest reading of it. A migration step could add nothing this default does
 * not already say correctly.
 *
 * Note what the default does NOT do: it does not hand anybody the Property Deed. An older save
 * buys that reveal upgrade like everyone else, and until it does there is no house to have.
 */
const HomeConstructionSchema = z
  .object({
    blueprintIds: z.array(z.string()),
    rooms: z.array(z.object({ roomId: z.string(), furnitureIds: z.array(z.string()) })),
    build: z
      .object({
        roomId: z.string(),
        elapsedMs: z.number().nonnegative(),
        requiredMs: z.number().nonnegative(),
      })
      .nullable(),
    cookiesInvested: BigNumSchema,
    extensionLevel: z.number().int().nonnegative().default(0),
  })
  .default({
    blueprintIds: [],
    rooms: [],
    build: null,
    cookiesInvested: { mantissa: 0, exponent: 0 },
    extensionLevel: 0,
  });

/**
 * Schema for save-format version 6. Adds `controlUnlocks` — the control economy
 * (control-unlocks.ts): which of the application's OWN controls the player has bought. It also
 * carries the defaulted `homeConstruction` block described above, which costs no version of its
 * own and grants nothing.
 *
 * `controlUnlocks` is one flat list of rung ids, and nothing else. Not a per-control record with
 * levels in it, because a level is derived (control-unlocks.ts#controlRungLevel) and storing a
 * derived number beside the facts it comes from is how the two end up disagreeing. Unknown ids
 * are tolerated on read rather than rejected: a save written by a build that sold one more
 * control than this one knows about should still load, and every reader looks a rung up in the
 * registry before believing it means anything.
 *
 * `migrations.ts#migrateV5ToV6` is where the one genuinely debatable decision in this file
 * lives, and it is the ONLY step in the whole v1-to-v6 chain that grants anything: an
 * already-played save is handed the control table for free. It is argued out in full there and
 * in control-unlocks.ts#MIGRATION_GRANT_LIFETIME_THRESHOLD. Every other step, including the
 * home default above, adds emptiness and nothing else.
 */
export const SaveDataV6Schema = SaveDataV5Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(6),
  homeConstruction: HomeConstructionSchema,
  controlUnlocks: z.object({
    purchasedRungIds: z.array(z.string()),
  }),
});

export type SaveDataV6 = z.infer<typeof SaveDataV6Schema>;

/**
 * Schema for save-format version 7. THE SHAPE IS IDENTICAL TO VERSION 6 — same fields, same
 * types, only the version literal moves.
 *
 * That is deliberate and worth stating, because the rule at the top of this file is "bump when
 * the shape changes" and the shape did not. What changed is the CONTENT of an existing field:
 * the Settings emblem became a purchasable control (`settings.open`), and a save written before
 * it existed has to be handed it if that save had already been using Settings. A grant is
 * something only a migration step can do, and a migration step only runs when the version moves,
 * so the version moves. The alternative — silently granting on load, outside the chain — would
 * be a rule that runs on every load forever with nothing recording that it ran.
 *
 * `migrations.ts#migrateV6ToV7` is the whole of it, and it grants exactly one id.
 */
export const SaveDataV7Schema = SaveDataV6Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(7),
});

export type SaveDataV7 = z.infer<typeof SaveDataV7Schema>;

/**
 * Schema for save-format version 8. AGAIN IDENTICAL IN SHAPE — only the version literal moves.
 *
 * Same reason as version 7, one decree later. The owner asked for the regex builder to be "more
 * advanced and purchased, upgradable", which added a shared `regex` control ladder rather than a
 * new save field. A save written before that ladder existed has to be handed its first rung if it
 * had already bought the token palette that used to be the top of the builder, and a grant is
 * something only a migration step can do — so the version moves so that a step can run once and
 * be recorded, rather than a rule running silently on every load forever.
 *
 * `migrations.ts#migrateV7ToV8` is the whole of it, and it grants exactly one id.
 */
export const SaveDataV8Schema = SaveDataV7Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(8),
});

export type SaveDataV8 = z.infer<typeof SaveDataV8Schema>;

/**
 * Schema for save-format version 9. IDENTICAL IN SHAPE ONCE MORE — only the version literal moves.
 *
 * Same instrument, one decree later, and the biggest content change any of these version bumps has
 * carried. The owner asked that "the app should start with a purely super plain cheaply made app
 * with just a cookie", which turns the application's entire appearance into a seven-rung `look`
 * ladder in the control registry rather than into a new save field. Every save that already exists
 * has been looking at the finished arcade cabinet since the day it was written, so a played save
 * has to be handed that look rather than woken up as a white page — and a grant is something only
 * a migration step can do.
 *
 * `migrations.ts#migrateV8ToV9` is the whole of it, and it grants exactly the seven look rungs.
 */
export const SaveDataV9Schema = SaveDataV8Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(9),
});

export type SaveDataV9 = z.infer<typeof SaveDataV9Schema>;

/** The schema alias that always points at the current (latest) version's shape. */
export const SaveDataLatestSchema = SaveDataV9Schema;
export type SaveDataLatest = SaveDataV9;

/** Minimal shape used only to read `schemaVersion` off of otherwise-unvalidated input. */
export const SaveVersionProbeSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
});

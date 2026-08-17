import { SAVE_SCHEMA_VERSION } from "./save-schema.js";

/**
 * A save version newer than SAVE_SCHEMA_VERSION is a save written by a NEWER app build.
 * We must never guess how to downgrade it — that would risk silently corrupting a save
 * that a newer app understands perfectly well. Loading it is refused with this typed error.
 */
export class SaveVersionTooNewError extends Error {
  constructor(
    public readonly foundVersion: number,
    public readonly maxSupportedVersion: number,
  ) {
    super(
      `Save schemaVersion ${foundVersion} is newer than the ${maxSupportedVersion} this build supports.`,
    );
    this.name = "SaveVersionTooNewError";
  }
}

/**
 * A migration step: takes the raw (already schema-validated-for-its-own-version) data at
 * `fromVersion` and returns raw data shaped for `fromVersion + 1`. Steps are applied in order,
 * forward-only — there is no downgrade path, by design.
 */
export type MigrationStep = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * Version 1 -> 2: adds `purchasedToolIds` (the Tools shop's early-buy record — see
 * tool-shop.ts). No version-1 save could have bought a tool early, since the shop did not
 * exist yet, so every migrated save starts with an empty list; the player's already-earned
 * natural unlocks (tools.ts's unlock conditions) are untouched by this migration.
 */
function migrateV1ToV2(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input, schemaVersion: 2, purchasedToolIds: [] };
}

/**
 * Version 2 -> 3: grants NOTHING.
 *
 * An earlier build of this migration handed every older save the three reveal upgrades (Shop
 * Sign, Upgrade Catalogue, Steady Hand) outright, reasoning that progressive disclosure must
 * not take away a surface a player had been using. The reasoning was half right and the fix
 * was wrong: it made a player's save show a hold-to-click hint for an upgrade they had never
 * bought, and gameplay they had never chosen. Nothing in this game switches itself on.
 *
 * The surfaces an older save demonstrably USED are kept the honest way instead — by derivation
 * from the progress that is already in the save (disclosure.ts#computeDisclosure): owning a
 * generator keeps the shop rail visible, owning any non-reveal upgrade keeps the ticket strip
 * visible. Steady Hand has no such footprint, because press-and-hold leaves no trace in a save,
 * and it is a behaviour change rather than a view — so it is bought, by everyone, or not had.
 *
 * The step is kept (rather than deleted) so the version chain stays continuous and a version-2
 * save still walks forward to the latest schema.
 */
function migrateV2ToV3(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input, schemaVersion: 3 };
}

/**
 * Version 3 -> 4: adds `dieselDepot`, the Diesel Depot's lifetime totals (diesel-exchange.ts).
 *
 * Nothing is granted here, unlike the previous step. A version-3 save was written by a build
 * with no depot in it, so it minted no diesel, spent no cookies on diesel, and cannot have lost
 * a surface it never had — zeroes are simply the honest record. The Fuel Contract reveal
 * upgrade is likewise NOT handed out: an older player buys it like everyone else.
 */
function migrateV3ToV4(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...input,
    schemaVersion: 4,
    dieselDepot: { litresMinted: 0, vouchersMinted: 0, cookiesSpent: { mantissa: 0, exponent: 0 } },
  };
}

/**
 * Version 4 -> 5: adds `dieselFactory`, the production economy that now makes the diesel
 * (diesel-factory.ts).
 *
 * Nothing is granted, and one thing deliberately is NOT undone. A version-4 save may already
 * carry `dieselDepot.litresMinted` from the build where cookies bought litres outright; those
 * vouchers were really written to the shared ledger and really are a record of what that player
 * did, so the counter is left exactly as it is. What changes for them is only what happens
 * NEXT: the depot now draws from tanks, the tanks start empty, and the floor starts bare. The
 * factory is bought a piece at a time like everything else in this game.
 */
function migrateV4ToV5(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...input,
    schemaVersion: 5,
    dieselFactory: {
      equipment: [],
      upgradeIds: [],
      crude: 0,
      litres: 0,
      lifetimeCrude: 0,
      lifetimeLitres: 0,
      cookiesInvested: { mantissa: 0, exponent: 0 },
      autoShipEnabled: false,
      stalledSeconds: 0,
    },
  };
}

/** Ordered forward-only migrations, indexed by the version they migrate FROM. */
export const MIGRATIONS: Readonly<Record<number, MigrationStep>> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
  4: migrateV4ToV5,
};

export interface MigrationResult {
  readonly data: Record<string, unknown>;
  readonly finalVersion: number;
}

/**
 * Runs `data` (currently at `fromVersion`) through every registered migration step in order
 * until it reaches SAVE_SCHEMA_VERSION. Throws SaveVersionTooNewError if `fromVersion` is
 * already newer than what this build supports — callers (save-codec.ts) catch this and turn
 * it into a non-throwing decode result rather than letting it propagate.
 */
export function migrateToLatest(data: Record<string, unknown>, fromVersion: number): MigrationResult {
  if (fromVersion > SAVE_SCHEMA_VERSION) {
    throw new SaveVersionTooNewError(fromVersion, SAVE_SCHEMA_VERSION);
  }

  let current = data;
  let version = fromVersion;

  while (version < SAVE_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new Error(`No migration registered from schemaVersion ${version}.`);
    }
    current = step(current);
    version += 1;
  }

  return { data: current, finalVersion: version };
}

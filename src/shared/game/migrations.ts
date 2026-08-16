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
 * Version 2 -> 3: grants the three reveal upgrades (upgrades.ts#REVEAL_UPGRADE_DEFINITIONS).
 *
 * Progressive disclosure (disclosure.ts) hides the shop rail, the upgrade strip and
 * hold-to-click until the matching reveal upgrade is bought. A version-2 save was written by a
 * build where all three were simply always on and there was nothing to buy, so migrating one
 * without granting them would silently TAKE surfaces away from a player who had been using
 * them for weeks. Every older save is therefore handed all three outright, free, as though it
 * had bought them long ago; a save created by this build starts at version 3 with none of them
 * and earns each one properly.
 *
 * Ids are written literally rather than imported from upgrades.ts on purpose: a migration
 * describes what a PAST format meant, and must keep meaning that even if the definition list
 * is later reshuffled or renamed.
 */
function migrateV2ToV3(input: Record<string, unknown>): Record<string, unknown> {
  const granted = ["reveal_shop_sign", "reveal_upgrade_catalogue", "reveal_steady_hand"];
  const existing = Array.isArray(input.upgrades) ? (input.upgrades as { id?: unknown }[]) : [];
  const alreadyOwned = new Set(existing.map((u) => u?.id));
  const additions = granted
    .filter((id) => !alreadyOwned.has(id))
    .map((id) => ({ id, purchasedAtTickCount: 0 }));
  return { ...input, schemaVersion: 3, upgrades: [...existing, ...additions] };
}

/** Ordered forward-only migrations, indexed by the version they migrate FROM. */
export const MIGRATIONS: Readonly<Record<number, MigrationStep>> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
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

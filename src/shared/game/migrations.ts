import type { BigNum } from "./big-number.js";
import {
  grantedRungIdsForMigration,
  grantedRungIdsForV7Migration,
  grantedRungIdsForV8Migration,
  MIGRATION_GRANT_LIFETIME_THRESHOLD,
} from "./control-unlocks.js";
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

/**
 * Version 5 -> 6: adds `controlUnlocks`, the control economy (control-unlocks.ts) — and GRANTS,
 * which no migration in this file has done since the version-2 step was corrected to stop.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THIS IS THE ONE DECISION IN THIS FEATURE THAT NEEDS A REVIEWER TO AGREE WITH IT.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * The owner's rule for the whole feature is that every control is bought — settings, buttons,
 * dragging, minimize, maximize, resize, the lot. Applied literally HERE, a returning player with
 * a built-out factory would open this build and find they could no longer move their own window,
 * no longer reach the ×100 stepper they had been buying generator tiers with, and no longer
 * search a hundred and seventy-nine upgrades. That is not the joke landing; that is the update
 * appearing to have broken a save, and the player would be right to read it that way.
 *
 * So this step grants, and the grant is bounded by evidence rather than by generosity. A save
 * with more than `MIGRATION_GRANT_LIFETIME_THRESHOLD` (1,000) lifetime cookies has demonstrably
 * been PLAYED — that is a few minutes in, and comfortably past the point where the chrome prices
 * in the table would have been pocket change anyway — so it keeps every control it was already
 * using. A save under that line never really got going, has nothing to be taken away from it,
 * and starts the new game the way a fresh save does: paying for all of it.
 *
 * What is granted is `control-unlocks.ts#V6_GRANDFATHERED_RUNG_IDS`, a FROZEN list of the rungs
 * that exist at schema version 6, not the live registry. A control invented after this migration
 * was written was never usable by an older save and must never appear in an older save's grant.
 *
 * The honest cost of the compromise: a grandfathered player never meets the coin-slot plates at
 * all until they start a new save. If the owner would rather have the joke than the
 * compatibility, `MIGRATION_GRANT_LIFETIME_THRESHOLD` is the single constant to change.
 *
 * The lifetime figure is read defensively — a big-number pair off disk that is missing or
 * malformed reads as zero, and zero grants nothing, which is the safe direction to fail in.
 * It is handed to the policy as a BigNum PAIR rather than as a plain number: a deep late-game
 * lifetime total is past 1e308 and does not survive the conversion to a double, and a save that
 * big is the most-played save there is, not a corrupt one. Comparing the pair is what keeps it
 * on the granting side of the threshold.
 */
function migrateV5ToV6(input: Record<string, unknown>): Record<string, unknown> {
  const raw = input.lifetimeCookies;
  let lifetime: BigNum = { mantissa: 0, exponent: 0 };
  if (raw && typeof raw === "object") {
    const pair = raw as { mantissa?: unknown; exponent?: unknown };
    if (typeof pair.mantissa === "number" && typeof pair.exponent === "number") {
      lifetime = { mantissa: pair.mantissa, exponent: pair.exponent };
    }
  }

  return {
    ...input,
    schemaVersion: 6,
    controlUnlocks: { purchasedRungIds: [...grantedRungIdsForMigration(lifetime)] },
  };
}

/**
 * Version 6 -> 7: grants the three controls that used to be free, and nothing else, on the same
 * evidence as the step above.
 *
 * Two owner decrees moved boundaries this codebase had written down: the Settings emblem, free in
 * every build up to and including version 6, is now a 25-cookie control, and the Cantonese and
 * Bilingual language modes, free in every build up to and including version 6, are now 40- and
 * 90-cookie controls (control-unlocks.ts). English is free and is the default.
 * A version-6 save that had been using Settings, or reading in Cantonese, never chose to give it up,
 * and taking it away on update is the same "the patch broke my save" reading the version-6 step
 * exists to avoid — so the same threshold answers it: more than
 * `MIGRATION_GRANT_LIFETIME_THRESHOLD` lifetime cookies keeps the door open for free.
 *
 * The grant list is `V7_GRANDFATHERED_RUNG_IDS`, frozen at exactly those three ids. It deliberately does
 * NOT re-run the version-6 grant: a save arriving here from version 5 has already been through
 * that step this same load, and a save that was under the threshold then is under it now. This
 * step chains nothing and appends to whatever list is already there, filtering out any id the
 * save somehow already carries so a hand-edited file cannot end up with a duplicate.
 *
 * The lifetime figure is read exactly as the step above reads it, for exactly the same reason:
 * as a BigNum pair, because the deepest saves overflow a double and those are the saves the
 * grandfather clause exists for.
 */
function migrateV6ToV7(input: Record<string, unknown>): Record<string, unknown> {
  const raw = input.lifetimeCookies;
  let lifetime: BigNum = { mantissa: 0, exponent: 0 };
  if (raw && typeof raw === "object") {
    const pair = raw as { mantissa?: unknown; exponent?: unknown };
    if (typeof pair.mantissa === "number" && typeof pair.exponent === "number") {
      lifetime = { mantissa: pair.mantissa, exponent: pair.exponent };
    }
  }

  const existing = input.controlUnlocks;
  let owned: string[] = [];
  if (existing && typeof existing === "object") {
    const list = (existing as { purchasedRungIds?: unknown }).purchasedRungIds;
    if (Array.isArray(list)) owned = list.filter((id): id is string => typeof id === "string");
  }

  const granted = grantedRungIdsForV7Migration(lifetime).filter((id) => !owned.includes(id));

  return {
    ...input,
    schemaVersion: 7,
    controlUnlocks: { purchasedRungIds: [...owned, ...granted] },
  };
}

/**
 * Version 7 -> 8: grants the first advanced regex rung, and nothing else.
 *
 * The owner's decree that the regex builder be "more advanced and purchased, upgradable" added
 * a SHARED `regex` ladder (control-unlocks.ts) whose two rungs are new capabilities. A save that
 * had bought a surface's token palette owned what was then the whole builder, and this release
 * moved the top of that ladder — so `regex.groups` is granted to a save past the same threshold,
 * and the 12,000-cookie live lab is bought by everybody. The full argument, including why the lab
 * is deliberately excluded, is on `V8_GRANDFATHERED_RUNG_IDS`.
 *
 * Mechanically this is the version-7 step with a different frozen list: same defensive BigNum
 * read of the lifetime figure, same appending to whatever the save already carries, same filter
 * so a hand-edited file cannot end up with a duplicate, and no chaining of the earlier grants.
 */
function migrateV7ToV8(input: Record<string, unknown>): Record<string, unknown> {
  const raw = input.lifetimeCookies;
  let lifetime: BigNum = { mantissa: 0, exponent: 0 };
  if (raw && typeof raw === "object") {
    const pair = raw as { mantissa?: unknown; exponent?: unknown };
    if (typeof pair.mantissa === "number" && typeof pair.exponent === "number") {
      lifetime = { mantissa: pair.mantissa, exponent: pair.exponent };
    }
  }

  const existing = input.controlUnlocks;
  let owned: string[] = [];
  if (existing && typeof existing === "object") {
    const list = (existing as { purchasedRungIds?: unknown }).purchasedRungIds;
    if (Array.isArray(list)) owned = list.filter((id): id is string => typeof id === "string");
  }

  const granted = grantedRungIdsForV8Migration(lifetime).filter((id) => !owned.includes(id));

  return {
    ...input,
    schemaVersion: 8,
    controlUnlocks: { purchasedRungIds: [...owned, ...granted] },
  };
}

/** Ordered forward-only migrations, indexed by the version they migrate FROM. */
export const MIGRATIONS: Readonly<Record<number, MigrationStep>> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
  4: migrateV4ToV5,
  5: migrateV5ToV6,
  6: migrateV6ToV7,
  7: migrateV7ToV8,
};

export { MIGRATION_GRANT_LIFETIME_THRESHOLD };

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

/**
 * APPLICATION settings — language mode and the two funny levels.
 *
 * These are preferences of the APPLICATION, not facts about a playthrough, so they deliberately
 * do NOT live in `GameState` and are never written through `save-codec`. A wipe of the save (the
 * two-key destructive gate in PrestigeScreen) erases a run; it must not silently reset the
 * player's language back to a language they may not read. They therefore get their own tiny
 * store beside the game persistence in persistence.ts, using the same localStorage discipline:
 * one namespaced key, a defensive decode that never throws, and a swallowed write failure so a
 * full disk cannot crash the shell.
 *
 * There is no IPC tier here on purpose. The preload bridge (src/preload/index.ts) exposes window
 * chrome and the game save only — it has no settings channel — so inventing one would be
 * guessing at a contract this lane does not own. localStorage in the renderer is where these
 * live today, and that is stated plainly rather than dressed up.
 */

/** How bilingual copy is rendered across the whole application. */
export type LanguageMode = "en" | "yue" | "both";

export const LANGUAGE_MODES: readonly LanguageMode[] = ["en", "yue", "both"];

/**
 * 1 = fully serious, 5 = maximum playfulness (design/settings-funny-sliders.html).
 *
 * HONEST SCOPE, stated here because the dialog states it too: the copy system in this build has
 * exactly ONE voice per language — every string in copy.ts, narration.ts and the domain
 * definitions is written once. The level is therefore stored, persisted, announced and applied
 * wherever a variant exists, and today no string yet has five variants. It is not wired to a
 * fake transform that pretends to be five voices.
 */
export type FunnyLevel = 1 | 2 | 3 | 4 | 5;

export const FUNNY_LEVEL_MIN = 1;
export const FUNNY_LEVEL_MAX = 5;

export interface AppSettings {
  readonly languageMode: LanguageMode;
  /** The English funny level. Completely independent of `funnyLevelYue` — see the spec's own
   *  warning: a single shared slider disguised as two is the common wrong implementation. */
  readonly funnyLevelEn: FunnyLevel;
  /** The Cantonese funny level. Independent of `funnyLevelEn`. */
  readonly funnyLevelYue: FunnyLevel;
}

/**
 * ENGLISH IS THE DEFAULT MODE, by the owner's instruction ("also english as default language").
 * It used to be `both`.
 *
 * It is also the only mode that is free. Cantonese and Bilingual are bought controls
 * (control-unlocks.ts#settings.language.yue / .both), which makes the default doubly
 * load-bearing: a brand-new save must be readable end to end without spending anything, and
 * English is what it is readable in.
 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  // English by owner decree (2026-08-17); Cantonese and Bilingual are bought like everything else.
  languageMode: "en",
  funnyLevelEn: 3,
  funnyLevelYue: 3,
};

/** Which non-English modes a save has bought. English is never in here — it is free. */
export interface OwnedLanguageModes {
  readonly yue: boolean;
  readonly both: boolean;
}

/**
 * The mode the application ACTUALLY renders in, given the stored preference and what is bought.
 *
 * Pure, and separate from the stored value on purpose. The preference is a preference: a player
 * who bought Cantonese, chose it, then wiped their save back to zero should find their choice
 * still written down rather than silently rewritten to English on disk. What they should not
 * find is the application still rendering in a mode the save no longer owns. So the stored value
 * is left alone and this function decides what is drawn — falling back to English, the free mode,
 * whenever the chosen one is not paid for.
 */
export function effectiveLanguageMode(stored: LanguageMode, owned: OwnedLanguageModes): LanguageMode {
  if (stored === "yue") return owned.yue ? "yue" : "en";
  if (stored === "both") return owned.both ? "both" : "en";
  return "en";
}

export const APP_SETTINGS_KEY = "material-cookie-clicker:settings:v1";

export function isLanguageMode(value: unknown): value is LanguageMode {
  return value === "en" || value === "yue" || value === "both";
}

/** Clamps and rounds anything into the 1..5 band; anything unusable falls back to `fallback`. */
export function coerceFunnyLevel(value: unknown, fallback: FunnyLevel): FunnyLevel {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  const clamped = Math.min(FUNNY_LEVEL_MAX, Math.max(FUNNY_LEVEL_MIN, rounded));
  return clamped as FunnyLevel;
}

/**
 * Turns anything at all — including `null`, a string, a half-written object from an older
 * build — into a usable settings record. Never throws: a settings file is not worth losing a
 * session over, and a bad field simply reverts to its default.
 */
export function normalizeAppSettings(raw: unknown): AppSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_APP_SETTINGS;
  const record = raw as Record<string, unknown>;
  return {
    languageMode: isLanguageMode(record.languageMode) ? record.languageMode : DEFAULT_APP_SETTINGS.languageMode,
    funnyLevelEn: coerceFunnyLevel(record.funnyLevelEn, DEFAULT_APP_SETTINGS.funnyLevelEn),
    funnyLevelYue: coerceFunnyLevel(record.funnyLevelYue, DEFAULT_APP_SETTINGS.funnyLevelYue),
  };
}

/** The narrow subset of the Web Storage API this module needs, for test injection. */
export interface SettingsStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AppSettingsStore {
  load(): AppSettings;
  save(settings: AppSettings): void;
}

export function createLocalStorageAppSettings(storage: SettingsStorageLike): AppSettingsStore {
  return {
    load(): AppSettings {
      let raw: string | null = null;
      try {
        raw = storage.getItem(APP_SETTINGS_KEY);
      } catch {
        return DEFAULT_APP_SETTINGS;
      }
      if (raw === null) return DEFAULT_APP_SETTINGS;
      try {
        return normalizeAppSettings(JSON.parse(raw));
      } catch {
        // Unparseable preferences are not worth quarantining the way a save is: there is
        // nothing in them a player could lose beyond three small choices.
        return DEFAULT_APP_SETTINGS;
      }
    },
    save(settings: AppSettings): void {
      try {
        storage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        // Quota exceeded or storage unavailable: the setting still applies for this session.
      }
    },
  };
}

/** An in-memory store for environments with no storage at all (tests, a stripped host). */
export function createMemoryAppSettings(initial: AppSettings = DEFAULT_APP_SETTINGS): AppSettingsStore {
  let current = initial;
  return {
    load: () => current,
    save: (settings) => {
      current = settings;
    },
  };
}

export function resolveAppSettingsStore(): AppSettingsStore {
  if (typeof window !== "undefined" && window.localStorage) {
    return createLocalStorageAppSettings(window.localStorage);
  }
  return createMemoryAppSettings();
}

import { validateVocabularyDocument } from "@material-cookie-clicker/surface-kernel";

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

export type DockEdge = "left" | "top" | "right" | "bottom";
export type NarratorLanguage = "en" | "yue" | "both";
export type PaletteSize = "card" | "window";

export interface PersonalVocabularyCache {
  readonly version: 1;
  readonly replacements: Readonly<Record<string, string>>;
}

export interface NarratorSettings {
  readonly enabled: boolean;
  readonly language: NarratorLanguage;
  readonly englishVoiceId: string | null;
  readonly cantoneseVoiceId: string | null;
  readonly rate: number;
  readonly pitch: number;
}

export interface CanonicalTabSettings {
  readonly dock: DockEdge;
  readonly pinnedIds: readonly string[];
  readonly orderIds: readonly string[];
  readonly closedIds: readonly string[];
  readonly groupById: Readonly<Record<string, string>>;
  readonly groupNames: Readonly<Record<string, string>>;
  readonly groupAccents: Readonly<Record<string, string>>;
  readonly collapsedGroupIds: readonly string[];
}

export const FUNNY_LEVEL_MIN = 1;
export const FUNNY_LEVEL_MAX = 5;

export interface AppSettings {
  readonly languageMode: LanguageMode;
  /** The English funny level. Completely independent of `funnyLevelYue` — see the spec's own
   *  warning: a single shared slider disguised as two is the common wrong implementation. */
  readonly funnyLevelEn: FunnyLevel;
  /** The Cantonese funny level. Independent of `funnyLevelEn`. */
  readonly funnyLevelYue: FunnyLevel;
  readonly dialogEmoji: boolean;
  readonly schoolMode: boolean;
  readonly schoolModeName: string;
  readonly displayName: string;
  readonly personalVocabulary: PersonalVocabularyCache | null;
  readonly narrator: NarratorSettings;
  readonly tabs: CanonicalTabSettings;
  readonly paletteSize: PaletteSize;
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
  dialogEmoji: true,
  schoolMode: false,
  schoolModeName: "School mode",
  displayName: "Material Cookie Clicker",
  personalVocabulary: null,
  narrator: {
    enabled: false,
    language: "en",
    englishVoiceId: null,
    cantoneseVoiceId: null,
    rate: 1,
    pitch: 1,
  },
  tabs: {
    dock: "left",
    pinnedIds: ["general"],
    orderIds: [],
    closedIds: [],
    groupById: {},
    groupNames: {},
    groupAccents: {},
    collapsedGroupIds: [],
  },
  paletteSize: "card",
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

export const APP_SETTINGS_KEY = "material-cookie-clicker:settings:v2";
export const LEGACY_APP_SETTINGS_KEY = "material-cookie-clicker:settings:v1";

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
  const narrator = readRecord(record.narrator);
  const tabs = readRecord(record.tabs);
  return {
    languageMode: isLanguageMode(record.languageMode) ? record.languageMode : DEFAULT_APP_SETTINGS.languageMode,
    funnyLevelEn: coerceFunnyLevel(record.funnyLevelEn, DEFAULT_APP_SETTINGS.funnyLevelEn),
    funnyLevelYue: coerceFunnyLevel(record.funnyLevelYue, DEFAULT_APP_SETTINGS.funnyLevelYue),
    dialogEmoji: record.dialogEmoji !== false,
    schoolMode: record.schoolMode === true,
    schoolModeName: boundedString(record.schoolModeName, DEFAULT_APP_SETTINGS.schoolModeName, 48),
    displayName: boundedString(record.displayName, DEFAULT_APP_SETTINGS.displayName, 80),
    personalVocabulary: normalizeVocabularyCache(record.personalVocabulary),
    narrator: {
      enabled: narrator.enabled === true,
      language: isNarratorLanguage(narrator.language) ? narrator.language : DEFAULT_APP_SETTINGS.narrator.language,
      englishVoiceId: nullableBoundedString(narrator.englishVoiceId, 160),
      cantoneseVoiceId: nullableBoundedString(narrator.cantoneseVoiceId, 160),
      rate: boundedNumber(narrator.rate, 0.5, 2, DEFAULT_APP_SETTINGS.narrator.rate),
      pitch: boundedNumber(narrator.pitch, 0.5, 2, DEFAULT_APP_SETTINGS.narrator.pitch),
    },
    tabs: {
      dock: isDockEdge(tabs.dock) ? tabs.dock : DEFAULT_APP_SETTINGS.tabs.dock,
      pinnedIds: boundedStringArray(tabs.pinnedIds, 32, DEFAULT_APP_SETTINGS.tabs.pinnedIds),
      orderIds: boundedStringArray(tabs.orderIds, 32, DEFAULT_APP_SETTINGS.tabs.orderIds),
      closedIds: boundedStringArray(tabs.closedIds, 32, DEFAULT_APP_SETTINGS.tabs.closedIds),
      groupById: boundedStringRecord(tabs.groupById, 32),
      groupNames: boundedStringRecord(tabs.groupNames, 16),
      groupAccents: boundedStringRecord(tabs.groupAccents, 16),
      collapsedGroupIds: boundedStringArray(tabs.collapsedGroupIds, 16, DEFAULT_APP_SETTINGS.tabs.collapsedGroupIds),
    },
    paletteSize: record.paletteSize === "window" ? "window" : "card",
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedString(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : fallback;
}

function nullableBoundedString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function boundedStringArray(value: unknown, maxEntries: number, fallback: readonly string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)
    .map((item) => item.slice(0, 80)))]
    .slice(0, maxEntries);
}

function boundedStringRecord(value: unknown, maxEntries: number): Record<string, string> {
  const source = readRecord(value);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source).slice(0, maxEntries)) {
    if (typeof entry === "string" && key.length > 0 && entry.length > 0) {
      result[key.slice(0, 80)] = entry.slice(0, 80);
    }
  }
  return result;
}

function isDockEdge(value: unknown): value is DockEdge {
  return value === "left" || value === "top" || value === "right" || value === "bottom";
}

function isNarratorLanguage(value: unknown): value is NarratorLanguage {
  return value === "en" || value === "yue" || value === "both";
}

function normalizeVocabularyCache(value: unknown): PersonalVocabularyCache | null {
  const record = readRecord(value);
  if (record.version !== 1) return null;
  const verdict = validateVocabularyDocument(JSON.stringify(record));
  return verdict.ok ? { version: 1, replacements: verdict.replacements } : null;
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
        raw = storage.getItem(APP_SETTINGS_KEY) ?? storage.getItem(LEGACY_APP_SETTINGS_KEY);
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

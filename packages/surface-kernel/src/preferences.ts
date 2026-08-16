/**
 * The shared personalization record.
 *
 * The documentation site already ships dock, theme, density, accent, font
 * scale, motion, language and the two humour levels. This module keeps that
 * shape and adds the fields the desktop application needs, so one validator
 * serves both surfaces.
 */

import type { LogoSelection } from "./identity.ts";
import type { NarrationPreferences } from "./narration.ts";

export type Dock = "left" | "top" | "right" | "bottom";
export type Theme = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";
export type MotionChoice = "system" | "reduce" | "full";
export type LanguageMode = "en" | "zh" | "both";
export type FunnyLevel = 1 | 2 | 3 | 4 | 5;

export type Preferences = {
  dock: Dock;
  theme: Theme;
  density: Density;
  accent: string;
  fontScale: number;
  motion: MotionChoice;
  language: LanguageMode;
  englishFunny: number;
  cantoneseFunny: number;
  dialogEmoji: boolean;
  displayName: string;
  logo: LogoSelection;
  narration: NarrationPreferences;
};

export const DOCKS: readonly Dock[] = ["left", "top", "right", "bottom"];
export const THEMES: readonly Theme[] = ["system", "light", "dark"];
export const DENSITIES: readonly Density[] = ["comfortable", "compact"];
export const MOTION_CHOICES: readonly MotionChoice[] = ["system", "reduce", "full"];
export const LANGUAGE_MODES: readonly LanguageMode[] = ["en", "zh", "both"];

export const MIN_FONT_SCALE = 0.8;
export const MAX_FONT_SCALE = 1.6;
export const MIN_FUNNY_LEVEL = 1;
export const MAX_FUNNY_LEVEL = 5;

export const DEFAULT_NARRATION: NarrationPreferences = {
  enabled: false,
  englishVoiceId: null,
  cantoneseVoiceId: null,
  rate: 1,
  pitch: 1,
};

export const DEFAULT_PREFERENCES: Preferences = {
  dock: "left",
  theme: "system",
  density: "comfortable",
  accent: "#4355b9",
  fontScale: 1,
  motion: "system",
  language: "en",
  englishFunny: 1,
  cantoneseFunny: 3,
  dialogEmoji: true,
  displayName: "",
  logo: { kind: "shipped" },
  narration: DEFAULT_NARRATION,
};

/** Every preference key a settings grid and a command palette must cover. */
export const PREFERENCE_KEYS: readonly (keyof Preferences)[] = [
  "dock",
  "theme",
  "density",
  "accent",
  "fontScale",
  "motion",
  "language",
  "englishFunny",
  "cantoneseFunny",
  "dialogEmoji",
  "displayName",
  "logo",
  "narration",
];

function pickString<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Accepts a six-digit hexadecimal colour only; anything else keeps the default. */
export function normalizeAccent(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function readNarration(value: unknown): NarrationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_NARRATION };
  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    englishVoiceId: typeof record.englishVoiceId === "string" ? record.englishVoiceId.slice(0, 120) : null,
    cantoneseVoiceId: typeof record.cantoneseVoiceId === "string" ? record.cantoneseVoiceId.slice(0, 120) : null,
    rate: clampNumber(record.rate, 0.5, 2, DEFAULT_NARRATION.rate),
    pitch: clampNumber(record.pitch, 0.5, 2, DEFAULT_NARRATION.pitch),
  };
}

function readLogo(value: unknown): LogoSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { kind: "shipped" };
  const record = value as Record<string, unknown>;
  if (record.kind === "local" && typeof record.dataUrl === "string" && record.dataUrl.startsWith("data:image/")) {
    return { kind: "local", dataUrl: record.dataUrl };
  }
  if (record.kind === "shipped" && typeof record.id === "string" && record.id.length > 0 && record.id.length <= 80) {
    return { kind: "shipped", id: record.id };
  }
  return { kind: "shipped" };
}

/** Reads an untrusted record and returns a complete, in-range preference set. */
export function validatePreferences(raw: unknown): Preferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_PREFERENCES };
  const record = raw as Record<string, unknown>;
  return {
    dock: pickString(record.dock, DOCKS, DEFAULT_PREFERENCES.dock),
    theme: pickString(record.theme, THEMES, DEFAULT_PREFERENCES.theme),
    density: pickString(record.density, DENSITIES, DEFAULT_PREFERENCES.density),
    accent: normalizeAccent(record.accent, DEFAULT_PREFERENCES.accent),
    fontScale: clampNumber(record.fontScale, MIN_FONT_SCALE, MAX_FONT_SCALE, DEFAULT_PREFERENCES.fontScale),
    motion: pickString(record.motion, MOTION_CHOICES, DEFAULT_PREFERENCES.motion),
    language: pickString(record.language, LANGUAGE_MODES, DEFAULT_PREFERENCES.language),
    englishFunny: Math.round(
      clampNumber(record.englishFunny, MIN_FUNNY_LEVEL, MAX_FUNNY_LEVEL, DEFAULT_PREFERENCES.englishFunny),
    ),
    cantoneseFunny: Math.round(
      clampNumber(record.cantoneseFunny, MIN_FUNNY_LEVEL, MAX_FUNNY_LEVEL, DEFAULT_PREFERENCES.cantoneseFunny),
    ),
    dialogEmoji: typeof record.dialogEmoji === "boolean" ? record.dialogEmoji : DEFAULT_PREFERENCES.dialogEmoji,
    displayName: typeof record.displayName === "string" ? record.displayName.slice(0, 60).trim() : "",
    logo: readLogo(record.logo),
    narration: readNarration(record.narration),
  };
}

/** Applies a partial change and revalidates the whole record. */
export function applyPreferencePatch(current: Preferences, patch: Partial<Preferences>): Preferences {
  return validatePreferences({ ...current, ...patch });
}

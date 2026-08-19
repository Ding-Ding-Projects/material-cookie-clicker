export const SHIPPED_APP_NAME = "Material Cookie Clicker";
export const STABLE_APP_IDENTITY = {
  applicationId: "org.dingdingprojects.materialcookieclicker",
  dataDirectoryName: "material-cookie-clicker",
  executableName: "Material Cookie Clicker.exe",
  updateChannel: "material-cookie-clicker",
} as const;

export const IDENTITY_STORAGE_KEY = "material-cookie-clicker.desktop.identity.v1";
export const IDENTITY_SCHEMA_VERSION = 1;
export const MAX_DISPLAY_NAME_LENGTH = 60;
export const MAX_LOGO_BYTES = 262_144;
export const MAX_LOGO_DIMENSION = 4096;
export const MAX_LOGO_PIXELS = 16_777_216;
export const LOGO_DERIVATIVE_SIZES = [16, 32, 48, 64, 128, 256] as const;

export type LogoFit = "contain" | "cover" | "fill";
export type LogoPresetId = "classic-cookie" | "golden-cookie" | "bakery-mark";

export interface LogoTransform {
  fit: LogoFit;
  focalX: number;
  focalY: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  background: "transparent" | string;
}

export interface LogoMetadata {
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  frames: 1;
  byteLength: number;
}

export interface LogoDerivative {
  size: (typeof LOGO_DERIVATIVE_SIZES)[number];
  mimeType: "image/png";
  dataUrl: string;
}

export type LogoSelection =
  | { kind: "preset"; presetId: LogoPresetId }
  | {
      kind: "custom";
      sourceDataUrl: string;
      metadata: LogoMetadata;
      transform: LogoTransform;
      derivatives: LogoDerivative[];
    };

export interface IdentityPreferences {
  version: 1;
  displayName: string;
  logo: LogoSelection;
}

export const DEFAULT_LOGO_TRANSFORM: LogoTransform = {
  fit: "contain",
  focalX: 0.5,
  focalY: 0.5,
  cropX: 0,
  cropY: 0,
  cropWidth: 1,
  cropHeight: 1,
  background: "transparent",
};

export const DEFAULT_IDENTITY_PREFERENCES: IdentityPreferences = {
  version: IDENTITY_SCHEMA_VERSION,
  displayName: "",
  logo: { kind: "preset", presetId: "classic-cookie" },
};

export const LOGO_PRESETS: ReadonlyArray<{ id: LogoPresetId; name: string; description: string }> = [
  { id: "classic-cookie", name: "Classic Cookie", description: "The shipped chocolate-chip cookie mark." },
  { id: "golden-cookie", name: "Golden Cookie", description: "A warm gold mark for lucky-cookie runs." },
  { id: "bakery-mark", name: "Bakery Mark", description: "A compact oven-and-cookie emblem." },
];

export type IdentityValidation<T> = { ok: true; value: T } | { ok: false; reason: string };

export function normalizeDisplayName(value: string): IdentityValidation<string> {
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length > MAX_DISPLAY_NAME_LENGTH) {
    return { ok: false, reason: `Use at most ${MAX_DISPLAY_NAME_LENGTH} characters.` };
  }
  if (/\p{Cc}/u.test(normalized)) return { ok: false, reason: "Control characters are not accepted." };
  return { ok: true, value: normalized };
}

export function resolveDisplayName(preferences: IdentityPreferences): string {
  return preferences.displayName || SHIPPED_APP_NAME;
}

/** Display-name changes never change installed identity. */
export function stableIdentityAfterRename(_displayName: string): typeof STABLE_APP_IDENTITY {
  return STABLE_APP_IDENTITY;
}

function finiteUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateLogoTransform(value: unknown): IdentityValidation<LogoTransform> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "Logo transform must be an object." };
  const item = value as Partial<LogoTransform>;
  if (!(["contain", "cover", "fill"] as unknown[]).includes(item.fit)) return { ok: false, reason: "Choose contain, cover or fill." };
  if (![item.focalX, item.focalY, item.cropX, item.cropY, item.cropWidth, item.cropHeight].every(finiteUnit)) {
    return { ok: false, reason: "Crop and focal values must be finite values from 0 to 1." };
  }
  if ((item.cropWidth ?? 0) <= 0 || (item.cropHeight ?? 0) <= 0 || (item.cropX ?? 0) + (item.cropWidth ?? 0) > 1 || (item.cropY ?? 0) + (item.cropHeight ?? 0) > 1) {
    return { ok: false, reason: "The crop must have area and stay inside the source image." };
  }
  if (typeof item.background !== "string" || item.background.length > 40 || /[;{}<>]/.test(item.background)) {
    return { ok: false, reason: "Background must be a bounded inert colour value or transparent." };
  }
  return { ok: true, value: item as LogoTransform };
}

export interface ElementAppearanceTarget {
  id: string;
  label: string;
  kind: "text" | "surface" | "control" | "icon" | "panel";
  properties: AppearancePropertyId[];
}

export type AppearancePropertyId =
  | "fontFamily" | "fontSize" | "fontWeight" | "fontStyle" | "fontVariationSettings"
  | "underline" | "underlineColor" | "strike" | "doubleStrike" | "overline"
  | "textTransform" | "smallCaps" | "superscript" | "subscript" | "textColor"
  | "highlight" | "outline" | "shadow" | "glow" | "letterSpacing" | "wordSpacing"
  | "lineHeight" | "baselineOffset" | "direction" | "textAlign" | "surfaceColor"
  | "borderColor" | "borderWidth" | "radius" | "padding" | "gap" | "elevation";

export const APPEARANCE_PROPERTY_SUPPORT: Readonly<Record<AppearancePropertyId, { css: string | null; unsupportedReason?: string }>> = {
  fontFamily: { css: "fontFamily" }, fontSize: { css: "fontSize" }, fontWeight: { css: "fontWeight" },
  fontStyle: { css: "fontStyle" }, fontVariationSettings: { css: "fontVariationSettings" },
  underline: { css: "textDecorationLine" }, underlineColor: { css: "textDecorationColor" },
  strike: { css: "textDecorationLine" },
  doubleStrike: { css: null, unsupportedReason: "CSS has no interoperable double-strikethrough property." },
  overline: { css: "textDecorationLine" }, textTransform: { css: "textTransform" },
  smallCaps: { css: "fontVariantCaps" }, superscript: { css: "verticalAlign" }, subscript: { css: "verticalAlign" },
  textColor: { css: "color" }, highlight: { css: "backgroundColor" }, outline: { css: "WebkitTextStroke" },
  shadow: { css: "textShadow" }, glow: { css: "textShadow" }, letterSpacing: { css: "letterSpacing" },
  wordSpacing: { css: "wordSpacing" }, lineHeight: { css: "lineHeight" }, baselineOffset: { css: "verticalAlign" },
  direction: { css: "direction" }, textAlign: { css: "textAlign" }, surfaceColor: { css: "backgroundColor" },
  borderColor: { css: "borderColor" }, borderWidth: { css: "borderWidth" }, radius: { css: "borderRadius" },
  padding: { css: "padding" }, gap: { css: "gap" }, elevation: { css: "boxShadow" },
};

export const RAINBOW_SENTINEL = "__material_cookie_clicker_rainbow__";
export type RainbowSpeedLevel = 1 | 2 | 3 | 4 | 5;
export const RAINBOW_DURATION_SECONDS: Readonly<Record<RainbowSpeedLevel, number>> = { 1: 24, 2: 16, 3: 10, 4: 6, 5: 3 };

export function rainbowCss(speed: RainbowSpeedLevel, reducedMotion: boolean): Record<string, string> {
  return reducedMotion
    ? { backgroundColor: "hsl(285 78% 56%)" }
    : { animationName: "material-cookie-rainbow", animationDuration: `${RAINBOW_DURATION_SECONDS[speed]}s`, animationIterationCount: "infinite", animationTimingFunction: "linear" };
}

export interface AppearanceLockPort {
  isBlocked(elementId: string, property?: AppearancePropertyId): boolean;
  requestUnlock(elementId: string, property?: AppearancePropertyId): void;
}

export const PRODUCT_APPEARANCE_SCHEMA_VERSION = 1;
export const MAX_PRODUCT_APPEARANCE_BYTES = 131_072;
export const MAX_PRODUCT_APPEARANCE_ELEMENTS = 300;
export const MAX_PRODUCT_APPEARANCE_VALUE_LENGTH = 180;
export type ProductAppearanceStore = Record<string, Partial<Record<AppearancePropertyId, string>>>;

export function validateProductAppearanceValue(value: string): boolean {
  if (value === RAINBOW_SENTINEL) return true;
  return value.length > 0 && value.length <= MAX_PRODUCT_APPEARANCE_VALUE_LENGTH && !/url\(|expression\(|@import|[;{}<>\\]/i.test(value);
}

export function exportProductAppearancePreset(store: ProductAppearanceStore, name: string): string {
  return `${JSON.stringify({ version: PRODUCT_APPEARANCE_SCHEMA_VERSION, name: name.slice(0, 80), elements: store }, null, 2)}\n`;
}

export function importProductAppearancePreset(raw: string): IdentityValidation<ProductAppearanceStore> {
  if (raw.length > MAX_PRODUCT_APPEARANCE_BYTES) return { ok: false, reason: "The appearance preset exceeds the 128 KB local limit." };
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { return { ok: false, reason: "The appearance preset is not valid JSON." }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "The preset root must be an object." };
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["version", "name", "elements"].includes(key)) || record.version !== 1 || !record.elements || typeof record.elements !== "object" || Array.isArray(record.elements)) {
    return { ok: false, reason: "Use version 1 with one elements object and no unknown fields." };
  }
  const entries = Object.entries(record.elements as Record<string, unknown>);
  if (entries.length > MAX_PRODUCT_APPEARANCE_ELEMENTS) return { ok: false, reason: `At most ${MAX_PRODUCT_APPEARANCE_ELEMENTS} elements are accepted.` };
  const propertyIds = new Set<AppearancePropertyId>(Object.keys(APPEARANCE_PROPERTY_SUPPORT) as AppearancePropertyId[]);
  const store: ProductAppearanceStore = {};
  for (const [elementId, rawValues] of entries) {
    if (!/^[a-z0-9][a-z0-9._:-]{0,119}$/i.test(elementId) || ["__proto__", "prototype", "constructor"].includes(elementId)) return { ok: false, reason: "An element identifier is unsafe." };
    if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) return { ok: false, reason: "Every element must map to an appearance object." };
    const values: Partial<Record<AppearancePropertyId, string>> = {};
    for (const [property, value] of Object.entries(rawValues as Record<string, unknown>)) {
      if (!propertyIds.has(property as AppearancePropertyId) || typeof value !== "string" || !validateProductAppearanceValue(value)) return { ok: false, reason: `The appearance property "${property}" is unsupported or unsafe.` };
      values[property as AppearancePropertyId] = value;
    }
    store[elementId] = values;
  }
  return { ok: true, value: store };
}

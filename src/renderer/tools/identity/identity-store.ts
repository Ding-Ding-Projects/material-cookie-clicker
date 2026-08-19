import { DEFAULT_IDENTITY_PREFERENCES, IDENTITY_STORAGE_KEY, LOGO_PRESETS, normalizeDisplayName, validateLogoTransform, type IdentityPreferences, type LogoPresetId } from "../../../shared/identity-model";

export function loadIdentityPreferences(storage: Pick<Storage, "getItem"> = localStorage): IdentityPreferences {
  try {
    const raw = storage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_IDENTITY_PREFERENCES);
    if (raw.length > 4_194_304) return structuredClone(DEFAULT_IDENTITY_PREFERENCES);
    const parsed = JSON.parse(raw) as Partial<IdentityPreferences>;
    const display = normalizeDisplayName(parsed.displayName ?? "");
    const logo = parsed.logo;
    if (!display.ok || parsed.version !== 1 || !logo) return structuredClone(DEFAULT_IDENTITY_PREFERENCES);
    if (logo.kind === "preset" && !LOGO_PRESETS.some((preset) => preset.id === logo.presetId)) return structuredClone(DEFAULT_IDENTITY_PREFERENCES);
    if (logo.kind === "custom" && (!logo.metadata || !logo.derivatives?.length || !validateLogoTransform(logo.transform).ok)) return structuredClone(DEFAULT_IDENTITY_PREFERENCES);
    return { version: 1, displayName: display.value, logo } as IdentityPreferences;
  } catch {
    return structuredClone(DEFAULT_IDENTITY_PREFERENCES);
  }
}

export function saveIdentityPreferences(value: IdentityPreferences, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(value));
}

export function withDisplayName(current: IdentityPreferences, name: string): IdentityPreferences {
  const verdict = normalizeDisplayName(name);
  if (!verdict.ok) throw new Error(verdict.reason);
  return { ...current, displayName: verdict.value };
}

export function withPreset(current: IdentityPreferences, presetId: LogoPresetId): IdentityPreferences {
  if (!LOGO_PRESETS.some((preset) => preset.id === presetId)) throw new Error("Unknown shipped logo preset.");
  return { ...current, logo: { kind: "preset", presetId } };
}

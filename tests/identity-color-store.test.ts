import { describe, expect, it } from "vitest";

import { cmykToRgb, describeColor, rgbToCmyk } from "../src/renderer/tools/identity/color-tools";
import { loadIdentityPreferences, withDisplayName, withPreset } from "../src/renderer/tools/identity/identity-store";
import { DEFAULT_IDENTITY_PREFERENCES, IDENTITY_STORAGE_KEY } from "../src/shared/identity-model";

describe("identity persistence", () => {
  it("loads a valid bounded record and resets corrupt or unknown presets", () => {
    const good = withPreset(withDisplayName(DEFAULT_IDENTITY_PREFERENCES, "Cookie Lab"), "golden-cookie");
    expect(loadIdentityPreferences({ getItem: (key) => key === IDENTITY_STORAGE_KEY ? JSON.stringify(good) : null })).toEqual(good);
    expect(loadIdentityPreferences({ getItem: () => "{" })).toEqual(DEFAULT_IDENTITY_PREFERENCES);
    expect(loadIdentityPreferences({ getItem: () => JSON.stringify({ ...good, logo: { kind: "preset", presetId: "network-logo" } }) })).toEqual(DEFAULT_IDENTITY_PREFERENCES);
  });
});

describe("complete colour translation", () => {
  it("round-trips CMYK and reports contrast, alpha and gamut", () => {
    const red = describeColor("rgb(255 0 0 / 0.5)", "#ffffff");
    expect(red.ok).toBe(true);
    if (!red.ok) return;
    expect(red.cmyk).toMatchObject({ c: 0, m: 100, y: 100, k: 0, alpha: 0.5 });
    expect(cmykToRgb(red.cmyk).coords.map(Math.round)).toEqual([255, 0, 0]);
    expect(rgbToCmyk(cmykToRgb({ c: 0, m: 0, y: 0, k: 100, alpha: 1 }))).toMatchObject({ k: 100 });
    expect(red.translations).toHaveProperty("oklch");
    expect(red.contrast).toBeGreaterThan(3);
  });

  it("fails closed on declarations instead of accepting CSS injection", () => {
    expect(describeColor("red; background:url(https://example.invalid)").ok).toBe(false);
  });
});

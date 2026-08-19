import { describe, expect, it } from "vitest";

import { inspectLogoBytes } from "../src/shared/identity-image";
import {
  DEFAULT_LOGO_TRANSFORM,
  MAX_LOGO_BYTES,
  RAINBOW_SENTINEL,
  SHIPPED_APP_NAME,
  STABLE_APP_IDENTITY,
  normalizeDisplayName,
  rainbowCss,
  stableIdentityAfterRename,
  exportProductAppearancePreset,
  importProductAppearancePreset,
  validateLogoTransform,
} from "../src/shared/identity-model";

function png(width: number, height: number, extraChunk?: string): Uint8Array {
  const bytes = new Uint8Array(extraChunk ? 57 : 33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  if (extraChunk) { bytes.set([0, 0, 0, 0], 33); bytes.set([...extraChunk].map((char) => char.charCodeAt(0)), 37); }
  return bytes;
}

describe("stable app identity", () => {
  it("normalizes a display rename without changing installed identity", () => {
    expect(normalizeDisplayName("  Cookie Palace  ")).toEqual({ ok: true, value: "Cookie Palace" });
    expect(stableIdentityAfterRename("Cookie Palace")).toBe(STABLE_APP_IDENTITY);
    expect(SHIPPED_APP_NAME).toBe("Material Cookie Clicker");
  });

  it("rejects control characters and overlong names", () => {
    expect(normalizeDisplayName("bad\u0000name").ok).toBe(false);
    expect(normalizeDisplayName("x".repeat(61)).ok).toBe(false);
  });
});

describe("bounded logo inspection", () => {
  it("reads real PNG dimensions from bytes", () => {
    expect(inspectLogoBytes(png(512, 256))).toEqual({ ok: true, value: { mimeType: "image/png", width: 512, height: 256, frames: 1, byteLength: 33 } });
  });

  it("rejects animation, decompression-sized dimensions, wrong signatures and byte limits", () => {
    expect(inspectLogoBytes(png(32, 32, "acTL"))).toEqual({ ok: false, reason: "Animated PNG images are not accepted." });
    expect(inspectLogoBytes(png(5000, 4)).ok).toBe(false);
    expect(inspectLogoBytes(Uint8Array.from([0x47, 0x49, 0x46])).ok).toBe(false);
    expect(inspectLogoBytes(new Uint8Array(MAX_LOGO_BYTES + 1)).ok).toBe(false);
  });

  it("rejects unsafe crop bounds", () => {
    expect(validateLogoTransform(DEFAULT_LOGO_TRANSFORM).ok).toBe(true);
    expect(validateLogoTransform({ ...DEFAULT_LOGO_TRANSFORM, cropX: 0.8, cropWidth: 0.5 }).ok).toBe(false);
    expect(validateLogoTransform({ ...DEFAULT_LOGO_TRANSFORM, background: "red;display:none" }).ok).toBe(false);
  });
});

describe("rainbow sentinel", () => {
  it("is not a color string and becomes a single hue under reduced motion", () => {
    expect(RAINBOW_SENTINEL).not.toMatch(/^#|^rgb|^hsl/);
    expect(rainbowCss(5, false).animationDuration).toBe("3s");
    expect(rainbowCss(5, true)).toEqual({ backgroundColor: "hsl(285 78% 56%)" });
  });
});

describe("product appearance presets", () => {
  it("round-trips the complete product property model and rejects unknown or active values", () => {
    const raw = exportProductAppearancePreset({ "header.title": { fontFamily: "Segoe UI", doubleStrike: "unsupported-kept", textColor: RAINBOW_SENTINEL } }, "Arcade");
    const imported = importProductAppearancePreset(raw);
    expect(imported.ok).toBe(true);
    expect(importProductAppearancePreset('{"version":1,"name":"x","elements":{"x":{"notAProperty":"red"}}}').ok).toBe(false);
    expect(importProductAppearancePreset('{"version":1,"name":"x","elements":{"x":{"textColor":"red;display:none"}}}').ok).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("identity and appearance surface contracts", () => {
  it("keeps rename, preset, upload, rollback and safe-area controls present", () => {
    const source = readFileSync("src/renderer/tools/identity/IdentityAppearancePanel.tsx", "utf8");
    for (const needle of ["Save display name", "Reset shipped name", "image/png,image/jpeg", "safe-area previews", "Reset all identity presentation", "Stable application ID"]) expect(source).toContain(needle);
  });

  it("keeps unsupported properties, lock seams, font search, colour translation and rainbow controls present", () => {
    const source = readFileSync("src/renderer/tools/identity/AppearanceEditor.tsx", "utf8");
    for (const needle of ["Unavailable:", "lockPort?.isBlocked", "Search installed fonts", "CMYK", "Animated rainbow", "reducedMotion", "Appearance preset"]) expect(source).toContain(needle);
  });
});

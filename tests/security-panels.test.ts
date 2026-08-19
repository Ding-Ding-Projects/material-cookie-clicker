import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/renderer/tools/security/StateToolsPanels.tsx", import.meta.url), "utf8").replaceAll("\r\n", "\n");

describe("security and state tools surface contract", () => {
  it("keeps every required panel explicitly present", () => {
    for (const component of ["ToyLockWizard", "SupportTicketsPanel", "ScheduleEditorPanel", "HistoryPanel", "ExportRegistryPanel", "ChangelogPanel", "OfflineDocsPanel"]) {
      expect(source).toMatch(new RegExp(`^export function ${component}\\(`, "m"));
    }
  });

  it("has an adjacent regex builder for its reusable search field and honest local-ticket disclosure", () => {
    expect(source).toContain("Regular-expression builder");
    expect(source).toContain("Nothing is sent anywhere. No ticket exists outside this computer");
  });

  it("does not contain a renderer network primitive or a hidden secret store", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/localStorage\.(?:setItem|getItem)/);
  });
});

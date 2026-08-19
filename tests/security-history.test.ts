import { describe, expect, it } from "vitest";
import { createSearchState, DEFAULT_REDACTION_RULES } from "@material-cookie-clicker/surface-kernel";

import { AppendOnlyHistoryManager } from "../src/shared/security-history";

describe("append-only local Git history model", () => {
  it("commits an encrypted snapshot, verifies it independently, and appends restores", async () => {
    const commits = new Set<string>();
    const written: { record: unknown; encryptedSnapshot: string }[] = [];
    let id = 0;
    const manager = new AppendOnlyHistoryManager(
      {
        initialize: async () => undefined,
        appendCommit: async (input) => { written.push(input); const sha = "a".repeat(39) + String(written.length); commits.add(sha); return sha; },
        containsCommit: async (sha) => commits.has(sha),
      },
      { encrypt: async (_snapshot, stableId) => `encrypted:${stableId}`, decrypt: async () => ({}) },
      { verify: async (answer) => answer === "right" },
      { now: () => 0, isoNow: () => "2027-01-01T00:00:00.000Z" },
      { next: () => `id-${++id}` },
      { ...DEFAULT_REDACTION_RULES, identityAnswers: ["never-store-this"] },
    );
    const first = await manager.append({ action: "identity-change", summary: "Changed never-store-this", stableId: "identity", snapshot: { value: "private" } });
    expect(first.record.summary).toContain("[redacted]");
    expect(written[0]?.encryptedSnapshot).toBe("encrypted:identity");
    await expect(manager.restore(first.record.revisionId, "wrong")).rejects.toThrow("not verified");
    const restored = await manager.restore(first.record.revisionId, "right");
    expect(restored.action).toBe("restore");
    expect(manager.list({}, createSearchState()).map((record) => record.action)).toEqual(["identity-change", "restore"]);
  });

  it("does not trust a commit SHA the adapter cannot read back", async () => {
    const manager = new AppendOnlyHistoryManager(
      { initialize: async () => undefined, appendCommit: async () => "b".repeat(40), containsCommit: async () => false },
      { encrypt: async () => "ciphertext", decrypt: async () => ({}) },
      { verify: async () => true },
      { now: () => 0, isoNow: () => "2027-01-01T00:00:00.000Z" },
      { next: () => "id" },
      DEFAULT_REDACTION_RULES,
    );
    await expect(manager.append({ action: "create", summary: "Create", stableId: "x", snapshot: {} })).rejects.toThrow("independently verified");
  });
});

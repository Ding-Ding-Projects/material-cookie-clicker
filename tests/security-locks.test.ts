import { describe, expect, it } from "vitest";

import { createToyLock, relockToyLock, toyLockBlocksMutation, unlockToyLock, type CredentialVault } from "../src/shared/security-locks";

function memoryVault(): CredentialVault & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    put: async (ref, value) => { values.set(ref, value); },
    read: async (ref) => values.get(ref) ?? null,
    delete: async (ref) => { values.delete(ref); },
  };
}

const clock = { now: () => 1_800_000_000_000, isoNow: () => "2027-01-15T08:00:00.000Z" };

describe("per-element toy locks", () => {
  it("keeps every credential under its own opaque vault reference", async () => {
    const vault = memoryVault();
    const first = await createToyLock({ id: "one", scope: { elementId: "button.one" }, method: "totp", credential: "JBSWY3DPEHPK3PXP", duration: { kind: "surface" }, vault, clock });
    const second = await createToyLock({ id: "two", scope: { elementId: "button.two", property: "fontSize" }, method: "totp", credential: "KRUGS4ZANFZSAYJA", duration: { kind: "until-close" }, vault, clock });
    expect(first.credentialRef).not.toBe(second.credentialRef);
    expect(vault.values.get(first.credentialRef)).toBe("JBSWY3DPEHPK3PXP");
    expect(JSON.stringify(first)).not.toContain("JBSWY3DPEHPK3PXP");
  });

  it("unlocks only the matching scope, honors duration, and explicitly relocks", async () => {
    const vault = memoryVault();
    const lock = await createToyLock({ id: "one", scope: { elementId: "button.one" }, method: "totp", credential: "JBSWY3DPEHPK3PXP", duration: { kind: "until-close" }, vault, clock });
    const verdict = await unlockToyLock({ lock, answer: "123456", vault, clock, totp: { verify: async (_secret, code) => code === "123456" } });
    expect(verdict.ok).toBe(true);
    expect(toyLockBlocksMutation([verdict.lock], { elementId: "button.one" }, clock.now())).toBe(false);
    expect(toyLockBlocksMutation([verdict.lock], { elementId: "button.two" }, clock.now())).toBe(false);
    expect(toyLockBlocksMutation([relockToyLock(verdict.lock)], { elementId: "button.one" }, clock.now())).toBe(true);
  });

  it("fails closed when the vault record is unavailable", async () => {
    const vault = memoryVault();
    const lock = await createToyLock({ id: "one", scope: { elementId: "panel" }, method: "totp", credential: "JBSWY3DPEHPK3PXP", duration: { kind: "minutes", minutes: 5 }, vault, clock });
    vault.values.clear();
    await expect(unlockToyLock({ lock, answer: "123456", vault, clock, totp: { verify: async () => true } })).resolves.toEqual({ ok: false, lock });
  });
});

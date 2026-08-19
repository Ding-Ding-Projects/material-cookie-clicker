import { describe, expect, it } from "vitest";

import { evaluateExtendedSchedule, resolveExternalScheduleValue, validateExtendedRule, validateScheduleSource, type ExtendedScheduleRule } from "../src/shared/security-scheduling";

function rule(overrides: Partial<ExtendedScheduleRule> = {}): ExtendedScheduleRule {
  return { id: "night", label: "Night theme", enabled: true, weekdays: [], startTime: "22:00", endTime: "06:00", target: "theme", value: "dark", source: { kind: "local" }, ...overrides };
}

describe("scheduled and external settings", () => {
  it("handles optional date boundaries and cross-midnight local windows", () => {
    const current = rule({ startDate: "2027-01-01", endDate: "2027-01-31" });
    expect(evaluateExtendedSchedule([current], "2027-01-15T04:00:00.000Z", "UTC").values.theme).toBe("dark");
    expect(evaluateExtendedSchedule([current], "2027-02-01T04:00:00.000Z", "UTC").values.theme).toBeUndefined();
  });

  it("rejects credential URLs, non-loopback HTTP, and unsupported Home Assistant entities", () => {
    expect(validateScheduleSource({ kind: "https-api", url: "https://name:secret@example.test/settings", allowedOrigins: [] })).toContain("Credentials");
    expect(validateScheduleSource({ kind: "https-api", url: "http://example.test/settings", allowedOrigins: [] })).toContain("HTTPS");
    expect(validateScheduleSource({ kind: "https-api", url: "http://127.0.0.1:8123/settings", allowedOrigins: [] })).toBeNull();
    expect(validateExtendedRule(rule({ source: { kind: "home-assistant", baseUrl: "https://ha.example", entityId: "light.office", tokenRef: "ha" } }))).toContain("Use a binary_sensor.* or input_boolean.* entity identifier.");
  });

  it("applies a Home Assistant value only when the boolean is on and its token came from the vault", async () => {
    const current = rule({ source: { kind: "home-assistant", baseUrl: "https://ha.example", entityId: "input_boolean.night", tokenRef: "ha:night" } });
    const result = await resolveExternalScheduleValue({
      rule: current,
      vault: { read: async (ref) => ref === "ha:night" ? "vault-value" : null },
      reader: { readHttps: async () => "", readHomeAssistant: async (_url, _entity, token) => token === "vault-value" ? "on" : "off" },
    });
    expect(result).toEqual({ active: true, values: { theme: "dark" } });
  });

  it("returns a bounded refusal instead of throwing for a malformed external document origin", async () => {
    const current = rule({ source: { kind: "https-api", url: "https://settings.example/state", allowedOrigins: ["https://settings.example"] } });
    const result = await resolveExternalScheduleValue({
      rule: current,
      vault: { read: async () => null },
      reader: { readHttps: async () => JSON.stringify({ version: 1, origin: "not a url", values: { theme: "dark" } }), readHomeAssistant: async () => "off" },
    });
    expect(result.active).toBe(false);
    expect(result.reason).toContain("valid HTTPS origin");
  });
});

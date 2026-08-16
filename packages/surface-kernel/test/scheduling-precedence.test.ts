import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSchedule,
  resolvePrecedence,
  ruleIsActive,
  validateExternalSettings,
  type ScheduleRule,
} from "../src/scheduling.ts";

// Synthetic presentation rules only; nothing here reads or writes anything.
function rule(overrides: Partial<ScheduleRule> = {}): ScheduleRule {
  return {
    id: "evening-theme",
    enabled: true,
    weekdays: [],
    startTime: "18:00",
    endTime: "23:00",
    target: "theme",
    value: "dark",
    ...overrides,
  };
}

test("a rule is active inside its window and inactive outside it", () => {
  assert.equal(ruleIsActive(rule(), 1, 19 * 60), true);
  assert.equal(ruleIsActive(rule(), 1, 9 * 60), false);
});

test("a window that crosses midnight stays active overnight", () => {
  const overnight = rule({ startTime: "22:00", endTime: "06:00" });
  assert.equal(ruleIsActive(overnight, 1, 23 * 60), true);
  assert.equal(ruleIsActive(overnight, 1, 2 * 60), true);
  assert.equal(ruleIsActive(overnight, 1, 12 * 60), false);
});

test("a disabled rule never applies", () => {
  assert.equal(ruleIsActive(rule({ enabled: false }), 1, 19 * 60), false);
});

test("weekday restrictions are respected", () => {
  const weekdaysOnly = rule({ weekdays: [1, 2, 3, 4, 5] });
  assert.equal(ruleIsActive(weekdaysOnly, 1, 19 * 60), true);
  assert.equal(ruleIsActive(weekdaysOnly, 0, 19 * 60), false);
});

test("an overlay is produced for the evaluated instant", () => {
  const overlay = evaluateSchedule([rule()], "2026-06-15T20:30:00.000Z", "UTC");
  assert.deepEqual(overlay.activeRuleIds, ["evening-theme"]);
  assert.equal(overlay.values.theme, "dark");
});

test("the evaluated time zone decides whether a rule is active", () => {
  const atNight = evaluateSchedule([rule()], "2026-06-15T20:30:00.000Z", "UTC");
  const sameInstantElsewhere = evaluateSchedule([rule()], "2026-06-15T20:30:00.000Z", "Asia/Tokyo");
  assert.equal(atNight.activeRuleIds.length, 1);
  assert.equal(sameInstantElsewhere.activeRuleIds.length, 0);
});

test("a manual override wins over an active rule, which wins over the default", () => {
  const overlay = evaluateSchedule([rule()], "2026-06-15T20:30:00.000Z", "UTC");
  const resolved = resolvePrecedence({ theme: "system", density: "comfortable" }, overlay, { theme: "light" });
  assert.equal(resolved.values.theme, "light");
  assert.equal(resolved.sources.theme, "manual");
  assert.equal(resolved.values.density, "comfortable");
  assert.equal(resolved.sources.density, "default");
});

test("an active rule wins when no manual override is set", () => {
  const overlay = evaluateSchedule([rule()], "2026-06-15T20:30:00.000Z", "UTC");
  const resolved = resolvePrecedence({ theme: "system" }, overlay, {});
  assert.equal(resolved.values.theme, "dark");
  assert.equal(resolved.sources.theme, "rule");
});

test("the stored baseline is never modified by resolution", () => {
  const baseline = { theme: "system" };
  const overlay = evaluateSchedule([rule()], "2026-06-15T20:30:00.000Z", "UTC");
  resolvePrecedence(baseline, overlay, { theme: "light" });
  assert.deepEqual(baseline, { theme: "system" });
});

test("an external settings document must declare an allowlisted https origin", () => {
  const document = JSON.stringify({
    version: 1,
    origin: "https://settings.example.org",
    values: { theme: "dark" },
  });
  const accepted = validateExternalSettings(document, ["https://settings.example.org/presentation.json"]);
  assert.equal(accepted.ok, true);

  const rejected = validateExternalSettings(document, ["https://other.example.org"]);
  assert.equal(rejected.ok, false);
});

test("a non-primitive external value is rejected", () => {
  const document = JSON.stringify({
    version: 1,
    origin: "https://settings.example.org",
    values: { theme: { nested: true } },
  });
  assert.equal(validateExternalSettings(document, ["https://settings.example.org"]).ok, false);
});

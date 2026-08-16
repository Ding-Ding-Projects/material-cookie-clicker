/**
 * Time-of-day presentation schedules and optional external presentation
 * settings.
 *
 * A rule never overwrites the stored baseline. It produces an overlay, and
 * precedence is fixed and documented: a manual override wins over an active
 * rule, and an active rule wins over the stored default.
 *
 * Nothing here performs a network request. A consumer that chooses to read an
 * external settings document supplies its own `SettingsSource`, and the
 * document is validated against an explicit https origin allowlist first.
 */

import type { AbortSignalLike } from "./ports.ts";

export type ScheduleRule = {
  id: string;
  enabled: boolean;
  /** 0 is Sunday through 6 is Saturday, matching `Date.getDay`. */
  weekdays: number[];
  /** Local `HH:MM` in the evaluated time zone. */
  startTime: string;
  endTime: string;
  target: string;
  value: unknown;
};

export interface SettingsSource {
  fetch(url: string, signal: AbortSignalLike): Promise<string>;
}

export type AppliedOverlay = {
  values: Record<string, unknown>;
  activeRuleIds: string[];
};

export type PrecedenceResult = {
  values: Record<string, unknown>;
  sources: Record<string, "manual" | "rule" | "default">;
};

export type ExternalSettingsVerdict =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; reason: string };

export const MAX_EXTERNAL_SETTINGS_BYTES = 32768;
export const MAX_EXTERNAL_SETTINGS_ENTRIES = 60;
export const EXTERNAL_SETTINGS_SCHEMA_VERSION = 1;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(time: string): number | null {
  const match = TIME_PATTERN.exec(time);
  if (!match) return null;
  return Number.parseInt(match[1] ?? "0", 10) * 60 + Number.parseInt(match[2] ?? "0", 10);
}

/** Reads the weekday and minute-of-day of an instant in a named time zone. */
export function localParts(nowIso: string, timeZone: string): { weekday: number; minutes: number } {
  const instant = new Date(nowIso);
  if (Number.isNaN(instant.getTime())) throw new Error("The supplied instant is not a valid date and time.");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(instant);
  const lookup = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const weekday = weekdays.indexOf(lookup("weekday").slice(0, 3).toLowerCase());
  const hour = Number.parseInt(lookup("hour"), 10);
  const minute = Number.parseInt(lookup("minute"), 10);
  return {
    weekday: weekday === -1 ? instant.getUTCDay() : weekday,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

/** Whether a rule's window contains the given minute of the day. */
export function ruleIsActive(rule: ScheduleRule, weekday: number, minutes: number): boolean {
  if (!rule.enabled) return false;
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(weekday)) return false;
  const start = minutesOf(rule.startTime);
  const end = minutesOf(rule.endTime);
  if (start === null || end === null) return false;
  if (start === end) return false;
  if (start < end) return minutes >= start && minutes < end;
  // A window that crosses midnight stays active until the end time next day.
  return minutes >= start || minutes < end;
}

/**
 * Produces the overlay the active rules ask for. Later rules in the list win
 * for the same target, so a consumer can express priority by ordering.
 */
export function evaluateSchedule(
  rules: readonly ScheduleRule[],
  nowIso: string,
  timeZone: string,
): AppliedOverlay {
  const { weekday, minutes } = localParts(nowIso, timeZone);
  const values: Record<string, unknown> = {};
  const activeRuleIds: string[] = [];
  for (const rule of rules) {
    if (!ruleIsActive(rule, weekday, minutes)) continue;
    activeRuleIds.push(rule.id);
    values[rule.target] = rule.value;
  }
  return { values, activeRuleIds };
}

/**
 * Documented precedence: manual override, then active rule, then the stored
 * default. The baseline is returned untouched for every key nothing overrides.
 */
export function resolvePrecedence(
  baseline: Record<string, unknown>,
  overlay: AppliedOverlay,
  manualOverride: Record<string, unknown>,
): PrecedenceResult {
  const values: Record<string, unknown> = { ...baseline };
  const sources: Record<string, "manual" | "rule" | "default"> = {};
  for (const key of Object.keys(baseline)) sources[key] = "default";
  for (const [key, value] of Object.entries(overlay.values)) {
    values[key] = value;
    sources[key] = "rule";
  }
  for (const [key, value] of Object.entries(manualOverride)) {
    values[key] = value;
    sources[key] = "manual";
  }
  return { values, sources };
}

function originOf(url: string): string | null {
  const match = /^(https:\/\/[^/?#]+)/i.exec(url.trim());
  return match ? (match[1] ?? "").toLowerCase() : null;
}

/**
 * Validates an external presentation-settings document. The document must
 * declare the https origin it was served from, that origin must be on the
 * caller's allowlist, and every value must be a bounded primitive.
 */
export function validateExternalSettings(raw: string, allowedOrigins: readonly string[]): ExternalSettingsVerdict {
  if (raw.length > MAX_EXTERNAL_SETTINGS_BYTES) {
    return { ok: false, reason: `The document exceeds ${MAX_EXTERNAL_SETTINGS_BYTES} bytes.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: "The document is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "The root must be an object." };
  }
  const record = parsed as Record<string, unknown>;
  const allowedRoot = new Set(["version", "origin", "values"]);
  if (
    Object.keys(record).some((key) => !allowedRoot.has(key)) ||
    record.version !== EXTERNAL_SETTINGS_SCHEMA_VERSION ||
    typeof record.origin !== "string" ||
    !record.values ||
    typeof record.values !== "object" ||
    Array.isArray(record.values)
  ) {
    return { ok: false, reason: "Use version 1 with an origin string and one values object." };
  }
  const declared = originOf(record.origin);
  const permitted = allowedOrigins.map((origin) => originOf(origin)).filter((origin): origin is string => origin !== null);
  if (!declared || !permitted.includes(declared)) {
    return { ok: false, reason: "The document origin is not an allowlisted https origin." };
  }
  const entries = Object.entries(record.values as Record<string, unknown>);
  if (entries.length > MAX_EXTERNAL_SETTINGS_ENTRIES) {
    return { ok: false, reason: `At most ${MAX_EXTERNAL_SETTINGS_ENTRIES} values are allowed.` };
  }
  const values: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (key.length < 1 || key.length > 80 || key === "__proto__") {
      return { ok: false, reason: "Every value key must be a safe 1-80 character string." };
    }
    const kind = typeof value;
    if (kind !== "string" && kind !== "number" && kind !== "boolean") {
      return { ok: false, reason: "Values must be strings, numbers or booleans." };
    }
    if (kind === "string" && (value as string).length > 200) {
      return { ok: false, reason: "String values are limited to 200 characters." };
    }
    values[key] = value;
  }
  return { ok: true, values };
}

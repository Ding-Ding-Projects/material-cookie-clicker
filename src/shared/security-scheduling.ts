export type ScheduleRule = {
  readonly id: string;
  readonly enabled: boolean;
  readonly weekdays: readonly number[];
  readonly startTime: string;
  readonly endTime: string;
  readonly target: string;
  readonly value: unknown;
};
export type AppliedOverlay = { readonly values: Record<string, unknown>; readonly activeRuleIds: string[] };

export type ScheduleSource =
  | { readonly kind: "local" }
  | { readonly kind: "https-api"; readonly url: string; readonly allowedOrigins: readonly string[] }
  | { readonly kind: "home-assistant"; readonly baseUrl: string; readonly entityId: string; readonly tokenRef: string };

export type ExtendedScheduleRule = ScheduleRule & {
  readonly label: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly source: ScheduleSource;
};

export interface ScheduleTokenVault {
  read(ref: string): Promise<string | null>;
}

export interface ExternalScheduleReader {
  readHttps(url: string, allowedOrigins: readonly string[]): Promise<string>;
  readHomeAssistant(baseUrl: string, entityId: string, token: string): Promise<"on" | "off">;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ENTITY = /^(?:binary_sensor|input_boolean)\.[a-z0-9_]+$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_EXTERNAL_BYTES = 32_768;

function minutes(time: string): number | null {
  const match = TIME.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function activeAt(rule: ScheduleRule, weekday: number, minute: number): boolean {
  if (!rule.enabled || (rule.weekdays.length > 0 && !rule.weekdays.includes(weekday))) return false;
  const start = minutes(rule.startTime);
  const end = minutes(rule.endTime);
  if (start === null || end === null || start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function localParts(nowIso: string, timeZone: string): { weekday: number; minute: number } {
  const date = new Date(nowIso);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = formatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(value("weekday").slice(0, 3).toLowerCase());
  return { weekday: weekday < 0 ? date.getUTCDay() : weekday, minute: Number(value("hour")) * 60 + Number(value("minute")) };
}

function validateExternalSettings(raw: string, allowedOrigins: readonly string[]): { ok: true; values: Record<string, unknown> } | { ok: false; reason: string } {
  if (raw.length > MAX_EXTERNAL_BYTES) return { ok: false, reason: `The document exceeds ${MAX_EXTERNAL_BYTES} bytes.` };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, reason: "The document is not valid JSON." }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "The root must be an object." };
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["version", "origin", "values"].includes(key)) || record.version !== 1 || typeof record.origin !== "string" || !record.values || typeof record.values !== "object" || Array.isArray(record.values)) return { ok: false, reason: "Use version 1 with an origin string and values object, and no unexpected fields." };
  let declared = "";
  const allowed: string[] = [];
  try {
    const declaredUrl = new URL(record.origin);
    if (declaredUrl.protocol !== "https:" || declaredUrl.username || declaredUrl.password) return { ok: false, reason: "The document origin must be credential-free HTTPS." };
    declared = declaredUrl.origin.toLowerCase();
    for (const origin of allowedOrigins) {
      const allowedUrl = new URL(origin);
      if (allowedUrl.protocol === "https:" && !allowedUrl.username && !allowedUrl.password) allowed.push(allowedUrl.origin.toLowerCase());
    }
  } catch {
    return { ok: false, reason: "The document origin is not a valid HTTPS origin." };
  }
  if (!allowed.includes(declared)) return { ok: false, reason: "The document origin is not allowlisted." };
  const entries = Object.entries(record.values as Record<string, unknown>);
  if (entries.length > 60 || entries.some(([key, value]) => ["__proto__", "prototype", "constructor"].includes(key) || key.length < 1 || key.length > 80 || !["string", "number", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value)) || (typeof value === "string" && value.length > 200))) return { ok: false, reason: "The values object is outside the bounded schema." };
  return { ok: true, values: Object.fromEntries(entries) };
}

export function validateScheduleSource(source: ScheduleSource): string | null {
  if (source.kind === "local") return null;
  const value = source.kind === "https-api" ? source.url : source.baseUrl;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a valid URL.";
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.username || url.password) return "Credentials are not allowed inside the URL.";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    return "Use HTTPS, except for an explicitly loopback development URL.";
  }
  if (source.kind === "home-assistant" && !ENTITY.test(source.entityId)) {
    return "Use a binary_sensor.* or input_boolean.* entity identifier.";
  }
  return null;
}

export function validateExtendedRule(rule: ExtendedScheduleRule): string[] {
  const errors: string[] = [];
  if (!rule.label.trim()) errors.push("A rule label is required.");
  if (rule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    errors.push("Weekdays must be integers from 0 through 6.");
  }
  if (rule.startDate && !DATE.test(rule.startDate)) errors.push("The start date must use YYYY-MM-DD.");
  if (rule.endDate && !DATE.test(rule.endDate)) errors.push("The end date must use YYYY-MM-DD.");
  if (rule.startDate && rule.endDate && rule.startDate > rule.endDate) errors.push("The start date must not follow the end date.");
  const sourceError = validateScheduleSource(rule.source);
  if (sourceError) errors.push(sourceError);
  return errors;
}

function dateAllows(rule: ExtendedScheduleRule, nowIso: string): boolean {
  const date = nowIso.slice(0, 10);
  return (!rule.startDate || date >= rule.startDate) && (!rule.endDate || date <= rule.endDate);
}

export function evaluateExtendedSchedule(
  rules: readonly ExtendedScheduleRule[],
  nowIso: string,
  timeZone: string,
): AppliedOverlay {
  const { weekday, minute } = localParts(nowIso, timeZone);
  const values: Record<string, unknown> = {};
  const activeRuleIds: string[] = [];
  for (const rule of rules) {
    if (validateExtendedRule(rule).length > 0 || !dateAllows(rule, nowIso) || !activeAt(rule, weekday, minute)) continue;
    activeRuleIds.push(rule.id);
    values[rule.target] = rule.value;
  }
  return { values, activeRuleIds };
}

export async function resolveExternalScheduleValue(input: {
  rule: ExtendedScheduleRule;
  reader: ExternalScheduleReader;
  vault: ScheduleTokenVault;
}): Promise<{ active: boolean; values?: Record<string, unknown>; reason?: string }> {
  const sourceError = validateScheduleSource(input.rule.source);
  if (sourceError) return { active: false, reason: sourceError };
  if (input.rule.source.kind === "local") return { active: true, values: { [input.rule.target]: input.rule.value } };
  if (input.rule.source.kind === "https-api") {
    const raw = await input.reader.readHttps(input.rule.source.url, input.rule.source.allowedOrigins);
    const verdict = validateExternalSettings(raw, input.rule.source.allowedOrigins);
    return verdict.ok ? { active: true, values: verdict.values } : { active: false, reason: verdict.reason };
  }
  const token = await input.vault.read(input.rule.source.tokenRef);
  if (!token) return { active: false, reason: "The Home Assistant token is unavailable in the credential vault." };
  const state = await input.reader.readHomeAssistant(input.rule.source.baseUrl, input.rule.source.entityId, token);
  return state === "on" ? { active: true, values: { [input.rule.target]: input.rule.value } } : { active: false };
}

export function resolvePrecedence(
  baseline: Record<string, unknown>,
  overlay: AppliedOverlay,
  manual: Record<string, unknown>,
): { values: Record<string, unknown>; sources: Record<string, "default" | "rule" | "manual"> } {
  const values = { ...baseline, ...overlay.values, ...manual };
  const sources: Record<string, "default" | "rule" | "manual"> = {};
  for (const key of Object.keys(baseline)) sources[key] = "default";
  for (const key of Object.keys(overlay.values)) sources[key] = "rule";
  for (const key of Object.keys(manual)) sources[key] = "manual";
  return { values, sources };
}

/**
 * Append-only local history, generalized.
 *
 * The desktop application already keeps an append-only encrypted history in
 * its main process, where the documentation site cannot reuse any of it. The
 * model itself is pure, so it lives here: the action allowlist, the redaction
 * pass, the filter, and the rule that restoring a revision appends a new
 * record and never rewrites an existing one. Storage stays in the surface,
 * behind the `HistoryStore` port.
 */

import { requireWebCrypto, type Clock, type IdFactory } from "./ports.ts";
import { matchesSearch, type SearchState } from "./regex-builder.ts";

/**
 * The desktop allowlist, widened with the actions both surfaces now record.
 */
export const HISTORY_ACTIONS = [
  "create",
  "answer",
  "attachment-add",
  "attachment-remove",
  "review",
  "restore",
  "undo",
  "import-copy",
  "reconcile",
  "replace",
  "preference-change",
  "appearance-change",
  "appearance-reset",
  "vocabulary-import",
  "vocabulary-clear",
  "lock-create",
  "lock-release",
  "schedule-change",
  "identity-change",
  "export",
  "conversion",
  "ticket-create",
  "ticket-advance",
] as const;

export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

export type DiffEntry = {
  path: string;
  before: string | null;
  after: string | null;
};

export type HistoryRecord = {
  id: string;
  revisionId: string;
  action: HistoryAction;
  at: string;
  actorSurface: "site" | "desktop";
  summary: string;
  redactedDiff: DiffEntry[];
};

export interface HistoryStore {
  append(record: HistoryRecord): Promise<void>;
  read(id: string): Promise<HistoryRecord | null>;
  readBatch(filter: HistoryFilter, afterId: string | null, limit: number): Promise<HistoryRecord[]>;
}

export type HistoryFilter = {
  from?: string;
  to?: string;
  actions?: readonly HistoryAction[];
};

export type RedactionRules = {
  /** Exact values from the personal vocabulary map. */
  vocabularyValues: readonly string[];
  /** Exact answers a person supplied to an identity or unlock question. */
  identityAnswers: readonly string[];
  /** Replace anything shaped like an absolute filesystem path. */
  redactAbsolutePaths: boolean;
  marker: string;
};

/** Most records a surface keeps in memory for the history browser. */
export const DEFAULT_HISTORY_CAP = 500;

export const DEFAULT_REDACTION_RULES: RedactionRules = {
  vocabularyValues: [],
  identityAnswers: [],
  redactAbsolutePaths: true,
  marker: "[redacted]",
};

const POSIX_PATH = /(^|\s)\/(?:[^\s/]+\/)+[^\s/]*/g;
const WINDOWS_PATH = /(^|\s)[A-Za-z]:\\(?:[^\s\\]+\\)*[^\s\\]*/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactText(value: string, rules: RedactionRules): string {
  let output = value;
  const secrets = [...rules.vocabularyValues, ...rules.identityAnswers]
    .filter((secret) => secret.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const secret of secrets) {
    output = output.replace(new RegExp(escapeRegExp(secret), "g"), rules.marker);
  }
  if (rules.redactAbsolutePaths) {
    output = output.replace(POSIX_PATH, (_match, lead: string) => `${lead}${rules.marker}`);
    output = output.replace(WINDOWS_PATH, (_match, lead: string) => `${lead}${rules.marker}`);
  }
  return output;
}

/** Returns a redacted copy of a record. The input record is never mutated. */
export function redactRecord(record: HistoryRecord, rules: RedactionRules = DEFAULT_REDACTION_RULES): HistoryRecord {
  return {
    ...record,
    summary: redactText(record.summary, rules),
    redactedDiff: record.redactedDiff.map((entry) => ({
      path: redactText(entry.path, rules),
      before: entry.before === null ? null : redactText(entry.before, rules),
      after: entry.after === null ? null : redactText(entry.after, rules),
    })),
  };
}

/** Filters by date range, action set and the shared search engine. */
export function filterHistory(records: HistoryRecord[], filter: HistoryFilter, state: SearchState): HistoryRecord[] {
  const actions = filter.actions && filter.actions.length > 0 ? new Set<string>(filter.actions) : null;
  return records.filter((record) => {
    if (actions && !actions.has(record.action)) return false;
    if (filter.from && record.at < filter.from) return false;
    if (filter.to && record.at > filter.to) return false;
    return matchesSearch(`${record.summary} ${record.action} ${record.actorSurface}`, state);
  });
}

/**
 * Produces the NEW record that restoring a revision appends. The source record
 * and the supplied list are left exactly as they were; nothing is rewritten,
 * amended or removed.
 */
export function restoreAsNewRevision(
  records: readonly HistoryRecord[],
  revisionId: string,
  options?: { clock?: Clock; ids?: IdFactory; action?: "restore" | "undo" },
): HistoryRecord {
  const source = records.find((record) => record.revisionId === revisionId);
  if (!source) throw new Error("The selected revision is not present in the supplied history.");
  const action = options?.action ?? "restore";
  const at = options?.clock ? options.clock.isoNow() : new Date().toISOString();
  const id = options?.ids ? options.ids.next() : requireWebCrypto().randomUUID();
  const newRevisionId = options?.ids ? options.ids.next() : requireWebCrypto().randomUUID();
  return {
    id,
    revisionId: newRevisionId,
    action,
    at,
    actorSurface: source.actorSurface,
    summary:
      action === "undo"
        ? `Undid to revision ${source.revisionId}`
        : `Restored revision ${source.revisionId}`,
    redactedDiff: source.redactedDiff.map((entry) => ({ ...entry })),
  };
}

/** Keeps the newest records within the cap without reordering the survivors. */
export function capHistory(records: HistoryRecord[], cap: number = DEFAULT_HISTORY_CAP): HistoryRecord[] {
  if (records.length <= cap) return records;
  return [...records]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, cap);
}

export type HistoryAction = "create" | "restore" | "undo" | "identity-change" | "preference-change" | "appearance-change" | "lock-create" | "lock-release" | "schedule-change" | "export" | "ticket-create" | "ticket-advance";
export type DiffEntry = { path: string; before: string | null; after: string | null };
export type HistoryRecord = { id: string; revisionId: string; action: HistoryAction; at: string; actorSurface: "desktop"; summary: string; redactedDiff: DiffEntry[] };
export type HistoryFilter = { from?: string; to?: string; actions?: readonly HistoryAction[] };
export type SearchState = { query: string; regex: boolean; pattern: string; flags: string };
export type RedactionRules = { vocabularyValues: readonly string[]; identityAnswers: readonly string[]; redactAbsolutePaths: boolean; marker: string };
export interface Clock { now(): number; isoNow(): string }
export interface IdFactory { next(): string }

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function redact(value: string, rules: RedactionRules): string {
  let output = value;
  for (const secret of [...rules.vocabularyValues, ...rules.identityAnswers].filter(Boolean).sort((a, b) => b.length - a.length)) output = output.replace(new RegExp(escapeRegex(secret), "g"), rules.marker);
  if (rules.redactAbsolutePaths) output = output.replace(/(^|\s)(?:[A-Za-z]:\\(?:[^\s\\]+\\)*[^\s\\]*|\/(?:[^\s/]+\/)+[^\s/]*)/g, `$1${rules.marker}`);
  return output;
}
function redactRecord(record: HistoryRecord, rules: RedactionRules): HistoryRecord {
  return { ...record, summary: redact(record.summary, rules), redactedDiff: record.redactedDiff.map((item) => ({ path: redact(item.path, rules), before: item.before === null ? null : redact(item.before, rules), after: item.after === null ? null : redact(item.after, rules) })) };
}
function matches(value: string, search: SearchState): boolean {
  if (!search.regex) return value.toLowerCase().includes(search.query.toLowerCase());
  if (!search.pattern || search.pattern.length > 256) return false;
  try { return new RegExp(search.pattern, search.flags.replaceAll("g", "")).test(value); } catch { return false; }
}
function restoreAsNewRevision(records: readonly HistoryRecord[], revisionId: string, clock: Clock, ids: IdFactory): HistoryRecord {
  const source = records.find((record) => record.revisionId === revisionId);
  if (!source) throw new Error("The selected revision is not present in local history.");
  return { id: ids.next(), revisionId: ids.next(), action: "restore", at: clock.isoNow(), actorSurface: "desktop", summary: `Restored revision ${revisionId}`, redactedDiff: source.redactedDiff.map((entry) => ({ ...entry })) };
}

export interface LocalGitHistoryAdapter {
  initialize(): Promise<void>;
  appendCommit(input: { message: string; record: HistoryRecord; encryptedSnapshot: string }): Promise<string>;
  containsCommit(sha: string): Promise<boolean>;
}

export interface SnapshotCipher {
  encrypt(snapshot: unknown, stableId: string): Promise<string>;
  decrypt(ciphertext: string, stableId: string): Promise<unknown>;
}

export interface HistoryAccessVerifier {
  verify(answer: string): Promise<boolean>;
}

export class AppendOnlyHistoryManager {
  readonly #records: HistoryRecord[] = [];

  constructor(
    private readonly git: LocalGitHistoryAdapter,
    private readonly cipher: SnapshotCipher,
    private readonly access: HistoryAccessVerifier,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
    private readonly redaction: RedactionRules,
  ) {}

  async append(input: {
    action: HistoryAction;
    summary: string;
    stableId: string;
    snapshot: unknown;
    diff?: HistoryRecord["redactedDiff"];
  }): Promise<{ record: HistoryRecord; commit: string }> {
    await this.git.initialize();
    const record = redactRecord({
      id: this.ids.next(),
      revisionId: this.ids.next(),
      action: input.action,
      at: this.clock.isoNow(),
      actorSurface: "desktop",
      summary: input.summary,
      redactedDiff: input.diff ? [...input.diff] : [],
    }, this.redaction);
    const encryptedSnapshot = await this.cipher.encrypt(input.snapshot, input.stableId);
    const commit = await this.git.appendCommit({ message: record.summary, record, encryptedSnapshot });
    if (!(await this.git.containsCommit(commit))) throw new Error("The local history commit could not be independently verified.");
    this.#records.push(record);
    return { record, commit };
  }

  async restore(revisionId: string, answer: string): Promise<HistoryRecord> {
    if (!(await this.access.verify(answer))) throw new Error("History access was not verified.");
    const record = restoreAsNewRevision(this.#records, revisionId, this.clock, this.ids);
    this.#records.push(record);
    return record;
  }

  list(filter: HistoryFilter, search: SearchState, cap?: number): HistoryRecord[] {
    const actions = filter.actions?.length ? new Set(filter.actions) : null;
    const filtered = this.#records.filter((record) => (!filter.from || record.at >= filter.from) && (!filter.to || record.at <= filter.to) && (!actions || actions.has(record.action)) && matches(`${record.summary} ${record.action}`, search));
    const limit = cap ?? 500;
    return filtered.length <= limit ? [...filtered] : [...filtered].sort((left, right) => right.at.localeCompare(left.at)).slice(0, limit);
  }
}

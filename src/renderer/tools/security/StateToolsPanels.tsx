import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import { CODING_EXPORT_FORMATS, validateArchiveOptions, type ArchiveOptions } from "../../../shared/security-exports.js";
import type { HistoryAction, HistoryRecord } from "../../../shared/security-history.js";
import { TOY_LOCK_DISCLOSURE, type ToyLockDuration, type ToyLockMethod } from "../../../shared/security-locks.js";
import { validateExtendedRule, type ExtendedScheduleRule, type ScheduleSource } from "../../../shared/security-scheduling.js";
import { exportChangelogMarkdown, filterVerifiedChangelog, type ChangelogEntry, type OfflineDocsBundle } from "../../../shared/security-content.js";
import { createSecuritySearchState, securitySearchMatches, type SecuritySearchState } from "../../../shared/security-search.js";
import { advanceLocalTicket, createLocalTicket, filterLocalTickets, type SupportTicket, type TicketSeverity } from "../../../shared/security-support-tickets.js";
import { TotpAuthenticatorPanel } from "./TotpAuthenticatorPanel.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function LocalSearch(props: { id: string; label: string; state: SecuritySearchState; onChange(state: SecuritySearchState): void }): ReactNode {
  const update = (patch: Partial<SecuritySearchState>) => props.onChange({ ...props.state, ...patch });
  return (
    <fieldset className="security-tools__search">
      <legend>{props.label}</legend>
      <label htmlFor={`${props.id}-query`}>Plain-text search · 文字搜尋</label>
      <input
        id={`${props.id}-query`}
        value={props.state.query}
        onChange={(event) => update({ query: event.currentTarget.value, regex: false })}
      />
      <details>
        <summary>Regular-expression builder · 正則式工具</summary>
        <label htmlFor={`${props.id}-pattern`}>Pattern · 表達式</label>
        <input
          id={`${props.id}-pattern`}
          value={props.state.pattern}
          onChange={(event) => update({ pattern: event.currentTarget.value, regex: true })}
        />
        <label htmlFor={`${props.id}-flags`}>Flags · 選項</label>
        <input
          id={`${props.id}-flags`}
          value={props.state.flags}
          onChange={(event) => update({ flags: event.currentTarget.value, regex: true })}
        />
        <p>JavaScript regular expressions; plain text remains the default.</p>
      </details>
    </fieldset>
  );
}

export function ToyLockWizard(props: {
  targetId: string;
  targetLabel: string;
  localDataPath: string;
  onCreate(input: { method: ToyLockMethod; credential: string; duration: ToyLockDuration }): Promise<void> | void;
  onCancel(): void;
}): ReactNode {
  const [method, setMethod] = useState<ToyLockMethod>("password");
  const [credential, setCredential] = useState("");
  const [durationKind, setDurationKind] = useState<ToyLockDuration["kind"]>("surface");
  const [minutes, setMinutes] = useState(5);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const duration: ToyLockDuration = durationKind === "minutes" ? { kind: "minutes", minutes } : { kind: durationKind };
      await props.onCreate({ method, credential, duration });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The lock could not be created.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="security-tools__card" aria-labelledby={`${props.targetId}-lock-title`} onSubmit={submit}>
      <h3 id={`${props.targetId}-lock-title`}>Lock {props.targetLabel} · 鎖住呢個項目</h3>
      <p>{TOY_LOCK_DISCLOSURE}</p>
      <p>Recovery folder · 重設資料夾: <code>{props.localDataPath}</code></p>
      <fieldset>
        <legend>Credential for this lock · 呢個鎖嘅獨立憑證</legend>
        <label><input type="radio" checked={method === "password"} onChange={() => setMethod("password")} /> Password</label>
        <label><input type="radio" checked={method === "totp"} onChange={() => setMethod("totp")} /> Authenticator code</label>
      </fieldset>
      <label htmlFor={`${props.targetId}-credential`}>{method === "password" ? "Password" : "Base32 setup secret"}</label>
      <input
        id={`${props.targetId}-credential`}
        type="password"
        autoComplete="new-password"
        value={credential}
        onChange={(event) => setCredential(event.currentTarget.value)}
        required
      />
      <label htmlFor={`${props.targetId}-duration`}>Unlock duration · 解鎖時間</label>
      <select id={`${props.targetId}-duration`} value={durationKind} onChange={(event) => setDurationKind(event.currentTarget.value as ToyLockDuration["kind"])}>
        <option value="surface">This surface only</option>
        <option value="minutes">A number of minutes</option>
        <option value="until-close">Until the app closes</option>
      </select>
      {durationKind === "minutes" && (
        <label>Minutes <input type="number" min={1} max={1440} value={minutes} onChange={(event) => setMinutes(event.currentTarget.valueAsNumber)} /></label>
      )}
      {error && <p role="alert">{error}</p>}
      <div>
        <button type="submit" disabled={pending}>{pending ? "Creating…" : "Create this lock"}</button>
        <button type="button" onClick={props.onCancel}>Emergency exit · 取消</button>
      </div>
    </form>
  );
}

export function SupportTicketsPanel(props: { localDataPath: string; onOpenFolder(path: string): void }): ReactNode {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<TicketSeverity>("low");
  const [search, setSearch] = useState(() => createSecuritySearchState());
  const visible = useMemo(() => filterLocalTickets(tickets, search), [tickets, search]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = `LOCAL-${String(tickets.length + 1).padStart(5, "0")}`;
    const now = new Date().toISOString();
    const ticket = createLocalTicket({ id, title, body, severity, at: now });
    setTickets((current) => [...current, ticket]);
    setTitle("");
    setBody("");
  };

  return (
    <section aria-labelledby="support-desk-title">
      <h2 id="support-desk-title">Support Tickets · 支援票務部</h2>
      <p><strong>Nothing is sent anywhere. No ticket exists outside this computer, no network request is made, no data is collected, and nobody is reading it.</strong></p>
      <form onSubmit={submit}>
        <label>Category and title · 分類同標題 <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} required maxLength={120} /></label>
        <label>Severity nobody will honour · 嚴重程度
          <select value={severity} onChange={(event) => setSeverity(event.currentTarget.value as TicketSeverity)}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </label>
        <label>Description · 詳情 <textarea value={body} onChange={(event) => setBody(event.currentTarget.value)} maxLength={4000} required /></label>
        <button type="submit">Create local ticket · 開本機票</button>
      </form>
      <LocalSearch id="tickets" label="Search tickets · 搜尋票務" state={search} onChange={setSearch} />
      <ul aria-label="Local support tickets">
        {visible.map((ticket) => (
          <li key={ticket.id}>
            <strong>{ticket.id}: {ticket.title}</strong> — {ticket.state}
            <button type="button" onClick={() => setTickets((current) => current.map((item) => item.id === ticket.id ? advanceLocalTicket(item, item.state === "open" ? "in-progress" : "resolved", new Date().toISOString()) : item))}>Advance status</button>
          </li>
        ))}
      </ul>
      <p>Resolution: open <code>{props.localDataPath}</code> and remove the application data yourself.</p>
      <button type="button" onClick={() => props.onOpenFolder(props.localDataPath)}>Open application-data folder · 打開資料夾</button>
    </section>
  );
}

function defaultRule(): ExtendedScheduleRule {
  return {
    id: "new-rule",
    label: "",
    enabled: true,
    weekdays: [],
    startTime: "09:00",
    endTime: "17:00",
    target: "theme",
    value: "dark",
    source: { kind: "local" },
  };
}

export function ScheduleEditorPanel(props: { timeZone: string; onSave(rule: ExtendedScheduleRule): void }): ReactNode {
  const [rule, setRule] = useState(defaultRule);
  const errors = validateExtendedRule(rule);
  const setSourceKind = (kind: ScheduleSource["kind"]) => {
    const source: ScheduleSource = kind === "local"
      ? { kind }
      : kind === "https-api"
        ? { kind, url: "https://", allowedOrigins: [] }
        : { kind, baseUrl: "https://", entityId: "input_boolean.", tokenRef: "home-assistant:settings" };
    setRule((current) => ({ ...current, source }));
  };
  return (
    <section aria-labelledby="schedule-title">
      <h2 id="schedule-title">Scheduled settings · 排程設定</h2>
      <p>Times use {props.timeZone}; daylight-saving changes follow that time zone. Later matching rules win.</p>
      <label>Rule label <input value={rule.label} onChange={(event) => setRule({ ...rule, label: event.currentTarget.value })} /></label>
      <label>Start date <input type="date" value={rule.startDate ?? ""} onChange={(event) => setRule({ ...rule, startDate: event.currentTarget.value || undefined })} /></label>
      <label>End date <input type="date" value={rule.endDate ?? ""} onChange={(event) => setRule({ ...rule, endDate: event.currentTarget.value || undefined })} /></label>
      <label>Start time <input type="time" value={rule.startTime} onChange={(event) => setRule({ ...rule, startTime: event.currentTarget.value })} /></label>
      <label>End time <input type="time" value={rule.endTime} onChange={(event) => setRule({ ...rule, endTime: event.currentTarget.value })} /></label>
      <fieldset>
        <legend>Weekdays; none selected means every day</legend>
        {WEEKDAYS.map((label, day) => <label key={label}><input type="checkbox" checked={rule.weekdays.includes(day)} onChange={(event) => setRule({ ...rule, weekdays: event.currentTarget.checked ? [...rule.weekdays, day] : rule.weekdays.filter((item) => item !== day) })} />{label}</label>)}
      </fieldset>
      <label>Source
        <select value={rule.source.kind} onChange={(event) => setSourceKind(event.currentTarget.value as ScheduleSource["kind"])}>
          <option value="local">Local value</option><option value="https-api">Validated HTTPS API</option><option value="home-assistant">Home Assistant boolean</option>
        </select>
      </label>
      {rule.source.kind === "https-api" && <label>API URL <input type="url" value={rule.source.url} onChange={(event) => {
        const source = rule.source;
        if (source.kind === "https-api") setRule({ ...rule, source: { ...source, url: event.currentTarget.value } });
      }} /></label>}
      {rule.source.kind === "home-assistant" && <>
        <label>Home Assistant base URL <input type="url" value={rule.source.baseUrl} onChange={(event) => {
          const source = rule.source;
          if (source.kind === "home-assistant") setRule({ ...rule, source: { ...source, baseUrl: event.currentTarget.value } });
        }} /></label>
        <label>Boolean entity <input value={rule.source.entityId} onChange={(event) => {
          const source = rule.source;
          if (source.kind === "home-assistant") setRule({ ...rule, source: { ...source, entityId: event.currentTarget.value } });
        }} /></label>
        <p>The access token stays in the operating-system credential vault; this rule stores only its opaque reference.</p>
      </>}
      {errors.length > 0 && <ul role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
      <button type="button" disabled={errors.length > 0} onClick={() => props.onSave(rule)}>Save scheduled rule</button>
    </section>
  );
}

export function HistoryPanel(props: { records: readonly HistoryRecord[]; onRestore(revisionId: string): void }): ReactNode {
  const [search, setSearch] = useState(() => createSecuritySearchState());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actions, setActions] = useState<HistoryAction[]>([]);
  const actionCounts = useMemo(() => new Map(props.records.map((record) => [record.action, props.records.filter((item) => item.action === record.action).length])), [props.records]);
  const visible = props.records.filter((record) => (!from || record.at >= from) && (!to || record.at <= `${to}T23:59:59.999Z`) && (actions.length === 0 || actions.includes(record.action)) && securitySearchMatches(`${record.summary} ${record.action}`, search));
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title">Local version history · 本機版本紀錄</h2>
      <LocalSearch id="history" label="Search history · 搜尋紀錄" state={search} onChange={setSearch} />
      <label>From <input type="date" value={from} onChange={(event) => setFrom(event.currentTarget.value)} /></label>
      <label>To <input type="date" value={to} onChange={(event) => setTo(event.currentTarget.value)} /></label>
      <fieldset><legend>Filter by action</legend>{[...actionCounts].map(([action, count]) => <label key={action}><input type="checkbox" checked={actions.includes(action)} onChange={(event) => setActions((current) => event.currentTarget.checked ? [...current, action] : current.filter((item) => item !== action))} />{action} ({count})</label>)}</fieldset>
      <ol>{visible.map((record) => <li key={record.id}><strong>{record.summary}</strong> <time dateTime={record.at}>{record.at}</time> <button type="button" onClick={() => props.onRestore(record.revisionId)}>Restore as a new revision</button></li>)}</ol>
    </section>
  );
}

export function ExportRegistryPanel(): ReactNode {
  const [query, setQuery] = useState(() => createSecuritySearchState());
  const [archive, setArchive] = useState<ArchiveOptions>({ format: "7z", method: "LZMA2", level: 5, solid: true, encryptContent: false, encryptHeaders: false });
  const errors = validateArchiveOptions(archive);
  return (
    <section aria-labelledby="exports-title">
      <h2 id="exports-title">Export and editor handoff · 匯出同編輯器</h2>
      <LocalSearch id="exports" label="Search export formats" state={query} onChange={setQuery} />
      <ul>{CODING_EXPORT_FORMATS.filter((format) => securitySearchMatches(`${format.label} ${format.extension}`, query)).map((format) => <li key={format.id}><strong>{format.label}</strong> · .{format.extension} · {format.supportsRoundTrip ? "round-trip" : format.limitations.join(" ")}</li>)}</ul>
      <fieldset><legend>Archive options</legend>
        <label>Format <select value={archive.format} onChange={(event) => setArchive({ ...archive, format: event.currentTarget.value as ArchiveOptions["format"] })}><option value="zip">ZIP</option><option value="7z">7z</option></select></label>
        <label>Level <input type="range" min={0} max={9} step={1} value={archive.level} onChange={(event) => setArchive({ ...archive, level: Number(event.currentTarget.value) as ArchiveOptions["level"] })} /></label>
        <label><input type="checkbox" checked={archive.encryptContent} onChange={(event) => setArchive({ ...archive, encryptContent: event.currentTarget.checked })} />AES-256 content encryption</label>
        <label><input type="checkbox" checked={archive.encryptHeaders} onChange={(event) => setArchive({ ...archive, encryptHeaders: event.currentTarget.checked })} />Encrypt filenames and headers</label>
      </fieldset>
      {errors.length > 0 && <ul role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
      <p>Every completed export can open as a Visual Studio Code workspace when that editor is detected.</p>
    </section>
  );
}

export function ChangelogPanel(props: { entries: readonly ChangelogEntry[]; onExport(markdown: string): void }): ReactNode {
  const [search, setSearch] = useState(() => createSecuritySearchState());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const visible = filterVerifiedChangelog(props.entries, { from: from || undefined, to: to || undefined }, search);
  return <section aria-labelledby="changelog-title">
    <h2 id="changelog-title">Changelog · 更新紀錄</h2>
    <LocalSearch id="changelog" label="Search changelog" state={search} onChange={setSearch} />
    <label>From <input type="date" value={from} onChange={(event) => setFrom(event.currentTarget.value)} /></label>
    <label>To <input type="date" value={to} onChange={(event) => setTo(event.currentTarget.value)} /></label>
    <button type="button" onClick={() => props.onExport(exportChangelogMarkdown(visible, from || null, to || null))}>Export filtered Markdown</button>
    <ol>{visible.map((entry, index) => <li key={`${entry.area}-${entry.version}-${index}`}><strong>{entry.version}</strong> · {entry.section}: {entry.entry} {entry.commit && <code>{entry.commit.slice(0, 8)}</code>}</li>)}</ol>
  </section>;
}

export function OfflineDocsPanel(props: { bundle: OfflineDocsBundle | null }): ReactNode {
  const [search, setSearch] = useState(() => createSecuritySearchState());
  const results = props.bundle ? props.bundle.articles.filter((article) => securitySearchMatches(`${article.title} ${article.plainText}`, search)) : [];
  return <section aria-labelledby="offline-docs-title">
    <h2 id="offline-docs-title">Offline documentation · 離線文件</h2>
    <LocalSearch id="offline-docs" label="Search article titles and text" state={search} onChange={setSearch} />
    {!props.bundle ? <p role="status">The bundled documentation index is unavailable.</p> : <ul>{results.map((article) => <li key={article.slug}><a href={`#docs/${article.slug}`}>{article.title}</a> — {article.plainText.slice(0, 120)}</li>)}</ul>}
  </section>;
}

export function SecurityStateToolsPanel(props: {
  localDataPath: string;
  timeZone: string;
  history: readonly HistoryRecord[];
  changelog: readonly ChangelogEntry[];
  docs: OfflineDocsBundle | null;
  onOpenFolder(path: string): void;
  onSaveSchedule(rule: ExtendedScheduleRule): void;
  onRestore(revisionId: string): void;
  onExport(markdown: string): void;
}): ReactNode {
  return <div className="security-state-tools">
    <TotpAuthenticatorPanel />
    <SupportTicketsPanel localDataPath={props.localDataPath} onOpenFolder={props.onOpenFolder} />
    <ScheduleEditorPanel timeZone={props.timeZone} onSave={props.onSaveSchedule} />
    <HistoryPanel records={props.history} onRestore={props.onRestore} />
    <ExportRegistryPanel />
    <ChangelogPanel entries={props.changelog} onExport={props.onExport} />
    <OfflineDocsPanel bundle={props.docs} />
  </div>;
}

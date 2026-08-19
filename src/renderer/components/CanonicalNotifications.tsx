import { useEffect, useState } from 'react';

import {
  createNotification,
  createSearchState,
  filterNotifications,
  reduceNotifications,
  type Notification as KernelNotification,
  type NotificationSeverity,
} from '@material-cookie-clicker/surface-kernel';

import { CanonicalSearch } from './CanonicalSearch.js';
import { bilingualText } from '../game/copy.js';

const NOTIFICATION_KEY = 'material-cookie-clicker:canonical-notifications:v1';
const NOTIFICATION_EVENT = 'material-cookie-clicker:notify';

export interface CanonicalNoticeInput {
  readonly kind: NotificationSeverity;
  readonly title: string;
  readonly body: string;
}

export function publishCanonicalNotification(input: CanonicalNoticeInput): void {
  const notification = createNotification({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    kind: input.kind,
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 500),
    createdAt: new Date().toISOString(),
  });
  try {
    localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(reduceNotifications(loadNotices(), { type: 'add', notification })));
  } catch { /* the visible session event still fires */ }
  window.dispatchEvent(new CustomEvent<KernelNotification>(NOTIFICATION_EVENT, { detail: notification }));
}

function loadNotices(): KernelNotification[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is KernelNotification => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      const notice = entry as Record<string, unknown>;
      return typeof notice.id === 'string' && notice.id.length <= 120
        && (notice.kind === 'success' || notice.kind === 'error' || notice.kind === 'progress' || notice.kind === 'info')
        && typeof notice.title === 'string' && notice.title.length <= 120
        && typeof notice.body === 'string' && notice.body.length <= 500
        && typeof notice.createdAt === 'string' && Number.isFinite(Date.parse(notice.createdAt))
        && typeof notice.read === 'boolean' && typeof notice.persistent === 'boolean';
    })
      .slice(0, 200);
  } catch { return []; }
}

export function CanonicalNotificationCenter() {
  const [notices, setNotices] = useState(loadNotices);
  const [search, setSearch] = useState(() => createSearchState());
  const [selected, setSelected] = useState<readonly string[]>([]);

  useEffect(() => {
    try { localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notices)); } catch { /* session state remains usable */ }
  }, [notices]);

  useEffect(() => {
    const listener = (event: Event) => {
      const notification = (event as CustomEvent<KernelNotification>).detail;
      if (!notification) return;
      setNotices((current) => reduceNotifications(current, { type: 'add', notification }));
    };
    window.addEventListener(NOTIFICATION_EVENT, listener);
    return () => window.removeEventListener(NOTIFICATION_EVENT, listener);
  }, []);

  const filtered = filterNotifications(notices, {}, search);
  const selectedSet = new Set(selected);
  const selectedNotices = notices.filter((notice) => selectedSet.has(notice.id));
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <section id="canonical-notifications" className="canonical-tool-card" aria-labelledby="canonical-notifications-title">
      <h3 id="canonical-notifications-title">{bilingualText({ en: 'Notification centre', yue: '通知中心' })}</h3>
      <p>{bilingualText({ en: 'Informational notices are non-blocking. Errors and progress remain until dismissed.', yue: '資訊通知唔會阻塞操作。錯誤同進度會保留到你關閉。' })}</p>
      <CanonicalSearch label={bilingualText({ en: 'Search notification history', yue: '搜尋通知記錄' })} state={search} onChange={setSearch} />
      <div className="canonical-bulk" role="group" aria-label="Notification bulk actions">
        <button type="button" onClick={() => setSelected(filtered.map((notice) => notice.id))}>{bilingualText({ en: `Select every match (${filtered.length})`, yue: `選取所有符合項（${filtered.length}）` })}</button>
        <button type="button" onClick={() => setSelected(filtered.filter((notice) => !selectedSet.has(notice.id)).map((notice) => notice.id))}>{bilingualText({ en: 'Inverse selection', yue: '反轉選取' })}</button>
        <button type="button" disabled={selectedNotices.length === 0} onClick={() => { setNotices((current) => reduceNotifications(current, { type: 'dismiss-scope', ids: [...selected] })); setSelected([]); }}>{bilingualText({ en: `Dismiss selected (${selectedNotices.length})`, yue: `關閉已選（${selectedNotices.length}）` })}</button>
        <button type="button" onClick={() => setNotices((current) => reduceNotifications(current, { type: 'mark-all-read' }))}>{bilingualText({ en: 'Mark all read', yue: '全部標示已讀' })}</button>
      </div>
      <ul className="canonical-notices">
        {filtered.map((notice) => (
          <li key={notice.id} data-kind={notice.kind} data-read={notice.read}>
            <input type="checkbox" checked={selectedSet.has(notice.id)} aria-label={`Select ${notice.title}`} onChange={() => toggle(notice.id)} />
            <div><strong>{notice.title}</strong><p>{notice.body}</p><time dateTime={notice.createdAt}>{new Date(notice.createdAt).toLocaleString()}</time></div>
            <button type="button" onClick={() => setNotices((current) => reduceNotifications(current, { type: notice.read ? 'mark-unread' : 'mark-read', id: notice.id }))}>{notice.read ? 'Mark unread' : 'Mark read'}</button>
            <button type="button" onClick={() => setNotices((current) => reduceNotifications(current, { type: 'dismiss', id: notice.id }))}>Dismiss</button>
          </li>
        ))}
      </ul>
      {filtered.length === 0 ? <p>{bilingualText({ en: 'No notifications match this search.', yue: '冇通知符合呢個搜尋。' })}</p> : null}
    </section>
  );
}

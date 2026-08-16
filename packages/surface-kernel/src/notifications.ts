/**
 * Notification centre state.
 *
 * The rule encoded here is that a person never loses a notice they might need
 * to act on: progress and error notices are persistent and are dismissed by
 * the reader, not by a timer.
 */

import { matchesSearch, type SearchState } from "./regex-builder.ts";

export type NotificationSeverity = "success" | "error" | "progress" | "info";

export type Notification = {
  id: string;
  kind: NotificationSeverity;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  persistent: boolean;
};

export type NotificationAction =
  | { type: "add"; notification: Notification }
  | { type: "mark-read"; id: string }
  | { type: "mark-unread"; id: string }
  | { type: "dismiss"; id: string }
  | { type: "mark-all-read" }
  | { type: "dismiss-scope"; ids: string[] }
  | { type: "clear" };

export type BulkSelection = {
  mode: "all" | "read" | "unread" | "selected";
  ids?: readonly string[];
};

/** Milliseconds a dismissible notice stays on screen. */
export const DEFAULT_TOAST_MS = 4800;

/** Most notices kept in the centre before the oldest read ones are dropped. */
export const DEFAULT_NOTIFICATION_CAP = 200;

/** Progress and error notices never auto-dismiss. */
export function isPersistent(kind: NotificationSeverity): boolean {
  return kind === "progress" || kind === "error";
}

/** Builds a notification with the persistence rule already applied. */
export function createNotification(input: {
  id: string;
  kind: NotificationSeverity;
  title: string;
  body: string;
  createdAt: string;
}): Notification {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    createdAt: input.createdAt,
    read: false,
    persistent: isPersistent(input.kind),
  };
}

function capped(list: Notification[]): Notification[] {
  if (list.length <= DEFAULT_NOTIFICATION_CAP) return list;
  const keep = list.filter((item) => !item.read || item.persistent);
  if (keep.length >= DEFAULT_NOTIFICATION_CAP) return keep.slice(0, DEFAULT_NOTIFICATION_CAP);
  const droppable = list.filter((item) => item.read && !item.persistent);
  return [...keep, ...droppable].slice(0, DEFAULT_NOTIFICATION_CAP);
}

/** Pure reducer over the notification list; newest first. */
export function reduceNotifications(list: Notification[], action: NotificationAction): Notification[] {
  switch (action.type) {
    case "add":
      return capped([action.notification, ...list.filter((item) => item.id !== action.notification.id)]);
    case "mark-read":
      return list.map((item) => (item.id === action.id ? { ...item, read: true } : item));
    case "mark-unread":
      return list.map((item) => (item.id === action.id ? { ...item, read: false } : item));
    case "dismiss":
      return list.filter((item) => item.id !== action.id);
    case "mark-all-read":
      return list.map((item) => ({ ...item, read: true }));
    case "dismiss-scope": {
      const ids = new Set(action.ids);
      return list.filter((item) => !ids.has(item.id));
    }
    case "clear":
      return [];
    default:
      return list;
  }
}

/** Filters by severity, creation date range and the shared search engine. */
export function filterNotifications(
  list: Notification[],
  range: { kinds?: readonly NotificationSeverity[]; from?: string; to?: string },
  state: SearchState,
): Notification[] {
  const kinds = range.kinds && range.kinds.length > 0 ? new Set(range.kinds) : null;
  return list.filter((item) => {
    if (kinds && !kinds.has(item.kind)) return false;
    if (range.from && item.createdAt < range.from) return false;
    if (range.to && item.createdAt > range.to) return false;
    return matchesSearch(`${item.title} ${item.body} ${item.kind}`, state);
  });
}

/** Resolves the exact set a bulk action will affect, for confirmation. */
export function selectBulkScope(list: Notification[], selection: BulkSelection): Notification[] {
  switch (selection.mode) {
    case "all":
      return [...list];
    case "read":
      return list.filter((item) => item.read);
    case "unread":
      return list.filter((item) => !item.read);
    case "selected": {
      const ids = new Set(selection.ids ?? []);
      return list.filter((item) => ids.has(item.id));
    }
    default:
      return [];
  }
}

# Notification centre

## Behavior

Informational, success, progress, and non-decision errors use non-blocking corner notifications.
Dismissed items remain in a searchable, selectable, bulk-manageable history.

## Configuration

Errors/warnings persist until dismissed; other messages use bounded timeouts. Emoji decoration is
controlled separately and never changes accessible facts.

## Failure modes

The desktop ships an update notice but no general centre. The site has partial notification logic
without complete history/bulk evidence.

## Security and privacy

Notifications must not expose secrets or private paths, and actions must repeat ordinary
authorization checks.

## Verification

`tests/game/updates.test.ts` and `captures/app/update-notice.png` prove only the updater notice.

## Suggested articles

- [Bulk actions](bulk-actions.md)
- [Dialog emoji setting](../interface/dialog-emoji-setting.md)

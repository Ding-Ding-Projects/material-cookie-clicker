# Browser-extension download dialogs

## Behavior

A browser-extension capture opens a real Start download decision, a separate IDM-style active
Downloading surface, and an always-on-top non-blocking completion surface.

## Configuration

The flow reports filename, source, destination, bytes, rate, ETA, pause/resume/cancel, errors, and
completion through the actual queue.

## Failure modes

The baseline packages no browser extension or handoff. Kernel download-state logic alone does not
prove any of the three surfaces.

## Security and privacy

Source/destination facts are bounded and never expose credentials. Cancel leaves the queue honest;
completion cannot be reported before the transfer finishes.

## Verification

Require a real installed extension handoff and distinct current built captures for Start, active
progress, and completion. DOM injection and mocked IPC do not count.

## Suggested articles

- [Notification centre](notification-centre.md)
- [Bulk actions](bulk-actions.md)

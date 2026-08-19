# Automatic updates

## Behavior

Installed copies check the unsigned Squirrel feed after startup and on a bounded schedule, download
without blocking gameplay, then show a persistent ready notice with version, notes, unsigned warning,
Restart, and Later.

## Configuration

The feed is HTTPS and enabled by default. Source/development runs do not claim an installed updater.

## Failure modes

Offline, invalid metadata/hash, corrupt assets, cancellation, rollback, and unsaved work must remain
visible and recoverable. No spinner may imply success.

## Security and privacy

Code signing is prohibited. Package hashes and HTTPS provide integrity/transport checks only; the
UI never claims publisher authenticity.

## Verification

`tests/game/updates.test.ts`, the v0.2.55 Squirrel assets, and
`captures/app/update-notice.png` cover the current flow. Complete failure-state captures remain
future evidence.

## Suggested articles

- [Unsigned installer policy](unsigned-installer-policy.md)
- [Notification centre](../tools/notification-centre.md)

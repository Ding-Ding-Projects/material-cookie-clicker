# Local history tool

## Behavior

The history tool provides append-only snapshots, browsing, diff, restore-as-new-revision, labels,
retention, date/action filters, search, and redacted export.

## Configuration

The local Git store belongs inside stable application data, never the user's project folder.
Sensitive history access requires its own local credential.

## Failure modes

At v0.2.55 only kernel history logic exists. No app manager, protected store, built interaction, or
capture is present.

## Security and privacy

Secrets remain encrypted or redacted; authenticated-encryption AAD must use stable identifiers.

## Verification

The kernel append-only test proves the pure model, not a real local Git store. See the dedicated
[data article](../data/local-version-history.md).

## Suggested articles

- [Exports](exports.md)
- [Changelog viewer](../data/changelog-viewer.md)

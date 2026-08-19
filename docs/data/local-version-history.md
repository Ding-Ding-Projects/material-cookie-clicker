# Local version history

## Behavior

Every user-managed document, record, credential metadata, and setting receives an append-only local
Git snapshot. Users can browse, search, date/action filter, diff, label, restore as a new revision,
prune by policy, and export redacted history.

## Configuration

The local repository lives in stable application data, never inside the user's own folder. History
manager access has an independent local credential and retention policy.

## Failure modes

The baseline ships kernel history logic only. No application-data Git store or first-class manager
is wired, and no built interaction/capture exists.

## Security and privacy

TOTP/password/PIN/QR data never becomes plaintext Git content. Encrypted snapshots keep keys in the
operating-system vault and bind authenticated data to stable identifiers.

## Verification

The kernel append-only test proves pure restore semantics only. Real Git, interruption, vault
failure, filtering, export, and restart recovery remain pending.

## Suggested articles

- [Local history tool](../tools/local-history.md)
- [Exports and privacy](exports-and-privacy.md)

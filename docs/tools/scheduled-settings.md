# Scheduled settings

## Behavior

Rules can schedule language and every appearance value by date, time, weekdays, local data,
validated HTTPS API, or Home Assistant boolean entity, with deterministic precedence.

## Configuration

Rules have stable IDs, labels, enabled state, timezone semantics, bounded refresh, and versioned
storage. Cross-midnight and equal-boundary behavior must be explicit.

## Failure modes

Only `packages/surface-kernel/src/scheduling.ts` is present; neither app nor site exposes the editor
or external-source seam.

## Security and privacy

Reject embedded credentials, redirects, arbitrary files, and SSRF. Home Assistant tokens belong in
the operating-system credential vault.

## Verification

The kernel precedence test covers rule selection only. Persistence, source failures, and UI evidence
remain pending.

## Suggested articles

- [Settings surface](../interface/settings-surface.md)
- [Local model manager](local-model-manager.md)

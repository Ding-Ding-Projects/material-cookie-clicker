# Personal vocabulary

## Behavior

Every surface exposes a visible local JSON upload with empty, loaded, invalid, replace, and clear
states. Valid replacements apply only at private user-facing text boundaries.

## Configuration

The versioned schema is bounded by bytes, depth, entry count, and key/value lengths. Duplicate keys,
unsafe keys, unknown versions, and unexpected fields are rejected atomically.

## Failure modes

Only kernel validation logic exists in the baseline. No desktop or site upload/cache surface exists.

## Security and privacy

Parsing and caching are local-only. Payloads, mappings, filenames, paths, and metadata never enter
repositories, logs, telemetry, exports, history, or public records.

## Verification

The kernel vocabulary test proves schema behavior only. Surface persistence and no-network evidence
remain pending.

## Suggested articles

- [School mode](school-mode.md)
- [Settings surface](../interface/settings-surface.md)

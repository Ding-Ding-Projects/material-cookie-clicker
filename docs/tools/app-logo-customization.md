# App-logo customization

## Behavior

The feature offers shipped presets and bounded local custom-image upload, crop/fit/focal/background
controls, safe-area and target-size previews, automatic validated derivatives, persistence, and reset.

## Configuration

Only allowlisted decoded formats are accepted. Input bytes, pixels, dimensions, frames, CPU, memory,
and output count are bounded; selection participates in appearance schedules and history.

## Failure modes

The v0.2.55 baseline ships a fixed project logo but no customization UI. Parallel release-completeness lanes are
pending and must not be recorded as implemented before their evidence lands.

## Security and privacy

Images remain local and never enter telemetry, logs, ordinary exports, history snapshots, captures,
or public records. Display changes never alter package or installer identity.

## Verification

Require malformed/oversized/signature-mismatch tests, conversion round trips, rollback, persistence,
reset, packaged rendering, and current built captures.

## Suggested articles

- [Appearance editor](appearance-editor.md)
- [Settings surface](../interface/settings-surface.md)

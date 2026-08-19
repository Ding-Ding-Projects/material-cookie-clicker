# Exports

## Behavior

Every record and view must be exportable in every faithful applicable format, with complete fields,
encoding/schema disclosure, round-trip support where possible, and direct VS Code handoff.

## Configuration

Structured formats include JSON/JSONL/YAML/TOML/XML/CSV/TSV/Markdown/HTML/SQL and applicable source
forms. Archive choices expose ZIP and full 7z controls.

## Failure modes

The baseline has kernel export helpers and limited site exporters, not a complete desktop or site
surface.

## Security and privacy

Exports omit secrets explicitly rather than silently. Archive paths stay relative, and sensitive
exports require consequential-action confirmation.

## Verification

The kernel CSV test covers one formatter only. See [Exports and privacy](../data/exports-and-privacy.md)
for the evidence boundary.

## Suggested articles

- [Bulk actions](bulk-actions.md)
- [External editor](external-editor.md)

# Bulk actions

## Behavior

Every collection supports multi-select, shift ranges, keyboard selection, scoped select-all,
inverse selection, preview, and the complete set of applicable single-item actions in bulk.

## Configuration

Selection composes with active filters and regex search. Destructive batches use the two-key
confirmation; long operations show progress and cancellation.

## Failure modes

The desktop uses a shared bulk toolbar on selected lists, but there is no hand-written proof that
every collection participates. The site has no complete implementation.

## Security and privacy

Bulk actions must report skipped items, preserve unsaved-work protection, and avoid exporting
filtered-out or secret data.

## Verification

No full per-list interaction/capture matrix exists. The completeness row remains partial.

## Suggested articles

- [Regex builder](regex-builder.md)
- [Destructive confirmation](../interface/destructive-confirmation.md)

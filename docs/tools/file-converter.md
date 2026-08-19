# Local file converter

## Behavior

The required converter detects source type from bounded bytes and presents categorized adapters for
documents/PDF, images, audio, video, archives, structured data, code/text, and binary encodings.
Queues are resumable, paged, bounded-concurrency, and never loaded wholly into memory.

## Configuration

Each adapter declares signatures, target, bundled status, limits, sandbox, lossiness, metadata
behavior, and output validation. PDF tools include inspect, split, merge, extract, reorder, rotate,
and metadata changes.

## Failure modes

The v0.2.55 baseline has a registry only. No adapter is proven bundled or usable from the desktop or
site, and the release-completeness implementation lane remains pending until its evidence lands.

## Security and privacy

Conversion is local, sandboxed, resource-bounded, atomic, and no-network. Unsupported or malformed
input must leave no partial destination.

## Verification

Require adapter-specific tests, packaged-file proof, offline built interactions, and current
captures before changing the inventory from logic-only/not implemented.

## Suggested articles

- [Exports](exports.md)
- [Bulk actions](bulk-actions.md)

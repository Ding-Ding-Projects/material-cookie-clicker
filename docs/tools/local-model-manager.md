# Local model manager

## Behavior

The complete Ollama suite uses the documented local API for health, version, models, exhaustive
catalog/tags, pulls, deletes, copies, streaming chat, and capability metadata. Harness launches are
app-owned allowlisted orchestration, not an Ollama feature.

## Configuration

Model and variant choices come from verified data. Hardware-fit states expose RAM, GPU, VRAM,
driver, storage, blob, parameter, quantization, and context evidence. Pulls use a payment-free,
bounded batch queue.

## Failure modes

`packages/local-ollama` provides real logic and focused tests, but v0.2.55 has no desktop or site UI,
packaged interaction proof, or capture. The release-completeness lane remains pending.

## Security and privacy

Only allowlisted loopback requests are permitted. Chats, attachments, profiles, snapshots, and
secrets stay local; arbitrary shell commands are rejected.

## Verification

Seven package test files cover catalog completeness, fit evidence, guided choices, pull preflight,
chat capability, no-payment semantics, and shell/rollback. They do not prove the application seam.

## Suggested articles

- [Scheduled settings](scheduled-settings.md)
- [Exports and privacy](../data/exports-and-privacy.md)

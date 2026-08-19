# Offline and no-network operation

## Behavior

Core gameplay and bundled application features work without a network. Local parsing, vocabulary,
history, conversion, narration settings, and authenticator operations never require an external
service. Optional release/update and local-service integrations state their boundaries.

## Configuration

The game save and settings live locally. Release checks use HTTPS; Ollama uses allowlisted loopback;
scheduled external settings are explicit opt-in rules.

## Failure modes

The shipped game loop is local, but the baseline lacks several universal offline surfaces,
including the in-app docs browser and converter UI. Do not generalize one no-network grep into proof
of every feature.

## Security and privacy

No CDN, analytics, telemetry, arbitrary proxy, or implicit upload is allowed for local features.

## Verification

Require a packaged run with the network unavailable plus feature-specific assertions. Current
gameplay captures do not prove absent network requests.

## Suggested articles

- [File converter](../tools/file-converter.md)
- [Local model manager](../tools/local-model-manager.md)

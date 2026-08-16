# Shared surface kernel

`@material-cookie-clicker/surface-kernel` is a dependency-free, framework-neutral TypeScript package holding the cross-cutting logic a documentation site and a desktop application both need: the anchored regular-expression search engine, preferences, language and humour resolution, personal vocabulary, the command registry, notifications, append-only history, exports, appearance overrides, colour, presentation locks, tabs, schedules, narration, identity, the conversion registry, documentation and changelog parsing, one-time passwords, QR matrix encoding, support tickets, the transfer state machine, and the Material 3 token set.

## Boundary

- The package compiles against the ES2022 standard library only. React, Electron and DOM types are unavailable inside it by construction.
- It performs no network access, no filesystem access and no rendering. Every capability of that kind is injected by the consuming surface through the interfaces in `src/ports.ts`.
- It has no runtime dependencies. The only ambient facility it uses is the Web Cryptography implementation, requested explicitly through `requireWebCrypto`.

## Scripts

- `npm run build` type-checks and emits declarations and JavaScript to `dist`.
- `npm test` runs the package's own tests with the Node.js test runner.

## Documentation

The full article, including failure modes, privacy notes and the verification status of this work, is at [docs/features/shared-surface-kernel/README.md](../../docs/features/shared-surface-kernel/README.md).

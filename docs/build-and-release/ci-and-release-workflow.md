# CI, Pages, and release workflow

## Behavior

Every push and manual dispatch builds; the `main` release workflow packages one unique non-draft
release with installer/update assets, dim-sum code name, line-count evidence, source commit, and UTC
timing. The Pages workflow publishes the static site.

## Configuration

The release runs on a pinned GitHub-hosted Windows runner and uses the repository token chain. Validation-only
workflow concurrency cancels stale runs; release publication never uses cancel-in-progress.

## Failure modes

GitHub Actions deliberately runs no tests or lint. A release may therefore ship code whose local tests
would fail; local checking before a push is the accepted control. Missing assets or publication
failures remain workflow failures.

## Security and privacy

Tokens stay in GitHub secret storage and are never logged. Workflows collect only allowlisted safe
evidence paths.

## Verification

The v0.2.55 Release, CI, and Pages runs completed successfully against exact commit `a98e38c`.
Release assets and tag target were read back after publication.

## Suggested articles

- [Unsigned installer policy](unsigned-installer-policy.md)
- [Changelog viewer](../data/changelog-viewer.md)

# CI, Pages, and release workflow

## Behavior

Every branch push and every manual dispatch of the Release workflow packages one uniquely tagged
release. The build-only CI workflow has no manual-dispatch route, so a manual release request cannot
accidentally create a build with no release. A non-`main` release is published without replacing the
stable `latest` release; a `main` release becomes latest. Every release includes the unsigned
installer/update assets, icon evidence, a dim-sum code-name link when the public catalog is
available, committed line-count evidence, the exact source branch and commit, and UTC timing.

The release remains a draft while every binary and metadata asset is uploaded through its numeric
release ID. The workflow verifies the exact asset-name set, uploaded state, nonzero size, and SHA-256
digest before one final API mutation writes the completed notes and publishes the release. All later
operations are read-only verification. The Pages workflow publishes the static site.

## Configuration

The release runs on a pinned GitHub-hosted Windows runner and uses the repository token chain.
Validation-only workflow concurrency cancels stale runs; release publication never uses
`cancel-in-progress`. Tags derive monotonically from the Release workflow run number, so pushes on
different branches do not collide.

The first-job start comes from the current GitHub Actions job record rather than a local clock read.
Completion is captured only after the last draft asset is uploaded and immediately before the one
notes-and-publication mutation; the returned `published_at` second must exactly match the timestamp
written to the notes. The line counter runs on the clean source checkout before package-version or
generated-manifest files are changed, requires zero uncommitted attribution, and fails visibly when
Git blame or commit metadata cannot be read.

## Failure modes

GitHub Actions deliberately runs no tests, lint, type checks, coverage, or static analysis. A release
may therefore ship code whose local tests would fail; local checking before a push is the accepted
control. A missing asset, duplicate tag, nonzero native GitHub CLI exit, attribution failure, timing
mismatch, wrong source ref, or publication mismatch fails the workflow. A failure before the final
publication mutation may leave an unpublished draft for maintainers to inspect, but cannot expose an
incomplete public release.

## Security and privacy

Tokens stay in GitHub secret storage and are never logged. Workflows collect only allowlisted safe
evidence paths.

## Verification

The published v0.2.55 baseline targets exact commit `a98e38c`; it exposed the former timing and
line-attribution defects that this contract repairs. Local structural and negative tests prove the
new draft, timing, asset, trigger, native-exit, icon, and attribution invariants. No release was
dispatched while developing this repair, so remote proof begins with the first post-integration run.

## Suggested articles

- [Unsigned installer policy](unsigned-installer-policy.md)
- [Changelog viewer](../data/changelog-viewer.md)

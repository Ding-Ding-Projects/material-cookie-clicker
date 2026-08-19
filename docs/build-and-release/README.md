# Build and release

- [Unsigned installer policy](unsigned-installer-policy.md)
- [One-click build scripts](build-scripts.md)
- [Dependency bootstrap](dependency-bootstrap.md)
- [CI and release workflow](ci-and-release-workflow.md)
- [Automatic updates](automatic-updates.md)

The verified baseline is `v0.2.55` at commit
`a98e38c07423a7cfb4cb3190412884a404a7245e`. It is a non-draft release with an unsigned
Squirrel.Windows setup executable, `RELEASES`, a full `.nupkg`, and a changelog manifest.

## Failure and security boundary

Code signing is permanently prohibited. Build scripts never install secrets or credentials.
Generated output and dependencies are not committed as source.

## Verification

Release evidence and current gaps are listed in the [per-surface inventory](../completeness.md).

## Suggested articles

- [Automatic updates](automatic-updates.md)
- [Offline operation](../data/offline-and-no-network.md)

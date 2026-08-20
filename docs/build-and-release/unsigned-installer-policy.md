# Unsigned installer policy

## Behavior

Windows releases use unsigned Squirrel.Windows assets: `Setup.exe`, `RELEASES`, and a full `.nupkg`
(plus deltas when produced). Users are warned about unknown-publisher/SmartScreen prompts.

## Configuration

Packaging keeps `forceCodeSigning`, `signExecutable`, and related signer controls false. No
certificate discovery or signer invocation is allowed. Squirrel's public icon URL is pinned to an
immutable commit containing the same generated icon bytes as the release source; it never uses a
moving branch, `latest`, or a superseded logo commit.

## Failure modes

A signer attempt, missing Squirrel asset, wrong package version, stale artifact, or setup executable
that is not `NotSigned` blocks publication.

## Security and privacy

HTTPS, feed metadata, and package hashes provide transport/integrity evidence but never identity or
signature authenticity.

## Verification

The v0.2.55 release publishes the baseline unsigned setup, `RELEASES`, and full package. The next
post-integration release also proves both executable signatures, four extracted icon sizes,
machine-readable installer evidence, and the exact expected release-asset set before publication.

## Suggested articles

- [Automatic updates](automatic-updates.md)
- [Build scripts](build-scripts.md)

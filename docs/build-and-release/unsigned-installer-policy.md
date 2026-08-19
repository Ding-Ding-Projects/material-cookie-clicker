# Unsigned installer policy

## Behavior

Windows releases use unsigned Squirrel.Windows assets: `Setup.exe`, `RELEASES`, and a full `.nupkg`
(plus deltas when produced). Users are warned about unknown-publisher/SmartScreen prompts.

## Configuration

Packaging keeps `forceCodeSigning`, `signExecutable`, and related signer controls false. No
certificate discovery or signer invocation is allowed.

## Failure modes

A signer attempt, missing Squirrel asset, wrong package version, stale artifact, or setup executable
that is not `NotSigned` blocks publication.

## Security and privacy

HTTPS, feed metadata, and package hashes provide transport/integrity evidence but never identity or
signature authenticity.

## Verification

The v0.2.55 release publishes all required assets and records the unsigned status. Its release
workflow completed successfully.

## Suggested articles

- [Automatic updates](automatic-updates.md)
- [Build scripts](build-scripts.md)

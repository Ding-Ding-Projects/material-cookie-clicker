# One-click build scripts

## Behavior

`download-dependencies.bat` obtains pinned build/runtime requirements; `build.bat` builds the
runnable app and optionally launches it; `build-installer.bat` produces and verifies the unsigned
installer without publishing.

## Configuration

Each supports `/s`, `--silent`, and `SILENT=1`, uses user/project-scoped caches, exits nonzero on a
real failure, and reports exact phases, paths, duration, artifact path, size, and hash.

## Failure modes

Missing tools are bootstrapped from canonical sources. A helper returning noisy native stdout as a
PowerShell value, stale output, missing packaged files, or a signer invocation must fail clearly.
The audited packager uses `System.Diagnostics.Process` with asynchronously drained output and reads
the strongly typed child exit code after `WaitForExit()`. This avoids an indeterminate exit value
after a completed package while preserving the signer-process audit and full stdout/stderr log.

## Security and privacy

Scripts never request or install credentials/signing material and never weaken persistent execution
policy.

## Verification

The scripts exist in the baseline and the v0.2.55 installer was produced by the supported packaging
path. `scripts/test-packaging-process-exit.ps1` proves both a zero exit and an exact nonzero exit,
including retained log evidence. Fresh-environment bootstrap evidence is tracked separately.

## Suggested articles

- [Dependency bootstrap](dependency-bootstrap.md)
- [CI and release workflow](ci-and-release-workflow.md)

# Dependency bootstrap

## Behavior

The root dependency fetcher obtains every declared build/run/test dependency from canonical sources,
pins versions and digests, reuses verified warm caches, and operates without elevation when a
user-scoped route exists.

## Configuration

The manifest/lockfiles determine versions. Silent modes are non-interactive and exit on the first
real failure.

## Failure modes

Partial installs, missing package modules, warm-tree residue, or undeclared parent-directory modules
must not count as success. Post-install assertions verify the actual expected files.

## Security and privacy

No secrets, credentials, signer tools, arbitrary mirrors, standard Git LFS, or unrelated global
toolchain mutations are allowed.

## Verification

The current root scripts and release workflow bootstrap Node/npm dependencies. A complete disposable
fresh-host proof remains a distinct release check.

## Suggested articles

- [Build scripts](build-scripts.md)
- [CI and release workflow](ci-and-release-workflow.md)

# Changelog viewer

## Behavior

The viewer covers every release with version, date, categorized factual changes, exact commit link,
typed/advanced date range, regex-enabled search, copy, and filtered export.

## Configuration

Generated records bind version, source commit, release URL, date, and article link. Filters compose
and persist only local visitor state.

## Failure modes

Release automation generates a reconciled changelog manifest, but neither baseline surface proves a
complete interactive viewer. A manifest alone is not a screen.

## Security and privacy

Provider-authored Markdown is rendered through an isolated renderer. No secret or private release
input enters the catalogue.

## Verification

Release scripts validate referenced commits. UI interaction, every-release coverage, filters,
exports, localization, and captures remain pending.

## Suggested articles

- [CI and release workflow](../build-and-release/ci-and-release-workflow.md)
- [Exports and privacy](exports-and-privacy.md)

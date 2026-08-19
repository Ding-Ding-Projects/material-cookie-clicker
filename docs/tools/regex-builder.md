# Regex builder

## Behavior

Every search field needs an adjacent builder with literal/class/anchor/group/alternation/quantifier
guidance, raw pattern and flags, sample text, syntax feedback, matches, capture groups, and export.

## Configuration

Plain-text search is the default. Pattern and sample sizes are bounded and each field owns its own
query, mode, flags, and validation state.

## Failure modes

The desktop has a working shared search component, but not every dropdown and context menu uses it.
The documentation site has a local JavaScript implementation but incomplete localization evidence.

## Security and privacy

Evaluation is local and bounded to reduce catastrophic-backtracking risk. Queries and samples are
not transmitted.

## Verification

Use `tests/game/regex-builder-advanced.test.ts` and the surface-kernel regex test. The built desktop
evidence is `captures/app/regex-lab.png`.

## Suggested articles

- [Command palette](command-palette.md)
- [Settings surface](../interface/settings-surface.md)

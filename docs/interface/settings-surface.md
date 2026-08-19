# Settings surface

## Behavior

Settings are reached from the console and include local search, language mode, independent funny
levels, and other app preferences as they are implemented. A free catalogue lists control prices.

## Configuration

Application settings persist separately from the game save under a stable local storage key, so a
save reset does not reset reading preferences.

## Failure modes

The current screen is not a complete universal settings implementation: full tab behavior,
provenance/explanations, voice pickers, scheduling, vocabulary upload, logo controls, locks, and
many other canonical rows remain missing.

## Security and privacy

No credential belongs in the settings record. Search and regex evaluation stay local.

## Verification

`tests/game/settings.test.ts` and the settings captures prove the current screen and persistence.

## Suggested articles

- [Language modes](../localization/language-modes.md)
- [Regex builder](../tools/regex-builder.md)

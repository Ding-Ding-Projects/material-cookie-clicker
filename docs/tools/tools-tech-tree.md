# Tools tech tree

## Behavior

Twenty application capabilities appear as discoveries that award gameplay bonuses. The application
feature itself must remain reachable without the discovery; only its in-game bonus and themed card
are gated.

## Configuration

Unlock thresholds and bonuses are defined in `src/shared/game/tools.ts` and persisted in the game
save. Settings and the command palette must never consult that unlock state before opening a tool.

## Failure modes

Treat a card that says “always available” but cannot open a real surface as incomplete. A discovered
tool must not disappear after spending cookies or prestige.

## Security and privacy

The tree grants no operating-system privilege, credential access, or network authority.

## Verification

`tests/game/tools.test.ts`, `tests/game/disclosure.test.ts`, and the built Tools capture cover the
current gameplay layer. Many matching application surfaces remain logic-only or absent; see the
[inventory](../completeness.md).

## Suggested articles

- [Command palette](command-palette.md)
- [Settings surface](../interface/settings-surface.md)

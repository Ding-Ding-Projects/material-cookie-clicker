# Achievements

> **Status: shipped and verified.** Achievement definitions, unlock evaluation, renderer badges,
> focused tests, packaged interaction, and a current built capture exist. The design file remains a
> reference rather than runtime evidence.

## What it does

An achievement is a named milestone (a generator count, a total-cookies threshold, a prestige
count, and so on) that unlocks a badge the first time its condition is met. `design/
achievement-badge.html` specifies two persistent states — a locked silhouette and an unlocked
full-colour badge — plus a distinct unlock-toast variant that announces the moment an achievement
is earned. The toast follows this project's non-blocking-notification rule: corner-anchored,
auto-dismissing, and never a blocking dialog. See
[Notification centre](../tools/notification-centre.md) for the shared notification contract the
toast is expected to reuse once both are built.

## How it is configured

The achievement list is game-balance data in `src/shared/game/achievements.ts`. Presentation keeps
locked and unlocked states distinct and searchable.

## Failure modes

Failure modes include an achievement condition that
is checked only at generator-purchase time and misses a condition satisfied by a passive CPS tick
(must be evaluated on every relevant state change, not only on discrete player actions), and a
badge that silently re-locks after being unlocked once (unlocks must be permanent and
save-persisted).

## Security considerations

Purely local; no network request, no leaderboard to falsify, no shared state. An edited save file
granting every achievement instantly is not a security concern for the same reason given in
[Cookie clicking](cookie-clicking.md): nobody pays for progress, so there is nothing to protect.

## Verification

`tests/game/achievements.test.ts` covers evaluation and persistence behavior.
`captures/app/dialog-achievements.png` shows the real built surface at 78 of 201 unlocked.

## Suggested articles

- [The 21-tier generator ladder](generator-ladder.md)
- [Prestige](prestige.md)
- [Notification centre](../tools/notification-centre.md)
- [The tools tech tree](../tools/tools-tech-tree.md)

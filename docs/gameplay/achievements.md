# Achievements

> **Status: not built.** No achievement definitions, unlock-condition evaluator, or badge rendering
> exists in this repository. This article documents the specified badge states from
> `design/achievement-badge.html`.

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

Not configurable yet. Once built, the achievement list itself is game-balance data owned by the
implementation; this article does not enumerate specific achievements because none exist yet, only
the two-state-plus-toast presentation contract they must follow.

## Failure modes

Not applicable yet. Once built, the anticipated failure modes are: an achievement condition that
is checked only at generator-purchase time and misses a condition satisfied by a passive CPS tick
(must be evaluated on every relevant state change, not only on discrete player actions), and a
badge that silently re-locks after being unlocked once (unlocks must be permanent and
save-persisted).

## Security considerations

Purely local; no network request, no leaderboard to falsify, no shared state. An edited save file
granting every achievement instantly is not a security concern for the same reason given in
[Cookie clicking](cookie-clicking.md): nobody pays for progress, so there is nothing to protect.

## Verification

Not yet verifiable beyond opening `design/achievement-badge.html` directly in a browser, which
renders the locked, unlocked, and toast states against static sample data. There is no running
unlock-condition evaluator to test.

## Suggested articles

- [The 20-tier generator ladder](generator-ladder.md)
- [Prestige](prestige.md)
- [Notification centre](../tools/notification-centre.md)
- [The tools tech tree](../tools/tools-tech-tree.md)

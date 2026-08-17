# Gameplay

The core incremental loop: click a cookie, buy generators that bake cookies automatically, catch
golden-cookie events for temporary bonuses, unlock achievements, and ascend through prestige to
trade progress for a permanent multiplier.

> [!NOTE]
> None of the articles in this category describe a shipped feature. No generator ladder, click
> handler, achievement engine, or prestige system exists anywhere in this repository yet — only
> `design/` specification files for how these surfaces must look and behave once built. Every
> article below says so explicitly rather than describing gameplay as though it runs today.

## Articles

- [Cookie clicking](cookie-clicking.md) — the primary click target and the cookies-per-second loop.
- [The 20-tier generator ladder](generator-ladder.md) — Cursor up to the Wok of the Gods, and the buy-quantity
  stepper.
- [Golden-cookie events](golden-cookie-events.md) — the random bonus overlay.
- [Achievements](achievements.md) — unlock conditions and the locked/unlocked badge states.
- [Prestige](prestige.md) — the destructive-action super-confirmation gate that trades progress for
  a permanent multiplier.

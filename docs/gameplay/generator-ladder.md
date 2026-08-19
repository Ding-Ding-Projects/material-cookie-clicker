# The 21-tier generator ladder

> **Status: shipped in v0.2.55, with narrow capture evidence pending.** The twenty-one definitions,
> permanent Office reveal, uncapped ownership, purchases, save behavior, and focused tests exist.
> The built ladder has been exercised, but the committed deep-ladder capture predates Office
> Building, so the Office-specific capture row remains pending.

## What it does

Twenty-one generator tiers, each baking cookies automatically once owned, in escalating cost and
output order:

1. Cursor
2. Grandma
3. Farm
4. Mine
5. Factory
6. Bank
7. Temple
8. Wizard Tower
9. Office Building
10. Shipment
11. Alchemy Lab
12. Portal
13. Time Machine
14. Antimatter Condenser
15. Prism
16. Chancemaker
17. Fractal Engine
18. Script Console
19. Idleverse
20. Cortex Baker
21. Wok of the Gods

Each tier is presented as a list row (`design/building-row.html`) with an icon, a bilingual name,
the owned count, the current cost, its per-unit and total CPS contribution, and a buy-quantity
stepper offering ×1, ×10, ×100, and Max. A row has three states: affordable (the player has enough
cookies), unaffordable (visible but disabled, never hidden), and locked (not yet reachable — see
below).

The Office Buildings expansion adds the new ninth tier, displayed as **Office Building · 寫字樓**. It is
permanently revealed when the all-time baked-cookie counter reaches **500,000,000**. The reveal
uses lifetime production rather than the current cookie balance, so spending cookies cannot hide
the row again, and prestige cannot remove it from a save. This addition does not move the existing
thresholds: the Minigames panel still unlocks at 100,000 lifetime baked cookies, Mouse Raids at
1,000,000, and prestige remains visible at 1,000,000,000 and usable at 1,000,000,000,000.

Locking a later tier behind an earlier one's progress is a pacing decision for the gameplay
implementation, separate from the tools tech tree described in
[The tools tech tree](../tools/tools-tech-tree.md): a generator lock gates a gameplay purchase, and
only a gameplay purchase — it never gates an application feature, because generators are not
application features to begin with.

## How it is configured

Each tier's cost curve, base CPS, and unlock threshold are implementation data, and this article's numbered list is the ordering contract that data must
follow — reordering, renaming, or removing a tier here requires updating this article in the same
change, per this project's documentation-currency rule.

## Failure modes

Failure modes include a cost curve that produces a
non-integer or negative price at some owned count (must be validated), a "Max" buy action that
silently buys fewer than it could afford (must report the real affordable quantity), and a locked
row that is fully invisible rather than shown-and-locked (violates the specification's
locked-but-visible state, which exists so a player always knows what is coming).

## Security considerations

Purely local, single-player arithmetic. No network request, no shared economy, no leaderboard. The
only local-integrity question — an edited save inflating owned counts — is not a security concern
here, per the [Cookie clicking](cookie-clicking.md) article's reasoning: there is nothing to
protect a purely cosmetic number from.

## Verification

`tests/game/generators.test.ts` and `endless-progression.test.ts` cover ordering, reveal, purchase,
and uncapped ownership. `captures/app/ladder-deep.png` proves the built deep ladder before the Office
addition; a current Office-row capture is still required.

## Suggested articles

- [Cookie clicking](cookie-clicking.md)
- [The tools tech tree](../tools/tools-tech-tree.md)
- [Achievements](achievements.md)
- [Bulk actions](../tools/bulk-actions.md)

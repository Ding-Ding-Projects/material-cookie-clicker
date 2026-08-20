# Gameplay

The core incremental loop: click a cookie, buy generators that bake cookies automatically, catch
golden-cookie events for temporary bonuses, unlock achievements, and ascend through prestige to
trade progress for a permanent multiplier.

> [!NOTE]
> The minigame article documents the current minigame and Lucky Chance flow. The older gameplay
> articles retain their historical scope notes where they describe specification-only surfaces.
> In particular, the minigame article's final expedited-release sentence describes that original
> lane; the evidence table below is the current candidate state.

## Current candidate evidence

Candidate `43d2174bc2172d31e572d9668282764438e4d904` is not a release. Its pinned clean
source/package check passed both TypeScript checks and 1,124/1,124 tests: 998 application tests
across 59 files, 37 local-model package tests, and 89 surface-kernel tests. That result proves
source and package behavior; it is not installed interaction or capture proof.

| Area | Implemented behavior | Evidence still required |
| --- | --- | --- |
| Graphics purchases | A fresh save is cookie-only. Seven ordered visual rungs are explicit purchases; production never grants one, and duplicate purchases deduct nothing. | The older plain-start image is superseded. Current parity/graphics receipts do not satisfy the generic promotion contract, so a clean task-rooted fresh-state capture is required. |
| Minigames and Lucky Chance | Five persisted boards unlock at 100,000 lifetime baked cookies; Mouse Raid remains at 1,000,000. The 6–12 minute schedule, final-30-second notice, Golden Token ledger, and atomic one-token drawer are implemented. | The aggregate suite is green, but there is no dedicated installed minigame UI interaction test or current promotable capture. The prior capture source contained uncommitted changes. |
| Office Building | The twenty-one-tier ladder includes Office Building at tier nine, permanently revealed at 500,000,000 lifetime baked cookies. | The committed deep-ladder image predates Office Building; a current row interaction record and capture are pending. |
| Endless progression | Generator ownership and prestige runs are uncapped. Home continues after six authored rooms through persisted repeatable extension floors. | No current committed endless-floor interaction record or capture exists. |

The design-parity structure and negative proof are healthy (16/16 reference rows and 19/19
deliberate red cases), but release parity is red because all 16 visual-diff reviews remain defects.
Existing parity records are also being invalidated for promotion-provenance gaps, so their presence
must not be read as approved release evidence.

## Articles

- [Cookie clicking](cookie-clicking.md) — the primary click target and the cookies-per-second loop.
- [Graphics purchase progression](graphics-progression.md) — the cookie-only fresh state and the
  seven explicitly purchased visual tiers.
- [The 21-tier generator ladder](generator-ladder.md) — Cursor through Office Buildings and Shipment up to
  the Wok of the Gods, with the buy-quantity stepper and the prestige-safe 500,000,000-cookie reveal.
- [Endless Home construction](home-construction.md) — six authored rooms followed by repeatable,
  persisted extension floors with no final level.
- [Golden-cookie events](golden-cookie-events.md) — the random bonus overlay.
- [Minigame events and Lucky Chance](minigame-events.md) — the five persisted minigames, Golden
  Tokens, and the seeded reward drawer.
- [Achievements](achievements.md) — unlock conditions and the locked/unlocked badge states.
- [Prestige](prestige.md) — the destructive-action super-confirmation gate that trades progress for
  a permanent multiplier.

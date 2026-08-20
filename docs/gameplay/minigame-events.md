# Minigame Events and Lucky Drawer

> **Status at integration base `43d2174`: mounted in the desktop application; focused documentation checks are in scope, while built interaction, screenshots, and a promotion receipt remain pending.**

## Mounted surface and unlock

The surface users actually receive is `src/renderer/screens/MinigamesScreen.tsx`. `src/renderer/App.tsx` imports that component as `PlayableMinigamesScreen` and mounts it inside the `minigames` anchored panel when `openSurface === "minigames"`. The separate `MinigameEventsScreen` adapter that also exists in `App.tsx` is not the component mounted by that route, so this article describes `PlayableMinigamesScreen`, not the dormant adapter.

The Minigames console button appears permanently at **100,000 lifetime baked cookies** through `areMinigameEventsUnlocked`. The mounted screen repeats the same threshold check before rendering its controls. Opening it keeps the main cookie surface and game tick loop in place behind the anchored panel.

The seeded scheduler chooses its next opportunity **6–12 minutes** ahead. Its **30-second clock is the incoming reveal window**: the notice becomes visible during the final 30 seconds before the scheduled start. It is not a 30-second round deadline, and a started board does not expire after 30 seconds. After the unlock, the empty panel also exposes a Start button for each of the five boards; only one board can be active or minimized at a time.

## Five boards in the mounted component

The mounted controls are narrower than the richer move helpers in `src/shared/game/minigames.ts`. `PlayableMinigamesScreen` writes validated whole-board updates with `minigameUpdate`, so the claims below stop at the controls that component actually exposes.

- **Klondike Solitaire · draw 3** shows the dealt seven-column tableau, face-up state, stock, and waste. Its controls draw three cards, recycle the waste when the stock empties, and attempt one waste-to-foundation move. The mounted screen does not expose tableau-to-tableau or tableau-to-foundation controls.
- **Memory Match** exposes all sixteen cards, accepts one reveal at a time, records matched pairs, and increments the attempt count after each pair.
- **Cookie 2048** exposes a 4×4 board and four direction buttons. The mounted helper compresses and merges a changed line, places the next `2` in the first empty cell, adds two points for the accepted move, records the best tile and move count, and marks a 2048 tile as a win.
- **Minesweeper** exposes an 8×8 board with ten persisted mines. A normal click reveals one cell and a context-menu action toggles a flag. The mounted screen does not wire the shared reducer's first-click relocation, flood reveal, or chord actions, so this article does not claim those interactions.
- **Breakout** is step-driven rather than a continuous animation. **Advance ball** applies one movement/bounce/brick/life step, and the left/right buttons move the paddle by a bounded increment. Bricks, score, lives, ball vector, and paddle position are persisted.

## Lifecycle and persistence

The mounted panel dispatches the persisted lifecycle directly:

- **Start** creates the selected seeded board when no active or minimized board exists.
- **Minimize** and **Resume** switch the persisted status without replacing the board data.
- **Restart** replaces the current board with a newly seeded initial board and resets its start/update timestamps.
- **Abandon** records the board id in the abandoned set and schedules the next opportunity.
- **Complete** records the board id in the completed set, passes grade `3`, awards the corresponding Golden Tokens, and schedules the next opportunity.

The same save JSON carries an optional `minigames` compatibility block containing the active board, schedule, Golden Token ledger, Lucky Chance state, and awarded reward ids. A missing or non-object block defaults each area to its empty state, preserving older saves without inventing minigame progress. This is an optional block in the same save, not a second save file.

## Golden Token sources

Every award is keyed by source and source id, so replaying the same source cannot mint the same award twice.

| Source | Mounted/domain amount | Duplicate key |
| --- | ---: | --- |
| Successful Oven Dial redemption | 1 | Golden-cookie spawn timestamp |
| **Complete** in `PlayableMinigamesScreen` | 3 | Board id plus completion timestamp |
| Newly unlocked achievement milestone | 1 per new achievement | Achievement id |
| **Claim today's objective** | 2 | Current UTC date |
| Rare chain | 2 | Completed-board count at each multiple of three |

With five distinct board ids, the reachable first rare-chain award is the third distinct completed board. Offline progress does not dispatch any of these award actions.

## Lucky Chance results

One draw costs one Golden Token. The draw uses a persisted draw count and a seeded five-slot pool:

| Reward id | Applied result |
| --- | --- |
| `cookie_bundle_small` | Adds 10,000 cookies. |
| `cookie_bundle_large` | Adds 100,000 cookies. |
| `timed_boost` | Starts a ×2 production effect for 15 minutes. |
| `raid_supplies` | Adds one `whack_pass` consumable. |
| `rare_cosmetic` | Records the reward id in the Lucky Chance reward history; this reducer applies no additional visual effect. |

Unclaimed rewards are selected before repeats. After every reward id has been claimed, the pool can return a duplicate result and still spends the token. When no Golden Token is available, the reducer returns the existing state without writing a result.

## Local checks and evidence boundary

The scoped checks for this documentation change are:

```powershell
node scripts/check-site.mjs
npx vitest run tests/completeness-inventory.test.ts tests/game/disclosure.test.ts tests/build-evidence.test.ts
```

`scripts/check-site.mjs` validates every static page, local link and anchor, responsive metadata, local-only resource rule, image description, and language annotation. The three focused test files cover the explicit site/document inventory and links, the 100,000-cookie disclosure, and the release-capture inventory contract. They do not exercise moves on the five mounted boards; no focused board interaction test exists at this base.

The release-capture inventory still marks `minigame-events`, `minigame-klondike`, `minigame-memory`, `minigame-2048`, `minigame-minesweeper`, and `minigame-breakout` as `pending`. No minigame record exists in `design/parity/evidence/promotion-inventory.json`, so there is no promoted reference/product receipt for this surface. Source mounting and passing local checks are not substitutes for built interaction, a real screenshot, or a promotion receipt.

Suggested articles: [Golden Cookie Events](golden-cookie-events.md), [Achievements](achievements.md), and [Prestige](prestige.md).

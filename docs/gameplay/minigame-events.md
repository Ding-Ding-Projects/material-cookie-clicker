# Minigame Events and Lucky Drawer

## Behavior

The mounted minigame panel unlocks permanently at 100,000 lifetime baked cookies. Mouse Raids
remain separate and unlock at 1,000,000 lifetime baked cookies. Both thresholds use preserved
lifetime production, so prestige does not remove either unlock.

After the minigame unlock, a seeded schedule selects an opportunity every 6–12 minutes. The
incoming notice appears only during the final 30 seconds. A scheduled opportunity never replaces
an active board, and the clicker, production, golden-cookie flow, and random events continue while
the panel is open. The panel supports minimize, resume, restart, abandon, and completion without
navigating away from the main game.

The five playable boards are:

- Klondike Solitaire with draw-three stock and persisted tableau, waste, foundation, and face-up
  state.
- Memory Match with persisted shuffled pairs, reveals, matches, and attempt count.
- Cookie 2048 with persisted directional moves, score, best tile, and win state.
- Minesweeper with persisted mine layout, reveals, flags, dimensions, and win/loss state.
- Breakout with persisted paddle, ball, bricks, score, lives, and pause state.

Golden Tokens use duplicate-protected source keys. Lucky Chance costs one token and selects one of
five equal reward slots: two cookie bundles, a timed boost, raid supplies, or a rare cosmetic. A
draw commits the deduction and result together; an unavailable token leaves state unchanged.

## Configuration

Thresholds and board rules live in `src/shared/game/minigames.ts`. The mounted React surface is
`src/renderer/screens/MinigamesScreen.tsx`; `src/renderer/App.tsx` opens it through the registered
`minigames` console surface in `src/renderer/game/console-panels.ts`.

Schedule, active-board, Golden Token, and Lucky Chance data are serialized by
`src/shared/game/save-codec.ts`. The schedule and board use the game's seeded random stream. No
setting shortens the shipped interval or creates offline token income.

## Failure modes

- A missing minigame sidecar is read as an empty suite so an older save remains usable.
- An incomplete or corrupt sidecar falls back to empty minigame state without discarding the
  ordinary game save.
- Scheduling is deferred while another minigame, random event, or waiting golden cookie owns the
  opportunity slot.
- A repeated Golden Token source key awards nothing a second time.
- A Lucky Chance action with no token writes no result and spends nothing.
- Closing or minimizing the panel must not pause cookie production.

## Security and privacy

Minigame state is local game data. It contains no credential and makes no network request. Board
state, token records, and Lucky Chance results remain in the same private local save boundary as
the rest of the game.

## Verification

The current source mounts `src/renderer/screens/MinigamesScreen.tsx` and wires its console route,
but no dedicated scheduling, board, button-interaction, Golden Token, or Lucky Chance test exists.
The v0.2.55 handoff records a full-suite run and a manual built-flow exercise; it does not provide a
machine-readable interaction receipt.

`src/renderer/App.tsx` still imports and defines an older `MinigameEventsScreen` adapter that is not
mounted. The completeness inventory does not cite it as implementation evidence, and completion
mode reports it until the obsolete adapter is removed from product source.

`scripts/release-capture-inventory.json` therefore keeps seven states pending: the dashboard, each
of the five playable boards, and Lucky Chance. This is an explicit focused-test and evidence gap,
not a claim that the mounted implementation is absent.

## Suggested articles

- [Golden Cookie Events](golden-cookie-events.md)
- [Achievements](achievements.md)
- [Prestige](prestige.md)
- [Cookie clicking](cookie-clicking.md)

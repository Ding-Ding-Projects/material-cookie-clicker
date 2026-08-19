# Prestige (ascend)

> **Status: shipped and verified.** Prestige calculation/reset, repeatable runs, the two-key gate,
> focused tests, packaged interaction, and built captures exist. The design file remains a
> reference rather than runtime evidence.

## What it does

Prestige ("ascend") resets the player's cookies and owned generators in exchange for a permanent
multiplier based on lifetime progress. Because it is irreversible and discards the player's current
run, it is gated behind this project's destructive-action super-confirmation contract rather than a
plain confirm dialog: `design/prestige-gate.html` specifies two independently operated key toggles,
a confirmation slider that stays disabled until both keys are on, an animated (but non-blocking)
progress fill as the slider moves, a distinct completion animation, and an always-available
Emergency exit control. The spec ships two live variants — an ordinary **prestige** (recoverable
in the sense that progress converts to a permanent bonus) and a **full wipe** (severe, more
destructive, and visually distinguished with the `error` colour role rather than `primary`).

## How it is configured

The permanent-multiplier formula is game-balance data. The gate's own behaviour is not configurable — softening a
destructive-action confirmation defeats its purpose — so this article does not describe any
user-facing setting for it.

## Failure modes

Failure modes mirror the general destructive-action contract: the slider must not be operable by keyboard focus alone without both
keys first being toggled, Escape and the Emergency exit must both cancel from any partial state
without applying the reset, and focus must return to the control that opened the gate afterward
(either on cancel or on completion) rather than being left stranded inside a closed dialog.

## Security considerations

Purely local; no network request. The gate is a user-experience safeguard against an accidental
irreversible action, not a security boundary — this project's toy-lock language elsewhere
("just for fun, never a security boundary") does not apply here specifically, since a
destructive-action super-confirmation gate is a documented mandatory contract for genuinely
irreversible actions, not a toy lock. The distinction matters for anyone maintaining this article:
do not merge the two concepts.

## Verification

`tests/game/prestige.test.ts` and `endless-progression.test.ts` cover calculation, reset, and
repeatability. `captures/app/prestige-gate.png` and `dialog-prestige.png` show the built UI.

## Suggested articles

- [Achievements](achievements.md)
- [The 21-tier generator ladder](generator-ladder.md)
- [Local history](../tools/local-history.md)
- [Material Design 3 appearance](../interface/material-design-appearance.md)

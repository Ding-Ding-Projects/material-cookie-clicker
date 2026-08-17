# Prestige (ascend)

> **Status: not built.** No prestige calculation, reset logic, or gate implementation exists in
> this repository. This article documents the specified destructive-action gate from
> `design/prestige-gate.html`.

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

Not configurable yet. Once built, the permanent-multiplier formula is the implementation's own
balance decision. The gate's own behaviour is not meant to be configurable at all — softening a
destructive-action confirmation defeats its purpose — so this article does not describe any
user-facing setting for it.

## Failure modes

Not applicable yet. Once built, the anticipated failure modes mirror this project's general
destructive-action contract: the slider must not be operable by keyboard focus alone without both
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

Not yet verifiable beyond opening `design/prestige-gate.html` directly in a browser, which renders
both the prestige and full-wipe variants through every gate state (untouched, one key, both keys,
partial slider, full slider, cancel, completion) against static sample data. There is no running
reset logic to test.

## Suggested articles

- [Achievements](achievements.md)
- [The 20-tier generator ladder](generator-ladder.md)
- [Local history](../tools/local-history.md)
- [Material Design 3 appearance](../interface/material-design-appearance.md)

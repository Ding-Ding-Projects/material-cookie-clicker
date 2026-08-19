# Endless Home construction

The Home begins with six authored rooms. Each still requires its blueprint, construction payment,
and real elapsed build time. Completing those rooms unlocks **Endless Extensions**; it does not end
the subgame.

## Repeatable floors

- The first extension costs 100,000,000 cookies and each later floor doubles in price.
- Construction uses the existing one-site, one-crew clock. It starts at thirty minutes and is
  bounded to one hour before furniture build-speed bonuses.
- Every completed floor adds 12 coziness and contributes a modest 2% production gain.
- `homeConstruction.extensionLevel` stores the unbounded count and survives save/reload and
  prestige. Older saves default to level zero.
- The interface always identifies the next floor and marks the sequence as infinite. There is no
  maximum extension level or final-completion state.

## The other endless loops

Cookie production uses arbitrary-magnitude values and repeated prestige has no terminal run.
Generator ownership is uncapped; Office Building explicitly records a null ownership cap. These
loops remain independent, so progressing one never silently completes another.

## Diesel Depot card

The shop-rail Diesel Depot status card has an accessible expand/collapse control. Its heading and
current tank amount remain visible while collapsed, `aria-expanded` reports the state, and the
preference persists in local application storage.

## Failure and recovery

A refused local-storage write leaves the Diesel Depot toggle usable for the current session. An old
save without `extensionLevel` loads as zero. Starting an extension while another room or extension
is being built is refused by the same one-site rule as every authored room.

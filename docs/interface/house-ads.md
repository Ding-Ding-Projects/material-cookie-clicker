# House ads

## Behavior

House ads are non-blocking, dismissible cards that promote the project's own real features — the
diesel factory, the tools tech tree, the changelog viewer, whatever else the game already ships.
Each card names one shipped feature, links to its in-app destination or its feature article, and
carries a close control. A dismissed card stays dismissed across reloads until the user resets
house ads in the Control Center. Nothing about a
house ad blocks input, steals focus, or interrupts an in-progress action; it behaves like any other
non-blocking notification under the project's own notification rules.

## Configuration

There is no third party in this feature: every card is authored content shipped inside the
repository, pointing at a real in-app surface or a real feature article, never at an external
advertiser, a tracking pixel, or a paid placement. Cards rotate from a fixed, bundled list; nothing
is fetched at runtime to decide which card to show. The Control Center provides a global on/off
switch, per-card enable/disable controls, bulk selection actions, export, and reset. The house-ad surface obeys the same language
modes and funny-level styling as the rest of the interface — the promoted feature and its
destination stay factual at every level, only the surrounding voice changes.

## Failure modes

If the bundled card list is empty or malformed, no card is shown; a missing promotion is not an
error a player needs to see. A card whose destination has been removed or renamed is a documentation
defect to fix, not a runtime failure to hide behind a broken link.

## Security and privacy

No network request of any kind: no ad network, no CDN, no analytics, no tracking, no impression
count sent anywhere. Nothing costs the player money — this is a promotion for a feature already
included in the same free, unsigned build, never a purchase prompt. Dismissal state stays in local
application storage only.

## Verification

`tests/site-house-ads.test.ts` checks the bundled catalogue, local-only behavior, linked targets,
Lang gui surface tokens, metadata, and documentation contract. `scripts/check-site.mjs` validates
the complete static site. See the [per-surface inventory](../completeness.md) for the remaining
built-site interaction and capture evidence gap.

## Suggested articles

- [Notification centre](../tools/notification-centre.md)
- [Tools tech tree](../tools/tools-tech-tree.md)
- [Settings surface](settings-surface.md)

# Tabbed navigation

## Behavior

The full contract provides browser-style tabs dockable left/right/top/bottom, overflow, reorder,
pinning, groups, four discovery searches, bulk close, appearance editing, and persisted structure.

## Configuration

Left is the default edge. Orientation changes keyboard axes; narrow side strips collapse rather
than rotating labels or clipping content.

## Failure modes

The desktop uses modal destination navigation and only ships reusable tab logic. The site has a
partial tab implementation without complete group/search/appearance evidence.

## Security and privacy

Locked and unsaved tabs retain their protections through search, bulk close, and restore.

## Verification

No current built capture proves the complete desktop or site contract. Test all four edges,
keyboard axes, groups, pins, searches, persistence, bilingual labels, and scale variants.

## Suggested articles

- [Command palette](../tools/command-palette.md)
- [Settings surface](settings-surface.md)

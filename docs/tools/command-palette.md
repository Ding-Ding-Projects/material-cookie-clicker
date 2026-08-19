# Command palette

## Behavior

The required palette opens with `Ctrl+Shift+F`, searches every destination, article, command,
setting, and appearance control, and teleports to the exact result. Setting rows use live controls.

## Configuration

The palette has bounded-card and full-window sizes, with persisted size and plain-text search as the
default. Regex mode comes from the adjacent full builder.

## Failure modes

The desktop baseline contains only a reusable command registry; it has no user-facing palette.
The site palette is partial and does not prove exhaustive rich-result coverage.

## Security and privacy

Queries stay local. Palette actions must not bypass locks, destructive confirmation, or ordinary
authorization checks.

## Verification

No desktop built interaction or capture satisfies this feature at v0.2.55. The completeness matrix
therefore records logic-only/partial states.

## Suggested articles

- [Regex builder](regex-builder.md)
- [Tabbed navigation](../interface/tabbed-navigation.md)

# Keyboard and screen-reader operation

## Behavior

Every action is keyboard reachable with visible focus and exposes correct names, roles, values,
states, shortcuts, result counts, and live announcements.

## Configuration

Focus returns to opening controls after dialogs/overlays. Vertical tab strips use up/down keys;
horizontal strips use left/right.

## Failure modes

Existing screens use native controls and labels, but there is no current complete per-surface
keyboard/screen-reader matrix. Several language-mode accessible names remain known gaps.

## Security and privacy

Assistive labels must not reveal secrets, hidden data, or private paths.

## Verification

Require keyboard-only built interactions and screen-reader inspection at normal/narrow widths and
100/125/150/200% scale. Current captures alone do not prove this.

## Suggested articles

- [Contrast and reduced motion](contrast-and-reduced-motion.md)
- [Tabbed navigation](../interface/tabbed-navigation.md)

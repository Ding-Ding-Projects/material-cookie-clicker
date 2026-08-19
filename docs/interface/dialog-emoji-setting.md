# Dialog emoji setting

## Behavior

Every app/page needs a persisted “Show emojis in dialogs and message boxes” toggle. Emoji is
non-semantic decoration in dialog copy, never in button/field labels or accessible names.

## Configuration

The toggle is localized, searchable, keyboard-accessible, and persists independently of language
or funny level.

## Failure modes

Neither baseline surface implements the complete toggle. Existing emoji cannot be treated as proof
of user control.

## Security and privacy

The setting stores one local boolean and no content or telemetry.

## Verification

Require on/off persistence, all language modes, narrow layout, and accessible-name invariance.

## Suggested articles

- [Notification centre](../tools/notification-centre.md)
- [Language modes](../localization/language-modes.md)

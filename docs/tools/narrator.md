# Narrator

## Behavior

Narration is off by default, serialized without overlap, and selectable as English, Cantonese, or
both. Each language has its own installed-voice picker plus automatic selection, rate, and pitch.

## Configuration

Voice identity, rate, pitch, language, and enabled state persist. Late voice enumeration must update
the picker and missing selected voices remain selected while falling back honestly.

## Failure modes

The desktop currently narrates a limited set of Home events and has no complete settings surface,
voice picker, or site equivalent.

## Security and privacy

Narration yields to assistive technology and respects quiet/reduced-sound settings. No spoken queue
may leak secrets.

## Verification

`tests/game/narration-home.test.ts` covers the limited implementation. Full voice and accessibility
matrices remain pending.

## Suggested articles

- [Language modes](../localization/language-modes.md)
- [Keyboard and screen reader](../accessibility/keyboard-and-screen-reader.md)

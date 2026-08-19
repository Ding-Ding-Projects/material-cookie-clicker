# Authenticator and toy locks

## Behavior

The complete feature pairs TOTP through an in-process QR code, stores arbitrary authenticator
entries, shows current/next codes and countdowns, and lets each element/tab/property own an
independent password or TOTP toy lock.

## Configuration

TOTP supports SHA-1, SHA-256, SHA-512, 6–8 digits, and arbitrary periods. Unlock duration is per
surface, timed, or until application close.

## Failure modes

At v0.2.55 only framework-neutral TOTP, QR, and lock logic exists. There is no desktop or site
authenticator UI, credential-vault integration, or built interaction.

## Security and privacy

Secrets belong in the operating-system credential vault and never in settings, Git history, logs,
captures, or ordinary exports. Site equivalents use local browser storage and must state the weaker
boundary.

## Verification

The RFC algorithm is covered by `packages/surface-kernel/test/totp-rfc6238.test.ts`; that does not
prove a usable surface.

## Suggested articles

- [Unlock ladder](unlock-ladder.md)
- [Support Tickets](support-tickets.md)

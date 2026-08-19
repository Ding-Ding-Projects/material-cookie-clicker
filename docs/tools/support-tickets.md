# Support Tickets

## Behavior

The fictional local support desk creates a local ticket, advances canned statuses, and resolves by
opening the exact application-data folder so the user can delete it themselves.

## Configuration

Category, description, local ticket number, severity, status, and local list state are configurable.
The disclosure that nothing is sent and nobody is reading is invariant.

## Failure modes

Kernel ticket data exists, but no desktop or site UI routes to it. It never deletes application data
on the user's behalf.

## Security and privacy

No network call, analytics, real support branding, or human response-time claim is permitted.

## Verification

Require routes from unlock/help/settings, local create/list/advance, exact folder opening, no-network
proof, and confirmation that no in-app delete bypass exists.

## Suggested articles

- [Unlock ladder](unlock-ladder.md)
- [Local history](local-history.md)

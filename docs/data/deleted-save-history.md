# Deleted save history

Deleting save progress never destroys it. Every deletion commits the save to a local Git
repository beside the application's own data, and it can always be restored — for half of what
that save produced per second.

## What happens when a save is deleted

The destructive-action gate on the Prestige screen still confirms the deletion the same way, with
its two keys and its slider. What changed is what the gate does and what it says:

1. The live save is encoded and handed to the main process.
2. The main process commits it to `<userData>/save-history`, a bare Git repository.
3. Only then is the save cleared and the game replaced with a fresh state.

The order matters. Once the browser storage is cleared the bytes are unrecoverable, so an archive
attempted afterwards would have nothing to keep.

A failed archive does not block the deletion the player asked for — silently refusing to delete
would be its own defect — but the completion message says which of the two actually happened. It
reads "kept in local history" only when there is genuinely something to restore, and says plainly
that it could **not** be written otherwise.

## What restoring costs

**Half of what the archived save produced per second**, floored to a whole cookie.

The price is charged against the save being restored, not against whatever the player is holding
now. That is the only reading that always works: the current run is usually a fresh one with
nothing in it, so billing the current balance would either make the restore free or make it
impossible, and neither is a price.

It is deliberately a fraction of *production* rather than of the balance:

| Archived save | Cost to restore |
|---|---|
| No generators yet | Nothing — it comes back whole |
| 1,000 cookies per second | 500 cookies |
| Everything reinvested, empty balance | Its full half, arriving at zero rather than being refused |

A save whose production outruns its balance is still restorable and simply arrives empty. Refusing
it would break the one promise the feature makes, which is that a deleted save can always come
back.

The cost shown on the restore button and the cost actually charged come from one call to one
function (`saveRestoreCost`), computed in the main process and carried on the record. Two
independent calculations of a price is how a button comes to advertise something the transaction
does not honour.

## Where it lives, and how to reset it

`<userData>/save-history`, a **bare** Git repository:

- It is never inside a folder the player owns.
- Nothing is ever uploaded, pushed, or synchronised. It is local to that one computer.
- Deleting the application data folder removes it, exactly like every other local store here.

## Why it writes Git objects directly

The application has four runtime dependencies, and shipping a fifth to write three object types is
a poor trade. Shelling out to the system `git` is worse: a player's machine may not have it, and a
history feature that silently does nothing on a machine without Git is precisely the
wired-at-one-end defect this project has been bitten by before.

Git's loose-object format is small and completely specified — a zlib-deflated
`<type> <length>\0<payload>` addressed by the SHA-1 of the uncompressed bytes — so
`src/main/save-history.ts` writes it with `node:zlib` and `node:crypto` and nothing else.

That is only worth doing if the result is a genuine repository, which is why the test runs the real
Git CLI against what the store produced: `git log`, `git cat-file` and `git fsck` all read it. A
private format could have passed every other assertion while being subtly wrong.

## Failure modes

| Situation | What happens |
|---|---|
| Archive refused or throws | The deletion still completes; the message says the save could not be kept |
| Save fails validation | It is not archived at all, rather than archived unreadable |
| An archived save no longer decodes | Still listed, with its restore button disabled and the reason shown |
| A malformed id reaches the read channel | Rejected before it is joined into any path |
| Save history unavailable in this build | The surface says so instead of showing an empty list |

An entry that cannot be decoded is deliberately still listed. Hiding it would misrepresent what the
history actually holds.

## Verification

- `tests/main/save-history.test.ts` — the object store, including the real-Git-CLI validation and a
  reopen-and-append case. The CLI assertions skip honestly when Git is absent, since Git is a
  development tool and not a runtime dependency of the game.
- `tests/game/save-history-cost.test.ts` — the price: exactly half, floored, charged against the
  archived save, zero for a save that produced nothing, and clamped for one that outruns its balance.
- Driven against the built artifact through the cheap headless route: archive, list, cost, and read
  back, then `git log` / `git cat-file` / `git fsck` run against the repository the running
  application actually wrote.

## Suggested articles

- [Local version history](local-version-history.md) — the same Git-backed idea applied to settings
  and other user-managed records.
- [Exports and privacy](exports-and-privacy.md) — what leaves the machine, which in this case is
  nothing.
- [Offline and no-network behaviour](offline-and-no-network.md) — why none of this needs a network.

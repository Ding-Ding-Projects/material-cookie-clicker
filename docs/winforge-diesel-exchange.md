# The diesel voucher exchange

Two separate Windows applications, one small file between them.

**Material Cookie Clicker** is a cookie-clicker game. **WinForge** is a Windows control centre
that includes a pressurised-water-reactor simulator; that simulator runs two emergency diesel
generators — the design-basis "10-second diesel" that has to reach rated voltage and frequency
ten seconds after a start signal. Diesel generators need diesel. This document is the agreement
that lets a cookie-clicker player buy some.

The game spends cookies and writes a voucher. WinForge reads the vouchers and, when it is built
to, marks them used. Neither application calls the other, neither needs the other to be running,
and neither needs the other installed. The whole contract is a JSON file on the same machine.

## Status, plainly

The cookie side of this contract is built and shipped: the game mints vouchers into the file
described below. **The WinForge side is not built.** Nothing has ever read this file, and no
voucher has ever been consumed. The game's Diesel Depot card says so on screen rather than
showing a zero that could be mistaken for "delivered and burned". This document exists so the
WinForge half can be written, in the WinForge repository, against a format that already exists
and already has files in it to test with.

## Where the file lives

```
%APPDATA%\DingDingProjects\exchange\diesel-vouchers.json
```

`%APPDATA%` is the roaming application-data directory for the signed-in user — the same
directory Electron returns from `app.getPath('appData')` and .NET returns from
`Environment.GetFolderPath(SpecialFolder.ApplicationData)`. It is per-user, which is deliberate:
one player's cookies buy one player's diesel.

Neither application owns the directory. Either may create it. A missing file is not an error and
not a fault — it means nobody has minted a voucher yet, and it should be read as an empty
ledger.

## What the file contains

```json
{
  "schemaVersion": 1,
  "vouchers": [
    {
      "id": "0b1f6e64-6d5d-4e8f-9d54-0a67b2f5a1c2",
      "mintedAt": "2026-08-16T09:41:07.512Z",
      "litres": 1,
      "cookiesSpent": "1000",
      "consumedAt": null
    }
  ]
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | integer | Currently `1`. A reader that finds a **higher** number must refuse the file rather than guess, exactly as it would refuse a save from a newer build. |
| `vouchers` | array | Append-only, in minting order. |
| `id` | string | Unique across the file. A UUID in practice. A reader must never renumber or reorder. |
| `mintedAt` | string | ISO-8601 UTC instant, stamped by the process that minted the voucher — the game's main process, from its own clock, never from a window script. |
| `litres` | integer | Litres of diesel this voucher is worth. Always positive and whole. |
| `cookiesSpent` | string | What the player paid, as a decimal (`"1000"`) or scientific (`"1.234560e21"`) string. A **string** because the cookie economy outgrows a JSON number within an ordinary session. It is a receipt: no consumer needs to do arithmetic on it. |
| `consumedAt` | string or null | `null` until WinForge consumes the voucher; then WinForge's own ISO-8601 instant. |

## Who is allowed to do what

**Material Cookie Clicker may:** append a voucher, and read the file.

**Material Cookie Clicker may never:** set `consumedAt`, remove a voucher, reorder vouchers,
edit a voucher after writing it, or write the file when it could not first parse what was
already there. There is no method in the cookie-side code that sets `consumedAt`; the omission
is enforced by the code's shape, not by a comment.

**WinForge may:** read the file, and set `consumedAt` on vouchers it has actually consumed.

**WinForge should not:** delete vouchers or rewrite history. The file is a ledger, and a ledger
that can forget is not evidence of anything.

## How to write it safely

Both sides write the **whole file** through a temporary file and a single rename:

1. read and parse the existing file (a missing file is an empty ledger);
2. if it does not parse, **stop** — preserve it and report the problem, never overwrite it;
3. apply the change in memory (append a voucher, or stamp a `consumedAt`);
4. serialise the whole ledger as UTF-8, two-space-indented JSON with a trailing newline;
5. write it to a temporary file in the same directory;
6. `rename` the temporary file over the real one.

Rename is atomic on Windows (`MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`), so a crash or a
power cut leaves either the previous ledger or the new one, never half a file.

Because step 1 happens on every write, the read-modify-write window is short but not zero. If
both applications write in the same instant, one write can be lost. That is accepted: this is a
single-user hobby exchange between two applications a person runs at their desk, not a
transaction log. If it ever needs to be stronger, the next step is a lock file beside the
ledger — not a database.

## The price a player pays

The first litre costs **1,000 cookies**, and every litre already minted makes the next one
**15% dearer** — the same 1.15 growth ratio the game's generator tiers use, so the depot reads
as one more rung of an economy the player already understands.

| Lifetime litres minted | Price of the next litre | Total spent to get there |
| ---: | ---: | ---: |
| 0 | 1,000 | 0 |
| 1 | 1,150 | 1,000 |
| 5 | 2,011 | 6,742 |
| 10 | 4,046 | 20,304 |
| 25 | 32,919 | 212,793 |
| 50 | 1,083,657 | 7,217,716 |
| 100 | 1,174,313,451 | 7,828,749,670 |

Diesel is therefore a real cookie sink at every stage of a run rather than a rounding error by
mid-game, and a hundred litres is a genuine project. The curve is over *lifetime* litres minted,
not litres held: a voucher leaves the game for good the moment it is written, and there is
nothing to sell back.

The depot is not on screen at the start of a run. It arrives with a **Fuel Contract** upgrade
(500 cookies), which itself requires the **Shop Sign** — the depot lives in the shop rail's
footer, so there has to be a rail first.

## What the game does NOT claim

The Diesel Depot card shows three separate things and keeps them separate:

- **litres minted** — from the game's own save;
- **vouchers minted** — counted from the ledger file itself;
- **consumed by WinForge** — counted from `consumedAt` fields in that same file, which only
  WinForge ever writes. While no WinForge reader exists, this reads "none yet — WinForge has not
  read the ledger", with the reason attached.

Deleting all the game's save data does **not** delete the ledger. The vouchers were sold; they
are not the game's to take back, and WinForge may be about to read them.

## Building the WinForge side

Everything a consumer needs is above. In short: read the file (missing means empty), refuse a
`schemaVersion` above 1, take the vouchers whose `consumedAt` is `null` in order, do whatever
the simulator should do with `litres` litres of diesel, and write back the same file with
`consumedAt` stamped on exactly the ones consumed — through the temp-and-rename dance in step 5
and 6 above. Nothing in the cookie-side application needs to change for that to work.

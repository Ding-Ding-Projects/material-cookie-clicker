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
| `cookiesSpent` | string | What these litres cost the player, as a decimal (`"1000"`) or scientific (`"1.234560e21"`) string. A **string** because the cookie economy outgrows a JSON number within an ordinary session. It is a receipt: no consumer needs to do arithmetic on it. See *A clarification to `cookiesSpent`* below — the field's type, name and meaning are unchanged at version 1, but where the number comes from has changed. |
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

## A clarification to `cookiesSpent` (still schema version 1)

An earlier build of the game sold litres directly: press a button, a thousand cookies vanish, a
litre exists. `cookiesSpent` was that price, and nothing else.

The game does not work that way any more. Diesel is **manufactured** now, by a small refinery
the player builds and runs (see the section below). Cookies never buy a litre; they buy the
plant. So the honest question a voucher's cookie figure answers is no longer *what did you pay
at the counter* — nobody pays anything at the counter — but *what did these litres cost to
make*. The game answers it by amortization:

```
cookiesSpent = cookies spent on the plant x (litres on this voucher / litres the plant has ever made)
```

**Nothing in the format changes.** The field is still present, still a string, still a decimal or
scientific figure, still a receipt no reader has to do arithmetic on. `schemaVersion` stays at
`1` and a WinForge reader written against the table above needs no change of any kind. This
section exists so that a reader who compares two vouchers and finds the figures do not follow a
neat 1.15 curve any more knows why: the number is an attribution of build cost, not a price.

A consequence worth stating plainly: the figure can be **`"0"`**. A player who has built nothing
and shipped nothing cannot ship at all, but a player whose plant was a gift of a save-file edit,
or whose lifetime production is enormous relative to a small shipment, can legitimately produce
a voucher whose amortized share rounds to zero. Zero is a true statement about attribution, not
a missing value, and readers must accept it.

## The game side: where the litres come from

The whole cookie-side economy of diesel now lives in `src/shared/game/diesel-factory.ts`. It is
a four-stage production line, ticking on the same wall clock as the rest of the game:

```
wells / importers  ->  refining units  ->  storage tanks  ->  the depot ships vouchers
     (crude)            (crude -> litres)     (finite)          (draws the tanks down)
```

Every stage can stall, and stalls honestly. A refinery with no crude refines nothing. A refinery
with a full tank in front of it refines nothing either, and the crude it would have used stays
in the yard. The depot cannot ship a litre the tanks do not hold.

### The rate curve

| Equipment | Cost of the first | Growth | What one unit does |
| --- | ---: | ---: | --- |
| Crude Well | 2,000 | x1.15 | +0.05 barrels/sec |
| Crude Importer | 24,000 | x1.15 | +0.5 barrels/sec |
| Refinery Still | 8,000 | x1.15 | +0.02 litres/sec of refining throughput |
| Catalytic Cracker | 120,000 | x1.15 | +0.2 litres/sec |
| Storage Tank | 5,000 | x1.15 | +25 litres of tank, +50 barrels of yard |
| Transfer Pump | 40,000 | x1.15 | +8% refining throughput, on every refining unit |

Every line grows **1.15 a unit** — the same house ratio the generator ladder and the old litre
curve both used, so the factory shop reads without being taught anything new. A bulk purchase is
summed as a geometric series, so ten units bought at once cost exactly what ten units bought one
at a time would.

Conversion starts at **2.5 barrels of crude per litre** of diesel. Storage starts at a
**10-litre drum** and a **20-barrel hardstanding**, before a single tank is bought.

Those numbers are chosen so the first two purchases teach the mechanic by themselves: **one well
feeds exactly one still** (0.05 barrels/sec produced against 0.02 x 2.5 = 0.05 barrels/sec
demanded), and one importer feeds exactly one cracker. Buy wells alone and the yard backs up to
its cap; buy stills alone and they idle. A balanced pair makes a litre every fifty seconds.

Note that a *fresh* floor runs out of **yard** before it runs out of **drum**: twenty barrels is
eight litres, and the drum holds ten. That is why the first Storage Tank raises both numbers at
once, and it is why the tank is the cheapest thing on the list after the well.

### The upgrade tree

Fourteen factory upgrades in four branches, each bought with cookies through the same reducer
seam as everything else in the game, and each offered only once the plant it improves is
actually running:

- **Throughput** (5) — Wider Bore, Deep Drilling and Pipeline Spur on the intake side; Hot Feed
  and Continuous Run on the refining side.
- **Efficiency** (3) — Trayed Column (x0.85), Vacuum Distillation (x0.8) and Hydrocracking
  (x0.75) on the barrels-per-litre figure. This is the only branch that makes an existing line
  cheaper to run rather than bigger.
- **Capacity** (3) — Bunded Bay (x1.5), Floating Roof (x2) and Tank Farm (x3) on both the tank
  and the yard.
- **Automation** (3) — Depot Telemetry ships when a tank is completely full, Dispatch Desk at
  half a tank, Night Shift at a quarter. Automation is bought *and* then switched on by the
  player; buying it never starts it.

The factory is not on screen at the start of a run. It arrives with the same **Fuel Contract**
upgrade (500 cookies) that used to reveal the depot, which itself requires the **Shop Sign** —
signing a contract to supply WinForge is what gives you a reason to build a refinery. Buying
that upgrade grants a *surface*, never a piece of equipment: the floor starts bare.

## What the game does NOT claim

The Diesel Depot card shows three separate things and keeps them separate:

- **litres shipped** — from the game's own save, and never more than the tanks really held;
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

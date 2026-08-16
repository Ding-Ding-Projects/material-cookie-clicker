# Captures

Real screenshots of real things. Every image here was taken from something that
was actually running on this machine — never a mockup, never a design file,
never a hand-edited image. Where a surface has not been captured yet, this file
says so rather than leaving a gap that reads as an oversight.

## How these were taken

Through an off-screen Windows desktop, so nothing appeared on anyone's visible
screen and no window stole focus. The application is launched directly onto that
desktop, its window is resolved **by title and class** from the desktop's window
list, and that specific window is captured.

Resolving by index would not work: one Electron process listed **thirteen**
top-level windows, of which twelve were input-method, tooltip, power-message and
UAC-indicator helpers. The application window is the `Chrome_WidgetWin_1` with a
non-empty title and non-zero dimensions.

Every capture is opened and looked at afterwards. A capture tool reporting that
a render succeeded is the tool's claim about itself, not evidence about the
pixels.

## `app/` — the built application

| File | What it shows | Commit |
| --- | --- | --- |
| `launch-shell.png` | The application launched from the real build: window opens, product name correct, theme surface rendering, custom title bar rather than the operating system's default. | `37c967b` |
| `diesel-depot.png` | The Diesel Depot in the shop rail's footer, one litre after minting: litres and vouchers both at 1, the price already risen to 1.15 thousand for the next litre, and the consumption line reading "none yet — WinForge has not read the ledger". The voucher this press wrote was checked on disk at `%APPDATA%\DingDingProjects\exchange\diesel-vouchers.json`. | this commit |

**How the diesel capture was set up.** It ran from the built `dist/` on an
off-screen desktop with a fresh, throwaway user-data directory, so the run
started from a genuinely empty save. Reaching a Diesel Depot purchase by hand
means about 1,600 clicks, which is not a thing to automate into a screenshot, so
the run was given a starting balance of 5,000 cookies: a save in the
application's own format, written into the profile's `localStorage` (where this
build persists) through the running app's own devtools connection, then loaded
by the app normally. Nothing else was seeded — the Shop Sign, the Upgrade
Catalogue and the Fuel Contract were all bought by clicking their real tickets,
and the mint was a real press of the real button.

**This is the shell, not the game.** The body reads "The cookie-clicker game
surface mounts here" because at that commit it genuinely did — the screens lane
had not landed. It is kept as an honest baseline of the first successful launch,
not passed off as the finished interface.

## `design/` — the design system

Captured from the spec files in `design/`, rendered in a browser on the same
off-screen desktop.

| File | What it shows |
| --- | --- |
| `cookie-surface.png` | The primary click target at rest, hover, pressed, focus-visible and reduced-motion. The cookie and its chocolate-chip texture are layered CSS radial gradients, not an image asset. Depth is a solid offset shadow that compresses flat when pressed. |
| `tool-card.png` | All four tool states — undiscovered, discovered-and-locked, ready-to-unlock, and unlocked — each carrying its **Always available** callout. |

`tool-card.png` is the one worth actually looking at, because it is the image
that proves the product's central contract is legible rather than merely
implemented. Unlocking a tool buys a **gameplay bonus** and its in-game
surfacing; it never buys or gates the application feature. A player who never
unlocks the Regex Builder tool still has the entire regex builder.

That is easy to state and easy to misread, and a chunky padlock beside a price
makes it easier still — so the "Always available" action sits in its own
bordered callout, deliberately separated from the lock chrome above it, and
appears **identically** on an undiscovered card and a fully unlocked one. It is
never greyed out and never hidden behind the silhouette.

## Not captured yet

- The six game destinations and the tools shop, in the running application.
- The settings surfaces, the command palette, and the appearance editor.
- Dark theme in the built application. The design specs carry both schemes and
  all 46 role pairs are contrast-verified, but the application itself has only
  been photographed in light.
- Narrow widths and high display scales.

These are gaps in evidence, not features known to be broken. Nobody has looked.

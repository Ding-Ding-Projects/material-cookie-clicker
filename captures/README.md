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

### The current set

Nine images, all taken in one session from the same build, and all of them
opened and looked at afterwards. This is the set the README table and the
documentation site's capture matrix both point at; everything below it in this
file is older evidence from earlier lanes, kept for the record.

| File | What it shows |
| --- | --- |
| `fresh-start.png` | A genuinely fresh profile. One `COOKIES` plate reading 0, the cookie alone in an empty cabinet panel, and nothing else — no shop rail, no upgrade strip, no console emblems, no navigation. This is what progressive disclosure looks like at its starting point. |
| `shop-revealed.png` | The same run after twelve real clicks on the cookie and one real press of the Shop Sign discovery ticket. The `SHOP` rail has docked, carrying a single Cursor row and one padlocked `???` rung; the Achievements and Tools console emblems arrived on their own progress. Still no upgrade strip. |
| `game-progressed.png` | The full surface: three HUD plates, all four console emblems, the cookie hero with its per-second and hold-to-click lines, the `UPGRADES` strip at 6 / 79, the shop rail, and the Diesel Depot docked as the rail's footer. |
| `game-dark.png` | The same surface in the dark "arcade night" theme. |
| `dialog-achievements.png` `dialog-tools.png` `dialog-statistics.png` `dialog-prestige.png` | Each of the four anchored dialogs, open over the dimmed game surface and pointed at the console emblem that opened it: 15 / 100 achievements, 9 / 20 tools, ten stat tiles, and the ascension projection below the trillion-cookie threshold. |
| `diesel-mint.png` | **Superseded — see the diesel factory set below.** One frame of the Diesel Depot's mint animation, from the build where cookies bought litres outright: the can pouring, the nozzle sweeping in behind it, a ghosted `14` rolling up under the litres figure, and the printed slip carrying `ed2d41c7` — a voucher identifier that really is in `%APPDATA%\DingDingProjects\exchange\diesel-vouchers.json`. |

**How this set was taken.** From the built `dist/`, launched by the real
`electron` binary onto an off-screen Windows desktop named `CaptureRefresh`,
with `--remote-debugging-port` so the run could be driven and a throwaway
`--user-data-dir` so it started from an empty save. The window was maximised
through the application's own title-bar API (2582x1550 device pixels at 144 DPI)
and every image is a Win32 `PrintWindow` capture of that one window, resolved by
title and class from the desktop's window list.

`fresh-start.png` and `shop-revealed.png` are one unseeded run: the twelve clicks
and the Shop Sign purchase were real presses of the real controls.

The other seven come from a second run given a starting balance — a save in the
application's own format carrying 5 billion cookies, the same lifetime figure and
nothing else, written into the profile's `localStorage` over the running app's
own devtools connection and then loaded normally. Everything visible past that
balance was bought through the interface: the four reveal upgrades, two global
upgrades, the generators down to Shipment, and every diesel mint. The
achievements and the console emblems unlocked themselves off that lifetime total.

Toasts queue, and a stale one lying across the shop rail would misrepresent the
layout, so each capture waited until the milestone region was empty before the
shutter. The dialog captures also wait several seconds after opening: a
`PrintWindow` taken during the open animation comes back with a blank rectangle
where the panel should be, and one such frame was discarded rather than shipped.

**The one alteration.** `game-dark.png` needed `data-theme="dark"` added to the
`<html>` element of `dist/renderer/index.html`, because the application otherwise
follows the operating system's colour scheme and this desktop is light. The file
was restored from a backup immediately afterwards. Nothing else in this set was
patched, retouched or composed.

### The diesel factory set

Three images from one session on the off-screen desktop `FactoryCapture`, all
opened and looked at afterwards. They replace the evidence for a mechanic that
no longer exists: the older `diesel-mint.png` above shows the build where cookies
bought litres outright, and diesel is manufactured now.

| File | What it shows |
| --- | --- |
| `factory-floor.png` | The Diesel Factory panel with the line **running**. Three stations joined by animated pipes — a nodding-donkey derrick pulling 3.75 barrels a second, three fractionating columns achieving 1.00 of their rated 1.00 litres a second, and two tank gauges reading 63.2 of 85 litres. Fifty wells, fifty refinery stills, three storage tanks and two factory upgrades, every one bought by a real press of a real button. |
| `factory-stalled.png` | The same panel a minute later, **stalled**. The tanks reached 85 of 85 litres, so refining stopped and the refining readout dropped to `0 / 1.00 L/s` while the rating stayed where it was; the yard filled behind it, so intake stopped too. All three stations carry the stall border and the status line names both reasons. This is the honest-halt behaviour, photographed rather than asserted. |
| `factory-ship.png` | The WinForge shipping station after a real press of Ship. Four figures that answer four different questions and are kept apart: ready to ship 31 L (the game's number), litres shipped 510 L (the game's number), vouchers minted 85 (counted from the ledger **file**), consumed by WinForge 76 (counted from `consumedAt` fields only WinForge writes). Below it the equipment shop's Crude Well row at 50 owned. |

**How this set was taken.** From the built `dist/`, launched by the real
`electron` binary onto an off-screen Windows desktop named `FactoryCapture`,
with `--remote-debugging-port` so the run could be driven and a throwaway
`--user-data-dir` so it started from an empty save. The window was maximised
through the application's own title-bar API (2582x1550 device pixels at 144 DPI)
and every image is a Win32 `PrintWindow` capture of that one window, resolved by
title and class from the desktop's window list.

The run was given a starting balance — a save in the application's own format
carrying 5 billion cookies and nothing else, written into the profile's
`localStorage` over the running app's own devtools connection and then loaded
normally. **Everything past that balance was bought through the interface**: the
four reveal upgrades (Shop Sign, Upgrade Catalogue, Steady Hand, Fuel Contract)
on their discovery tickets, then fifty Crude Wells, fifty Refinery Stills, three
Storage Tanks, and the Wider Bore, Trayed Column and Depot Telemetry upgrades —
each one a mouse-down/mouse-up posted to the window at the control's real
coordinates. No equipment and no upgrade was written into the save.

**The shipments are real, and they prove the point.** Six vouchers were written
to `%APPDATA%\DingDingProjects\exchange\diesel-vouchers.json` during this run,
and every single one carries **exactly 85 litres** — the tank's full capacity —
because that is all the tanks ever held. The old depot could mint any number of
litres the player could afford; this one cannot exceed what was manufactured.
The `cookiesSpent` figure falls across the six (72.2M, then 24.0M, 18.1M, 14.5M,
12.1M) exactly as amortization over a growing lifetime production predicts.

One thing found by looking rather than by testing: the first pass of this panel
sat frozen at `0.0 / 85 L` while the save underneath it really was filling,
because the factory rode on the store's `fast` slice and a player with a
refinery and no generators has a static cookie count. The factory has its own
store slice now, and these captures are from the fixed build.

### The manual-purchase set

Three images from one run on a fresh profile, taken after the lane that made
every unlock a purchase. Every cookie in them was earned by real clicks posted
to the window, and every purchase in them was a real press of a real button.

| File | What it shows |
| --- | --- |
| `manual-hold-proof.png` | Hold-to-click actually working. The window received exactly ONE button-down, held for five seconds, and one button-up at the end; this frame is from the middle of that hold, and the `COOKIES` plate has gone from 77 to 100 with no individual presses in between. The toast beside it reads `Tool discovered: Command Palette · 發現工具：指令面板` — the honest new wording, because discovering a tool grants nothing. |
| `manual-prices.png` | Literal prices. The Cursor row's buy button reads `Buy · 買 — 🍪 1,232`, not "1.2 thousand", and the HUD plate reads `992.45` rather than a rounded word that used to run past the bevel. |
| `manual-tools-discovered.png` | The Tools panel on that same run, reading `0 / 20 TOOLS UNLOCKED` even though several tools have been discovered by play. Nothing in the tree switches itself on. |

### The settings set

Four images from one session on the off-screen desktop `SettingsCapture`, each
opened and looked at afterwards, taken from the built `dist/` launched by the
real `electron` binary against a throwaway `--user-data-dir` so the save really
was empty.

| File | What it shows |
| --- | --- |
| `settings-fresh.png` | A brand-new profile with exactly one console button on the cabinet: the Settings gear. The four game emblems are all still unearned, which is the point — Settings is an application surface and is never gated by progress. |
| `settings-dialog.png` | The Settings panel open as an anchored dialog over the dimmed game surface: the language-mode segmented switch with Bilingual pressed, and the top of the two funny-level cards under the "two separate controls" warning. |
| `settings-sliders.png` | The two funny sliders in full, with the English one moved to 1 by keyboard while the Cantonese one stayed at 3 — the independence rule, demonstrated rather than asserted — plus the honest note that no copy varies by level yet. The focus ring on the English slider is real keyboard focus. |
| `settings-yue.png` | The same window in Cantonese-only mode. The HUD label, the console button label, the panel heading and every line of the panel's own copy are Cantonese with no English beside them. |

Not shown by this set: Settings opened from a progressed save (the game emblems
beside the gear), and Settings reached from a tool card's "Open it now", which
needs a run far enough along to have the Tools emblem. Both are gaps in
evidence, not known breakage.

Persistence across a restart was verified in the same session but not
photographed as a pair: the application was closed through its own title-bar
control and relaunched against the same profile, and came back up in
Cantonese-only mode.

### Earlier lanes

| File | What it shows | Commit |
| --- | --- | --- |
| `launch-shell.png` | The application launched from the real build: window opens, product name correct, theme surface rendering, custom title bar rather than the operating system's default. | `37c967b` |
| `diesel-depot.png` | The Diesel Depot in the shop rail's footer, one litre after minting: litres and vouchers both at 1, the price already risen to 1.15 thousand for the next litre, and the consumption line reading "none yet — WinForge has not read the ledger". The voucher this press wrote was checked on disk at `%APPDATA%\DingDingProjects\exchange\diesel-vouchers.json`. | this commit |
| `railfix-default-size.png` | The shop rail at the application's **default** window size (1024x720, not maximised), after the rail layout fix: the generator ladder keeps a real height — the Cursor row and its Buy button fully readable, the scrollbar showing there is more below — and the Diesel Depot is docked underneath it as a compact footer carrying its name, both figures and the Mint button. Before the fix the ladder resolved to exactly **zero** pixels of height at this size and the depot card ran past the bottom of the rail. | this commit |

| `anim-generator.png` | A generator purchase mid-flight: cookie coins arcing out of the HUD counter toward the Cursor row, and the row itself lit by its warm sweep with the owned count already rolled to its new figure. | this commit |
| `anim-ticket.png` | An upgrade ticket mid-tear: golden coins in the air, and the Cursor Upgrade (x1) ticket split along its perforation with the two halves offset and the spark flash over it. | this commit |
| `anim-diesel-1.png` `-2.png` `-3.png` | Three phases of one diesel mint sequence on the depot card: the nozzle swinging in over a still-empty can with the litres figure rolling up; the can filling with fuel drops falling from the nozzle; and the printed voucher slip carrying the real identifier's short prefix (`11c54571`) that the main process wrote to the ledger. | this commit |

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


**How the animation captures were taken.** Same off-screen desktop, same
window-by-title-and-class resolution, same seeded-save route as the diesel
capture below — a save in the application's own format written into the
profile's `localStorage` over the running app's own devtools connection, then
loaded normally. The purchases themselves are real presses of the real controls,
issued through that same connection, on a slow repeat so that a PrintWindow
capture taken from outside lands while an animation is genuinely in flight.
Every frame here was opened and looked at; frames that caught the gap between
animations were discarded rather than relabelled.

A still cannot prove timing. What these images show is that each effect renders,
is anchored to the right control, and carries real data (the voucher prefix is
the one the ledger file received). What they do NOT show is the easing, the
settle, or that nothing exceeds three flashes a second — those are properties of
the CSS and of the one-shot, non-repeating animations it declares.

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

- The factory's **automation** branch actually shipping by itself when a tank
  crosses its threshold. It is unit-tested, and the Ship-automatically switch is
  in `factory-ship.png` with its threshold caption, but no capture shows a lorry
  leaving without a press.
- The factory panel under **reduced motion**, where the pipe flow and the derrick
  stop dead. That is declared in CSS and asserted nowhere else.

- The command palette and the appearance editor — neither exists in the
  application yet. The settings surface DOES exist now and is captured; see
  the settings set below.
- A golden-cookie spawn. The window is five to fifteen minutes wide and no
  capture run has sat still long enough to catch one.
- Narrow widths and high display scales. Every image in the current set is one
  maximised window on one desktop, so the shop rail's bottom-sheet drawer
  breakpoint is still only verified by forcing it, never by a real resize.
- The prestige two-key confirmation gate. It ships, and it sits below the fold
  of `dialog-prestige.png`.
- The generator ladder past Shipment. The seeded run never bought that deep, so
  the last five tiers have never been on screen for a camera.

These are gaps in evidence, not features known to be broken. Nobody has looked.

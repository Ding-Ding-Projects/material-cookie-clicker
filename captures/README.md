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

### The frenzy-class events

| File | What it shows |
| --- | --- |
| `frenzy-production.png` | A **Production Frenzy** running, 67 seconds into its 77. The HUD's event plate carries the frenzy class accent — a warm plate with a gold ring — beside the oven emblem, a draining bar and the countdown. |
| `frenzy-choice.png` | A **Taste Test**, waiting for an answer. The two-button card sits over the lower stage: the question in both languages, a brown "serve it now" button carrying the literal figure it pays (4,290,600,089,997 cookies), an olive "send it back" button offering production ×5 for a minute, and the line saying that answering neither gives you neither. The HUD plate for a choice event is deliberately quiet rather than gold. |

**How these two were taken.** From the built `dist/`, launched by the real
`electron` binary onto an off-screen Windows desktop named `FrenzyCapture` on
its own debugging port, with a throwaway `--user-data-dir`. The window was
maximised through the application's own title-bar API (2582x1550 device pixels
at 144 DPI) and both images are Win32 `PrintWindow` captures of that one window,
resolved by title and class. The save is the same progressed one the other
captures use, written into `localStorage` over the devtools connection and then
loaded normally.

The draw was pinned to one event with the developer-only local-storage flag
(`material-cookie-clicker:events:fast` set to `event:production_frenzy` and then
`event:taste_test`). That flag decides **which** event fires and nothing else:
the event that lands is the real event with its real duration, its real
arithmetic and the real one-event-at-a-time rule. Waiting for a Production
Frenzy on the shipped schedule would be about a four-hour wait, and for a Burnt
Batch Frenzy about fifteen hours, which is not a capture process.

**What is not captured.** Eleven of the sixteen pool events have no picture yet:
Grandma's Surprise Batch, Sugar Rush, Lucky Crumb, Market Day, Click Frenzy,
Burnt Batch Frenzy, Clot, Combo Window, Delivery Rush, Flour Shortage, Night
Shift and Sprinkle Storm. The site article describes them from their shipped
definitions and says so plainly rather than implying a photograph exists.

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

### The mechanics-expansion set

Three images from the build that grew the ladder to twenty tiers, the upgrade
catalogue to 179 and the achievement roster to 201, added milk and the kitten
line, and replaced the horizontally-scrolling upgrade strip with a shelf.

Taken the same way as everything else — an off-screen `MechanicsCapture`
desktop, the window resolved by title and class, `PrintWindow` on that one
window — with one addition worth stating plainly. The renderer persists to
`localStorage` today (see `src/renderer/game/persistence.ts`), and a
`localStorage` value cannot be written from outside the browser process, so the
progressed save was pushed into the running app over the DevTools protocol by
`scripts/capture-seed-localstorage.mjs`. The state in these pictures is a real
save decoded by the real save codec and played by the real reducer; only the
route it took into the app is unusual.

| Image | What it shows |
| --- | --- |
| `mechanics-shelf.png` | The rebuilt upgrade shelf on a late save. `READY TO BUY` is a wrapping grid of 20 tickets sorted cheapest-first and capped at two rows; `NEARLY THERE` is 8 locked upgrades shown as requirement lines with progress tracks and counters (`90 / 100`, `78 / 90`); `ALREADY BOUGHT` is 64 owned upgrades collapsed into a single strip of stamps behind a count badge. The milk tide runs along the floor of the stage reading `Wong Tai Sin Milk — 312% milk`. |
| `mechanics-milk.png` | A mid-game save, for the milk level rather than the shelf: `Malted Milk — 108% milk`, drawn as a shallow band because the tide is scaled against a 400% full glass. Synergy tickets (`Cursor × Grandma`, `Grandma × Cookie Farm`) and two greyed-out, unaffordable kitten tickets are on the shelf above it. |
| `mechanics-reborn.png` | The Reborn tree inside the Prestige dialog, scrolled to the tree itself. Three branches — Inheritance 遺產, Power 力量, Memory 記憶 — with bought nodes struck green and labelled `BOUGHT · 已買`, affordable nodes lit, and locked ones dimmed and printing what they are waiting for. The header reads `42 ascension points unspent · 8 spent in this tree`. |

All three were opened and looked at, and all three were re-taken after the first
attempt: the shelf collapsed to a row of count badges the first time, because it
was competing with the cookie panel for the same flex space, and the milk tide
was invisible the first time, because it was rising behind opaque cabinet panels
with nowhere to be seen.

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

### The home-construction set

Two images from one session on the off-screen desktop `HomeFinishCapture`, both
opened and looked at afterwards. They are the evidence for the second nested
subgame — the bakery-home (`src/shared/game/home-construction.ts`).

| File | What it shows |
| --- | --- |
| `home-building.png` | The Home panel with a room genuinely going up. `BUILDING SITE` reads **Building the Parlour**, a progress bar at **70%** and **1m 30s** remaining; the house grid below carries a green `BUILT` Kitchen with two furniture glyphs standing on its floor, a `FOR SALE` Pantry drawn as a dashed floor plan with its builders' price and build time beside a Buy blueprint button, and a `BUILDING` Parlour crossed by scaffolding. The three card states of the subgame in one frame. |
| `home-furnished.png` | Three rooms finished. The coziness dial reads **89 of 249** with its needle on the real fraction, and the sentence beside it prints **+19.3%** — the figure the cookie economy is actually multiplied by, curve and furniture folded into one number. Per-room coziness reads 31, 24 and 34, which is the 89 the gauge shows, and the site is idle. |

**How this set was taken.** From the built `dist/`, launched by the real
`electron` binary onto an off-screen Windows desktop named `HomeFinishCapture`,
with `--remote-debugging-port=9331` and a throwaway `--user-data-dir`. The window
was maximised through the application's own title-bar API (2582x1550 device
pixels at 144 DPI) and both images are Win32 `PrintWindow` captures of that one
window, resolved by title and class from the desktop's window list.

The run was seeded with `scripts/capture-seed-home.test.ts` in its `before`
stage — a rich save with the shop open and, deliberately, **no Property Deed**,
because the point of that stage is to photograph somebody buying the house
rather than owning it. Everything after that balance was a real press posted to
the window at the control's real coordinates: the Property Deed ticket, the
Kitchen blueprint, the Kitchen builders, two pieces of kitchen furniture, the
Parlour blueprint, the Parlour builders, and later the Parlour's armchair and
hearth.

**The clock in these images is real.** The Kitchen's full sixty seconds and two
hundred and ten seconds of the Parlour's five minutes were served by the running
application in real time; nothing was fast-forwarded and no elapsed value was
written into the save. `home-building.png` was taken after the renderer was
rebuilt and the window reloaded mid-build, and the build resumed at exactly the
elapsed it had been saved with — which is also the proof that a closed
application does not build.

`home-furnished.png` starts from the harness's `furnished` stage, a save two
rooms in with a Parlour most of the way through its build; that build then
finished on the clock during the session and its two pieces of furniture were
bought by real presses. One frame was discarded before it: a `PrintWindow` taken
seconds after a scroll came back torn, half the window painted and half stale.
It was retaken rather than shipped.

**What this set does not show.** The Bedroom, Workshop and Garden were never
reached, so the twenty- and thirty-minute builds and the fifteen dearest pieces
of furniture are unphotographed, and the builders'-pace tile reads `+0%` in both
images because every piece that raises it lives in a room this run never built.

### The mouse-raid set

Two images of the Mouse Raid, the hourly event that puts mice on the counter and
takes up to eighty per cent of the balance from the ones you fail to whack.

Taken the same way as everything else: the built `dist/` launched by the real
`electron` binary onto an off-screen Windows desktop named `MiceCapture`, the
window resolved by title and class, `PrintWindow` on that one window, and a
progressed save pushed in over the DevTools protocol by
`scripts/capture-seed-localstorage.mjs`.

| Image | What it shows |
| --- | --- |
| `mice-raid.png` | Five mice mid-raid, scattered across the lower half of the stage as five real pink buttons, with the HUD's fourth plate pink and outlined in red reading `Mouse Raid · 老鼠打劫`, a draining bar, `10s`, and `5 of 5 mice left · 仲有 5 / 5 隻老鼠`. |
| `mice-aftermath.png` | The card that states the outcome: `2 of 4 mice got away with 16 quintillion cookies`, the same line in Cantonese, and the note that the lifetime total was untouched. The balance above it reads 24 quintillion, having been 40 quintillion before the raid — exactly the eighty per cent ceiling scaled by the two mice that escaped. |

**Two things about this run that a reader should know.**

A raid fires about once an hour, which no capture run can wait for, so this one
set the documented developer-only local-storage key
(`material-cookie-clicker:events:fast`) to the value `raid`, which shortens the
raid's window to a few seconds and quiets the ordinary event pool. It changes
the schedule and nothing else: the mouse count, the twenty-second window, the
eighty-per-cent ceiling, the thousand-cookie floor and the never-two-at-once rule
are all the shipped ones. There is no in-game control that reaches this.

The two mice in `mice-aftermath.png` were whacked by real Win32 background clicks
on the real buttons, and the arithmetic on the card is the reducer's answer to
them. Those clicks were aimed with the reduced-motion layout — the same
`prefers-reduced-motion` path a player with that preference gets, emulated over
the DevTools protocol — because a click posted to a moving 56-pixel button from
outside the process lands a second later and a stage away. The mice are still
buttons, still worth the same, and still whackable either way; only the aiming
was made possible. `mice-raid.png` has no such emulation and shows the mice
mid-scurry.

### The manual-purchase set

Three images from one run on a fresh profile, taken after the lane that made
every unlock a purchase. Every cookie in them was earned by real clicks posted
to the window, and every purchase in them was a real press of a real button.

| File | What it shows |
| --- | --- |
| `manual-hold-proof.png` | Hold-to-click actually working. The window received exactly ONE button-down, held for five seconds, and one button-up at the end; this frame is from the middle of that hold, and the `COOKIES` plate has gone from 77 to 100 with no individual presses in between. The toast beside it reads `Tool discovered: Command Palette · 發現工具：指令面板` — the honest new wording, because discovering a tool grants nothing. |
| `manual-prices.png` | Literal prices. The Cursor row's buy button reads `Buy · 買 — 🍪 1,232`, not "1.2 thousand", and the HUD plate reads `992.45` rather than a rounded word that used to run past the bevel. |
| `manual-tools-discovered.png` | The Tools panel on that same run, reading `0 / 20 TOOLS UNLOCKED` even though several tools have been discovered by play. Nothing in the tree switches itself on. |
### The random-events set (`events-rain.png`, `events-indicator.png`)

Two images from one session on the off-screen desktop `EventsCapture`, both
opened and looked at afterwards, of the random-event system described in
`site/features/random-events.html`.

| File | What it shows |
| --- | --- |
| `events-rain.png` | A Cookie Rain in progress: twelve real, clickable cookie buttons scattered across the game stage at different heights, a `Cookie Rain / 曲奇雨` plate in the HUD with its remaining-time bar reading 18s, and the marquee naming the event in both languages. |
| `events-indicator.png` | An Oven Hiccup — the pool's one setback — with the HUD plate, the marquee and the thump-to-fix chip all rendered in the error role rather than the spark one, and the marquee carrying the extra red line saying production is down until it ends. |

**How these were taken, and the one thing that was set.** Same route as every set
above: the built `dist/`, the real `electron` binary, a throwaway
`--user-data-dir`, `--remote-debugging-port` so the run could be driven, and
Win32 `PrintWindow` on the window resolved by title and class. Two values were
written into that throwaway profile's local storage before the game booted: a
seeded save, so the surface shows real generators and a real per-second rate
rather than zeroes; and the developer-only key
`material-cookie-clicker:events:fast`, which is read once at startup and
shortens the event window from three-to-ten minutes to a few seconds.

That key is the only way to reach the fast schedule. There is no button, no
settings row and no in-game control that summons an event, and a player who
never sets it never leaves the shipped timing. Nothing in either photograph was
forced to a particular event: the scheduler picked at random and each capture
waited for the event it wanted to come round.

The oven chip was also pressed, with a real background mouse click on that
window, and the Oven Hiccup ended immediately as designed. That is not visible in
either photograph; it is written down here because it was actually checked.
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

### The control-economy set

Three images from one session on the off-screen desktop `CommodifyCapture`, each
opened and looked at afterwards, taken from the built `dist/` launched by the
real `electron` binary on its own CDP port against a throwaway
`--user-data-dir`, so the save really was empty. Every cookie in them was earned
by a real press on the cookie, and the purchase was a real press on the plate and
then on its confirmation.

| File | What it shows |
| --- | --- |
| `commodify-locked-chrome.png` | A fresh save that cannot move its own window. The title bar carries a bilingual price plate reading "Drag the window — 10" where the drag region would be, and the minimize and maximize caps are replaced by their own plates at 30 and 45. The close cross is an ordinary button with no price on it. The confirmation is open under the drag plate, because the purchase is worth more than one percent of the balance. |
| `commodify-unlocked.png` | The same window after the ten cookies were spent. The drag plate is gone and the marquee is the drag handle; minimize and maximize are still priced; close is unchanged. |
| `commodify-controls-catalogue.png` | The controls catalogue inside the Settings panel: the statement that the close button, the Settings panel and the catalogue's own search field are never for sale, that free search field, and the first group of the price list. |

The drag purchase was verified at the operating-system level as well as in the
pixels, because pixels cannot show whether a window is draggable. A script run on
the same off-screen desktop asked the window itself `WM_NCHITTEST` over the
marquee, which is the question Windows uses to decide whether a press begins a
window drag. Before the purchase the answer was `HTCLIENT` (1) at that point and
everywhere else on the bar. After the purchase, at the identical point on the
identical window, it was `HTCAPTION` (2), while the rest of the bar and the
cabinet body still answered `HTCLIENT`.

Not shown by this set, and stated plainly rather than glossed: **the window was
never physically dragged.** Synthesising a real cursor drag needs `SetCursorPos`,
and on an off-screen desktop that call is inert — the attempt reported a cursor
position of `0,0` and the window did not move, which is a fact about the headless
desktop rather than about the application. The hit-test contrast above is the
strongest evidence that could be gathered without putting a window on the user's
visible screen.

Also not shown: buying minimize, maximize or resize; the stepper, search and bulk
ladders being climbed; and the light theme, since the capture desktop follows the
operating system's colour scheme and it was dark.

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

## Integration sanity checks

Not feature captures. Each one is a single frame taken from the built application
on a fresh profile straight after an integration merge, to prove the merged tree
still starts and still shows the right nothing.

| File | What it shows |
| --- | --- |
| `integrate-sanity.png` | After the factory and mouse-raid lanes were merged. |
| `wave-sanity.png` | After the frenzy-events, control-economy and home-construction lanes were merged. A fresh profile is the cookie, the COOKIES plate reading 0, and the free Settings emblem — no shop rail, no console emblems, no house and no factory. The title bar carries the three coin plates the control economy puts there: drag at 10, minimize at 30, maximize at 45. The close button is a real button, because close is never for sale. Taken on an off-screen desktop named `WaveCapture` with the Win32 PrintWindow API. |

## Not captured yet

- The factory's **automation** branch actually shipping by itself when a tank
  crosses its threshold. It is unit-tested, and the Ship-automatically switch is
  in `factory-ship.png` with its threshold caption, but no capture shows a lorry
  leaving without a press.
- The factory panel under **reduced motion**, where the pipe flow and the derrick
  stop dead. That is declared in CSS and asserted nowhere else.
- The home's **Bedroom, Workshop and Garden** — their blueprints, their twenty-
  and thirty-minute builds, and the fifteen dearest pieces of furniture. The
  builders'-pace figure has therefore never been photographed reading anything
  but `+0%`, because all four pieces that raise it live in those rooms.
- The home's **furniture shop shelf**. Nine pieces were bought through it during
  the home session, so it certainly works, but both frames were composed around
  the coziness gauge and the house grid and the shelf sits below them.

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
  the deepest eleven tiers have never been on screen for a camera. The six new
  late tiers (Chancemaker through the Wok of the Gods) are drawn and wired, and
  their icons have never been photographed.
- The dark theme on any of the new surfaces. The shelf, the milk tide and the
  Reborn tree are all built from the same theme tokens as everything else and
  should repaint, but nobody has looked at them in the dark set.
- The permanent-pin shelf inside the Reborn tree with a slot actually bought.
  The seeded save owns no slot node, so that panel was only ever photographed in
  its empty state.

These are gaps in evidence, not features known to be broken. Nobody has looked.

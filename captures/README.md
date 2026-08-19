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

## Release capture inventory and isolated launcher

`scripts/release-capture-inventory.json` is the hand-written release evidence
list. It distinguishes existing current-build images from pending evidence;
pending rows do not carry an image path and therefore cannot accidentally pass
because an older, similarly named capture happens to exist.

`scripts/prepare-release-capture-plan.mjs` prepares a launch plan for the
approved cheap Lowlevel named hidden-desktop route. It does not launch a window
itself. The plan gives the caller a task-only profile, debugging port, exact
renderer URL and the complete state inventory. `scripts/cdp-isolated-session.mjs`
then refuses to inspect or drive the app unless `/json/list` contains exactly
one target, that target is a page, its normalized URL exactly equals the plan,
and its debugger socket is on the requested loopback port. The capture helpers
use synchronous evaluations and explicit deadlines; they do not use the
`awaitPromise` mode that hangs on the affected Windows/Node combination.

`scripts/validate-release-capture-evidence.mjs` validates the final evidence
record against the inventory, exact source commit and method. A verified row
must point to a real PNG and record the dynamically resolved window title and
`Chrome_WidgetWin_1` class. A blocked row must name the exact blocker. This lane
created the harness but deliberately did not launch any UI, so the following
current release states remain **pending** rather than being inferred from older
images:

- the current minigame-events dashboard and each of its five playable boards;
- the Lucky Chance drawer with a real token draw;
- the Office Building row at and beyond its unlock threshold;
- the endless Home extension card;
- the collapsed Diesel Depot persisted across a reload;
- installed-executable launch and the unsigned update-ready banner.

The same inventory carries the pre-existing gaps already documented later in
this file: remaining event-pool images, a milk-focused composition, late Home
rooms, an Oven Dial miss, keyed prestige states, reduced-motion Factory and
Mouse Raid, the not-yet-implemented command palette and appearance editor, and
a genuinely narrow application window. No image was fabricated to make those
rows look complete.

## `app/` — the built application

### The current set

Sixteen images, taken across three runs of one build in one sitting, and every
one of them opened and looked at afterwards. This is the set the README table
and the documentation site's capture matrix both point at. Everything below this
section is older evidence from earlier lanes, kept for the record; where an old
image and a new one show the same surface, the old one is no longer listed in
either table and the new one is.

**How they were taken.** From the built `dist/`, launched by the real `electron`
binary onto an off-screen Windows desktop named `EvidenceRefresh`. Each run got
its own `--remote-debugging-port` (9741, 9742, 9746) and its own throwaway
`--user-data-dir`, and the page target's URL was verified as this worktree's
`dist/renderer/index.html` before anything else happened. The window was
maximised through the application's own title-bar API (2604x1562 device pixels
at 144 DPI) and every image is a Win32 `PrintWindow` capture of that one window,
resolved by handle from the headless desktop's own window list.

**One thing about method that changed, and it is worth writing down.** Running
two or three of these Electron windows on the same off-screen desktop at once
does not work: an occluded window stops painting, and `PrintWindow` then returns
a *stale but plausible* frame — the previous state of the surface, rendered
perfectly, with no tearing to give it away. That was caught by looking: a
capture came back showing the plain look several minutes after the DOM said the
whole ladder had been bought. Every image in this set was therefore taken with
exactly one application window alive on the desktop. Two frames were discarded
for the older reason as well — a `PrintWindow` taken while the Settings panel
was still animating open came back half-drawn, then checkerboarded — and were
retaken after the panel settled.

| File | What it shows |
| --- | --- |
| `plain-start.png` | A genuinely fresh profile: white page, system font, a 1px grey rule under the title bar, square corners, no shadows, no illustrated art — and in the middle of it a flat grey circle with the word `COOKIE` on it. The title bar's own controls are coin-slot plates (`10` to drag the window, `30` minimize, `45` maximize) and the close cross beside them is an ordinary button with no price. The only two console buttons are the free `Prices` catalogue and a `SETTINGS` plate at `25`. Nothing was seeded and nothing was pressed before the shutter. |
| `plain-upgrading.png` | The same run with exactly two of the seven look rungs bought — `look.palette` (50) and `look.cabinet` (250). The warm palette and the wooden cabinet are back; everything above them is still visibly absent (system font rather than the display face, flat cream rather than the oven glow, a brown disc rather than the drawn cookie, a plain `▪` on the Shop Sign ticket). The counter reads 100 because 300 of the seeded 400 cookies were really spent. |
| `game-progressed.png` | The full mid-game surface in the light theme: three HUD plates, the raid-supplies shelf, eight console buttons, the drawn hero cookie over its oven glow, the three-section upgrade shelf at `68 / 180`, the shop rail and the Diesel Depot status card, with the milk tide along the floor at `Wong Tai Sin Milk — 312% milk`. |
| `game-dark.png` | The same surface, same save, same minute, in the dark "arcade night" theme. Note that the dark theme is the seventh rung of the look ladder: a save that has not bought it cannot reach this picture at all. |
| `dialog-factory.png` | The Diesel Factory panel, **stalled** — the honest-halt behaviour photographed rather than asserted. The tanks are at 85 of 85 litres so refining reads `0 / 1.00 L/s` while its rating stays at 1.00, and the yard is at 170 of 170 barrels so intake has stopped too. The status line names both reasons. The shipping station below reports ready to ship 85 L, litres shipped 14 L, vouchers minted 139 and consumed by WinForge 76 — the last two counted from the ledger file rather than from the game. |
| `dialog-home.png` | The Home panel with the Kitchen genuinely under construction: `Building the Kitchen`, 54%, 28s remaining, and the room's own card badged `BUILDING` with scaffolding across its floor plan. The blueprint (5,000) and the builders (10,000) were bought with real presses — that is the 15,000 the panel reports as spent — and the sixty seconds were served by the running application in real time. |
| `dialog-achievements.png` | The Achievements panel at `78 / 201 unlocked`, with earned badges drawn in gold and unearned ones flat grey behind a `???`. |
| `dialog-tools.png` | The Tools tech tree reading `0 / 20 TOOLS UNLOCKED` while all twenty of those application features are already usable — which is the entire contract, stated twice on the surface: once in the callout across the top and once in every card's own bordered `ALWAYS AVAILABLE` block. |
| `dialog-statistics.png` | Ten counters, including `CLOCK ANOMALIES CAUGHT 0`, above the per-generator breakdown of where the production comes from. |
| `dialog-prestige.png` | The ascension projection with its arithmetic printed: 448 points if you reset now, each one a permanent +1%, so ×5.90. A golden cookie happened to spawn on the **shipped** schedule while this frame was open and is visible on the dimmed stage behind the panel. |
| `dialog-prices.png` | The controls catalogue, reading `8 OF 41 BOUGHT` — the registry counted live. It carries the statement that the close button and the catalogue's own search field are never for sale, that free search field, and the first group of the price list. |
| `dialog-settings.png` | Settings opened from a progressed save (a gap the previous set named and this one closes). The language-mode switch at 60, the note that English is free forever, the two-separate-controls warning, both funny sliders at 35 each, and the honest admission that no copy in this build actually varies by level yet. |
| `raid-supplies.png` | The HUD's `RAID SUPPLIES` shelf after two real presses: a Whack Pass at `1 / 5` with its next price stepped to `4,000,000`, and the `Storage 5` chip now asking `25,000,000`. The point of the frame is that the other two plates also read `/ 5` — the cap is one shared ladder, so buying it once raised all three. |
| `golden-spawn.png` | A golden cookie standing as its own sprite in its ray-burst, low and left of centre over the upgrade shelf. What is **not** gold matters as much: the hero cookie in the middle of its panel is the ordinary baked one, because the hero no longer collects golden cookies at all. |
| `golden-dial.png` | The Oven Dial the catch opens, on `Round 1 of 3`, over the dimmed window: a drawn half-circle gauge with the golden band across its upper right and the needle pointing up-left, its tip well outside the band. The line under the `Stop the needle` button reads `Round 1: the band is 26% of the dial and the needle crosses it in 1.8 seconds` — the difficulty stated in numbers rather than left to be felt. |
| `golden-dial-stepped.png` | The same round with `prefers-reduced-motion` on. An inner ring of two dozen ticks appears — every position the needle may occupy — the instruction becomes `The needle steps one notch at a time`, and the briefed sweep goes from 1.8 to 2.9 seconds. Reduced motion changes the cadence, not the target: the band is the same 26%. |
| `golden-dial-won.png` | Three hits in a row and the payout: a yellow pill at the top of the stage reading `Golden cookie redeemed: Windfall`. Another sprite has already spawned lower down, which is the fast developer schedule doing what it is for. |
| `event-sugar-rush.png` | A **Sugar Rush** five seconds from the end of it: an amber event plate in the HUD with a sun glyph, a draining bar and a `5s` countdown, and a marquee card in the corner saying in plain words what it does — every click lands seven times as hard. Worth a second look for a layout reason as well: the event plate pushed the eight console buttons onto a row of their own, and in that wider HUD the raid-supplies shelf prints all three plates whole. |

### The gap-closing set

Ten images from one sitting on the same build as the current set, taken to close
the gaps the "Not captured yet" list below used to name. Every one was opened
and looked at afterwards, and two of them turned out to be photographs of faults
as well as of features — both written down here rather than cropped away.

**How they were taken.** From the built `dist/`, launched by the real `electron`
binary onto an off-screen Windows desktop named `GapClose`. Six separate runs,
each with its own `--remote-debugging-port` (9801 through 9806), its own
throwaway `--user-data-dir` and its own process, and the page target's URL
verified as this worktree's `dist/renderer/index.html` before anything else
happened. The window was maximised through the application's own title-bar API
(2604x1562 device pixels at 144 DPI, 1722x1027 CSS pixels at a device pixel
ratio of 1.5) and every image is a Win32 `PrintWindow` capture of that one
window, resolved by handle from the desktop's own window list. Only ever one
application window was alive on that desktop at a time, for the stale-frame
reason the current set's section gives above. The capture desktop follows a dark
operating-system colour scheme, so the frames on a bought look tier are in the
dark theme; nothing was patched to make that happen.

**The developer-only keys and preferences, named where they apply.** Three, and
they are the documented ones: `material-cookie-clicker:events:fast` set to
`raid` for the raid frame, `material-cookie-clicker:golden:fast` for the two
golden frames, and `prefers-reduced-motion: reduce` emulated over the devtools
connection for `plain-reduced-motion.png` — which is a real user preference a
player sets in Windows, not a developer key. Each changes *when* something
happens, or which media query matches; none of them changes what the thing does.

| File | What it shows |
| --- | --- |
| `raid.png` | A Mouse Raid in progress: five mice mid-scurry as five real buttons scattered across the lower half of the stage, one of them paler because the pointer is on it, and a red `Mouse Raid` plate in the HUD with its bar running down. Behind that, the outcome card from the *previous* raid in the same session — `4 of 4 mice got away with 51.2 quadrillion cookies`, with the line that the lifetime total is untouched — and a `COOKIES` plate reading 12.8 quadrillion where every other frame from this save reads 40 quintillion. The economics are visible in one picture. |
| `mode-yue.png` | Cantonese-only mode, on the plain look tier. Every string on the surface is Cantonese: the title bar's drag plate, the `曲奇` readout label above 275, all four console buttons, the discovery ticket and its `買` button, and the milk line along the floor. The one thing left in English is the flat grey disc reading `COOKIE`, which is the plain tier's stand-in for the drawn cookie rather than a piece of copy. |
| `reborn-tree.png` | The Reborn tree, whole, with the counter above it reading `42 ascension points unspent · 8 spent in this tree`. Three branches — Inheritance, Power, Memory — and all three card states at once: bought (solid green, `BOUGHT`), affordable now (amber, its price repeated as the button label), and locked behind a *named* prerequisite (`REQUIRES RED PACKET`) rather than behind a hidden condition. The footer says outright why the panel above it reads `NOTHING YET`. |
| `prestige-gate.png` | The prestige two-key gate, opened and left alone. Both key toggles are off, the confirmation slider is greyed, and the line under it reads `Both keys required before this slider unlocks`. The card states what is lost and what is carried *before* it asks for anything, with the carried figure — 490 points — computed rather than rounded, and an `Emergency exit` at the foot. |
| `ladder-deep.png` | A generator row past Shipment: the Antimatter Condenser, tier thirteen of twenty, two owned, `+430 million/sec each`, the next one priced at `224,825,000,000,000`, with the Prism below it. It also shows the honest limit of the rail — a row is 205px tall and the rail's viewport is about 250px, because the Diesel Depot is docked in its footer, so about one row and a sliver is all that is ever on screen. |
| `home-coziness.png` | Three rooms built and furnished. The coziness dial reads **106 of 249** and the sentence beside it prints **+20.1%**, the figure the cookie economy is really multiplied by. Per-room coziness reads 31, 24 and 51, which is the 106 the gauge shows. And `BUILDERS' PACE` reads **+8%** — the first time that tile has read anything but `+0%` in any capture — because the Parlour's Mantel Clock is now standing in a room. |
| `factory-autoship.png` | The factory automation branch shipping a lorry **by itself**. Nobody pressed the ship button: the tanks filled to 85 of 85, the level float tripped, and seconds later storage reads `6.2 / 85 L`, the whole line is green and `Running` rather than stalled, litres shipped has jumped to 269 and vouchers minted to 165. The `Ship automatically` box is ticked, with the line `Sends a lorry once the tanks reach 100% full` under it. |
| `golden-dial-r2.png` | The Oven Dial on `Round 2 of 3`, reached by really winning round one. The golden band is visibly shorter than round one's, the needle is well clear of it, and the status line reads `In the band. Next round is tighter.` |
| `plain-reduced-motion.png` | Two things that had only ever been declared in CSS, in one frame. The golden sprite keeps its full drawing at the **plain look tier** while the hero cookie has lost its own and is a flat grey disc reading `COOKIE` — because a sprite you have to find and press must stay findable at every tier. It renders in greys rather than gold because the plain tier has no palette to be gold with. And under **reduced motion** the ray burst is a fixed set of shafts rather than a turning one. |
| `update-notice.png` | The update notice, retaken on this build: `Update ready (0.3.0) — restart to install`, the unsigned-artifact warning under it, and the Restart and Later buttons, sitting in the bottom-right over the shop rail's Diesel Depot card and dimming nothing. |

**What each frame cost in real presses, so nothing here reads as scripted.**
`mode-yue.png` started from a save seeded with 400 cookies and nothing else; the
Settings emblem at 25, the language-mode switch at 60 and Cantonese mode at 40
were each bought with a real Win32 background press on the real control, each
through its own confirmation, and the balance falling 400 → 375 → 315 → 275 is
the receipt. Pressing Cantonese *after* buying it is what switched the
application; buying it does not, which is what the panel's own copy promises.
`home-coziness.png` started from the `furnished` stage of
`scripts/capture-seed-home.test.ts` and its four Parlour pieces were bought with
real presses. `factory-autoship.png` took three real presses — the Auto-ship
switch at 2,500, the Depot Telemetry upgrade at 100,000, and the tick — and then
the run simply watched; the shipped-litres counter moved twice on its own before
the shutter. `reborn-tree.png` and `prestige-gate.png` were reached by a real
press on the Prestige console button and then by scrolling. **No reset was
completed and the wipe gate was never opened.**

**The one place a press was not a Win32 press, and why.** In
`golden-dial-r2.png` the sprite was caught with a real Win32 background press,
but the press that *won round one* was dispatched as a pointer event over the
devtools connection at the Stop button's real coordinates. A Win32 message
posted from another process cannot be timed to a band the needle crosses in
under two seconds; the moment was chosen by polling the dial's own accessible
value text — the shipped one that says in words whether the needle is inside the
band — so the reducer judged that press exactly as it judges a player's. Stated
here rather than left to look like the rest.

**Two faults these frames found, by being looked at.**

The first is in `raid.png` itself. The raid's HUD plate prints
`6s5 of 5 mice left`: in the single-plate layout the countdown and the mice count
are set with nothing between them, so the seconds run straight into the count.
It is the same class of fault as the `Night Shift38s` one the double-event lane
found and fixed in the *two*-plate layout, recurring in the layout beside it.

The second is on the Oven Dial. While a pointer rests on the `Stop the needle`
button, `:hover` swaps its background to `--spark` but leaves its colour as
`--on-tertiary-container`. In the dark theme those are pale yellow on bright
yellow: a contrast ratio of **1.05:1**, measured from the running renderer's own
computed styles, against **7.29:1** for the same label in the button's resting
state. For as long as a player is pointing at the only control this minigame
has, its label is effectively invisible. Two frames were discarded and retaken
because of it — the first two attempts at `golden-dial-r2.png` came back with a
washed-out button label, and chasing that is what found the cause; the frame
that shipped was taken with the pointer moved off.

Neither fault is fixed in this release. Both are named because a capture set
that quietly cropped them would be worth less than one that says what it saw.

### The wave-two events set

Two images from one session on the off-screen desktop `EventsWave2Capture`, both
opened and looked at afterwards. They are the evidence for double events and for
the six events that shipped alongside them.

| File | What it shows |
| --- | --- |
| `events-double.png` | **A double event** — two pool events drawn in one spawn and running at once, which the scheduler could not do before this lane. Two stacked plates in the HUD where one used to sit: a red `Clot` at `62s` and a green `Market Day` at `56s`, both with their countdown bars dropped to fit and their seconds kept. The marquee reads `DOUBLE EVENT! Clot + Market Day` and carries both emblems. The proof the Clot is really running is on the `PER SECOND` plate: `7,151,000,150`, exactly half the `14,302,000,300` the same seeded save shows in the frame below. |
| `event-cookie-eclipse.png` | **A Cookie Eclipse**, twelve seconds from the end: the cookie panel dark, five haloed crumbs scattered across it, and every readable figure in the window — the HUD, the whole shop column, every price on the upgrade shelf — at its ordinary contrast. |

**How these were taken.** From the built `dist/`, launched by the real `electron`
binary onto an off-screen Windows desktop named `EventsWave2Capture`, on its own
debugging port (9758) and its own throwaway `--user-data-dir`, with the page
target's URL verified as this worktree's `dist/renderer/index.html` before
anything else happened. The window was maximised through the application's own
title-bar API (2582x1550 device pixels at 144 DPI) and both images are Win32
`PrintWindow` captures of that one window, resolved by handle from the headless
desktop's own window list. Only one application window was alive on that desktop
at a time, for the reason stated further down.

**How the shutter was timed, and the one thing that was driven.** Both events last
seconds, so the run polls the DOM over the devtools connection and only fires the
shutter once the real state is on screen — five crumbs present, or two indicator
plates and a stacked marquee with at least twenty-five seconds left on both. The
marquee itself dismisses after six seconds unless a pointer is over it **or focus
is inside it**, which is a shipped WCAG 2.2.1 behaviour rather than a capture
hack; the run moves focus to the marquee's own `Dismiss` button, exactly as a
keyboard user would, to hold the card open. That focus is real and is why the
button carries a focus ring in both frames. Nothing else was pressed, and no
state was written except the seeded save and the developer key.

**Three frames were thrown away, and looking is what threw them away.** The first
`event-cookie-eclipse.png` came back with every price in the shop dimmed — the
event's scrim had been put on the event stage, which turns out to span the upgrade
shelf as well as the cookie panel, so an event whose own copy promises that
everything you read stays lit was making the shop hard to read. The second
confined the darkness correctly but still scattered one glowing crumb onto the
brightly lit shop rail, outside the picture it was supposed to be part of. And the
first `events-double.png` read `Night Shift38s` on its plates: hiding the
countdown bar to make two plates fit had also removed the only thing separating
the event's name from its remaining seconds. All three were fixed in the source
and re-shot; none of them would have been found by reading the code.

**What was seeded, and what was bought.** One image, `plain-start.png`, is an
untouched fresh profile: nothing seeded, nothing pressed. `plain-upgrading.png` starts from a save carrying 400 cookies and
a lifetime total of 400 — deliberately under the 1,000-cookie grandfather
threshold, so the look had to be *bought* rather than granted — and both rungs
were then bought inside the running application with real Win32 presses on the
coin-slot plates and their confirmations. The balance falling 400 → 350 → 100 is
the receipt.

Everything from `game-progressed.png` down starts from the progressed save that
`scripts/capture-seed-save.test.ts` writes, pushed into `localStorage` over the
running app's own devtools connection and then loaded normally. On top of that
balance, these were bought with real Win32 presses on the real controls, and the
catalogue's own counter climbing `0 → 7 → 8 OF 41 BOUGHT` is the receipt: all
seven look rungs (50, 250, 750, 1,800, 4,000, 8,000, 15,000), the Settings
emblem (25), a Whack Pass, a storage rung, the Kitchen blueprint and its
builders.

**One change to that seed, stated plainly.** The seed script now writes the seven
`look` rung ids into the save's `controlUnlocks`. It did not before, and the
first pass of this run photographed a ninety-quintillion-cookie save wearing the
plain start look, which is not what a run that far along looks like. The ladder
being *climbed* is photographed separately and with real presses, in
`plain-start.png` and `plain-upgrading.png`; the seed grants it so the surface
captures show the surface rather than the ladder. That is the only thing about
the game state in this set that was written rather than played.

**The theme, and why both halves are declared.** This capture desktop follows a
dark operating-system colour scheme. So the light frames in this set were taken
with `data-theme="light"` set on the running renderer's root element over the
devtools connection, and `game-dark.png` with `data-theme="dark"`; the attribute
was cleared afterwards. Neither is a file patch this time — nothing in `dist/`
was edited — and neither reaches anything the application cannot already show a
player whose machine is set the other way.

**The developer-only keys.** The four `golden-*.png` frames were
taken with `material-cookie-clicker:golden:fast` set in a throwaway profile,
which shortens the five-to-fifteen-minute spawn schedule and lengthens the
window enough to photograph. `event-sugar-rush.png` was taken with
`material-cookie-clicker:events:fast` set to `event:sugar_rush`, which shortens
the pool's schedule and pins the draw to one event. Both keys change **when**
something happens and nothing else: the event that lands is the real event, with
its real duration, its real arithmetic and the real one-event-at-a-time rule,
and the golden's spawn position and the dial's band position are the scheduler's
and the PRNG's own choices. There is no button and no settings row that reaches
the pool's schedule and pins the draw to one event; the same key was set to
`stack:2` for `events-double.png` and to `event:cookie_eclipse` for
`event-cookie-eclipse.png`. Every one of these keys changes **when** something
happens, or **which** of the real events it is, and nothing else: the event that
lands is the real event, with its real duration, its real arithmetic and the real
compatibility rules, and the golden's spawn position and the puzzle's odd tile are
the scheduler's and the PRNG's own choices. `stack:2` in particular does not relax
the matrix — it asks the draw to fill two slots, and which two events land is the
ordinary weighted draw refusing every pair the rules forbid. There is no button and no settings row that reacheseither key, and a player who never sets one never leaves the shipped timing.

**The three Oven Dial frames, and exactly which press was a human's.** They were
taken in their own session, from the built `dist/`, on an off-screen desktop
named `GoldenDialCapture`, its own port (9351) and its own throwaway profile;
`PrintWindow` on the one window, resolved by handle.

The CATCH was a real background Win32 press on the sprite's real coordinates.
The three winning presses behind `golden-dial-won.png` were **not** hand-timed: a
short script in the page watched the dial's own `aria-valuetext` and clicked the
real `Stop the needle` button on the frame it reported `in the band`. That is the
real control and the real reducer path — the reducer recomputes the needle
position from the round's start time regardless of who clicked — but it is an
automated finger rather than a human one, and it is written down that way instead
of dressed up. The reason is mechanical: a background press costs about a second
of round trip, and round three's band is open for a fraction of that.

For `golden-dial-stepped.png` one further thing was faked, and only this:
`window.matchMedia` was overridden in the page so the component's reduced-motion
probe answered yes, exactly as it would on a machine set that way. The catch then
froze stepped mode onto the domain state through the ordinary code path. The
needle positions sampled while that card was open came back as
`17, 17, 25, 33, 33, 42, 42, 50, 50, 58, 58, 67, 67, 75` — discrete notches, each
held for a countable stretch. That sample is the evidence behind the claim that
reduced motion turns this into a rhythm game rather than switching it off.

Three more behaviours were driven and watched rather than photographed: a
deliberate miss produced the shake and `Missed the band — two seconds off the
clock`, an Escape produced `The golden cookie got away.`, and reloading the app
mid-dial round-tripped the caught cookie's position and open round back out of
the save intact.

**Two defects these frames caught that no test did.** The needle originally
stopped short of the track, so judging whether it was inside the band — the
entire game — meant estimating an alignment that was not actually drawn; it now
crosses the band and carries a hard dot on the track. And the payout line sat 12%
down the stage, which put it straight across the face of the hero cookie; it is
pinned to the top of the stage now. Both were found by opening the pictures and
looking at them.

**The toasts, and why one is in shot.** A save producing fourteen billion cookies
a second earns a milestone every few seconds, and the application also re-announces
every achievement in the save on load — about two hundred of them, four seconds
apart. Most frames here waited for the milestone region to empty.
`game-progressed.png` did not get one: it carries a real `Tool discovered: Regex
Builder` toast in the bottom-right, over the cabinet floor and obscuring nothing.
It is described rather than cropped.

**A fault found by looking.** When all eight console buttons sit on the HUD row,
the raid-supplies shelf **clips its third plate**: `Half-HP Whack` runs under the
shelf's right-hand edge and loses the end of its own label. It is visible in
`game-progressed.png`, `game-dark.png`, `raid-supplies.png` and every dialog
capture in this set.

It is not a capture artefact, and comparing two frames in this set is what pins
down the condition: in `event-sugar-rush.png` an event plate pushed the console
buttons onto a second row, and in that wider layout the same shelf prints all
three plates and its storage chip whole. So the shelf is not too small in
principle; it is the crowded single-row HUD that cuts it. Stated here and on the
site rather than framed out of shot.

**Not shown by this set**, and listed rather than glossed: a genuinely narrow
window (every frame is one maximised window, so the shop-drawer breakpoint is
still verified by forcing the breakpoint); a finished, furnished home — no room
was completed, so the coziness gauge reads 0 of 249 and the builders'-pace tile
reads +0%; the Reborn tree and the prestige two-key confirmation gate, which both
ship but sit below the fold of `dialog-prestige.png`; the deep end of the
generator ladder past Shipment; fifteen of the sixteen pool events, and the Mouse
Raid itself as opposed to the supplies shelf you buy for it; the update notice;
Cantonese-only mode; and a *missed* press on the Oven Dial, with its shake. Older
photographs of several of those are still on disk and described further down this
file; they are not in the tables because they are pictures of builds that have
since changed.


### The advanced regex builder

| File | What it shows |
| --- | --- |
| `regex-lab.png` | The shop rail's search popover with both shared advanced tiers bought, in one shot: the live lab holding the sample `cursor-12 grandma-7 farm-350`, the three matches highlighted, the capture table naming group 1 `name` on every match, the plain-language sentence reading the pattern back in words, the one-press history chips underneath, and the standing line saying the whole thing is evaluated locally and never transmitted. |

**How this one was taken.** From the built `dist/`, launched by the real
`electron` binary onto an off-screen Windows desktop named `RegexProCapture`, on
its own debugging port (9727 — the first port checked, 9411, was already answering
for a different worktree's build, which is why the URL of the page target is
verified before anything else happens) and its own throwaway `--user-data-dir`.
The save was seeded by `scripts/capture-seed-regex-lab.test.ts` with 250,000
cookies and the shop rail's own three search rungs bought, and with the two shared
`regex` rungs deliberately unbought. Both advanced tiers were then bought inside
the running application with real presses: a mouse press on the coin-slot plate,
then Enter on the confirmation's own Buy button, which is where the keyboard
lands. The pattern and the sample text were typed in as real key events. The
image is a Win32 `PrintWindow` capture of that one window, resolved by title and
class, and it was opened and looked at afterwards.

### The golden cookie: the random spawn and its puzzle — **superseded twice**

> Superseded, and the file it described is gone. `golden-puzzle.png` photographed
> **Odd Cookie Out**, a four-by-four "spot the different tile" grid that was the
> golden cookie's minigame for exactly one release. It was replaced because it
> failed a decree — *"golden cookie puzzle must be a minigame, not a chance
> game"* — and it deserved to: the odd tile was seeded, so pressing at random won
> a round one time in sixteen with no skill in it at all. The Oven Dial replaced
> it, and `golden-dial*.png` in **The current set** above are what the golden
> cookie actually opens now. `golden-spawn.png` is still a live file; the sprite
> did not change.
>
> What follows is the account of the lane that first photographed the sprite and
> that grid, kept because the method in it is still exactly how these are taken,
> and because a record that quietly deleted its own wrong turn would be worth
> less than one that says which turn was wrong.

| File | What it shows |
| --- | --- |
| `golden-spawn.png` | A golden cookie spawned as its own sprite low on the left of the stage, standing in its ray-burst and straddling the boundary between the hero panel and the upgrades shelf. Note what is NOT gold: the hero cookie in the middle of its panel is the ordinary baked one, because the hero cookie no longer collects golden cookies at all. |
| `golden-puzzle.png` | The Odd Cookie Out card that catching it opens, on `Round 1 of 3`, over a fully dimmed window. Sixteen cookie tiles in a four-by-four grid; the odd one this round is the extra-chip variant, third row, third column. |

**How these were taken, and the one key that was set.** From the built `dist/`,
launched by the real `electron` binary onto an off-screen Windows desktop named
`GoldenPuzzleCapture`, on its own debugging port (9347) and its own throwaway
`--user-data-dir`. The window was maximised through the application's own
title-bar API and both images are Win32 `PrintWindow` captures of that one
window, resolved by handle from the headless desktop's own window list. Both
were opened and looked at afterwards, and the first version of the spawn capture
was thrown away because looking at it is what revealed that the sprite was
invisible at the plain look tier.

Two values went into that throwaway profile's local storage before the game
booted: a seeded save from `scripts/capture-seed-save.test.ts` (with the `look`
ladder bought, so the surface is the finished cabinet rather than the plain
start), and the developer-only key `material-cookie-clicker:golden:fast`, which
is read once at startup and shortens the five-to-fifteen-minute spawn schedule to
a few seconds while lengthening the window enough to photograph. That key is the
only way to reach the fast schedule; there is no button and no settings row, and
a player who never sets it never leaves the shipped timing. NOTHING about the
capture was otherwise arranged: the scheduler chose both spawn positions itself
(they differ between the two runs behind these images), and the odd tile in the
puzzle capture is the one the seeded PRNG picked.

The catch in `golden-puzzle.png` was a real background Win32 press on the
sprite's real coordinates, not a scripted `click()`. The rest of the loop was
driven the same way afterwards and watched rather than assumed: a deliberate
wrong pick produced the shake and the line `Not that one — two seconds off the
clock.`, three correct picks closed the card and left a `windfall` effect on the
save with focus restored to the hero cookie, and an Escape produced `The golden
cookie got away.` No capture was taken of those states; they are recorded here
as observations, not as photographs.

### The raid supplies shelf — **superseded**

> Retaken as `raid-supplies.png` in the current set, on a save that could afford
> the dearer rungs. The older `whack-storage.png` is still on disk; the account
> below is kept for its method.

| File | What it shows |
| --- | --- |
| `whack-storage.png` | The HUD's `RAID SUPPLIES` shelf after two real purchases: a Whack Pass standing at `1 / 5` with its next price already stepped up to `4,000,000`, and the `Storage 5` chip beside the shelf title asking `25,000,000` for the last rung. The other two plates read `0 / 5` — the cap is one shared ladder, so buying it once raised all three at once. |

**How this one was taken.** From the built `dist/`, launched by the real
`electron` binary onto an off-screen Windows desktop named `WhackStoreCapture`,
on its own debugging port (9731) and its own throwaway `--user-data-dir`, with the
page target's URL verified as this worktree's `dist/renderer/index.html` first.
The save was seeded by `scripts/capture-seed-whack-storage.test.ts` with 50,000,000
cookies and NOTHING bought on the shelf — the stock started at `0 / 3` and the
storage chip at rung zero. Both purchases were then made inside the running
application with real Win32 presses on the real controls: one press on the Whack
Pass plate (`0 / 3` → `1 / 3`, price `1,000,000` → `4,000,000`) and one on the
storage chip (`Storage 3` → `Storage 5`). The balance falling from 50,000,000 is
the receipt. The image is a `PrintWindow` capture of that one window, resolved by
handle from the headless desktop's own window list, and it was opened and looked
at afterwards.

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

### The update notice — **retaken**

> `update-notice.png` was re-shot on the current build in the gap-closing set
> above, so the file this section describes no longer exists as it was. The
> account below is kept because the method in it is still exactly how the notice
> is reached, and because the honest limits it states — the status is injected,
> not earned — apply word for word to the new frame as well.

| File | What it shows |
| --- | --- |
| `update-notice.png` | The automatic-update notice on the running game: `Update ready (0.3.0) — restart to install`, the unsigned-artifact warning underneath it, and the Restart and Later buttons. It sits in the bottom-right of the cabinet over the shop rail, leaves the console emblems and the cookie alone, and dims nothing — the game is still running behind it. |

**How it was taken, and what it does and does not prove.** The status in that
card was **injected**, not earned. A development checkout has no Squirrel
updater in it at all, so no real update could ever download here; the notice was
driven through the dev-only seam the component listens on beside the real IPC
push (a `material-cookie-clicker:update-status` window event, dispatched over
the devtools connection). The picture is therefore honest evidence that the
notice renders, reads correctly, and sits where it says it sits — and it is
**not** evidence that an update was ever downloaded, hash-checked or installed
on this machine. In the same session the real IPC path was exercised separately:
asking the main process for its status returned
`{"kind":"unsupported","reason":"this is an unpackaged development checkout, not
a Squirrel installation"}`, which is the honest answer, and pressing the channel
the Restart button uses did nothing, because there was no package to install.

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

### The mouse-raid set — **superseded**

> A raid on the current build is now photographed as `raid.png` in the
> gap-closing set above. `mice-raid.png` and `mice-aftermath.png` are still on
> disk and the account below is kept for its method, which is the same one the
> new frame used; they are no longer in either table because they predate hit
> points and the raid-supplies shelf.

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
### The settings set — **superseded**

> Retaken as `dialog-settings.png` in the current set, and from a progressed save
> rather than a fresh one, which is the gap this section itself named. The four
> older files are still on disk. Note that `settings-fresh.png` shows a build in
> which the Settings emblem was free; it is a purchase now.

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

### The control-economy set — **superseded**

> The chrome-price story is now told by `plain-start.png` and `dialog-prices.png`
> in the current set. The three `commodify-*.png` files are still on disk, and
> the `WM_NCHITTEST` evidence below is the strongest proof in this file that a
> window really became draggable, so it is kept in full.

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

Rewritten against the current set rather than accumulated. Everything here is a
gap in evidence, not a feature known to be broken — nobody has looked.

The gap-closing set above removed most of what this list used to hold: the Mouse
Raid, Cantonese-only mode and the language purchase, the Reborn tree, the
prestige two-key gate, the deep end of the generator ladder, the finished and
furnished house with its coziness gauge, the builders'-pace figure, the factory
automation branch shipping by itself, the golden sprite at the plain look tier,
and the reduced-motion rendering of that sprite. What is written below is what
genuinely remains.

**Whole features with no photograph on this build**

- **Eighteen of the twenty-two pool events.** Sugar Rush, Cookie Eclipse, Clot
  and Market Day are photographed (the last two together, in the double-event
  frame). The rest are described on the site from their shipped definitions.
  Older photographs of Cookie Rain, the Oven Hiccup, a Production Frenzy and a
  Taste Test are on disk from earlier lanes and are described above; they
  predate several changes to the surface, which is why they are not in the
  current tables.
- **Milk at a level worth looking at.** The tide is in every surface capture as a
  band along the floor reading `Wong Tai Sin Milk — 312% milk`, but nothing in
  this set is composed around it.

**States of features that are photographed**

- The home past **three finished rooms**: the Bedroom, Workshop and Garden have
  never been reached, so the twenty- and thirty-minute builds and the fifteen
  dearest pieces of furniture are unit-tested and undrawn.
- A **missed** press on the Oven Dial, with the card's shake and its
  `Missed the band — two seconds off the clock` line. The miss and the walk-away
  were both driven and watched during the dial lane and written down there as
  observations; only wins have been photographed.
- The prestige gate **once a key has been turned** — its keyed, sliding and
  completed states. The gap-closing run opened the gate and stopped there on
  purpose: reaching those states means really spending a run, and a capture is
  not a good enough reason to.

**Things declared only in CSS**

- The **factory panel** and the **raid** under reduced motion, where the pipe
  flow, the derrick and the scurrying stop. The golden sprite's reduced-motion
  rendering is now photographed (`plain-reduced-motion.png`), and the dial's own
  reduced-motion behaviour was always the exception — it is a domain mode rather
  than a CSS declaration, and it is in `golden-dial-stepped.png`.

**Things that do not exist yet**

- The command palette and the appearance editor. Both are named in the tools
  tech tree as game content; neither is a built application surface.

**Method gaps**

- No **genuinely narrow window**. Every frame in the current set is one maximised
  window, so the shop-drawer breakpoint and the bottom-sheet behind it stay
  verified by forcing the breakpoint (see the layout-stability section below)
  rather than by really resizing the application.

**Two faults, photographed rather than missing**

Not gaps, and listed here so a reader looking for what is wrong finds it in the
same place as what is unshown: the raid's HUD plate runs its countdown into its
mice count (`6s5 of 5 mice left`), and the Oven Dial's `Stop the needle` button
drops to a 1.05:1 contrast ratio in the dark theme while a pointer is on it.
Both are described in full in the gap-closing set's section above. Neither is
fixed in this release.

## `sp-locked.png` / `sp-unlocked.png` — the Settings panel becomes a purchase

Taken from the built application on an off-screen Windows desktop named
`SettingsPurchaseCapture`, with a throwaway `--user-data-dir` and its own
debugging port, and captured window-by-handle with `PrintWindow`. Both were
opened and looked at afterwards.

| File | What it shows |
| --- | --- |
| `sp-locked.png` | A genuinely fresh profile, cookie counter at 0. Where the Settings emblem used to sit on the console there is now a coin-slot plate reading `SETTINGS 🍪 25`, and beside it the new free `PRICES` button — the controls catalogue, moved out of Settings so the price list stays readable without paying. The title bar still carries its own unbought chrome plates at 10, 30 and 45, and the close cross is an ordinary button. |
| `sp-unlocked.png` | The same run after the twenty-five cookies were earned by real presses on the cookie and spent by a real press on the plate and then on its confirmation (the balance falls 78 → 53, and the confirmation appears because the price is worth more than one percent of the balance). The plate has become the Settings emblem, the panel is open over the dimmed game, and the language row shows the switch still priced at 60 with the note that English is the free default and the other two modes are bought. |

The panel behind the third capture in this lane — the free `PRICES` console
button — was opened in the same session and read `1 OF 31 BOUGHT`, which is the
whole registry counted live and agrees with the figure the documentation site
publishes.


## `layout-1000px.png` / `layout-1440px.png` — the layout-stability pass

Both taken from the built `dist/` in one session, on an off-screen Windows
desktop named `LayoutLane`, launched by the real Electron binary with its own
debugging port (9411) and a throwaway `--user-data-dir`. Both were opened and
looked at afterwards.

**How the two widths were reached.** The window itself cannot be resized from
outside while the resize purchase is unbought — that is enforced in the main
process on purpose (`src/main/main.ts`, `resizable: false`). So the viewport was
set over the devtools connection with `Emulation.setDeviceMetricsOverride` at
1000x720 and 1440x900, `deviceScaleFactor: 1`, and the images are
`Page.captureScreenshot` of that emulated viewport. The CSS genuinely lays out at
those widths in CSS pixels; nothing about the layout is scaled or faked.

The save is the progressed one `scripts/capture-seed-save.test.ts` writes, pushed
into `localStorage` over the same connection and then loaded normally.

| File | What it shows |
| --- | --- |
| `layout-1000px.png` | The narrowest width the game has to hold, which is where the owner's screenshots came from. The Cursor row reads across: name, rate sub-line and the owned count `220`, each on one line — it used to wrap one word per line down a 34px column. The upgrade shelf shows `READY TO BUY` alone above a whole row of tickets, each carrying its name, what it actually does, and its price. The cabinet head is one row of readouts plus one row of console caps and stays that way whatever lands in it. The card over the rail is the offline-earnings notice, sitting in the one toast column with the achievement toast below it rather than through it. |
| `layout-1440px.png` | The default window. Eight tickets across two rows with their effect lines, `NEARLY THERE` and `ALREADY BOUGHT` below them as separate sections rather than printed over each other, and the shop rail carrying the full priced stepper and its buy button. |

**The cookie-position invariant, measured rather than eyeballed.** From a
genuinely fresh profile, the cookie button's bounding rect was read from the DOM
before any reveal, after buying Shop Sign, and after buying Upgrade Catalogue —
each purchase made by a real press on the discovery ticket's own button.

| Width | Before any reveal | After Shop Sign | After Upgrade Catalogue |
| --- | --- | --- | --- |
| 1000x720 | centre (314.00, 265.21), 122.4 x 122.4 | (314.00, 265.21) | (314.00, 265.21) |
| 1440x900 | centre (534.00, 287.53), 153 x 153 | (534.00, 287.53) | (534.00, 287.53) |

Zero drift on both axes at both widths.

### The clipping audit

| File | What it shows |
| --- | --- |
| `clip-before.png` `clip-after.png` | The same view — the mid-game save at 1000x720 — before and after the clipping audit's fixes. Before: the hero panel ends at `221.6 / SEC` with the hold-to-click line cut off beneath it, the shop rail's footer (the Diesel Depot card and the button that opens the factory) is missing entirely, and the console's third cap reads `ACHIEVEMEN / TS`. After: the hint line is on screen, the depot card is back in the rail with its door, every cap label is whole on one line, and the supplies plates carry their prices again. |

**How these were taken.** From the built `dist/`, launched by the real `electron` binary
onto an off-screen Windows desktop named `ClipAudit`, on its own debugging port and its
own throwaway `--user-data-dir`, with the page target's URL verified as this worktree's
`dist/renderer/index.html` before anything else happened. The save is the `mid` state
written by `scripts/capture-seed-clipping.test.ts` and pushed into localStorage the same
way every other seeded capture in this file is. The viewport is a real
`Emulation.setDeviceMetricsOverride` at 1000x720, and both frames are
`Page.captureScreenshot` of that window at that size. The `before` frame was taken from a
build of the merge commit with this lane's own changes stashed, so the two images differ
by exactly the fixes and nothing else. Both were opened and looked at afterwards — the
mid-word `ACHIEVEMEN / TS` break in the before frame was found that way, by looking,
after the DOM audit had already passed it as "not overflowing".

The audit that produced them, its method and its findings table are in
`docs/clipping-audit.md`.

# Material Cookie Clicker

A Material Design 3 cookie clicker for Windows, built with Electron.

> [!NOTE]
> This project is in early construction. Nothing has been released yet: there is
> no published release, no verified installer, and no packaged runtime. Do not
> treat any capability described here as working until a release exists with
> attached, downloadable assets.

## Contents

- [What it is](#what-it-is)
- [The feature inventory is the tech tree](#the-feature-inventory-is-the-tech-tree)
- [Install](#install)
- [Build it yourself](#build-it-yourself)
- [Documentation](#documentation)

## What it is

An incremental game: click a cookie, buy generators that bake cookies for you,
spend upgrades to multiply the rate, unlock achievements, and ascend to trade
progress for a permanent multiplier.

It is a full desktop application rather than a page — bilingual English and
Hong Kong Cantonese with independent humour levels per language, Material
Design 3 throughout, keyboard and screen-reader operable, and it works with the
network unplugged.

**Nobody ever pays a penny to use it.** No purchase, no licence, no
subscription, no feature held behind a paywall.

## The feature inventory is the tech tree

This application's own features — the command palette, the regex builder, the
authenticator, the file converter, the local model manager, the appearance
editor and the rest — also appear inside the game as **tools** you discover and
unlock by playing, each granting a real gameplay bonus.

**An unlock gates the gameplay bonus and the in-game surfacing only. It never
gates the feature.** Every feature is reachable from settings and the command
palette at all times, whether or not its tool has been unlocked. Nobody should
have to farm cookies to get a regex builder, and this project's completeness
rules forbid satisfying a feature contract by hiding the feature — so the
separation is enforced in code and covered by a test, not left as an intention.

## Language and settings

The application ships a Settings panel, reachable from its gear emblem on the
cabinet console from the very first frame of a new save — it is an application
surface, not something the game unlocks. It holds a language-mode selector
(English, Cantonese, or both at once), which really does re-render every
surface in the app, and two independent 1–5 funny-level sliders, one per
language. The levels persist; the writing does not vary by level yet, because
every string in this build is written once per language, and the panel says so
plainly instead of implying otherwise.

## Install

No release exists yet. A download button will appear here, and on the
documentation site, once a verified installer has actually been published.

Windows installers from this project are **unsigned** and will trigger the
operating system's unknown-publisher warning. That is expected, and is stated
plainly rather than worked around.

### Automatic updates

An installed copy checks this repository's GitHub releases for a newer version
a while after it starts and then roughly every four hours, through the
Squirrel.Windows updater the installer sets up. It never blocks the game: the
check and the download happen outside the window, and a failure is a log line.
When a package has downloaded, a small corner card offers **Restart** or
**Later**.

Squirrel checks the downloaded package's bytes against the SHA1 recorded for it
in the `RELEASES` index it fetched over HTTPS, and refuses a package that does
not match. It cannot check who wrote that index — the artifacts are unsigned
and permanently will be — so the card says the update is unsigned and that
nothing proves who built it, rather than the word "verified". Running from
source has no updater in the process at all; it logs that and shows nothing.

## Build it yourself

| Script | What it does |
| --- | --- |
| `download-dependencies.bat` | Obtains every dependency needed to build and run, into a user-scoped location |
| `build.bat` | Builds the runnable application, then offers to launch it |
| `build-installer.bat` | Produces the same unsigned installer the release pipeline publishes |

All three accept `/s`, `--silent`, and a `SILENT=1` environment variable for a
non-interactive run that exits non-zero on the first real failure.

## Documentation

Categorized feature documentation lives under `docs/`, and the documentation
site is published from `site/`.

## Captures

Real screenshots of the built application, taken from `dist/` running maximised
on an off-screen Windows desktop and photographed window by window via Win32
PrintWindow, then opened and looked at afterwards. One of the sixteen starts from a
genuinely empty profile, with nothing seeded and nothing pressed. The rest start from a save written into the running
application's own storage to skip the grind, and everything bought on top of it —
the seven look rungs, the Settings emblem, a Whack Pass, a storage rung, a house
blueprint and its builders — was a real press on the real control. The home
capture served its sixty seconds of construction on a real clock.

Three things were set that a player cannot reach, each named where it applies:
`data-theme` on the running renderer's root element for the light and dark pair
(the capture desktop follows a dark operating-system scheme, so both members of
that pair are stated rather than one), and the two documented developer-only
local-storage keys that shorten the golden-cookie and random-event schedules.
Those keys change *when* something happens and nothing else — the event that
lands is the real event, at its real duration, with its real arithmetic.

What these still do not show: a genuinely narrow window (every frame is one
maximised window, so the shop-drawer breakpoint stays verified by forcing the
breakpoint); a finished, furnished home; the Reborn tree and the prestige
two-key gate, which both ship but sit below the fold of the Prestige capture;
the deep end of the generator ladder past Shipment; fifteen of the sixteen pool
events and the Mouse Raid itself as opposed to its supplies shelf; the update
notice; and Cantonese-only mode. Older photographs of several of those exist on
disk and are described in `captures/README.md`; they are not listed below
because they are pictures of builds that have since changed.

One thing the run found by looking rather than by testing, and it is a fault
rather than a gap: when all eight console buttons sit on the HUD row, the
raid-supplies shelf clips its third plate, so `Half-HP Whack` loses the end of
its own label under the shelf edge. Comparing two frames in the set pins down
the condition — in `event-sugar-rush.png` an event plate pushes the console
buttons onto a second row and all three plates then print whole — so it is the
crowded single-row HUD that cuts it. Named here rather than cropped out.

<details>
<summary>The sixteen captures of the current build</summary>

| What it shows | Capture |
| --- | --- |
| A genuinely fresh save with the whole look unbought: a white page, a grey disc labelled COOKIE, and a title bar whose own drag region and window caps carry prices of 10, 30 and 45 | ![A brand-new save on a white page. The title bar is the system font with a thin grey rule under it and carries three dashed price plates: Drag the window at 10 cookies, a minimize cap at 30 and a maximize cap at 45, with an ordinary unpriced close cross beside them. Below, one flat panel holds a Cookies readout at 0 and a large grey rectangle with a single flat light-grey circle carrying the word COOKIE. Only two console buttons exist: a free Prices button and a SETTINGS plate priced at 25. There is no shop rail, no upgrade shelf, no illustrated art and no shadow anywhere.](captures/app/plain-start.png) |
| The same run with exactly two of the seven look rungs bought — colour and the cabinet — and everything above them still visibly missing | ![The same window after two look rungs. The page is warm cream inside a chunky dark-brown wooden frame with rounded corners, the Cookies readout stands at 100, and four console buttons sit beside it: Achievements, Tools, Prices and a SETTINGS plate still priced at 25. The hero cookie is a plain brown disc with COOKIE printed on it rather than a drawing, the title is still the ordinary system font rather than a letter-spaced display face, the cabinet interior is one flat cream with no oven glow, and a Shop Sign ticket at the bottom carries a plain square glyph and a Buy button at 10 cookies.](captures/app/plain-upgrading.png) |
| The full surface on a progressed save: HUD plates, the raid-supplies shelf, eight console buttons, the hero cookie, the three-section upgrade shelf and the shop rail | ![The full game surface in the light theme. Three HUD plates read COOKIES 40 quintillion, PER SECOND 14,421,932,820 and PER CLICK 136.32, beside a RAID SUPPLIES shelf whose third plate is clipped by the shelf edge, and a row of eight illustrated console buttons. A drawn chocolate-chip cookie sits over a soft oven glow above 14.3 BILLION / SEC and HOLD TO CLICK REPEATEDLY. The UPGRADES shelf reads 68 / 180 across READY TO BUY with eighteen tickets, NEARLY THERE with two locked rows at 90 of 100 and 78 of 90, and ALREADY BOUGHT with sixty-eight stamps. The SHOP rail on the right carries a priced search field, the Cursor row owning 220 with a Buy button at 338,544,791,711,333, the Grandma row owning 160, and a Diesel Depot card reading 85 L in the tanks and 14 L shipped.](captures/app/game-progressed.png) |
| The same surface in the dark "arcade night" theme — which is itself the seventh and dearest rung of the look ladder | ![The same progressed surface in dark theme: a near-black warm-brown cabinet with amber borders and gold-edged plates, pale readouts on black, dark console caps with their illustrated badges still in colour, the hero cookie in a pool of amber oven glow, dark upgrade tickets with gold rims, and a bright amber Buy button in the shop rail. The layout and every figure are identical to the light capture.](captures/app/game-dark.png) |
| The Diesel Factory, stalled honestly: full tanks stop refining, a full yard stops intake, and the status line names both | ![The Diesel Factory panel over a dimmed game surface. A PRODUCTION FLOOR section shows CRUDE INTAKE at 7.50 bbl/s, REFINING at 0 of 1.00 L/s and STORAGE at 85.0 of 85 L as filled gauges, with a bold line saying the tanks are full so refining has stopped and the yard is full too so intake has stopped as well. Readouts give crude in the yard 170.0 of 170 bbl, crude per litre 2.500 bbl, tank capacity 85 L and litres manufactured 3,144.0 L. Below, the WINFORGE SHIPPING STATION offers Ship 85 L to WinForge, an Auto-ship switch priced at 2,500, and four figures: ready to ship 85 L, litres shipped 14 L, vouchers minted 139, consumed by WinForge 76.](captures/app/dialog-factory.png) |
| The Home with a Kitchen genuinely under construction, its sixty seconds served on a real clock | ![The Home panel over a dimmed game surface. A COZINESS section shows a dial with its needle at the bottom and a 0 beneath, with readouts for coziness 0 of 249, rooms built 0 of 6, furniture placed 0, builders' pace plus 0 percent and spent on the house 15,000 cookies. A BUILDING SITE section reads Building the Kitchen above a bar at 54 percent and Time remaining: 28s, with a bold note that one site and one crew means only one room is ever under construction. Below, a single Kitchen card badged BUILDING shows its floor as a pale plan crossed by scaffolding and repeats the 54 percent and 28 seconds.](captures/app/dialog-home.png) |
| Achievements as an anchored dialog, reading 78 of 201 on this save, with unearned badges hidden behind question marks | ![The Achievements panel over a dimmed game surface. A line reads 78 / 201 unlocked with the figure repeated in Cantonese, then a Search achievements field priced at 50 cookies. Below, a four-column grid of round gold medals named First Bite, 1 Cursor, 10 Cursors, 25 Cursors, 50 Cursors, 100 Cursors, 200 Cursors, 1 Grandma, 10 Grandmas, 25 Grandmas, 50 Grandmas and 100 Grandmas, then a flat grey padlocked medal captioned only with three question marks, followed by 1 Cookie Farm, 10 Cookie Farms and 25 Cookie Farms.](captures/app/dialog-achievements.png) |
| The Tools tech tree reading 0 of 20 unlocked while all twenty of those application features are already usable | ![The Tools panel over a dimmed game surface. A callout across the top reads Every real app feature is already open, beside a What unlocking actually does disclosure. A plate reads 0 / 20 TOOLS UNLOCKED next to an empty track, with a Tool progression switch priced at 300 and a dropdown set to Display plus bonuses only, then a Search tools field priced at 50. Tier 1, badged Bronze, early game, holds two cards: Command Palette and Regex Builder, each marked Ready to unlock with a bilingual description, a gameplay bonus, progress at 50 of 50 clicks and 10 of 10 Cursor, an Unlock now button at 250 and 587.5 cookies, and its own bordered ALWAYS AVAILABLE callout.](captures/app/dialog-tools.png) |
| Statistics — ten counters including the clock-anomaly count, over a per-generator breakdown | ![The Statistics panel over a dimmed game surface. Ten tiles read total cookies baked 90 quintillion, lifetime cookies 90 quintillion, cookies per second 14.42 billion with a bilingual no-change-this-session note, click power 136.3 with the same note, total clicks 12,400, ascension points 42, prestige runs 3, achievements unlocked 78 / 201, tools unlocked 0 / 20, and clock anomalies caught 0. A heading below reads Where your cookies come from, above a table with bilingual headers for generator, owned, CPS and share.](captures/app/dialog-statistics.png) |
| Prestige with the ascension projection printed and multiplied out, and a golden cookie visible on the dimmed stage behind | ![The Prestige panel over a dimmed game surface. Four tiles read ascension points 42, production multiplier times 1.42, prestige runs 3 and lifetime cookies this run 90 quintillion. An Ascension projection states that prestiging right now would earn 448 ascension points, and explains bilingually that each point is a permanent plus one percent, so ascending now would reach times 5.90. A Permanent upgrades section reads NOTHING YET in both languages with a paragraph about pinning in the Reborn tree. Behind the dimmed panel a small golden cookie sprite with a ray burst sits on the game stage.](captures/app/dialog-prestige.png) |
| The free Prices catalogue, counting the control registry live at 8 of 41 rungs bought | ![The Prices panel over a dimmed game surface. A CONTROLS CATALOGUE section carries a badge reading 8 OF 41 BOUGHT and a paragraph saying every control is bought one press at a time, prices are flat and printed, and nothing is gated behind progress. A bordered callout states that two things are never for sale, the close button and this catalogue with its own search field, and that everything else has a price including the Settings panel. A free search field follows, captioned that it is free. A group headed THE WINDOW ITSELF lists Close the window with a rung called The exit at 1 cookie, Drag the window at 10, and the start of a Minimize entry.](captures/app/dialog-prices.png) |
| Settings opened from a progressed save, with every row on it carrying its own price | ![The Settings panel over a dimmed game surface. A LANGUAGE MODE section carries a Language mode switch plate priced at 60 cookies, a note that the setting persists across restarts and applies to every surface including the settings panel itself, and a callout saying English is the default and free forever while Cantonese and bilingual are separate purchases, and that buying a mode does not switch to it. A FUNNY LEVEL section warns these are two separate controls rather than one shared slider, with an English funny slider plate at 35 and a Cantonese funny slider plate at 35 side by side, and a closing note that this build has one voice per language so nothing on screen reads differently yet.](captures/app/dialog-settings.png) |
| The raid-supplies shelf after two real purchases, showing that the storage cap is one shared ladder | ![The game surface with the raid-supplies shelf changed. The shelf is headed RAID SUPPLIES and carries a highlighted gold Storage 5 chip priced at 25,000,000, then three stock plates: Whack Pass at 1 / 5 with its next price at 4,000,000, Bigger Whack at 0 / 5 at 2,500,000, and a third plate labelled Half-HP whose text runs under the shelf's right edge and is cut off, reading 0 / 5 at 2,500,000. The rest of the surface is unchanged.](captures/app/raid-supplies.png) |
| A golden cookie spawned as its own sprite on the stage — the hero cookie no longer collects them | ![The full game surface with a small golden cookie sprite standing low and left of centre over the upgrade shelf, drawn inside a pale ray burst. The large hero cookie in the panel above is plainly separate and not gold at all — it is the ordinary baked one. The rest of the surface is unchanged: HUD plates at 40 quintillion cookies and 14,302,000,300 per second, a RAID SUPPLIES shelf, eight console buttons, the upgrade shelf at 68 / 180, and the shop rail with the Diesel Depot card](captures/app/golden-spawn.png) |
| The Odd Cookie Out puzzle that catching it opens | ![The Odd Cookie Out card open over a dimmed game surface. It is headed Odd Cookie Out, then Round 1 of 3, then the instruction that one cookie is not like the others, press it. Below sits a four-by-four grid of sixteen near-identical pale cookie tiles, each drawn with a scatter of small chocolate chips, one of which differs by a single chip. A wide Let it go button runs along the bottom of the card](captures/app/golden-puzzle.png) |
| One random event running on the real surface | ![The game surface with a Sugar Rush running. The HUD has reflowed to two rows: the top row holds COOKIES 40 quintillion, PER SECOND 14,302,000,300, PER CLICK 136.32, then a bright amber event plate carrying a small sun glyph, the words Sugar Rush, a draining bar and a 5s countdown, and beyond it the RAID SUPPLIES shelf, whose three plates and Storage 3 chip are all fully readable in this wider layout. The eight console buttons have wrapped onto a second row of their own. The drawn hero cookie sits below over its oven glow, the upgrade shelf reads 68 / 180, and a card in the bottom right reads Sugar Rush: Every click lands seven times as hard.](captures/app/event-sugar-rush.png) |

</details>

Older captures from earlier lanes are still on disk under `captures/`, and
`captures/README.md` says what each of them was.

## License

Apache-2.0.

# Handoff

## Graphics-purchase follow-up (2026-08-19)

A brand-new save now renders only the usable plain cookie. `lookStage` derives the structural
`cookie-only`, `palette-only`, and `cabinet` states from purchased rungs; cookie production alone
never advances that state. The next graphics coin slot appears only when its exact price is
affordable, purchases remain ordered and persistent through the existing control-unlock field,
and duplicate dispatches deduct nothing. The cabinet purchase gates the title bar, HUD, console,
discovery and gameplay-owned rails; the glow purchase gates golden rays, and the art purchase
gates room, furniture and gauge drawings. Existing version-9 grandfathering is unchanged.

Focused verification is in `tests/game/look-tiers.test.ts`, including a deliberate red-then-green
proof for the no-auto-grant/single-deduction regression. The previous `plain-start.png` is now
explicitly marked as superseded in public documentation. A corrected built-artifact fresh-state
capture remains required after integration.

Reconciled 2026-08-19 against the integrated application-tools candidate based on the v0.2.55 release. Every number
below was read from a real command, not remembered. Where something is
unverified it says so, and where an earlier version of this file was wrong the
correction is noted rather than quietly applied.

## What this is

**Material Cookie Clicker** — a cookie clicker desktop application for Windows,
built with Electron, bilingual English and Hong Kong Cantonese, with two
independent humour sliders (one per language). It is unsigned by permanent
policy and nobody ever pays anything to use it.

Its defining idea: **the application's own features are the game's tech tree.**
The command palette, regex builder, authenticator, file converter, local model
manager and the rest appear in-game as *tools* the player discovers and — as of
the current design — **buys with cookies**, each granting a gameplay bonus,
alongside a twenty-one-tier generator ladder from Cursor and Grandma through
Office Buildings and Shipment to Portal, the Time Machine, the Idleverse and
the Wok of the Gods.

The progression loop is intentionally endless. Generator ownership and prestige runs have no
terminal cap. After the six authored Home rooms are complete, `startHomeExtension` constructs
repeatable floors through the existing one-site clock; `homeConstruction.extensionLevel` persists
the count, and each floor adds coziness and a small production bonus. The shop-rail Diesel Depot
status card now persists an accessible collapsed/expanded state.

## Current minigame-events release state

The minigame-events work on `main` adds the permanently unlocked
minigame suite at 100,000 lifetime baked cookies and keeps Mouse Raid unlock at
1,000,000. It adds a seeded 6–12 minute schedule with a final-30-second notice,
one persisted active board at a time, and a side-panel flow that supports
minimize, resume, restart, abandon, and reload without pausing the clicker.
The five boards are Klondike draw-3 Solitaire, Memory Match, Cookie 2048,
Minesweeper, and Breakout. Golden Tokens and the Lucky Chance drawer use
duplicate-protected persisted state, with no token generation during offline
progress.

The original expedited lane skipped tests and captures. That historical boundary is superseded by
the v0.2.55 verification pass: the complete local suite reported `903/903`, the installer was built,
and the minigame flow was exercised from the built artifact. A current committed minigame capture
is still missing and remains an explicit evidence gap.

## Final application-tools wiring candidate

The four previously optional Settings → Application tools slots now mount real source surfaces:
the categorized converter plus dedicated PDF operations, the local-model screen through a cached
privileged proxy, identity plus per-element appearance editing, and security/state tools with
operating-system-vault and local-Git history adapters. Tool-card actions route to the exact
application-tools tab. File and PDF requests must use paths granted by the main-process file
pickers; the renderer receives no filesystem primitive.

The local-model integration is intentionally partial. The main process performs the documented
loopback runtime recovery probe and reports the missing/stopped/healthy state. Catalog, pull, chat,
and harness actions remain explicitly unavailable until a fully packaged allowlisted adapter is
present; no renderer network path, arbitrary shell route, cloud fallback, or fake success was
introduced. Authenticator registration persists encrypted material through the credential-vault
adapter, but persisted code-view hydration and authenticated history restore remain pending.

## The one rule a successor must not erode

**Buying or unlocking a tool buys a gameplay bonus and its in-game surfacing. It
never buys, unlocks, or gates the actual application feature.** Every feature is
reachable from settings and the command palette at all times. A player who never
touches the tech tree still has the entire regex builder.

Attaching a *price* to something called "Regex Builder" makes this far easier to
misread, which is why it is enforced structurally rather than by good intentions:

- `ToolDefinition.gatesApplicationFeature` is a literal `false` with its
  reasoning recorded beside it.
- `src/shared/game/tools.ts` deliberately exports **no** predicate shaped like
  "is this feature available". Its absence is the design, not an oversight.
- `tests/game/tools.test.ts` asserts both, and has been deliberately broken and
  watched go red **twice** — once when written, once after the type-fix pass.
- `design/tool-card.html` puts the "Always available" action in its own bordered
  callout, identical on an undiscovered card and a fully unlocked one, so the
  padlock chrome cannot absorb it. See `captures/design/tool-card.png` — that
  image exists specifically to prove this is legible, not merely implemented.

If you are ever tempted to add a convenience helper answering "can the user use
X yet", that is this contract being eroded.

## State, with real numbers

### Verified

| Thing | Evidence |
| --- | --- |
| Project test suite | **56 files, 922 tests, all passing** (`npm run check`, 2026-08-19) |
| `packages/surface-kernel` | **89 tests passing** (`npm test` in that package) |
| `packages/local-ollama` | **37 tests passing** — previously unverifiable, now green once the workspace was wired |
| Completeness negative regression | **8 tests passing** — exact capability/page rows, traceable evidence, article sections and links plus deliberate missing-row, blank-evidence, missing-article/page/section, and broken-anchor red fixtures |
| Smoke test | **7/7** (`npm run smoke`) |
| Build | `npm run build` exits 0, emitting `dist/main`, `dist/preload`, `dist/renderer`, `dist/shared` |
| Contrast | All **46** role pairs across light and dark computed against the real sRGB luminance formula (`node design/_verify/contrast-check.mjs`) |
| Application launches | Photographed from the real build on an off-screen desktop — `captures/app/launch-shell.png` |

The final-wiring `npm run check` total is **1048/1048 tests**: 922 application tests, 37 local
model package tests, and 89 surface-kernel tests, plus both TypeScript checks.

**Test files run against the source tree, not the built artifact.** That
distinction matters here: a unit test that injects the bridge proves the screen
and says nothing about whether the real preload exposes the shape the renderer
expects. `npm run smoke` exists precisely to cover that seam — it reads
`dist/`, not `src/`.

### The published baseline

**The verified published baseline is `v0.2.55`, target
`a98e38c07423a7cfb4cb3190412884a404a7245e`.** The non-draft release was read
back through the GitHub CLI after publication. It contains a 144,457,728-byte
`MaterialCookieClicker-Setup.exe`, a 143,481,570-byte full `.nupkg`, a 93-byte
`RELEASES`, and a 29,631-byte `release-changelog.json`. The Release, CI, and
Pages workflows for that exact commit completed successfully. Local verification
for the same source reported `903/903` tests green and the built desktop was
exercised on an off-screen Windows desktop. The workflows themselves deliberately
run no tests or lint; their green state proves build/publication, not local test quality.

### Newly verified in the 2026-08-16 pass

- **The game has been seen running.** The single-surface game (HUD, cookie
  hero, docked shop rail, upgrade ticket strip on one screen) plus the four
  secondary tabs (Achievements, Tools, Statistics, Prestige) were launched from
  the built `dist/` on an off-screen desktop and captured via PrintWindow. The
  current evidence set is the nine files listed under "The current set" in
  `captures/README.md` — `fresh-start.png`, `shop-revealed.png`,
  `game-progressed.png`, `game-dark.png`, the four `dialog-*.png` and
  `diesel-mint.png`. It supersedes the older `surface-*.png`, which show a build
  with bottom tabs and no progressive disclosure. Purchases were real presses of
  the real controls, not mocked.
- The visual language is the game-first v2 design (`design/`, 78/78 AA pairs
  computed), a deliberate escalation of the non-M3 decision. The core loop
  lives on ONE surface by owner directive — never split shop/upgrades onto
  separate pages again.
- A real Pages site now lives in `site/` and deploys via the existing
  `pages.yml`.

### The 2026-08-17/18 run, in one paragraph

The game is now a full incremental: progressive disclosure from a deliberately
plain app (the entire look is bought in seven tiers), total commodification
(41+ control rungs including the one-cookie exit, priced Settings, priced
languages, the priced "Open it now" shortcut), 21 generators / 180 upgrades /
201 achievements, milk + kittens + a Reborn tree, a diesel-factory subgame
exporting to WinForge through the voucher ledger, a home-construction subgame,
22 random events with rare double/triple stacks and a 30-60-minute Mouse Raid
with buyable consumables and storage, a wandering golden cookie redeemed
through the Oven Dial timing minigame, Squirrel auto-updates (proven by a real
installed update), and a 26-row real-capture evidence matrix. Every system was
built in its own lane, gate-checked (typecheck, vitest, build, smoke,
check-site), captured from the running build, merged, and released through the
standing pipeline.

### Still not verified — do not describe these as working

- ~~Dark theme never captured~~ — captured (`captures/app/game-dark.png`, via
  `data-theme="dark"` on the built renderer root) and it renders correctly.
- Narrow-width drawer behaviour was verified only by patching the breakpoint
  in built CSS, not by resizing a real window.
- **The completeness inventory now exists** at `docs/completeness.md`, with an executable
  exact-ID negative regression in `tests/completeness-inventory.test.ts`. It intentionally records
  many partial, logic-only, and unimplemented canonical rows rather than presenting the project as complete.
- **Application-tool sources are now mounted in the source candidate**, including logo/identity,
  converter/PDF, local-model recovery, appearance, authenticator registration, history, schedules,
  exports, and local status. Their installed interaction and capture evidence remains pending, and
  the full packaged local-model adapter is still partial; `docs/completeness.md` is authoritative.

### Settings, language mode and the funny levels

There IS a settings surface now: a console emblem (a gear), on the console from
the first frame of a brand-new save because Settings is an application surface
and progressive disclosure does not apply to it — asserted in
`tests/game/settings.test.ts`, which also fails if a `settings` key ever appears
in the disclosure record.

**It is now BOUGHT, by owner decree** ("settings still appearing" /
"needs to be purchased"). The emblem is the `settings.open` control, 25 cookies,
and until it is paid for that position on the console holds the ordinary
coin-slot plate with the figure printed on it, which buys itself when pressed.
Priced is not progress-gated, and the distinction is the point: no milestone, no
tool and no unlock stands in front of it, so any save can buy it as soon as it
has clicked 25 cookies — under a minute from a cold start. It is a till, not a
grind.

The boundary that used to justify keeping Settings free — the price list lives
in it — was answered rather than waved away: **the controls catalogue is now its
own free console button** (`console-panels.ts#CATALOGUE_PANEL_ID`), appended
unconditionally beside the Settings slot and never sold at any price, and still
also rendered at the bottom of the Settings panel. A save with zero cookies can
read every price in the game, including the 25 that Settings costs.

**English is the default language and is free forever.** Cantonese and Bilingual
are separate purchases (`settings.language.yue`, 40; `settings.language.both`,
90). Until bought they appear as coin-slot plates inside the language switch,
and `effectiveLanguageMode` renders English whenever the stored preference is a
mode the save does not own — without rewriting the stored preference, which is
still the player's choice.

Migration: schema version 7 exists for exactly this. A save above the same
thousand-lifetime-cookie threshold the v6 grant used is handed
`settings.open`, `settings.language.yue` and `settings.language.both` and
nothing else (`migrations.ts#migrateV6ToV7`, frozen list
`V7_GRANDFATHERED_RUNG_IDS`).

What is real:

- **Language mode (English / Cantonese / Bilingual) works.** One formatting
  function, `formatBilingual` in `src/renderer/game/copy.ts`, decides what a
  bilingual pair renders as; `bilingualText` — which nearly every label already
  went through — delegates to it against a module-level active mode that `App`
  sets during render. Photographed end to end in
  `captures/app/settings-yue.png`.
- **Settings are persisted separately from the game save**
  (`src/renderer/game/app-settings.ts`, key
  `material-cookie-clicker:settings:v1`), so a save wipe never resets the
  language somebody reads the app in. Verified by relaunching the built app
  against the same profile and finding it still in Cantonese-only mode.
- **"Open it now" on a tool card opens Settings** and highlights the closest
  row — when Settings has been bought. When it has not, the press surfaces the
  PURCHASE instead of silently failing: the status region announces the control
  and its literal price, and focus moves to the coin-slot plate on the console
  that sells it. `console-panels.ts#openFeatureOutcome` is the pure decision and
  takes one boolean — whether the rung is owned — and still never consults the
  tech tree. The callout carries one extra honest line saying so, with the
  figure in it, while Settings is unbought. The tools contract is unchanged: no
  application feature is gated behind the tech tree. This one has a price on the
  door, which is a different thing and is written down as such.

What is stored but not yet visible:

- **The two funny levels change nothing on screen.** They are independent, they
  persist, and no string in this build has per-level variants, so there is
  nothing for a level to select. The panel says so in both languages under the
  sliders. Do not "wire them up" with a text transform — write the variants.

Known remainder in the language migration: a small number of accessible names
and a few hardcoded headings (parts of `ShopRail`, `DiscoveryTicket`,
`UpgradeStrip` aria-labels, the `DestructiveGate` section headings) still
compose both languages into one string regardless of the mode. They were left
rather than half-converted; each is a plain `${x.en} · ${x.yue}` template that
`bilingualText` can absorb.

### Minigame-events expansion — documentation handoff, 2026-08-19

The current minigame-events lane is documented in the six files named below.
The implementation already defines the contract; this documentation pass did
not alter its code, styles, tests, captures, or UI surfaces.

- The minigame panel unlocks permanently at exactly **100,000 lifetime baked
  cookies**, and Mouse Raids unlock permanently at **1,000,000**. Both read the
  all-time `stats.totalCookiesBaked` counter, which survives prestige. The
  established prestige tab and action remain at 1B and 1T.
- A seeded, persisted schedule places the next opportunity 6–12 minutes later,
  reveals it only in the last 30 seconds, and refuses to overlap an active
  minigame, random event, or waiting golden cookie. The side panel leaves the
  clicker and production loop running.
- The five playable modes are Klondike Solitaire, Memory Match, Cookie 2048,
  Minesweeper, and Breakout. The active record stores the mode id, status,
  start/update timestamps, and the complete mode-specific board state. Active,
  minimized, completed, and abandoned states are saved; minimize, resume,
  restart, and abandon are explicit lifecycle actions.
- Golden Tokens are awarded by Oven Dial completion, minigame grades, daily
  objectives, achievement milestones, and rare chains. Stable source keys
  prevent duplicate awards; fixed award amounts keep steady income bounded and
  offline progress cannot farm tokens.
- Lucky Chance costs one token and rolls five equal 20% reward slots: two
  cookie bundles, a timed boost, raid supplies, or a rare cosmetic. A duplicate
  result consumes the draw but does not duplicate the claimed reward. The token
  deduction, seeded result, draw count, and duplicate state are persisted in one
  reducer update, while an unavailable token leaves state unchanged.

The original documentation-only lane skipped tests, captures, and UI runs. The later v0.2.55 pass
ran the complete local suite and exercised the built flow; the remaining gap is a committed current-
release minigame capture, not absence of implementation or tests.

### Office Buildings expansion — documentation handoff, 2026-08-19

The generator ladder now documents twenty-one real tiers. The **Office Buildings**
expansion adds **Office Building · 寫字樓** as tier nine, between Wizard Tower and
Shipment, and permanently reveals it at exactly **500,000,000 all-time baked
cookies**. The unlock reads the
lifetime production counter rather than the current balance, so spending cookies
does not hide the row again and prestige does not remove it from the save.

The established thresholds remain unchanged: Minigames at **100,000** lifetime
baked cookies, Mouse Raids at **1,000,000**, prestige visible at
**1,000,000,000**, and prestige usable at **1,000,000,000,000**. The original expedited lane
changed only implementation and related records. The later v0.2.55 pass tested and exercised the
integrated build; a committed Office-row-specific capture remains pending.

Files written in this lane:

1. `README.md`
2. `ROADMAP.md`
3. `HANDOFF.md`
4. `docs/gameplay/README.md`
5. `docs/gameplay/generator-ladder.md`
6. `site/features/generator-ladder.html`
7. `site/features/index.html`

## Work in flight at the end of this session

The independent release-completeness source lanes have converged into the integration candidate.
The final wiring lane mounts their application surfaces and supplies the minimum privileged
adapters described above. Installed UI interaction, capture evidence, and final installer/release
proof remain separate pending work and must not be inferred from source integration or a green
build.

## Layout

| Path | What it is |
| --- | --- |
| `src/shared/game/` | The game domain. Pure TypeScript, no React, no Electron. **One** mutation seam: `applyGameAction` in `reducer.ts`. |
| `src/main`, `src/preload`, `src/renderer` | Electron main, the bridge, the interface. |
| `packages/surface-kernel`, `packages/local-ollama` | Vendored engines, ~10,600 lines. **Read `VENDORED.md` in each before editing** — fixes flow in by re-vendoring from upstream, never by local edits, or the copy silently stops matching its source and nobody can tell which version is running. |
| `design/` | The design system, mirrored to a Claude Design project. Keep them in step. |
| `captures/` | Real screenshots, with a README stating exactly what has *not* been captured. |
| `scripts/` | Build, dependency bootstrap, line counter, release support, smoke test. |

## Things that will bite you

**Node 26 breaks Electron's installer silently.** Its install step prints a
cache hit, exits `0`, and extracts nothing — leaving no executable while
reporting success. `scripts/ensure-electron-binary.mjs` re-extracts the verified
archive and is wired as `prestart`/`pretest`. If Electron appears missing, run
it; do not conclude the dependency is broken. `npm ci` also blocks postinstall
scripts here, which is what makes this necessary after a clean install.

**Relative imports need `.js` extensions.** `tsconfig.main.json` uses `NodeNext`.
An extensionless relative import does **not** fail loudly — it resolves to `any`,
and that `any` spreads outward disguised as unrelated errors. Fifty-eight
compiler errors here turned out to be one cause: thirty-four missing extensions,
whose downstream symptoms looked like sixteen missing type annotations and two
sloppy catch blocks. When many unrelated type errors appear at once, look
upstream for the import that stopped resolving.

**A lane that passes in isolation proves the lane, not the seam.** The game
domain reported a clean typecheck against a scratch config and produced 58
errors against the real one. Both reports were honest.

**A shared file can belong to no lane.** `package-lock.json` was generated
before the vendored packages existed, and the lane that later ran an install
correctly reverted its own lockfile change because that file was outside its
allowed paths. Both obeyed their briefs and the remote build failed in 24
seconds. When parallel lanes have strict path ownership, ask which files belong
to nobody.

**A generator must create its own output directories.** A release job died on
`ENOENT` writing into `site/assets/` because the lane that creates that
directory had not landed. Node's `writeFile` does not create parents, so the
error named the file and said nothing about the directory.

**The theme is deliberately not Material Design 3.** The standing rules require
M3 conformance on every user-facing surface; the owner explicitly overrode that
here, because a game deserves a game's aesthetic. Every accessibility, contrast,
focus, target-size, reduced-motion and offline rule continues to apply
unchanged. This is a decision, not an omission — do not "fix" it back.

## Open issues

- **#1** — the umbrella build issue. Still open; it tracks the whole project.

## Next owner's most useful first move

Run the real built-artifact interaction/capture matrix for every newly mounted Application tools
tab, then build and inspect the unsigned installer at the pinned candidate commit. Keep the
local-model row partial until catalog, queue, chat, and allowlisted harness adapters are packaged
and exercised. Do not convert a pending row to verified from source or test evidence alone.

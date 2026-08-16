# Handoff

Rewritten 2026-08-16 against the repository as it actually is. Every number
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
alongside a fourteen-tier generator ladder from Cursor and Grandma out to
Portal, Time Machine and Prism.

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
| Project test suite | **10 files, 109 tests, all passing** (`npx vitest run tests`) |
| `packages/surface-kernel` | **89 tests passing** (`npm test` in that package) |
| `packages/local-ollama` | **37 tests passing** — previously unverifiable, now green once the workspace was wired |
| Smoke test | **7/7** (`npm run smoke`) |
| Build | `npm run build` exits 0, emitting `dist/main`, `dist/preload`, `dist/renderer`, `dist/shared` |
| Contrast | All **46** role pairs across light and dark computed against the real sRGB luminance formula (`node design/_verify/contrast-check.mjs`) |
| Application launches | Photographed from the real build on an off-screen desktop — `captures/app/launch-shell.png` |

**Test files run against the source tree, not the built artifact.** That
distinction matters here: a unit test that injects the bridge proves the screen
and says nothing about whether the real preload exposes the shape the renderer
expects. `npm run smoke` exists precisely to cover that seam — it reads
`dist/`, not `src/`.

### The published baseline

**Latest release is `v0.1.7`**, non-draft, target commit `37c967b`, carrying a
144,166,912-byte `MaterialCookieClicker-Setup.exe`, a full `.nupkg`, `RELEASES`
and `release-changelog.json`.

**Be precise about what was actually verified.** `v0.1.5` is the release whose
assets, target commit, notes, line-count table, dim sum code name and unsigned
status were each checked by hand. `v0.1.6` and `v0.1.7` shipped automatically
from later pushes through the same pipeline and were **not** individually
audited. The pipeline is proven; those two specific releases are trusted by
inheritance, which is a weaker claim and is stated as one.

An earlier version of this file named `v0.1.5` as "the release". That was true
when written and is now stale by two — exactly the failure mode this file warns
about.

### Not verified — do not describe these as working

- **The game itself has never been seen running.** The launch capture is the
  empty shell; its body reads "The cookie-clicker game surface mounts here"
  because at that commit it genuinely did.
- **No game surface has been captured**: none of the six destinations, the tools
  shop, settings, the command palette, the appearance editor, dark theme in the
  application, narrow widths, or high display scales.
- **The completeness inventory and its negative regression guard do not exist.**
  Until they do, "every canonical feature is present" is an assertion nobody can
  check.
- **App-logo customization is unimplemented** — the one canonical feature with
  no reference implementation in any sibling project.

## Work in flight at the end of this session

Three lanes had subagents still working when the session closed. Their branches
hold whatever had been committed; nothing was lost, and nothing is complete.

| Branch | State |
| --- | --- |
| `lane/game-screens` | Cookie and Generators screens, store, provider, persistence, destructive gate, hold-to-click, narration, tool view model. **Upgrades, Achievements, Statistics, Prestige and Tools screens do not exist.** Never built, never run. |
| `lane/purchasing` | Buy/sell modes, automation and the tool shop. Branch point only — no commits landed. |
| `lane/docs-site` | Categorized documentation under `docs/`. Uncommitted at session end; preserved on its branch. |

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

Finish `lane/game-screens`, then launch the built artifact and photograph every
surface. The pipeline is proven and the interface is not, and that gap is where
the next real defect is.

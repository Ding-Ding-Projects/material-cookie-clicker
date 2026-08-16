# Handoff

Written 2026-08-16. Every claim here was checked against the repository as it
actually is, not against what an earlier note said. Where something is
unverified it says so.

## What this is

**Material Cookie Clicker** — a cookie clicker desktop application for Windows,
built with Electron, bilingual English and Hong Kong Cantonese, with two
independent humour sliders (one per language).

Its defining idea: **the application's own features are the game's tech tree.**
The command palette, regex builder, authenticator, file converter, local model
manager and the rest appear in-game as *tools* you discover and unlock by
playing, each granting a gameplay bonus, alongside an ordinary fourteen-tier
generator ladder.

## The one rule a successor must not erode

**An unlock gates the gameplay bonus and the in-game surfacing. It never gates
the feature.** Every feature is reachable from settings and the command palette
at all times, unlocked or not.

This is not a preference. The project's completeness contract fails closed when
a user-facing feature can be absent and forbids satisfying a feature contract by
hiding the feature — and separately, nobody should have to farm cookies to get a
regex builder. It is enforced structurally rather than by intention:

- `ToolDefinition.gatesApplicationFeature` is a literal `false` with the reason
  recorded beside it.
- `src/shared/game/tools.ts` deliberately exports **no** predicate shaped like
  "is this feature available", because availability is not a question the game
  is permitted to answer. Its absence is the design.
- `tests/game/tools.test.ts` asserts both. That test was broken on purpose and
  watched go red before it was trusted, twice — once when written and again
  after the type-fix pass.

If you are ever tempted to add a convenience helper answering "can the user use
X yet", that is this contract being eroded.

## State, honestly

### Verified

- **Release `v0.1.5` is published and real.** Not a draft, target commit
  `bfb6d0ce3a1261cf26bb688dd298114e36c3c90b`, with a 144 MB `Setup.exe`, a
  `RELEASES` index and a full `.nupkg`. Unsigned, and the notes say so — code
  signing is permanently prohibited here.
- **CI and Release both green.** `windows-build` and `publish` had never
  completed in this repository before that commit.
- **`npm run build` exits 0**; `npx vitest run tests` passes 109 tests across 10
  files; the vendored packages pass 89 and 37 in the integrated tree.
- **Contrast**: all 46 role pairs across light and dark computed against the
  real sRGB luminance formula, not asserted. `node design/_verify/contrast-check.mjs`.

### Not verified — do not describe these as working

- **The application has never been launched from the built artifact.** The
  installer exists and the pipeline works; nothing has confirmed what happens
  when a person runs it.
- **No captures exist.** No surface has been photographed from a real build.
- The completeness inventory and its negative regression Shek Q are **not yet
  written**.
- App-logo customization is unimplemented. It is the one canonical feature with
  no reference implementation anywhere in the sibling projects.

## Layout

| Path | What it is |
| --- | --- |
| `src/shared/game/` | The whole game domain. Pure TypeScript, no React, no Electron. One mutation seam: `applyGameAction` in `reducer.ts`. |
| `src/main`, `src/preload`, `src/renderer` | Electron main, the bridge, and the interface. |
| `packages/surface-kernel`, `packages/local-ollama` | Vendored engines. **Read `VENDORED.md` in each before editing** — fixes flow in by re-vendoring from upstream, never by divergent local edits, or the copy silently stops matching its source. |
| `design/` | The design system. Mirrored to a Claude Design project; keep them in step. |
| `scripts/` | Build, dependency bootstrap, line counter, release support. |

## Things that will bite you

**Node 26 breaks Electron's installer silently.** Its install step prints a
cache hit, exits `0`, and extracts nothing — leaving no executable while
reporting success. `scripts/ensure-electron-binary.mjs` re-extracts the verified
archive and is wired as `prestart`/`pretest`. If `npm start` reports a missing
Electron, run it; do not conclude the dependency is broken.

**`npm ci` blocks postinstall scripts** under this npm's allow-scripts gate,
which is what makes the above necessary after a clean install.

**Relative imports need `.js` extensions.** `tsconfig.main.json` uses `NodeNext`.
An extensionless relative import does not fail loudly — it resolves to `any`,
and that `any` spreads outward disguised as unrelated errors. Fifty-eight
compiler errors here turned out to be one cause: thirty-four missing
extensions. When many unrelated type errors appear at once, look upstream for
the import that stopped resolving rather than patching each symptom.

**A lane that passes in isolation proves the lane, not the seam.** The game
domain reported a clean typecheck against a scratch config and produced 58
errors against the real one. Both reports were honest. Verify against the
project's actual configuration before believing an integration is fine.

**The theme is deliberately not Material Design 3.** The standing rules require
M3 conformance on every user-facing surface; the owner explicitly overrode that
here, on the grounds that a game deserves a game's aesthetic. Every
accessibility, contrast, focus, target-size, reduced-motion and offline rule
continues to apply unchanged. This is a decision, not an omission — do not
"fix" it back.

## Next owner's most useful first move

Install `v0.1.5` and run it. The pipeline is proven and the interface is not,
and that gap is where the next real defect is.

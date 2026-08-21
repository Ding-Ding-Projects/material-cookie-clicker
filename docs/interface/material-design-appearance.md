# Material Design and product appearance

## Behavior

Product chrome uses Material Design 3 tokens, component anatomy, typography, shape, elevation,
motion, focus, and responsive layout. Gameplay illustrations and data encodings keep their
functional bakery-arcade art without turning product controls into custom lookalikes.

Sixteen checked-in HTML references are rendered directly by the dedicated reference app. The
built product exposes a deterministic matching route for every row. Each hand-written inventory
record fixes the screen, state, theme, 1280×800 viewport, display scale, locale, deterministic
fixture, Material primitive audit, raw captures, labelled comparison, visual diff, and any approved
deviation.

## Configuration

The product still sells its presentation through the ordered graphics ladder, including the dark
theme. The separate appearance editor contract remains incomplete.

`design/parity/inventory.json` owns the exact reference set and deterministic tuples.
`design/reference-app/server.mjs` runs the local reference app, while
`src/renderer/DesignParityRoute.tsx` resolves the matching product routes. Reference files are data,
not runtime instructions.

## Failure modes

- A changed reference hash invalidates its previous evidence.
- A missing route, tuple field, primitive audit, receipt, raw capture, comparison, diff, or source
  binding fails the structural or evidence validator.
- A visually different pair remains a defect until the implementation is repaired or an exact
  intentional deviation has a recorded reason and approval.
- A structurally conforming Material audit does not override an open visual-diff defect.
- Historical images remain historical evidence and never satisfy a newer source commit.

## Security and privacy

Appearance changes are local presentation only and must not change installed identity or expose
private custom assets. The reference and product capture routes use deterministic fixtures, block
network access, and require receipts that record expected-surface isolation, privacy review, live
window resolution, and owned cleanup.

## Verification

`design/_verify/design-parity-guard.mjs` validates the exact reference set and runs the negative
proof. `tests/design-parity.test.ts`, `tests/design-reference-modernization.test.ts`, and
`tests/no-m3-remigration.test.ts` cover the inventory, evidence bindings, and Material audit summaries.

At the current integration baseline, all 16 rows have verified reference/product captures,
labelled comparisons, and machine-readable diffs bound to source commit `6f878d9`. All five audit
summaries and their 75 primitive records are conforming. The release verdict is nevertheless red:
all 16 diff reviews are `defect`, so release validation stops with `DIFF_REVIEW_DEFECT`. That is the
truthful current state; verified evidence proves what differs, not that the differences are
approved.

## Suggested articles

- [Appearance editor](../tools/appearance-editor.md)
- [Contrast and reduced motion](../accessibility/contrast-and-reduced-motion.md)
- [Graphics purchase progression](../gameplay/graphics-progression.md)

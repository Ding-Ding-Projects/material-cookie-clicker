# Vendored package: `@material-cookie-clicker/surface-kernel`

This package is **vendored**, not written for Material Cookie Clicker. It is copied wholesale from a
public sibling repository owned by the same organization, and it must stay that way.

## Source

- Repository: `https://github.com/Ding-Ding-Projects/material-tax-reporting`
- Path in that repository: `packages/surface-kernel`
- Upstream commit SHA at time of copy: `7f509f9713dec6e98abc43ac3ea3b1c13260e495`
  (obtained with `git -C material-tax-reporting rev-parse HEAD`)
- Original package name: `@material-tax-reporting/surface-kernel`
- Original package version: `0.1.0`

## License

MIT. The upstream package carries `"license": "MIT"` in its `package.json`; no
separate `LICENSE` file ships inside the package directory itself, and no
per-file copyright header is present upstream — the license is declared at the
package-manifest level, exactly as it was received. The copyright is held by
the `material-tax-reporting` project (Ding-Ding-Projects).

## What was copied

`src/`, `test/`, `scripts/` (the `build.mjs` esbuild helper), `package.json`,
`tsconfig.json`, and `README.md`. The `dist/` directory was **not** copied: it
is upstream's own git-ignored build output (`npm run build` regenerates it via
`esbuild`, consumed only through the package's `"node"` export condition), so
there was nothing tracked there to vendor. It is git-ignored here too — see
`.gitignore` at the repository root — and must be produced locally by running
`npm run build` in this package once a workspace toolchain is wired up.

Read the long explanatory comment inside `package.json` (the `"//"` array)
before touching the `exports` map. It documents a real, previously-hit failure
mode: Node cannot load a bare `.ts` file without `--experimental-strip-types`,
so the `"node"` condition exists specifically to point Node consumers at
`./dist/index.js` while bundlers keep reading `./src/index.ts` directly via
`"default"`. That comment survived the copy unmodified.

## Files modified during vendoring, and why

| File | Change | Reason |
| --- | --- | --- |
| `package.json` | `"name"` changed from `@material-tax-reporting/surface-kernel` to `@material-cookie-clicker/surface-kernel` | Rehoming into the `@material-cookie-clicker` workspace scope. Nothing else in the manifest was touched — the conditional `exports` map, `scripts`, `files`, `sideEffects`, `engines`, and `devDependencies` are byte-identical to upstream. |
| `src/storage-keys.ts` | Every `"material-tax-reporting.site.*"` storage-key literal (and `LEGACY_PREFERENCES_KEY`) rewritten to `"material-cookie-clicker.site.*"` | These are live, load-bearing identifiers — the actual `localStorage`/persistence keys a consuming app reads and writes at runtime, not documentation. Leaving the old organization/product name baked into Material Cookie Clicker's persisted data would be wrong on its own terms, independent of the rename above. |
| `README.md` | The package name in the opening sentence updated to `@material-cookie-clicker/surface-kernel`; a passing reference to "the documentation site and the desktop application" (upstream's own two consumers) generalized to "a documentation site and a desktop application", since Material Cookie Clicker is neither of those specific upstream products | Cosmetic/accuracy only; no behavioral content changed. |

No other file was modified. Every other `.ts` file, `test/*.test.ts`, `tokens.css`,
`tsconfig.json`, and `scripts/build.mjs` are byte-identical to the upstream commit
above.

## The maintenance rule

**Upstream fixes flow in by re-vendoring from a newer upstream commit, never by
divergent local edits.** If a bug is found in this package's logic, the fix
belongs upstream in `material-tax-reporting`, and this copy is refreshed by
repeating the vendoring steps above (copy → rename → rewrite storage keys →
re-verify) against the new commit. A locally patched vendored package silently
stops matching its source, and from that point on nobody — not the next agent,
not a human maintainer — can tell which version of the logic is actually
running in Material Cookie Clicker without diffing every file by hand. Recording the exact
upstream SHA above is what makes that diff possible; do not let it go stale.

When re-vendoring, reapply exactly the two live-identifier changes listed in
the table (package name, storage-key prefixes) — everything else should come
across as a clean, unmodified copy.

## Verification performed at vendoring time

- Own test suite: `node --test --experimental-strip-types test/*.test.ts` run
  directly inside this package directory (no workspace/root tooling required,
  since this package has zero runtime dependencies) — **89 passed, 0 failed**.
- File and total line counts of the copied tree (`src/`, `test/`, `scripts/`,
  the three top-level files) match the upstream source exactly: 40 files,
  5,156 total lines, before and after the copy and the rewrites above.
- `grep -rn "material-tax-reporting"` over the vendored tree returns zero
  matches.

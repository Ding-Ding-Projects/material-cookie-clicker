# Vendored package: `@material-cookie-clicker/local-ollama`

This package is **vendored**, not written for Material Cookie Clicker. It is copied wholesale from a
public sibling repository owned by the same organization, and it must stay that way.

## Source

- Repository: `https://github.com/Ding-Ding-Projects/material-tax-reporting`
- Path in that repository: `packages/local-ollama`
- Upstream commit SHA at time of copy: `7f509f9713dec6e98abc43ac3ea3b1c13260e495`
  (obtained with `git -C material-tax-reporting rev-parse HEAD`)
- Original package name: `@material-tax-reporting/local-ollama`
- Original package version: `0.1.0`

## License

MIT. The upstream package carries `"license": "MIT"` in its `package.json`; no
separate `LICENSE` file ships inside the package directory itself, and no
per-file copyright header is present upstream — the license is declared at the
package-manifest level, exactly as it was received. The copyright is held by
the `material-tax-reporting` project (Ding-Ding-Projects).

## What was copied

`src/`, `test/`, `package.json`, `tsconfig.json`, and `README.md`. This package
has no `scripts/` helper and no build-generated `dist/` directory upstream
(its `exports` map points straight at `./src/index.ts`), so there was nothing
else to bring across.

## Dependency on `@material-cookie-clicker/surface-kernel`

This package's `package.json` declares a single workspace dependency,
`@material-cookie-clicker/surface-kernel` (renamed from `@material-tax-reporting/surface-kernel`
— see below). Three source files import from it by bare specifier:
`src/catalog.ts`, `src/controller.ts`, and `src/view-model.ts`. All three
import statements were rewritten in place; nothing else in those files changed.

## Files modified during vendoring, and why

| File | Change | Reason |
| --- | --- | --- |
| `package.json` | `"name"` changed from `@material-tax-reporting/local-ollama` to `@material-cookie-clicker/local-ollama`; the `dependencies` entry changed from `@material-tax-reporting/surface-kernel` to `@material-cookie-clicker/surface-kernel` | Rehoming into the `@material-cookie-clicker` workspace scope, and pointing at this repository's own vendored copy of the kernel package under its new name. Nothing else in the manifest was touched. |
| `src/catalog.ts` | Import specifier `@material-tax-reporting/surface-kernel` → `@material-cookie-clicker/surface-kernel` | Follows the sibling package's rename; the import would otherwise resolve to nothing in this workspace. |
| `src/controller.ts` | Same import-specifier rewrite | Same reason. |
| `src/view-model.ts` | Same import-specifier rewrite | Same reason. |
| `README.md` | Package name in the opening sentence updated to `@material-cookie-clicker/local-ollama` | Cosmetic/accuracy only; no behavioral content changed. |

No other file was modified. Every other `.ts` file and `test/*.test.ts` is
byte-identical to the upstream commit above.

## The maintenance rule

**Upstream fixes flow in by re-vendoring from a newer upstream commit, never by
divergent local edits.** If a bug is found in this package's logic, the fix
belongs upstream in `material-tax-reporting`, and this copy is refreshed by
repeating the vendoring steps above (copy → rename package and dependency →
rewrite the three import specifiers → re-verify) against the new commit. A
locally patched vendored package silently stops matching its source, and from
that point on nobody can tell which version of the logic is actually running
in Material Cookie Clicker without diffing every file by hand. Recording the exact upstream
SHA above is what makes that diff possible; do not let it go stale. Re-vendor
`@material-cookie-clicker/surface-kernel` and this package together — they are one upstream
commit, and mixing SHAs between them is exactly the drift this rule exists to
prevent.

## Verification performed at vendoring time — and what could NOT be verified

- File and total line counts of the copied tree (`src/`, `test/`, the three
  top-level files) match the upstream source exactly: 22 files, 5,441 total
  lines, before and after the copy and the rewrites above.
- `grep -rn "material-tax-reporting"` over the vendored tree returns zero
  matches.
- **The package's own test suite (`node --test --experimental-strip-types
  test/*.test.ts`) could NOT be run to a real pass/fail count, and this must
  not be read as "verified".** Reason: this package imports
  `@material-cookie-clicker/surface-kernel` by bare specifier, which Node can only resolve
  through `node_modules` — and that resolution depends on a root-level
  workspace `package.json` (declaring the npm/pnpm workspace and running
  `npm install`/`npm ci` to link the sibling package), which this pig is
  scoped to `packages/**` only and does **not** own. No such root manifest
  exists yet in this worktree.
  - As a one-off local diagnostic (not committed, not part of this package),
    a manual `node_modules/@material-cookie-clicker/surface-kernel` symlink was created to
    check what would happen next. Under that symlink, Node's ESM resolver
    picked up `@material-cookie-clicker/surface-kernel`'s `"node"` export condition, which
    points at `./dist/index.js` — and `dist/` is upstream's own git-ignored,
    generated-by-`npm run build` output (see `surface-kernel/VENDORED.md`
    and the explanatory comment in `surface-kernel/package.json`). Building
    it requires the `esbuild` devDependency, which is not installed anywhere
    in this worktree (no root manifest, no `npm install` has ever run here).
    Under that condition, 5 of 14 test files failed on
    `ERR_MODULE_NOT_FOUND` for `.../surface-kernel/dist/index.js`; the
    remaining 9 that don't touch that import path passed.
  - This is not a defect introduced by vendoring — it is upstream's own
    documented Node-vs-bundler resolution design working exactly as
    described, just missing the workspace plumbing (root `package.json`,
    `npm install`, and a `surface-kernel` build step) that another pig owns.
  - **Once the root workspace exists**, real verification is: from the
    repository root, `npm install` (or equivalent), `npm run build --workspace
    packages/surface-kernel` (or `cd packages/surface-kernel && npm run
    build`) to produce `dist/index.js`, then `npm test --workspace
    packages/local-ollama` (or `cd packages/local-ollama && node --test
    --experimental-strip-types test/*.test.ts`). Report the real pass/fail
    count from that run rather than trusting this note indefinitely.

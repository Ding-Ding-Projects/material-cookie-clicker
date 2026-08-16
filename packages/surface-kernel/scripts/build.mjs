/**
 * Produces the compiled JavaScript entry that Node's own loader resolves.
 *
 * The package's `exports` map offers the TypeScript source to bundlers and this
 * compiled file to Node. Node cannot load a `.ts` file: type stripping arrived
 * in Node 22.18.0, and the pinned toolchain for this repository is older than
 * that, so any script Node executes directly would otherwise fail with
 * `ERR_UNKNOWN_FILE_EXTENSION`. See the `//` note in this package's manifest.
 *
 * This step transpiles and bundles; it does not type-check. That is deliberate.
 * A type error must never withhold a release, so the release path may depend on
 * a compiler that produces an artifact and never on a checker that produces a
 * verdict.
 */
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPoint = path.join(packageRoot, 'src', 'index.ts');
const outfile = path.join(packageRoot, 'dist', 'index.js');

// `--if-available` is passed by the install-time `prepare` script and by nothing
// else. An install can legitimately run `prepare` in a context that never
// installed this package's own devDependencies -- the documentation site installs
// only its own workspace, and its bundler aliases this package straight to source
// and so never needs the compiled entry at all. In that context a hard failure
// takes down a build that did not want this artifact in the first place.
//
// The explicit `build` script passes no flag and stays strict, so the release
// path still fails loudly when the compiler is genuinely missing. Skipping is
// announced rather than silent: a build that quietly produced nothing is how a
// missing artifact reaches a runtime that needed it.
const optional = process.argv.includes('--if-available');

let build;
try {
  ({ build } = await import('esbuild'));
} catch (error) {
  if (!optional) throw error;
  process.stdout.write(
    'surface-kernel: esbuild is not installed in this context, so no compiled entry was produced. ' +
      'A bundler consuming the TypeScript source is unaffected; anything Node loads directly must run ' +
      'this package\'s build script in a context where its devDependencies are installed.\n',
  );
  process.exit(0);
}

await build({
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  // esbuild labels each bundled module with a path relative to its working
  // directory, so without this the bytes differ depending on where the script
  // was invoked from. The desktop workspace runs it from `apps/desktop` and a
  // developer runs it from the repository root; both must produce the same
  // artifact, because the release path hashes what this file is folded into.
  absWorkingDir: packageRoot,
  // The package imports no dependency and no Node builtin, so it needs neither
  // a browser nor a Node resolution profile. Anything that starts reaching for
  // one has left the framework-neutral layer and belongs in a surface instead.
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  sourcemap: false,
  legalComments: 'none',
});

// Assert against the produced file rather than the exit code. esbuild reporting
// success proves it ran; only the artifact proves anything was written.
const written = await stat(outfile).catch(() => null);
if (!written?.isFile() || written.size === 0) {
  throw new Error(`The surface kernel build produced no usable entry at ${outfile}.`);
}

process.stdout.write(`surface-kernel: wrote ${path.relative(packageRoot, outfile)} (${written.size} bytes)\n`);

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const packagePath = path.join(root, 'package.json');
const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function requireStableVersion(value, label = 'version') {
  if (typeof value !== 'string' || !STABLE_SEMVER.test(value)) {
    throw new Error(`${label} must be a stable semantic version; received ${JSON.stringify(value)}.`);
  }
  return value;
}

export function releaseVersion(baseVersion, runNumber, runAttempt) {
  requireStableVersion(baseVersion, 'package.json version');
  if (!/^\d+$/.test(runNumber) || !/^\d+$/.test(runAttempt) || Number(runNumber) < 1 || Number(runAttempt) < 1) {
    throw new Error('GitHub run number and attempt must be positive integers.');
  }
  const parsed = STABLE_SEMVER.exec(baseVersion);
  if (!parsed) throw new Error(`package.json version could not be parsed: ${JSON.stringify(baseVersion)}.`);
  const run = Number(runNumber);
  const attempt = Number(runAttempt);
  const patch = Number(parsed[3]);
  if (!Number.isSafeInteger(run) || !Number.isSafeInteger(attempt) || !Number.isSafeInteger(patch + run)) {
    throw new Error('GitHub run number or attempt exceeds the supported semantic-version range.');
  }
  return `${parsed[1]}.${parsed[2]}.${patch + run}`;
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function writeExclusiveJson(target, value) {
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

export async function stageReleaseMetadata({ outputDirectory, version, sourceRoot = root }) {
  requireStableVersion(version, 'effective release version');
  const resolvedRoot = path.resolve(sourceRoot);
  const output = path.resolve(outputDirectory);
  if (isInside(output, resolvedRoot)) {
    throw new Error('Release metadata staging must live outside the checkout so tracked and untracked source stay untouched.');
  }
  const manifest = JSON.parse(await readFile(path.join(resolvedRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(resolvedRoot, 'package-lock.json'), 'utf8'));
  if (manifest.name !== lock.name || !lock.packages || !lock.packages['']) {
    throw new Error('package.json and package-lock.json do not describe the same root package.');
  }
  manifest.version = version;
  lock.version = version;
  lock.packages[''].version = version;
  await mkdir(output, { recursive: true });
  await writeExclusiveJson(path.join(output, 'package.json'), manifest);
  await writeExclusiveJson(path.join(output, 'package-lock.json'), lock);
  return { version, packagePath: path.join(output, 'package.json'), lockPath: path.join(output, 'package-lock.json') };
}

function parseArguments(argv) {
  const options = { runNumber: undefined, runAttempt: undefined, version: undefined, outputDirectory: undefined, printOnly: false };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--run-number') options.runNumber = argv[++index];
    else if (value === '--run-attempt') options.runAttempt = argv[++index];
    else if (value === '--version') options.version = argv[++index];
    else if (value === '--output-dir') options.outputDirectory = argv[++index];
    else if (value === '--print-only') options.printOnly = true;
    else if (value.startsWith('--')) throw new Error(`Unknown option: ${value}`);
    else positionals.push(value);
  }
  if (positionals.length > 0) {
    if (positionals.length !== 2 || options.runNumber || options.runAttempt) {
      throw new Error('Legacy positional use accepts exactly <run-number> <run-attempt>.');
    }
    [options.runNumber, options.runAttempt] = positionals;
  }
  if (options.version && (options.runNumber || options.runAttempt)) {
    throw new Error('Use either --version or a run-number/run-attempt pair, never both.');
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  const version = options.version
    ? requireStableVersion(options.version, '--version')
    : releaseVersion(manifest.version, String(options.runNumber ?? ''), String(options.runAttempt ?? ''));
  if (options.printOnly) {
    if (options.outputDirectory) throw new Error('--print-only cannot be combined with --output-dir.');
  } else {
    if (!options.outputDirectory) {
      throw new Error('--output-dir is required; this command never rewrites tracked package metadata.');
    }
    await stageReleaseMetadata({ outputDirectory: options.outputDirectory, version });
  }
  process.stdout.write(`${version}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

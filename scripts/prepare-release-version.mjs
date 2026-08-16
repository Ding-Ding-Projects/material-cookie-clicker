import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const root = path.resolve(import.meta.dirname, '..');
const packagePath = path.join(root, 'package.json');

export function releaseVersion(baseVersion, runNumber, runAttempt) {
  if (!semver.valid(baseVersion) || semver.prerelease(baseVersion)) {
    throw new Error(`package.json version must be a stable semantic version; received ${JSON.stringify(baseVersion)}.`);
  }
  if (!/^\d+$/.test(runNumber) || !/^\d+$/.test(runAttempt) || Number(runNumber) < 1 || Number(runAttempt) < 1) {
    throw new Error('GitHub run number and attempt must be positive integers.');
  }
  const parsed = semver.parse(baseVersion);
  if (!parsed) throw new Error(`package.json version could not be parsed: ${JSON.stringify(baseVersion)}.`);
  const run = Number(runNumber);
  const attempt = Number(runAttempt);
  if (!Number.isSafeInteger(run) || !Number.isSafeInteger(attempt) || !Number.isSafeInteger(parsed.patch + run)) {
    throw new Error('GitHub run number or attempt exceeds the supported semantic-version range.');
  }
  // A rerun intentionally preserves its release version; a later workflow run must always sort higher.
  const releasePatch = parsed.patch + run;
  return `${parsed.major}.${parsed.minor}.${releasePatch}`;
}

async function main() {
  const [runNumber, runAttempt] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  const version = releaseVersion(manifest.version, runNumber, runAttempt);
  manifest.version = version;
  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${version}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}

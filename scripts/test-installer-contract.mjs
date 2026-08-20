#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseVersion, stageReleaseMetadata } from './prepare-release-version.mjs';
import { createRuntimeVerificationPlan } from './prepare-squirrel-runtime-verification.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (executable, args, label) => {
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${label} failed\n${result.stdout}\n${result.stderr}`);
  return result;
};

const temporary = mkdtempSync(path.join(tmpdir(), 'material-cookie-clicker-installer-contract-'));
try {
  const sourcePackage = readFileSync(path.join(root, 'package.json'));
  const sourceLock = readFileSync(path.join(root, 'package-lock.json'));
  const staged = await stageReleaseMetadata({ outputDirectory: path.join(temporary, 'metadata'), version: '1.2.3', sourceRoot: root });
  const stagedPackage = JSON.parse(readFileSync(staged.packagePath, 'utf8'));
  const stagedLock = JSON.parse(readFileSync(staged.lockPath, 'utf8'));
  if (stagedPackage.version !== '1.2.3' || stagedLock.version !== '1.2.3' || stagedLock.packages[''].version !== '1.2.3') {
    throw new Error('staged package and lock versions do not agree');
  }
  if (hash(sourcePackage) !== hash(readFileSync(path.join(root, 'package.json'))) || hash(sourceLock) !== hash(readFileSync(path.join(root, 'package-lock.json')))) {
    throw new Error('release metadata staging mutated tracked source');
  }
  let refusedInside = false;
  try { await stageReleaseMetadata({ outputDirectory: path.join(root, 'dist', 'forbidden-metadata'), version: '1.2.4', sourceRoot: root }); }
  catch (error) { refusedInside = /outside the checkout/.test(String(error)); }
  if (!refusedInside) throw new Error('release metadata staging accepted a checkout-owned output');
  if (releaseVersion('0.2.0', '56', '1') !== '0.2.56') throw new Error('release version derivation drifted');

  const plan = createRuntimeVerificationPlan({
    installer: path.join(temporary, 'Setup.exe'),
    artifactReceipt: path.join(temporary, 'artifact.json'),
    profile: path.join(temporary, 'profile'),
    evidenceRoot: path.join(temporary, 'evidence'),
    desktop: 'installer-contract-test',
    port: 9444,
    feedUrl: 'https://updates.example.test/material-cookie-clicker/1.2.3-to-1.2.4/',
    priorVersion: '1.2.2',
    candidateVersion: '1.2.3',
    targetVersion: '1.2.4',
    releaseNotesUrl: 'https://updates.example.test/material-cookie-clicker/1.2.4',
  });
  if (plan.processEnvironment.MATERIAL_COOKIE_CLICKER_VERIFY_UPDATE_FEED !== '1') throw new Error('verification plan did not arm the explicit feed boundary');
  let mutableRefused = false;
  try {
    createRuntimeVerificationPlan({ ...plan, feedUrl: 'https://github.com/Ding-Ding-Projects/material-cookie-clicker/releases/latest/download/', priorVersion: '1.2.2', candidateVersion: '1.2.3', targetVersion: '1.2.4', releaseNotesUrl: 'https://updates.example.test/notes' });
  } catch (error) { mutableRefused = /mutable public latest feed/.test(String(error)); }
  if (!mutableRefused) throw new Error('verification plan accepted the mutable public latest feed');

  const powershell = `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  for (const relative of ['scripts/build-common.ps1', 'scripts/build-installer.ps1', 'scripts/verify-squirrel-artifacts.ps1', 'scripts/verify-installed-release-evidence.ps1', 'scripts/test-verify-squirrel-artifacts.ps1', 'scripts/test-packaging-process-exit.ps1']) {
    const command = `$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${path.join(root, relative).replaceAll("'", "''")}',[ref]$null,[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{Write-Error $_};exit 1}`;
    run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], `PowerShell syntax ${relative}`);
  }
  run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'test-verify-squirrel-artifacts.ps1')], 'Squirrel artifact red-green test');
  run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'test-packaging-process-exit.ps1')], 'packaging process exit red-green test');
  run(process.execPath, [path.join(root, 'scripts', 'test-validate-squirrel-runtime-receipt.mjs')], 'runtime receipt red-green test');

  const common = readFileSync(path.join(root, 'scripts', 'build-common.ps1'), 'utf8');
  if (/function Invoke-ProjectInstaller[\s\S]*?Select-Object -First 1/.test(common)) throw new Error('Invoke-ProjectInstaller still uses ambiguous first-match executable selection');
  if (!common.includes('CSC_IDENTITY_AUTO_DISCOVERY') || !common.includes('signerInvocationCount')) throw new Error('signer environment/process provenance is missing');
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const key of ['forceCodeSigning', 'signExecutable', 'signAndEditExecutable']) {
    if (packageJson.build.win[key] !== false) throw new Error(`${key} is not explicitly false`);
  }
  console.log('PASS installer contract staging, signer, artifact, runtime, feed, and syntax red-green checks');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

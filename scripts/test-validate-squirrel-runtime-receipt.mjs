#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const validator = join(here, 'validate-squirrel-runtime-receipt.mjs');
const root = mkdtempSync(join(tmpdir(), 'material-cookie-clicker-runtime-receipt-'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function validate(receiptPath) {
  return spawnSync(process.execPath, [validator, '--input', receiptPath], { encoding: 'utf8' });
}

function expectRejected(receiptPath, receipt, pattern, label) {
  writeFileSync(receiptPath, JSON.stringify(receipt));
  const result = validate(receiptPath);
  if (result.status === 0 || !pattern.test(result.stderr)) throw new Error(`${label} did not fail: ${result.stderr || result.stdout}`);
}

try {
  const installer = Buffer.from('installer');
  const executable = Buffer.from('installed-executable');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const ledger = Buffer.from('{"owned":true}');
  const installerPath = join(root, 'Setup.exe');
  const executablePath = join(root, 'Material Cookie Clicker.exe');
  const screenshotPath = join(root, 'installed.png');
  const ledgerPath = join(root, 'ledger.json');
  const artifactReceiptPath = join(root, 'artifact-receipt.json');
  const receiptPath = join(root, 'runtime-receipt.json');
  writeFileSync(installerPath, installer);
  writeFileSync(executablePath, executable);
  writeFileSync(screenshotPath, png);
  writeFileSync(ledgerPath, ledger);
  const artifactReceipt = { version: 1, valid: true, sourceCommit: 'a'.repeat(40), packageVersion: '1.2.3', setup: { sha256: hash(installer), authenticodeStatus: 'NotSigned' } };
  writeFileSync(artifactReceiptPath, JSON.stringify(artifactReceipt));
  const now = Date.now();
  const receipt = {
    version: 1,
    sourceCommit: 'a'.repeat(40),
    installerPath,
    installerSha256: hash(installer),
    artifactReceiptPath,
    artifactReceiptSha256: hash(readFileSync(artifactReceiptPath)),
    route: 'cheap-lowlevel-headless',
    installation: { setupExitCode: 0, installedExecutablePath: executablePath, installedExecutableSha256: hash(executable), candidateVersion: '1.2.3' },
    launch: { pid: 1234, hwnd: '0x1', windowTitle: 'Material Cookie Clicker', className: 'Chrome_WidgetWin_1', processPath: executablePath, processImageSha256: hash(executable), width: 1, height: 1, installedArtifact: true, screenshotPath, screenshotSha256: hash(png), screenshotWidth: 1, screenshotHeight: 1 },
    update: {
      feedUrl: 'https://updates.example.test/material-cookie-clicker/1.2.3-to-1.2.4/',
      verificationBoundary: { mode: 'explicit-verification-only', flag: 'MATERIAL_COOKIE_CLICKER_VERIFY_UPDATE_FEED', urlVariable: 'MATERIAL_COOKIE_CLICKER_VERIFY_UPDATE_FEED_URL', deterministicPair: true, priorVersion: '1.2.2' },
      observedStates: [{ state: 'available', at: new Date(now).toISOString() }, { state: 'downloading', at: new Date(now + 1000).toISOString() }, { state: 'ready-to-restart', at: new Date(now + 2000).toISOString() }],
      metadataValidated: true,
      packageHashValidated: true,
      unsignedWarningVisible: true,
      restartActionVisible: true,
      laterActionVisible: true,
      unsavedWorkProtectionVerified: true,
      targetVersion: '1.2.4',
      releaseNotesUrl: 'https://updates.example.test/material-cookie-clicker/1.2.4',
    },
    privacy: { visibleDesktopUntouched: true, disposableOperatingSystemBoundary: true, existingUserInstallationAbsent: true, taskOwnedProfile: true, unrelatedWindowsObserved: false },
    cleanup: { ledgerPath, ledgerSha256: hash(ledger), targetsAreExact: true, disposableBoundary: true },
  };
  writeFileSync(receiptPath, JSON.stringify(receipt));
  let result = validate(receiptPath);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);

  receipt.update.packageHashValidated = false;
  expectRejected(receiptPath, receipt, /packageHashValidated/, 'package-hash regression');
  receipt.update.packageHashValidated = true;
  receipt.update.feedUrl = 'https://github.com/Ding-Ding-Projects/material-cookie-clicker/releases/latest/download/';
  expectRejected(receiptPath, receipt, /mutable public latest feed/, 'mutable-feed regression');
  receipt.update.feedUrl = 'https://updates.example.test/material-cookie-clicker/1.2.3-to-1.2.4/';
  [receipt.update.observedStates[0], receipt.update.observedStates[1]] = [receipt.update.observedStates[1], receipt.update.observedStates[0]];
  expectRejected(receiptPath, receipt, /states are missing or out of order/, 'state-order regression');
  [receipt.update.observedStates[0], receipt.update.observedStates[1]] = [receipt.update.observedStates[1], receipt.update.observedStates[0]];
  receipt.launch.processImageSha256 = 'b'.repeat(64);
  expectRejected(receiptPath, receipt, /process image hash/, 'process-image regression');
  receipt.launch.processImageSha256 = hash(executable);
  writeFileSync(artifactReceiptPath, JSON.stringify({ ...artifactReceipt, packageVersion: '9.9.9' }));
  expectRejected(receiptPath, receipt, /artifact receipt SHA-256/, 'artifact-receipt mutation regression');
  console.log('PASS Squirrel runtime receipt positive and negative checks');
} finally {
  rmSync(root, { recursive: true, force: true });
}

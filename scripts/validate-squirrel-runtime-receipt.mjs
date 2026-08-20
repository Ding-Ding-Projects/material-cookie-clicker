#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fail(message) {
  console.error(`Squirrel runtime receipt rejected: ${message}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.log('Usage: node validate-squirrel-runtime-receipt.mjs --input <runtime-receipt.json>');
  process.exit(0);
}
if (argv.length !== 2 || argv[0] !== '--input' || !argv[1]) fail('expected --input <path>');
const receiptPath = resolve(argv[1]);
if (!existsSync(receiptPath)) fail('receipt file does not exist');

let value;
try { value = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch { fail('receipt is not valid JSON'); }
const object = (item) => item && typeof item === 'object' && !Array.isArray(item);
const text = (item) => typeof item === 'string' && item.trim().length > 0;
const hex = (item, size) => text(item) && new RegExp(`^[0-9a-f]{${size}}$`, 'i').test(item);
const positive = (item) => Number.isSafeInteger(item) && item > 0;
const requireTrue = (item, label) => { if (item !== true) fail(`${label} must be true`); };
const hashFile = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const compareVersions = (left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });

if (value.version !== 1) fail('version must be 1');
if (!hex(value.sourceCommit, 40) && !hex(value.sourceCommit, 64)) fail('sourceCommit is invalid');
if (!hex(value.installerSha256, 64)) fail('installerSha256 is invalid');
if (value.route !== 'cheap-lowlevel-headless') fail('route must be cheap-lowlevel-headless');
if (!text(value.installerPath)) fail('installerPath is required');
const installerPath = resolve(value.installerPath);
if (!existsSync(installerPath)) fail('installer does not exist at validation time');
const installerHash = hashFile(installerPath);
if (installerHash !== value.installerSha256.toLowerCase()) fail('installer SHA-256 does not match');

if (!text(value.artifactReceiptPath) || !hex(value.artifactReceiptSha256, 64)) fail('artifact receipt binding is incomplete');
const artifactReceiptPath = resolve(value.artifactReceiptPath);
if (!existsSync(artifactReceiptPath)) fail('artifact receipt does not exist at validation time');
if (hashFile(artifactReceiptPath) !== value.artifactReceiptSha256.toLowerCase()) fail('artifact receipt SHA-256 does not match');
let artifactReceipt;
try { artifactReceipt = JSON.parse(readFileSync(artifactReceiptPath, 'utf8')); } catch { fail('artifact receipt is not valid JSON'); }
if (artifactReceipt.version !== 1 || artifactReceipt.valid !== true || artifactReceipt.sourceCommit !== value.sourceCommit) fail('artifact receipt source binding does not match');
if (!object(artifactReceipt.setup) || artifactReceipt.setup.sha256 !== installerHash || artifactReceipt.setup.authenticodeStatus !== 'NotSigned') fail('artifact receipt setup binding does not match');

if (!object(value.installation) || value.installation.setupExitCode !== 0) fail('installation did not complete successfully');
if (!text(value.installation.installedExecutablePath) || !hex(value.installation.installedExecutableSha256, 64) || !text(value.installation.candidateVersion)) fail('installation evidence is incomplete');
if (artifactReceipt.packageVersion !== value.installation.candidateVersion) fail('installed candidate version does not match the artifact receipt');
const executablePath = resolve(value.installation.installedExecutablePath);
if (!existsSync(executablePath)) fail('installed executable does not exist at validation time');
const executableHash = hashFile(executablePath);
if (executableHash !== value.installation.installedExecutableSha256.toLowerCase()) fail('installed executable SHA-256 does not match');

if (!object(value.launch) || !positive(value.launch.pid) || !text(value.launch.hwnd) || !text(value.launch.windowTitle) || !text(value.launch.className) || !positive(value.launch.width) || !positive(value.launch.height)) fail('launch evidence is incomplete');
requireTrue(value.launch.installedArtifact, 'launch.installedArtifact');
if (value.launch.className !== 'Chrome_WidgetWin_1') fail('launch.className must be Chrome_WidgetWin_1');
if (!text(value.launch.processPath) || resolve(value.launch.processPath).toLowerCase() !== executablePath.toLowerCase()) fail('launch process path is not the installed executable');
if (!hex(value.launch.processImageSha256, 64) || value.launch.processImageSha256.toLowerCase() !== executableHash) fail('launch process image hash is not the installed executable hash');
if (!text(value.launch.screenshotPath) || !hex(value.launch.screenshotSha256, 64) || !positive(value.launch.screenshotWidth) || !positive(value.launch.screenshotHeight)) fail('launch screenshot evidence is incomplete');
const screenshotPath = resolve(value.launch.screenshotPath);
if (!existsSync(screenshotPath)) fail('launch screenshot does not exist');
const screenshot = readFileSync(screenshotPath);
if (createHash('sha256').update(screenshot).digest('hex') !== value.launch.screenshotSha256.toLowerCase()) fail('launch screenshot SHA-256 does not match');
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
if (screenshot.length < 33 || !screenshot.subarray(0, 8).equals(pngSignature) || screenshot.toString('ascii', 12, 16) !== 'IHDR') fail('launch screenshot is not a PNG');
if (screenshot.readUInt32BE(16) !== value.launch.screenshotWidth || screenshot.readUInt32BE(20) !== value.launch.screenshotHeight) fail('launch screenshot dimensions do not match');

if (!object(value.update) || !object(value.update.verificationBoundary)) fail('update verification evidence is required');
const boundary = value.update.verificationBoundary;
if (boundary.mode !== 'explicit-verification-only' || boundary.flag !== 'MATERIAL_COOKIE_CLICKER_VERIFY_UPDATE_FEED' || boundary.urlVariable !== 'MATERIAL_COOKIE_CLICKER_VERIFY_UPDATE_FEED_URL') fail('update verification boundary is not the explicit packaged-process seam');
requireTrue(boundary.deterministicPair, 'update.verificationBoundary.deterministicPair');
if (!text(boundary.priorVersion) || compareVersions(value.installation.candidateVersion, boundary.priorVersion) <= 0) fail('verification priorVersion must be older than candidateVersion');
let feed;
let notes;
try {
  feed = new URL(value.update.feedUrl);
  notes = new URL(value.update.releaseNotesUrl);
} catch { fail('update URLs are invalid'); }
if (feed.protocol !== 'https:' || feed.username || feed.password || feed.hash || feed.search || !feed.pathname.endsWith('/')) fail('feedUrl must be bounded credential-free HTTPS with a trailing slash');
if (feed.hostname === 'github.com' && /\/releases\/latest\/download\/?$/i.test(feed.pathname)) fail('the mutable public latest feed is not deterministic verification evidence');
if (notes.protocol !== 'https:' || notes.username || notes.password) fail('releaseNotesUrl must be credential-free HTTPS');
const observations = Array.isArray(value.update.observedStates) ? value.update.observedStates : [];
const requiredStates = ['available', 'downloading', 'ready-to-restart'];
if (observations.length < requiredStates.length) fail('ordered updater observations are incomplete');
let lastTime = -Infinity;
for (let index = 0; index < requiredStates.length; index += 1) {
  const observation = observations[index];
  if (!object(observation) || observation.state !== requiredStates[index]) fail('updater states are missing or out of order');
  const at = Date.parse(observation.at);
  if (!Number.isFinite(at) || at <= lastTime) fail('updater timestamps are invalid or not increasing');
  lastTime = at;
}
for (const field of ['metadataValidated', 'packageHashValidated', 'unsignedWarningVisible', 'restartActionVisible', 'laterActionVisible', 'unsavedWorkProtectionVerified']) requireTrue(value.update[field], `update.${field}`);
if (!text(value.update.targetVersion) || compareVersions(value.update.targetVersion, value.installation.candidateVersion) <= 0) fail('targetVersion must be newer than candidateVersion');

if (!object(value.privacy)) fail('privacy evidence is required');
for (const field of ['visibleDesktopUntouched', 'disposableOperatingSystemBoundary', 'existingUserInstallationAbsent', 'taskOwnedProfile']) requireTrue(value.privacy[field], `privacy.${field}`);
if (value.privacy.unrelatedWindowsObserved !== false) fail('privacy.unrelatedWindowsObserved must be false');

if (!object(value.cleanup) || !text(value.cleanup.ledgerPath) || !hex(value.cleanup.ledgerSha256, 64)) fail('cleanup ownership ledger is incomplete');
requireTrue(value.cleanup.targetsAreExact, 'cleanup.targetsAreExact');
requireTrue(value.cleanup.disposableBoundary, 'cleanup.disposableBoundary');
const ledgerPath = resolve(value.cleanup.ledgerPath);
if (!existsSync(ledgerPath)) fail('cleanup ownership ledger does not exist');
if (hashFile(ledgerPath) !== value.cleanup.ledgerSha256.toLowerCase()) fail('cleanup ownership ledger SHA-256 does not match');

console.log(JSON.stringify({
  valid: true,
  sourceCommit: value.sourceCommit,
  candidateVersion: value.installation.candidateVersion,
  targetVersion: value.update.targetVersion,
  observedStates: observations.map((entry) => entry.state),
  installerSha256: installerHash,
  installedExecutableSha256: executableHash,
  artifactReceiptSha256: value.artifactReceiptSha256,
}, null, 2));

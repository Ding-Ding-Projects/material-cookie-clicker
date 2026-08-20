#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  loadJsonStrict,
  resolveContained,
  sha256File,
  validateRunLedgerFile,
} from './promotion-receipt-contract.mjs';

function fail(message) {
  console.error(`Evidence transaction rejected: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) fail(`unknown argument ${arg}`);
    result[arg.slice(2)] = argv[++index];
  }
  return result;
}

function atomicReplace(source, target) {
  const temporary = resolve(dirname(target), `.evidence-${process.pid}-${randomUUID()}.tmp`);
  copyFileSync(source, temporary);
  const handle = openSync(temporary, 'r+');
  try { fsyncSync(handle); } finally { closeSync(handle); }
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      renameSync(temporary, target);
      return;
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error?.code)) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
    }
  }
  if (existsSync(temporary)) unlinkSync(temporary);
  throw lastError;
}

function writeExclusiveJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const handle = openSync(path, 'r+');
  try { fsyncSync(handle); } finally { closeSync(handle); }
}

function replaceJson(path, value) {
  const temporary = resolve(dirname(path), `.transaction-${process.pid}-${randomUUID()}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const handle = openSync(temporary, 'r+');
  try { fsyncSync(handle); } finally { closeSync(handle); }
  atomicReplace(temporary, path);
}

const options = parseArgs(process.argv.slice(2));
if (!['stage', 'rollback'].includes(options.mode)) fail('--mode must be stage or rollback');
for (const name of ['repo-root', 'run-root', 'ledger']) if (!options[name]) fail(`--${name} is required`);

let ledgerContext;
try {
  ledgerContext = validateRunLedgerFile(options.ledger, {
    repoRoot: options['repo-root'],
    runRoot: options['run-root'],
    phase: 'promotion',
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const repoRoot = resolve(options['repo-root']);
const runRoot = ledgerContext.runRoot;

if (options.mode === 'stage') {
  for (const name of ['receipt-id', 'raw', 'target', 'expected-raw-sha256', 'transaction']) {
    if (!options[name]) fail(`--${name} is required for stage`);
  }
  if (!/^[0-9a-f]{64}$/u.test(options['expected-raw-sha256'])) fail('--expected-raw-sha256 is invalid');
  const captureRecord = ledgerContext.ledger.captures[options['receipt-id']];
  if (!captureRecord) fail('--receipt-id is not an exact record in the finalized run ledger');
  if (captureRecord.rawPath !== options.raw || captureRecord.promotedPath.replaceAll('\\', '/') !== options.target.replaceAll('\\', '/')) {
    fail('raw/target paths do not match the finalized run ledger');
  }
  if (captureRecord.sha256 !== options['expected-raw-sha256']) fail('raw hash does not match the finalized run ledger');
  const raw = resolveContained(runRoot, options.raw, 'raw capture');
  const target = resolveContained(repoRoot, options.target, 'promoted target', { allowMissing: true });
  const transaction = resolveContained(runRoot, options.transaction, 'transaction output', { allowMissing: true });
  if (existsSync(transaction)) fail('transaction output already exists');
  if (sha256File(raw) !== options['expected-raw-sha256']) fail('raw capture SHA-256 does not match');

  const previousExisted = existsSync(target);
  let previousSha256 = null;
  let backupPath = null;
  if (previousExisted) {
    if (!options['expected-existing-sha256'] || !/^[0-9a-f]{64}$/u.test(options['expected-existing-sha256'])) {
      fail('replacement requires --expected-existing-sha256');
    }
    previousSha256 = sha256File(target);
    if (previousSha256 !== options['expected-existing-sha256']) fail('existing target changed before promotion');
    backupPath = resolve(runRoot, `.evidence-backup-${randomUUID()}.bin`);
    copyFileSync(target, backupPath);
  } else if (options['expected-existing-sha256']) {
    fail('target is absent but an existing hash was supplied');
  }

  const record = {
    version: 1,
    state: 'prepared',
    preparedAt: new Date().toISOString(),
    stagedAt: null,
    repoRoot: resolve(repoRoot),
    runRoot,
    runLedgerSha256: ledgerContext.ledgerSha256,
    receiptId: options['receipt-id'],
    rawPath: raw,
    targetPath: target,
    promotedSha256: options['expected-raw-sha256'],
    previousExisted,
    previousSha256,
    backupPath,
    rollbackPending: true,
  };
  writeExclusiveJson(transaction, record);

  try {
    atomicReplace(raw, target);
    if (sha256File(target) !== record.promotedSha256 || !readFileSync(target).equals(readFileSync(raw))) {
      throw new Error('promoted target read-back differs from raw capture');
    }
    record.state = 'staged';
    record.stagedAt = new Date().toISOString();
    replaceJson(transaction, record);
  } catch (error) {
    try {
      if (backupPath && existsSync(backupPath)) atomicReplace(backupPath, target);
      else if (!previousExisted && existsSync(target)) unlinkSync(target);
      record.state = 'rolled-back-after-stage-error';
      record.rollbackPending = false;
      replaceJson(transaction, record);
    } catch (rollbackError) {
      fail(`staging failed and rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    fail(error instanceof Error ? error.message : String(error));
  }

  console.log(JSON.stringify({ staged: true, receiptId: record.receiptId, target, sha256: record.promotedSha256, transaction }, null, 2));
} else {
  if (!options.transaction) fail('--transaction is required for rollback');
  const transaction = resolveContained(runRoot, options.transaction, 'transaction');
  const record = loadJsonStrict(transaction);
  if (record.version !== 1 || record.state !== 'staged' || record.repoRoot !== resolve(repoRoot) || record.runRoot !== runRoot || record.runLedgerSha256 !== ledgerContext.ledgerSha256 || record.rollbackPending !== true) {
    fail('transaction ownership or state is invalid');
  }
  const target = resolveContained(repoRoot, record.targetPath, 'promoted target');
  if (sha256File(target) !== record.promotedSha256) fail('promoted target changed; rollback refused');
  if (record.previousExisted) {
    const backup = resolveContained(runRoot, record.backupPath, 'transaction backup');
    if (sha256File(backup) !== record.previousSha256) fail('transaction backup changed; rollback refused');
    atomicReplace(backup, target);
  } else {
    unlinkSync(target);
  }
  record.state = 'rolled-back';
  record.rollbackPending = false;
  record.rolledBackAt = new Date().toISOString();
  replaceJson(transaction, record);
  console.log(JSON.stringify({ rolledBack: true, receiptId: record.receiptId, target, restoredSha256: record.previousSha256 }, null, 2));
}

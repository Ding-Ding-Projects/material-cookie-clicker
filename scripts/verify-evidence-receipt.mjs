#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  loadJsonStrict,
  resolveContained,
  sha256File,
  validatePromotionInventory,
  validatePromotionReceipt,
  validateRunLedgerFile,
} from './promotion-receipt-contract.mjs';

function fail(message) {
  console.error(`UI evidence rejected: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const result = { maxAgeHours: 168 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--max-age-hours') result.maxAgeHours = Number(argv[++index]);
    else if (arg.startsWith('--')) result[arg.slice(2)] = argv[++index];
    else fail(`unknown argument ${arg}`);
  }
  return result;
}

const options = parseArgs(process.argv.slice(2));
for (const name of ['receipt', 'repo-root', 'run-root', 'ledger', 'expected-commit']) {
  if (!options[name]) fail(`--${name} is required`);
}
if (!Number.isFinite(options.maxAgeHours) || options.maxAgeHours <= 0 || options.maxAgeHours > 24 * 365) {
  fail('--max-age-hours is outside the supported bound');
}
if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(options['expected-commit'])) fail('--expected-commit is invalid');

const repoRoot = resolve(options['repo-root']);
const runRoot = resolve(options['run-root']);
let head;
try {
  head = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  execFileSync('git', ['-C', repoRoot, 'cat-file', '-e', `${options['expected-commit']}^{commit}`], { stdio: ['ignore', 'ignore', 'ignore'] });
} catch {
  fail('expected commit is not a reachable commit in the Oak Kay');
}
if (head !== options['expected-commit']) fail('Oak Kay HEAD does not match the expected commit');

try {
  const ledgerContext = validateRunLedgerFile(options.ledger, {
    repoRoot,
    runRoot,
    expectedCommit: options['expected-commit'],
    phase: 'promotion',
  });
  const receiptPath = resolveContained(runRoot, options.receipt, 'promotion receipt');
  const receipt = loadJsonStrict(receiptPath);
  const inventoryPath = resolveContained(repoRoot, receipt.inventory?.path, 'promotion inventory');
  const inventory = loadJsonStrict(inventoryPath);
  validatePromotionInventory(inventory, {
    expectedIds: ledgerContext.ledger.rows.flatMap((rowId) => [`${rowId}--reference`, `${rowId}--product`]),
  });
  const result = validatePromotionReceipt(receipt, {
    expectedCommit: options['expected-commit'],
    ledger: ledgerContext.ledger,
    ledgerSha256: ledgerContext.ledgerSha256,
    inventory,
    repoRoot,
    runRoot,
    maxAgeHours: options.maxAgeHours,
  });
  console.log(JSON.stringify({
    ...result,
    receiptSha256: sha256File(receiptPath),
    runLedgerSha256: ledgerContext.ledgerSha256,
    sourceCommit: options['expected-commit'],
    width: receipt.capture.width,
    height: receipt.capture.height,
    documentationFiles: receipt.documentation.length,
  }, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

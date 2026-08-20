import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

export const RUN_LEDGER_MARKER = 'material-cookie-clicker-design-parity-run';
export const PROMOTION_INVENTORY_SCHEMA_VERSION = 2;
export const requiredPromotionRecordFields = Object.freeze([
  'path',
  'sourceCommit',
  'artifactSha256',
  'captureSha256',
  'screen',
  'state',
  'theme',
  'viewportWidth',
  'viewportHeight',
  'scale',
  'interactionProofId',
  'interactionReceiptSha256',
  'inspectionStatus',
]);

const SIDES = Object.freeze(['product', 'reference']);
const HEX_64 = /^[0-9a-f]{64}$/u;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const RECEIPT_ID = /^[a-z0-9][a-z0-9._-]{2,100}$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class PromotionContractError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'PromotionContractError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new PromotionContractError(code, message);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validHwnd(value) {
  if (typeof value !== 'string' || !/^(?:0x[0-9a-f]+|[0-9]+)$/iu.test(value)) return false;
  try { return BigInt(value) > 0n; } catch { return false; }
}

function isoTime(value) {
  return text(value) && Number.isFinite(Date.parse(value));
}

function exactBoolean(value, expected, code, label) {
  if (value !== expected) reject(code, `${label} must be ${expected}`);
}

function requireText(value, code, label) {
  if (!text(value)) reject(code, `${label} must be non-empty text`);
}

function requireHash(value, code, label) {
  if (typeof value !== 'string' || !HEX_64.test(value)) reject(code, `${label} must be a lowercase SHA-256`);
}

function requireCommit(value, code, label) {
  if (typeof value !== 'string' || !COMMIT.test(value)) reject(code, `${label} must be a full hexadecimal commit`);
}

function requireTime(value, code, label) {
  if (!isoTime(value)) reject(code, `${label} must be an ISO timestamp`);
}

function sameSet(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function assertNoDuplicateJsonKeys(source, path) {
  let index = 0;
  const whitespace = /\s/u;
  const skipWhitespace = () => {
    while (index < source.length && whitespace.test(source[index])) index += 1;
  };
  const invalid = () => reject('JSON_INVALID', `${path} is not valid JSON`);
  const parseString = () => {
    if (source[index] !== '"') invalid();
    const start = index;
    index += 1;
    while (index < source.length) {
      const character = source[index++];
      if (character === '"') {
        try { return JSON.parse(source.slice(start, index)); } catch { invalid(); }
      }
      if (character === '\\') {
        if (index >= source.length) invalid();
        const escape = source[index++];
        if (escape === 'u') {
          if (!/^[0-9a-f]{4}$/iu.test(source.slice(index, index + 4))) invalid();
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escape)) invalid();
      } else if (character.charCodeAt(0) < 0x20) invalid();
    }
    invalid();
  };
  const parseValue = () => {
    skipWhitespace();
    const character = source[index];
    if (character === '{') {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (source[index] === '}') { index += 1; return; }
      while (index < source.length) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) reject('JSON_DUPLICATE_KEY', `${path} repeats object key ${key}`);
        keys.add(key);
        skipWhitespace();
        if (source[index++] !== ':') invalid();
        parseValue();
        skipWhitespace();
        const separator = source[index++];
        if (separator === '}') return;
        if (separator !== ',') invalid();
      }
      invalid();
    }
    if (character === '[') {
      index += 1;
      skipWhitespace();
      if (source[index] === ']') { index += 1; return; }
      while (index < source.length) {
        parseValue();
        skipWhitespace();
        const separator = source[index++];
        if (separator === ']') return;
        if (separator !== ',') invalid();
      }
      invalid();
    }
    if (character === '"') { parseString(); return; }
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, index)) { index += literal.length; return; }
    }
    const number = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u)?.[0];
    if (!number) invalid();
    index += number.length;
  };
  parseValue();
  skipWhitespace();
  if (index !== source.length) invalid();
}

export function loadJsonStrict(path) {
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    reject('JSON_FILE_MISSING', `${path} cannot be read`);
  }
  if (source.charCodeAt(0) === 0xfeff) reject('JSON_BOM_FORBIDDEN', `${path} starts with a byte-order mark`);
  assertNoDuplicateJsonKeys(source, path);
  try {
    return JSON.parse(source);
  } catch {
    reject('JSON_INVALID', `${path} is not valid JSON`);
  }
}

function atomicWriteJson(path, value) {
  const temporary = resolve(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const handle = openSync(temporary, 'r+');
  try { fsyncSync(handle); } finally { closeSync(handle); }
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      renameSync(temporary, path);
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

export function appendCaptureToRunLedger(ledgerPath, record, options = {}) {
  const absoluteLedger = resolve(ledgerPath);
  const lockPath = `${absoluteLedger}.lock`;
  let lock;
  try {
    lock = openSync(lockPath, 'wx');
  } catch {
    reject('RUN_LEDGER_LOCKED', 'run ledger is already being updated');
  }
  try {
    const ledger = validateRunLedger(loadJsonStrict(absoluteLedger), { ...options, phase: 'capture' });
    if (!object(ledger.captures)) ledger.captures = {};
    if (Object.hasOwn(ledger.captures, record.id)) reject('CAPTURE_RECORD_EXISTS', `${record.id} already exists in the run ledger`);
    ledger.captures[record.id] = record;
    atomicWriteJson(absoluteLedger, ledger);
    return Object.freeze({ ledger, ledgerSha256: sha256File(absoluteLedger) });
  } finally {
    if (lock !== undefined) closeSync(lock);
    if (existsSync(lockPath)) unlinkSync(lockPath);
  }
}

function canonicalRoot(path, label) {
  const lexical = resolve(path);
  if (!existsSync(lexical)) reject('ROOT_MISSING', `${label} does not exist`);
  return realpathSync(lexical);
}

export function resolveContained(root, path, label, { allowMissing = false } = {}) {
  const canonical = canonicalRoot(root, `${label} root`);
  const lexical = isAbsolute(path) ? resolve(path) : resolve(canonical, path);
  const parent = realpathSync(dirname(lexical));
  const parentRelative = relative(canonical, parent);
  if (parentRelative.startsWith('..') || isAbsolute(parentRelative)) {
    reject('PATH_ESCAPE', `${label} parent escapes its owned root`);
  }
  if (!allowMissing && !existsSync(lexical)) reject('PATH_MISSING', `${label} does not exist`);
  if (!existsSync(lexical)) return lexical;
  if (lstatSync(lexical).isSymbolicLink()) reject('PATH_SYMLINK', `${label} is a symbolic link or junction`);
  const actual = realpathSync(lexical);
  const actualRelative = relative(canonical, actual);
  if (actualRelative === '' || actualRelative.startsWith('..') || isAbsolute(actualRelative)) {
    reject('PATH_ESCAPE', `${label} must be below its owned root`);
  }
  return actual;
}

function validateAsset(asset, label) {
  if (!object(asset)) reject('BUILD_ASSET_INVALID', `${label} must be an object`);
  requireText(asset.path, 'BUILD_ASSET_INVALID', `${label}.path`);
  requireHash(asset.sha256, 'BUILD_ASSET_INVALID', `${label}.sha256`);
}

function validateBuildBinding(build, side, sourceCommit) {
  const label = `builds.${side}`;
  if (!object(build) || build.version !== 1 || build.kind !== side) {
    reject('BUILD_RECEIPT_INVALID', `${label} must be a version-1 ${side} build receipt`);
  }
  if (build.sourceCommit !== sourceCommit) reject('BUILD_SOURCE_MISMATCH', `${label}.sourceCommit does not match the run`);
  requireText(build.receiptPath, 'BUILD_RECEIPT_INVALID', `${label}.receiptPath`);
  requireHash(build.receiptSha256, 'BUILD_RECEIPT_INVALID', `${label}.receiptSha256`);
  requireText(build.artifactPath, 'BUILD_RECEIPT_INVALID', `${label}.artifactPath`);
  requireHash(build.artifactSha256, 'BUILD_RECEIPT_INVALID', `${label}.artifactSha256`);
  requireTime(build.artifactBuiltAt, 'BUILD_RECEIPT_INVALID', `${label}.artifactBuiltAt`);
  requireText(build.loadedUrl, 'BUILD_RECEIPT_INVALID', `${label}.loadedUrl`);
  validateAsset(build.indexHtml, `${label}.indexHtml`);
  if (!Array.isArray(build.scripts) || build.scripts.length === 0) {
    reject('BUILD_SCRIPT_SET_MISSING', `${label}.scripts must name every loaded JavaScript asset`);
  }
  if (!Array.isArray(build.styles) || build.styles.length === 0) {
    reject('BUILD_STYLE_SET_MISSING', `${label}.styles must name every loaded stylesheet`);
  }
  build.scripts.forEach((asset, index) => validateAsset(asset, `${label}.scripts[${index}]`));
  build.styles.forEach((asset, index) => validateAsset(asset, `${label}.styles[${index}]`));
  const paths = [build.indexHtml.path, ...build.scripts.map((asset) => asset.path), ...build.styles.map((asset) => asset.path)];
  if (new Set(paths).size !== paths.length) reject('BUILD_ASSET_DUPLICATE', `${label} repeats a loaded asset path`);
}

function validateRuntime(runtime, side) {
  const label = `runtime.${side}`;
  if (!object(runtime)) reject('RUNTIME_PROOF_INVALID', `${label} is required`);
  requireText(runtime.proofPath, 'RUNTIME_PROOF_INVALID', `${label}.proofPath`);
  requireHash(runtime.proofSha256, 'RUNTIME_PROOF_INVALID', `${label}.proofSha256`);
  if (!positiveInteger(runtime.launchPid)) reject('RUNTIME_IDENTITY_INVALID', `${label}.launchPid must be a live positive integer`);
  if (!validHwnd(runtime.hwnd)) reject('RUNTIME_IDENTITY_INVALID', `${label}.hwnd must be a positive live handle`);
  exactBoolean(runtime.hwndResolvedLive, true, 'RUNTIME_IDENTITY_INVALID', `${label}.hwndResolvedLive`);
  if (runtime.consoleErrorCount !== 0 || runtime.pageErrorCount !== 0) {
    reject('RUNTIME_ERRORS_PRESENT', `${label} records console or page errors`);
  }
  exactBoolean(runtime.visibleDesktopUntouched, true, 'RUNTIME_PRIVACY_INVALID', `${label}.visibleDesktopUntouched`);
  exactBoolean(runtime.expectedSurfaceOnly, true, 'RUNTIME_PRIVACY_INVALID', `${label}.expectedSurfaceOnly`);
  exactBoolean(runtime.unrelatedTargetsObserved, false, 'RUNTIME_PRIVACY_INVALID', `${label}.unrelatedTargetsObserved`);
  requireTime(runtime.observedAt, 'RUNTIME_PROOF_INVALID', `${label}.observedAt`);
}

function validateInspection(inspection, label) {
  if (!object(inspection)) reject('INSPECTION_INCOMPLETE', `${label} is required`);
  for (const field of ['decoded', 'pixelsInspected', 'targetVisible', 'expectedStateVisible', 'sensitiveDataReviewed']) {
    exactBoolean(inspection[field], true, 'INSPECTION_INCOMPLETE', `${label}.${field}`);
  }
  requireText(inspection.reviewer, 'INSPECTION_INCOMPLETE', `${label}.reviewer`);
  requireTime(inspection.reviewedAt, 'INSPECTION_INCOMPLETE', `${label}.reviewedAt`);
}

function validateCaptureRecord(record, id, rowIds) {
  const label = `captures.${id}`;
  if (!object(record) || record.version !== 1 || record.id !== id) reject('CAPTURE_RECORD_INVALID', `${label} identity is invalid`);
  if (!rowIds.includes(record.rowId) || !SIDES.includes(record.side)) reject('CAPTURE_RECORD_INVALID', `${label} row or side is invalid`);
  const expectedId = `${record.rowId}--${record.side}`;
  if (id !== expectedId) reject('CAPTURE_RECORD_INVALID', `${label} does not use the exact row-side id`);
  for (const field of ['rawPath', 'promotedPath', 'interactionProofId', 'interactionReceiptPath', 'privacyScanPath']) {
    requireText(record[field], 'CAPTURE_RECORD_INVALID', `${label}.${field}`);
  }
  for (const field of ['sha256', 'interactionReceiptSha256', 'privacyScanSha256']) {
    requireHash(record[field], 'CAPTURE_RECORD_INVALID', `${label}.${field}`);
  }
  if (!positiveInteger(record.width) || !positiveInteger(record.height) || !positiveNumber(record.scale)) {
    reject('CAPTURE_DIMENSIONS_INVALID', `${label} dimensions or scale are invalid`);
  }
  requireTime(record.startedAt, 'CAPTURE_TIME_INVALID', `${label}.startedAt`);
  requireTime(record.capturedAt, 'CAPTURE_TIME_INVALID', `${label}.capturedAt`);
  if (Date.parse(record.capturedAt) < Date.parse(record.startedAt)) reject('CAPTURE_TIME_INVALID', `${label} ends before it starts`);
  validateInspection(record.inspection, `${label}.inspection`);
}

export function validateRunLedger(ledger, {
  repoRoot,
  runRoot,
  expectedCommit,
  requiredRowIds,
  phase = 'promotion',
} = {}) {
  if (!object(ledger) || ledger.version !== 1) reject('RUN_LEDGER_INVALID', 'run ledger must be a version-1 object');
  if (!object(ledger.owner) || ledger.owner.marker !== RUN_LEDGER_MARKER) reject('RUN_OWNER_INVALID', 'run ledger owner marker is missing');
  requireText(ledger.owner.taskId, 'RUN_OWNER_INVALID', 'owner.taskId');
  requireText(ledger.owner.markerPath, 'RUN_OWNER_INVALID', 'owner.markerPath');
  requireHash(ledger.owner.markerSha256, 'RUN_OWNER_INVALID', 'owner.markerSha256');
  requireText(ledger.owner.repoRoot, 'RUN_OWNER_INVALID', 'owner.repoRoot');
  requireText(ledger.owner.runRoot, 'RUN_OWNER_INVALID', 'owner.runRoot');
  requireTime(ledger.owner.createdAt, 'RUN_OWNER_INVALID', 'owner.createdAt');
  if (ledger.route !== 'cheap-lowlevel-headless') reject('RUN_ROUTE_INVALID', 'run route must be cheap-lowlevel-headless');
  if (!object(ledger.source)) reject('RUN_SOURCE_INVALID', 'run source is required');
  requireCommit(ledger.source.startCommit, 'RUN_SOURCE_INVALID', 'source.startCommit');
  requireCommit(ledger.source.endCommit, 'RUN_SOURCE_INVALID', 'source.endCommit');
  if (ledger.source.startCommit !== ledger.source.endCommit) reject('RUN_SOURCE_CHANGED', 'source commit changed during the run');
  if (expectedCommit && ledger.source.startCommit !== expectedCommit) reject('RUN_SOURCE_MISMATCH', 'run source does not match the expected commit');
  if (repoRoot && resolve(ledger.owner.repoRoot) !== resolve(repoRoot)) reject('RUN_OWNER_INVALID', 'owner.repoRoot does not match the requested Oak Kay');
  if (runRoot && resolve(ledger.owner.runRoot) !== resolve(runRoot)) reject('RUN_OWNER_INVALID', 'owner.runRoot does not match the requested run root');
  if (!Array.isArray(ledger.rows) || ledger.rows.length === 0 || ledger.rows.some((row) => !text(row))) {
    reject('RUN_ROWS_INVALID', 'run ledger must enumerate the exact row ids');
  }
  if (new Set(ledger.rows).size !== ledger.rows.length) reject('RUN_ROWS_INVALID', 'run ledger repeats a row id');
  if (requiredRowIds && !sameSet(ledger.rows, requiredRowIds)) reject('RUN_ROWS_INVALID', 'run ledger row set is incomplete or expanded');
  if (!object(ledger.builds)) reject('BUILD_RECEIPT_INVALID', 'run ledger builds are required');
  for (const side of SIDES) validateBuildBinding(ledger.builds[side], side, ledger.source.startCommit);
  if (!object(ledger.runtime)) reject('RUNTIME_PROOF_INVALID', 'run ledger runtime is required');
  for (const side of SIDES) validateRuntime(ledger.runtime[side], side);
  if (phase === 'capture') return ledger;
  if (phase !== 'promotion') reject('RUN_PHASE_INVALID', `unsupported ledger validation phase ${phase}`);
  if (!object(ledger.captures)) reject('CAPTURE_RECORD_INVALID', 'run ledger captures are required for promotion');
  const expectedCaptureIds = ledger.rows.flatMap((rowId) => SIDES.map((side) => `${rowId}--${side}`));
  if (!sameSet(Object.keys(ledger.captures), expectedCaptureIds)) reject('CAPTURE_SET_INVALID', 'run ledger must contain exactly two records per row');
  for (const id of expectedCaptureIds) validateCaptureRecord(ledger.captures[id], id, ledger.rows);
  if (!object(ledger.cleanup)) reject('RUN_CLEANUP_INCOMPLETE', 'run cleanup proof is required');
  exactBoolean(ledger.cleanup.completed, true, 'RUN_CLEANUP_INCOMPLETE', 'cleanup.completed');
  exactBoolean(ledger.cleanup.ownedOnly, true, 'RUN_CLEANUP_INCOMPLETE', 'cleanup.ownedOnly');
  requireText(ledger.cleanup.proofPath, 'RUN_CLEANUP_INCOMPLETE', 'cleanup.proofPath');
  requireHash(ledger.cleanup.proofSha256, 'RUN_CLEANUP_INCOMPLETE', 'cleanup.proofSha256');
  requireTime(ledger.cleanup.completedAt, 'RUN_CLEANUP_INCOMPLETE', 'cleanup.completedAt');
  return ledger;
}

function assertFileHash(root, path, expected, label) {
  const absolute = resolveContained(root, path, label);
  if (sha256File(absolute) !== expected) reject('HASH_MISMATCH', `${label} SHA-256 does not match`);
  return absolute;
}

function validateBuildFiles(runRoot, build, sourceCommit, side) {
  const receiptPath = assertFileHash(runRoot, build.receiptPath, build.receiptSha256, `${side} build receipt`);
  const stored = loadJsonStrict(receiptPath);
  const comparable = { ...build };
  delete comparable.receiptPath;
  delete comparable.receiptSha256;
  if (JSON.stringify(stored) !== JSON.stringify(comparable)) reject('BUILD_RECEIPT_MISMATCH', `${side} build receipt does not match the ledger`);
  if (stored.sourceCommit !== sourceCommit) reject('BUILD_SOURCE_MISMATCH', `${side} build receipt source commit differs`);
  assertFileHash(runRoot, build.artifactPath, build.artifactSha256, `${side} artifact`);
  assertFileHash(runRoot, build.indexHtml.path, build.indexHtml.sha256, `${side} index.html`);
  build.scripts.forEach((asset, index) => assertFileHash(runRoot, asset.path, asset.sha256, `${side} script ${index}`));
  build.styles.forEach((asset, index) => assertFileHash(runRoot, asset.path, asset.sha256, `${side} style ${index}`));
}

function validateRuntimeFile(runRoot, runtime, side) {
  const path = assertFileHash(runRoot, runtime.proofPath, runtime.proofSha256, `${side} runtime proof`);
  const stored = loadJsonStrict(path);
  for (const field of ['launchPid', 'hwnd', 'hwndResolvedLive', 'consoleErrorCount', 'pageErrorCount', 'visibleDesktopUntouched', 'expectedSurfaceOnly', 'unrelatedTargetsObserved', 'observedAt']) {
    if (stored[field] !== runtime[field]) reject('RUNTIME_PROOF_MISMATCH', `${side} runtime proof field ${field} differs from the ledger`);
  }
}

export function validateRunLedgerFile(ledgerPath, options = {}) {
  if (!options.runRoot) reject('RUN_ROOT_REQUIRED', 'runRoot is required to validate a run ledger file');
  const runRoot = canonicalRoot(options.runRoot, 'run root');
  const expectedLedgerPath = resolve(runRoot, 'run-ledger.json');
  const actualLedgerPath = resolveContained(runRoot, ledgerPath, 'run ledger');
  if (actualLedgerPath !== expectedLedgerPath) reject('RUN_LEDGER_LOCATION_INVALID', 'run ledger must be run-ledger.json at the owned run root');
  const ledger = validateRunLedger(loadJsonStrict(actualLedgerPath), { ...options, runRoot });
  const ownerMarkerPath = assertFileHash(runRoot, ledger.owner.markerPath, ledger.owner.markerSha256, 'run owner marker');
  const ownerMarker = loadJsonStrict(ownerMarkerPath);
  for (const [field, expected] of Object.entries({
    version: 1,
    marker: RUN_LEDGER_MARKER,
    taskId: ledger.owner.taskId,
    repoRoot: ledger.owner.repoRoot,
    runRoot: ledger.owner.runRoot,
    sourceCommit: ledger.source.startCommit,
    createdAt: ledger.owner.createdAt,
  })) {
    if (ownerMarker[field] !== expected) reject('RUN_OWNER_MISMATCH', `run owner marker field ${field} differs from the ledger`);
  }
  for (const side of SIDES) {
    validateBuildFiles(runRoot, ledger.builds[side], ledger.source.startCommit, side);
    validateRuntimeFile(runRoot, ledger.runtime[side], side);
  }
  if ((options.phase ?? 'promotion') === 'promotion') {
    for (const record of Object.values(ledger.captures)) {
      assertFileHash(runRoot, record.rawPath, record.sha256, `${record.id} raw PNG`);
      assertFileHash(runRoot, record.interactionReceiptPath, record.interactionReceiptSha256, `${record.id} interaction proof`);
      const privacyPath = assertFileHash(runRoot, record.privacyScanPath, record.privacyScanSha256, `${record.id} privacy proof`);
      const privacy = loadJsonStrict(privacyPath);
      for (const field of ['visibleDesktopUntouched', 'expectedSurfaceOnly', 'sensitiveDataReviewed']) {
        exactBoolean(privacy[field], true, 'PRIVACY_PROOF_INCOMPLETE', `${record.id} privacy.${field}`);
      }
      exactBoolean(privacy.unrelatedTargetsObserved, false, 'PRIVACY_PROOF_INCOMPLETE', `${record.id} privacy.unrelatedTargetsObserved`);
      if (privacy.reviewer !== record.inspection.reviewer || privacy.reviewedAt !== record.inspection.reviewedAt) {
        reject('PRIVACY_PROOF_MISMATCH', `${record.id} privacy review does not match the ledger inspection`);
      }
    }
    const cleanupPath = assertFileHash(runRoot, ledger.cleanup.proofPath, ledger.cleanup.proofSha256, 'cleanup proof');
    const cleanup = loadJsonStrict(cleanupPath);
    if (cleanup.completed !== true || cleanup.ownedOnly !== true || cleanup.completedAt !== ledger.cleanup.completedAt) {
      reject('RUN_CLEANUP_MISMATCH', 'cleanup proof does not match the ledger');
    }
  }
  return Object.freeze({ ledger, ledgerPath: actualLedgerPath, ledgerSha256: sha256File(actualLedgerPath), runRoot });
}

function validatePendingRecord(record, label) {
  if (record.active !== false || record.status !== 'pending') reject('PROMOTION_PENDING_INVALID', `${label} must be inactive and pending`);
  requireText(record.reason, 'PROMOTION_PENDING_INVALID', `${label}.reason`);
  for (const field of ['receiptSha256', 'sourceCommit', 'artifactSha256', 'captureSha256', 'interactionProofId', 'interactionReceiptSha256']) {
    if (record[field] !== null) reject('PROMOTION_PENDING_INVALID', `${label}.${field} must be null until a fresh run exists`);
  }
  if (record.inspectionStatus !== 'pending') reject('PROMOTION_PENDING_INVALID', `${label}.inspectionStatus must be pending`);
}

function validateActiveRecord(record, label) {
  if (record.active !== true || record.status !== 'verified') reject('PROMOTION_ACTIVE_INVALID', `${label} must be active and verified`);
  requireCommit(record.sourceCommit, 'PROMOTION_ACTIVE_INVALID', `${label}.sourceCommit`);
  requireHash(record.artifactSha256, 'PROMOTION_ACTIVE_INVALID', `${label}.artifactSha256`);
  requireHash(record.captureSha256, 'PROMOTION_ACTIVE_INVALID', `${label}.captureSha256`);
  requireText(record.interactionProofId, 'PROMOTION_ACTIVE_INVALID', `${label}.interactionProofId`);
  requireHash(record.interactionReceiptSha256, 'PROMOTION_ACTIVE_INVALID', `${label}.interactionReceiptSha256`);
  if (record.inspectionStatus !== 'inspected') reject('PROMOTION_ACTIVE_INVALID', `${label}.inspectionStatus must be inspected`);
  requireHash(record.receiptSha256, 'PROMOTION_ACTIVE_INVALID', `${label}.receiptSha256`);
}

export function validatePromotionInventory(inventory, { expectedIds } = {}) {
  if (!object(inventory) || inventory.schemaVersion !== PROMOTION_INVENTORY_SCHEMA_VERSION || !Array.isArray(inventory.records)) {
    reject('PROMOTION_INVENTORY_INVALID', `promotion inventory schemaVersion must be ${PROMOTION_INVENTORY_SCHEMA_VERSION}`);
  }
  const ids = new Set();
  for (const [index, record] of inventory.records.entries()) {
    const label = `records[${index}]`;
    if (!object(record) || !RECEIPT_ID.test(record.id ?? '')) reject('PROMOTION_RECORD_INVALID', `${label}.id is invalid`);
    if (ids.has(record.id)) reject('PROMOTION_RECORD_DUPLICATE', `${record.id} appears more than once`);
    ids.add(record.id);
    for (const field of requiredPromotionRecordFields) {
      if (!Object.hasOwn(record, field)) reject('PROMOTION_FIELD_MISSING', `${record.id}.${field} is missing`);
    }
    requireText(record.rowId, 'PROMOTION_RECORD_INVALID', `${record.id}.rowId`);
    if (!['referenceRaw', 'productRaw'].includes(record.evidenceKey)) reject('PROMOTION_RECORD_INVALID', `${record.id}.evidenceKey is invalid`);
    requireText(record.path, 'PROMOTION_RECORD_INVALID', `${record.id}.path`);
    requireText(record.screen, 'PROMOTION_RECORD_INVALID', `${record.id}.screen`);
    requireText(record.state, 'PROMOTION_RECORD_INVALID', `${record.id}.state`);
    requireText(record.theme, 'PROMOTION_RECORD_INVALID', `${record.id}.theme`);
    if (!positiveInteger(record.viewportWidth) || !positiveInteger(record.viewportHeight) || !positiveNumber(record.scale)) {
      reject('PROMOTION_RECORD_INVALID', `${record.id} viewport or scale is invalid`);
    }
    if (record.active === true) validateActiveRecord(record, record.id);
    else if (record.active === false) validatePendingRecord(record, record.id);
    else reject('PROMOTION_RECORD_INVALID', `${record.id}.active must be boolean`);
  }
  if (expectedIds && !sameSet(ids, expectedIds)) reject('PROMOTION_RECORD_SET_INVALID', 'promotion inventory id set is incomplete or expanded');
  return Object.freeze({ recordCount: inventory.records.length, activeCount: inventory.records.filter((record) => record.active).length });
}

export function promotionRecordFromReceipt(receipt, { rowId, evidenceKey, receiptSha256 }) {
  return {
    id: receipt.id,
    active: true,
    status: 'verified',
    rowId,
    evidenceKey,
    receiptSha256,
    path: receipt.capture.promotedPath.replaceAll('\\', '/'),
    sourceCommit: receipt.source.startCommit,
    artifactSha256: receipt.source.artifactSha256.toLowerCase(),
    captureSha256: receipt.capture.sha256.toLowerCase(),
    screen: receipt.state.screen,
    state: receipt.state.state,
    theme: receipt.state.theme,
    viewportWidth: receipt.state.viewport.width,
    viewportHeight: receipt.state.viewport.height,
    scale: receipt.state.viewport.scale,
    interactionProofId: receipt.runtime.interactionProofId,
    interactionReceiptSha256: receipt.runtime.interactionReceiptSha256.toLowerCase(),
    inspectionStatus: 'inspected',
    reason: null,
  };
}

function expectedPromotionRecord(receipt) {
  return {
    path: receipt.capture.promotedPath.replaceAll('\\', '/'),
    sourceCommit: receipt.source.startCommit,
    artifactSha256: receipt.source.artifactSha256.toLowerCase(),
    captureSha256: receipt.capture.sha256.toLowerCase(),
    screen: receipt.state.screen,
    state: receipt.state.state,
    theme: receipt.state.theme,
    viewportWidth: receipt.state.viewport.width,
    viewportHeight: receipt.state.viewport.height,
    scale: receipt.state.viewport.scale,
    interactionProofId: receipt.runtime.interactionProofId,
    interactionReceiptSha256: receipt.runtime.interactionReceiptSha256.toLowerCase(),
    inspectionStatus: 'inspected',
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePng(bytes, width, height) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    reject('PNG_INVALID', 'capture is not a PNG IHDR stream');
  }
  if (bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height) reject('PNG_DIMENSION_MISMATCH', 'PNG dimensions differ from the receipt');
  let ihdr = 0;
  let idat = 0;
  let iend = 0;
  let finalOffset = 8;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (offset + 12 + length > bytes.length) reject('PNG_INVALID', `PNG chunk ${type} exceeds the file`);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) {
      reject('PNG_INVALID', `PNG chunk ${type} has an invalid CRC`);
    }
    if (['tEXt', 'zTXt', 'iTXt'].includes(type)) reject('PNG_TEXT_METADATA', 'PNG textual metadata is forbidden');
    if (type === 'IHDR') ihdr += 1;
    if (type === 'IDAT') idat += 1;
    if (type === 'IEND') iend += 1;
    offset += 12 + length;
    finalOffset = offset;
    if (type === 'IEND') break;
  }
  if (ihdr !== 1 || idat < 1 || iend !== 1 || finalOffset !== bytes.length) reject('PNG_INVALID', 'PNG chunk structure is incomplete or has trailing bytes');
}

function documentationContainsExactImage(documentPath, promotedPath, alt) {
  const body = readFileSync(documentPath, 'utf8').replaceAll('\\', '/');
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markdown = new RegExp(`!\\[${escape(alt)}\\]\\(${escape(promotedPath)}(?:\\s+"[^"]*")?\\)`);
  const html = new RegExp(`<img\\s+[^>]*src=["']${escape(promotedPath)}["'][^>]*alt=["']${escape(alt)}["'][^>]*>`, 'iu');
  return markdown.test(body) || html.test(body);
}

export function validatePromotionReceipt(receipt, {
  expectedCommit,
  ledger,
  ledgerSha256,
  inventory,
  repoRoot,
  runRoot,
  maxAgeHours = 168,
} = {}) {
  if (!object(receipt) || receipt.version !== 1 || !RECEIPT_ID.test(receipt.id ?? '')) reject('RECEIPT_INVALID', 'receipt identity is invalid');
  if (receipt.route !== 'cheap-lowlevel-headless') reject('RECEIPT_ROUTE_INVALID', 'receipt route must be cheap-lowlevel-headless');
  if (!object(receipt.provenance)) reject('RUN_LEDGER_BINDING_MISSING', 'receipt provenance is required');
  requireText(receipt.provenance.runLedgerPath, 'RUN_LEDGER_BINDING_MISSING', 'provenance.runLedgerPath');
  requireHash(receipt.provenance.runLedgerSha256, 'RUN_LEDGER_BINDING_MISSING', 'provenance.runLedgerSha256');
  if (ledgerSha256 && receipt.provenance.runLedgerSha256 !== ledgerSha256) reject('RUN_LEDGER_BINDING_MISMATCH', 'receipt run ledger hash differs');
  if (!object(receipt.source)) reject('RECEIPT_SOURCE_INVALID', 'receipt source is required');
  requireCommit(receipt.source.startCommit, 'RECEIPT_SOURCE_INVALID', 'source.startCommit');
  requireCommit(receipt.source.endCommit, 'RECEIPT_SOURCE_INVALID', 'source.endCommit');
  if (receipt.source.startCommit !== receipt.source.endCommit) reject('RECEIPT_SOURCE_CHANGED', 'receipt source changed during capture');
  if (expectedCommit && receipt.source.startCommit !== expectedCommit) reject('RECEIPT_SOURCE_MISMATCH', 'receipt source does not match expected commit');
  for (const field of ['artifactPath', 'buildReceiptPath']) requireText(receipt.source[field], 'RECEIPT_SOURCE_INVALID', `source.${field}`);
  for (const field of ['artifactSha256', 'buildReceiptSha256']) requireHash(receipt.source[field], 'RECEIPT_SOURCE_INVALID', `source.${field}`);
  requireTime(receipt.source.artifactBuiltAt, 'RECEIPT_SOURCE_INVALID', 'source.artifactBuiltAt');
  if (!object(receipt.capture)) reject('RECEIPT_CAPTURE_INVALID', 'receipt capture is required');
  for (const field of ['rawPath', 'promotedPath']) requireText(receipt.capture[field], 'RECEIPT_CAPTURE_INVALID', `capture.${field}`);
  for (const field of ['sha256', 'rawSha256']) requireHash(receipt.capture[field], 'RECEIPT_CAPTURE_INVALID', `capture.${field}`);
  if (receipt.capture.sha256 !== receipt.capture.rawSha256 || receipt.capture.mimeType !== 'image/png') reject('RECEIPT_CAPTURE_INVALID', 'raw and promoted PNG bindings differ');
  if (!positiveInteger(receipt.capture.width) || !positiveInteger(receipt.capture.height)) reject('RECEIPT_CAPTURE_INVALID', 'capture dimensions are invalid');
  requireTime(receipt.capture.startedAt, 'RECEIPT_CAPTURE_INVALID', 'capture.startedAt');
  requireTime(receipt.capture.capturedAt, 'RECEIPT_CAPTURE_INVALID', 'capture.capturedAt');
  const artifactBuiltAt = Date.parse(receipt.source.artifactBuiltAt);
  const startedAt = Date.parse(receipt.capture.startedAt);
  const capturedAt = Date.parse(receipt.capture.capturedAt);
  if (startedAt < artifactBuiltAt || capturedAt < startedAt) reject('RECEIPT_TIME_INVALID', 'artifact/build/capture times are out of order');
  if (Date.now() - capturedAt > maxAgeHours * 3600000) reject('RECEIPT_STALE', 'capture is stale');
  if (!object(receipt.state) || !object(receipt.state.viewport)) reject('RECEIPT_STATE_INVALID', 'receipt state tuple is incomplete');
  for (const field of ['surface', 'screen', 'state', 'theme']) requireText(receipt.state[field], 'RECEIPT_STATE_INVALID', `state.${field}`);
  if (!positiveInteger(receipt.state.viewport.width) || !positiveInteger(receipt.state.viewport.height) || !positiveNumber(receipt.state.viewport.scale)) {
    reject('RECEIPT_STATE_INVALID', 'state.viewport must contain width, height, and scale');
  }
  if (!['page', 'window'].includes(receipt.state.captureKind)) reject('RECEIPT_STATE_INVALID', 'state.captureKind must be page or window');
  if (!object(receipt.privacy)) reject('RECEIPT_PRIVACY_INVALID', 'receipt privacy is required');
  for (const field of ['visibleDesktopUntouched', 'expectedSurfaceOnly', 'sensitiveDataReviewed']) exactBoolean(receipt.privacy[field], true, 'RECEIPT_PRIVACY_INVALID', `privacy.${field}`);
  for (const field of ['unrelatedTargetsObserved', 'mocked', 'handEdited']) exactBoolean(receipt.privacy[field], false, 'RECEIPT_PRIVACY_INVALID', `privacy.${field}`);
  validateInspection(receipt.inspection, 'inspection');
  if (!object(receipt.runtime) || !positiveInteger(receipt.runtime.launchPid) || !validHwnd(receipt.runtime.hwnd)) reject('RECEIPT_RUNTIME_INVALID', 'receipt runtime identity is incomplete');
  exactBoolean(receipt.runtime.hwndResolvedLive, true, 'RECEIPT_RUNTIME_INVALID', 'runtime.hwndResolvedLive');
  if (receipt.runtime.consoleErrorCount !== 0 || receipt.runtime.pageErrorCount !== 0) reject('RECEIPT_RUNTIME_INVALID', 'receipt runtime records console or page errors');
  for (const field of ['interactionProofId', 'interactionReceiptPath', 'privacyScanPath']) requireText(receipt.runtime[field], 'RECEIPT_RUNTIME_INVALID', `runtime.${field}`);
  for (const field of ['interactionReceiptSha256', 'privacyScanSha256']) requireHash(receipt.runtime[field], 'RECEIPT_RUNTIME_INVALID', `runtime.${field}`);
  exactBoolean(receipt.runtime.cleanupCompleted, true, 'RECEIPT_RUNTIME_INVALID', 'runtime.cleanupCompleted');
  exactBoolean(receipt.runtime.cleanupOwnedOnly, true, 'RECEIPT_RUNTIME_INVALID', 'runtime.cleanupOwnedOnly');
  if (!object(receipt.inventory) || receipt.inventory.recordId !== receipt.id) reject('RECEIPT_INVENTORY_INVALID', 'receipt inventory identity is invalid');
  requireText(receipt.inventory.path, 'RECEIPT_INVENTORY_INVALID', 'inventory.path');
  if (!Array.isArray(receipt.documentation) || receipt.documentation.length === 0) reject('RECEIPT_DOCUMENTATION_INVALID', 'receipt needs at least one documentation link');
  for (const [index, entry] of receipt.documentation.entries()) {
    if (!object(entry)) reject('RECEIPT_DOCUMENTATION_INVALID', `documentation[${index}] is invalid`);
    requireText(entry.path, 'RECEIPT_DOCUMENTATION_INVALID', `documentation[${index}].path`);
    requireText(entry.alt, 'RECEIPT_DOCUMENTATION_INVALID', `documentation[${index}].alt`);
  }
  if (ledger) {
    if (ledger.source.startCommit !== receipt.source.startCommit) reject('RUN_LEDGER_BINDING_MISMATCH', 'receipt source differs from run ledger');
    const side = receipt.id.endsWith('--reference') ? 'reference' : receipt.id.endsWith('--product') ? 'product' : null;
    if (!side) reject('RECEIPT_ID_INVALID', 'receipt id must end in --reference or --product');
    const build = ledger.builds[side];
    if (build.artifactPath !== receipt.source.artifactPath || build.artifactSha256 !== receipt.source.artifactSha256 || build.receiptPath !== receipt.source.buildReceiptPath || build.receiptSha256 !== receipt.source.buildReceiptSha256 || build.artifactBuiltAt !== receipt.source.artifactBuiltAt) {
      reject('BUILD_BINDING_MISMATCH', 'receipt build binding differs from the run ledger');
    }
    const capture = ledger.captures[receipt.id];
    if (!capture || capture.rawPath !== receipt.capture.rawPath || capture.promotedPath !== receipt.capture.promotedPath || capture.sha256 !== receipt.capture.sha256 || capture.interactionProofId !== receipt.runtime.interactionProofId || capture.interactionReceiptSha256 !== receipt.runtime.interactionReceiptSha256 || capture.privacyScanSha256 !== receipt.runtime.privacyScanSha256) {
      reject('CAPTURE_BINDING_MISMATCH', 'receipt capture/proof binding differs from the run ledger');
    }
    const runtime = ledger.runtime[side];
    if (runtime.launchPid !== receipt.runtime.launchPid || runtime.hwnd !== receipt.runtime.hwnd || runtime.hwndResolvedLive !== receipt.runtime.hwndResolvedLive) reject('RUNTIME_BINDING_MISMATCH', 'receipt runtime identity differs from the run ledger');
  }
  if (inventory) {
    validatePromotionInventory(inventory);
    const records = inventory.records.filter((record) => record.id === receipt.id && record.active === true);
    if (records.length !== 1) reject('PROMOTION_ACTIVE_RECORD_INVALID', 'receipt needs exactly one active exact promotion record');
    const expected = expectedPromotionRecord(receipt);
    for (const [field, value] of Object.entries(expected)) {
      if (records[0][field] !== value) reject('PROMOTION_RECORD_MISMATCH', `promotion record field ${field} differs from receipt`);
    }
  }
  if (repoRoot && runRoot) {
    const rawPath = assertFileHash(runRoot, receipt.capture.rawPath, receipt.capture.rawSha256, 'raw capture');
    const promotedPath = assertFileHash(repoRoot, receipt.capture.promotedPath, receipt.capture.sha256, 'promoted capture');
    const rawBytes = readFileSync(rawPath);
    const promotedBytes = readFileSync(promotedPath);
    if (!rawBytes.equals(promotedBytes)) reject('PROMOTED_BYTES_DIFFER', 'promoted capture bytes differ from raw capture');
    validatePng(promotedBytes, receipt.capture.width, receipt.capture.height);
    assertFileHash(runRoot, receipt.source.buildReceiptPath, receipt.source.buildReceiptSha256, 'build receipt');
    assertFileHash(runRoot, receipt.runtime.interactionReceiptPath, receipt.runtime.interactionReceiptSha256, 'interaction proof');
    assertFileHash(runRoot, receipt.runtime.privacyScanPath, receipt.runtime.privacyScanSha256, 'privacy proof');
    assertFileHash(runRoot, receipt.provenance.runLedgerPath, receipt.provenance.runLedgerSha256, 'run ledger');
    const artifactPath = assertFileHash(runRoot, receipt.source.artifactPath, receipt.source.artifactSha256, 'source artifact');
    if (!artifactPath) reject('ARTIFACT_MISSING', 'source artifact is absent');
    const inventoryPath = resolveContained(repoRoot, receipt.inventory.path, 'promotion inventory');
    const diskInventory = loadJsonStrict(inventoryPath);
    if (!inventory) validatePromotionInventory(diskInventory);
    for (const entry of receipt.documentation) {
      const docPath = resolveContained(repoRoot, entry.path, 'documentation');
      if (!documentationContainsExactImage(docPath, receipt.capture.promotedPath.replaceAll('\\', '/'), entry.alt)) {
        reject('DOCUMENTATION_BINDING_MISSING', `${entry.path} lacks the exact image link and alt text`);
      }
    }
  }
  return Object.freeze({ valid: true, id: receipt.id, captureSha256: receipt.capture.sha256 });
}

export function assertNoHardcodedCaptureIdentity(source, { path = 'source' } = {}) {
  if (typeof source !== 'string') reject('SOURCE_SCAN_INVALID', `${path} must be text`);
  const forbidden = [
    // Anchored at the start of the line, this matched a bare `SOURCE_COMMIT = "..."` and missed
    // every declared form -- `const SOURCE_COMMIT`, `let`, `var`, `export const`, and the Python
    // `SOURCE_COMMIT: str = "..."` -- which is how anyone would actually write it. A guard that
    // catches only the spelling nobody uses is a guard that passes on everything.
    [/^\s*(?:export\s+)?(?:const|let|var)?\s*SOURCE_COMMIT\s*(?::\s*\w+\s*)?=\s*["'][0-9a-f]{40,64}["']/mu, 'hard-coded source commit'],
    [/\b(?:launchPid|hwnd)\s*[":=]\s*["']?\d{2,}["']?/mu, 'hard-coded process/window identity'],
    [/\(\s*["'](?:referenceRaw|productRaw)["'][^\n]*,\s*\d+\s*,\s*\d+\s*\)/mu, 'hard-coded process/window tuple'],
    [/next\s*\([^\n]*glob\s*\(\s*["']\*\.js["']\s*\)/mu, 'arbitrary first-JavaScript artifact selection'],
    [/shutil\.copyfile\s*\(\s*(?:reference_source|product_source)\b/mu, 'direct raw-promotion copy'],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) reject('HARDCODED_CAPTURE_IDENTITY', `${path} contains ${label}`);
  }
  return true;
}

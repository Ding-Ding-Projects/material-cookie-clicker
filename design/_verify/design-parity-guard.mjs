import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePromotionInventory } from '../../scripts/promotion-receipt-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const designRoot = resolve(here, '..');
export const inventoryPath = join(designRoot, 'parity', 'inventory.json');
export const negativeFixturePath = join(designRoot, 'parity', 'negative-proof-fixture.json');
const repositoryRoot = resolve(designRoot, '..');
export const promotionInventoryPath = join(designRoot, 'parity', 'evidence', 'promotion-inventory.json');

const REQUIRED_PRIMITIVES = [
  'buttons', 'fields', 'menus', 'tabs', 'dialogs', 'navigation', 'selectionControls',
  'typography', 'colorRoles', 'shape', 'elevation', 'stateLayers', 'motion', 'focus', 'accessibility',
];
const REQUIRED_EVIDENCE = {
  referenceRaw: 'EVIDENCE_REFERENCE_RAW_MISSING',
  productRaw: 'EVIDENCE_PRODUCT_RAW_MISSING',
  comparison: 'EVIDENCE_COMPARISON_MISSING',
  diff: 'EVIDENCE_DIFF_MISSING',
};
const VALID_AUDIT_STATUSES = new Set(['conforming', 'defect', 'intentional-deviation']);

export class ParityGuardError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'ParityGuardError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new ParityGuardError(code, message); };
const clone = (value) => structuredClone(value);

export function loadInventory() {
  return JSON.parse(readFileSync(inventoryPath, 'utf8'));
}

export function loadNegativeFixture() {
  return JSON.parse(readFileSync(negativeFixturePath, 'utf8'));
}

export function loadPromotionInventory() {
  return JSON.parse(readFileSync(promotionInventoryPath, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function evidencePath(relative, code, label) {
  const absolute = resolve(repositoryRoot, relative);
  if (absolute !== repositoryRoot && !absolute.startsWith(`${repositoryRoot}\\`) && !absolute.startsWith(`${repositoryRoot}/`)) {
    fail(code, `${label} escapes the repository`);
  }
  return absolute;
}

function readJsonEvidence(relative, expectedHash, code, label) {
  const path = evidencePath(relative, code, label);
  if (!existsSync(path)) fail(code, `${label} is absent`);
  if (sha256(path) !== expectedHash) fail(code, `${label} hash is stale`);
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { fail(code, `${label} is not valid JSON`); }
}

function assertPng(path, code, label, width = 1280, height = 800) {
  const bytes = readFileSync(path);
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail(code, `${label} is not a PNG`);
  if (bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height) fail(code, `${label} dimensions are not ${width}x${height}`);
}

function assertPromotionRecord(row, key, evidence, promotionInventory) {
  const expectedId = `${row.id}--${key === 'referenceRaw' ? 'reference' : 'product'}`;
  requireText(evidence.promotionRecordId, 'EVIDENCE_PROMOTION_RECORD_MISSING', `${row.id} ${key} promotion record id`);
  requireText(evidence.receiptSha256, 'EVIDENCE_RECEIPT_HASH_MISSING', `${row.id} ${key} receipt hash`);
  if (evidence.promotionRecordId !== expectedId) fail('EVIDENCE_PROMOTION_RECORD_INVALID', `${row.id} ${key} promotion record identity is invalid`);
  const records = promotionInventory.records.filter((record) => record.id === expectedId && record.active === true);
  if (records.length !== 1) fail('EVIDENCE_PROMOTION_RECORD_INVALID', `${row.id} ${key} needs exactly one active promotion record`);
  const record = records[0];
  const expectedArtifact = key === 'referenceRaw'
    ? row.captureProvenance?.referenceArtifactSha256
    : row.captureProvenance?.productArtifactSha256;
  const expected = {
    rowId: row.id,
    evidenceKey: key,
    receiptSha256: evidence.receiptSha256,
    path: evidence.path,
    sourceCommit: row.sourceCommit,
    artifactSha256: expectedArtifact,
    captureSha256: evidence.sha256,
    screen: row.tuple.screen,
    state: row.tuple.state,
    theme: row.tuple.theme,
    viewportWidth: row.tuple.viewport.width,
    viewportHeight: row.tuple.viewport.height,
    scale: row.tuple.scale,
    inspectionStatus: 'inspected',
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (record[field] !== expectedValue) fail('EVIDENCE_PROMOTION_RECORD_INVALID', `${row.id} ${key} promotion field ${field} does not match`);
  }
  requireText(record.interactionProofId, 'EVIDENCE_PROMOTION_RECORD_INVALID', `${row.id} ${key} interaction proof id`);
  requireText(record.interactionReceiptSha256, 'EVIDENCE_PROMOTION_RECORD_INVALID', `${row.id} ${key} interaction proof hash`);
}

function requireText(value, code, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(code, `${label} must be non-empty text`);
}

function requireNumber(value, code, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(code, `${label} must be a positive number`);
}

function routeTuple(route, routeKind, code) {
  let parsed;
  try {
    parsed = routeKind === 'reference' ? new URL(route, 'http://127.0.0.1') : new URL(route);
  } catch {
    fail(code, `${routeKind} route is not a valid URL`);
  }
  return {
    screen: (parsed.searchParams.get(routeKind === 'reference' ? 'row' : 'designParity'))?.replace(/--[^-]+$/, '') ?? null,
    state: parsed.searchParams.get('state'),
    theme: parsed.searchParams.get('theme'),
    viewport: {
      width: Number(parsed.searchParams.get('width')),
      height: Number(parsed.searchParams.get('height')),
    },
    scale: Number(parsed.searchParams.get('scale')),
    locale: parsed.searchParams.get('locale'),
  };
}

function assertRouteMatchesTuple(row) {
  const expected = row.tuple;
  for (const [kind, value, code] of [
    ['reference', row.reference.route, 'REFERENCE_ROUTE_TUPLE_MISMATCH'],
    ['product', row.product.route, 'PRODUCT_ROUTE_TUPLE_MISMATCH'],
  ]) {
    const actual = routeTuple(value, kind, code);
    const normalizedExpected = JSON.stringify(expected);
    const normalizedActual = JSON.stringify(actual);
    if (normalizedActual !== normalizedExpected) {
      fail(code, `${row.id} ${kind} route tuple ${normalizedActual} does not equal ${normalizedExpected}`);
    }
  }
}

export function validateInventory(inventory, {
  mode = 'structure',
  verifyHashes = true,
  promotionInventory = loadPromotionInventory(),
} = {}) {
  const evidenceMode = mode === 'release' || mode === 'evidence';
  if (inventory.schemaVersion !== 1) fail('SCHEMA_VERSION_UNSUPPORTED', 'schemaVersion must be 1');
  if (inventory.inventoryPolicy !== 'hand-written-exact-reference-set') {
    fail('INVENTORY_POLICY_INVALID', 'inventory must declare the hand-written exact-reference policy');
  }

  const actualReferenceFiles = readdirSync(designRoot)
    .filter((name) => name.endsWith('.html'))
    .sort();
  const requiredFiles = inventory.requiredReferenceFiles;
  if (!Array.isArray(requiredFiles) || JSON.stringify([...requiredFiles].sort()) !== JSON.stringify(actualReferenceFiles)) {
    fail('REFERENCE_SET_MISMATCH', 'requiredReferenceFiles must exactly enumerate every checked-in design/*.html reference');
  }

  if (!Array.isArray(inventory.rows)) fail('ROWS_MISSING', 'rows must be an array');
  try {
    validatePromotionInventory(promotionInventory);
  } catch (error) {
    fail('PROMOTION_INVENTORY_INVALID', error instanceof Error ? error.message : String(error));
  }
  const ids = new Set();
  const files = new Set();
  for (const row of inventory.rows) {
    requireText(row.id, 'ROW_ID_MISSING', 'row id');
    if (ids.has(row.id)) fail('ROW_ID_DUPLICATE', `duplicate row id ${row.id}`);
    ids.add(row.id);

    requireText(row.reference?.file, 'REFERENCE_FILE_MISSING', `${row.id} reference file`);
    if (files.has(row.reference.file)) fail('REFERENCE_ROW_DUPLICATE', `${row.reference.file} appears in more than one row`);
    files.add(row.reference.file);
    if (!requiredFiles.includes(row.reference.file)) fail('REFERENCE_FILE_UNKNOWN', `${row.reference.file} is not in the hand-written set`);

    const filePath = join(designRoot, row.reference.file);
    if (!existsSync(filePath)) fail('REFERENCE_FILE_ABSENT', `${row.reference.file} does not exist`);
    requireText(row.reference.sha256, 'REFERENCE_HASH_MISSING', `${row.id} reference hash`);
    if (verifyHashes && sha256(filePath) !== row.reference.sha256) {
      fail('REFERENCE_HASH_STALE', `${row.id} hash does not match ${row.reference.file}`);
    }

    requireText(row.reference.route, 'REFERENCE_ROUTE_MISSING', `${row.id} reference route`);
    requireText(row.product?.route, 'PRODUCT_ROUTE_MISSING', `${row.id} product route`);
    if (!Array.isArray(row.declaredStates) || row.declaredStates.length === 0
      || row.declaredStates.some((state) => typeof state !== 'string' || state.trim() === '')
      || new Set(row.declaredStates).size !== row.declaredStates.length) {
      fail('DECLARED_STATES_INVALID', `${row.id} must hand-write every declared state exactly once`);
    }
    requireText(row.tuple?.screen, 'TUPLE_SCREEN_MISSING', `${row.id} tuple screen`);
    requireText(row.tuple?.state, 'TUPLE_STATE_MISSING', `${row.id} tuple state`);
    requireText(row.tuple?.theme, 'TUPLE_THEME_MISSING', `${row.id} tuple theme`);
    requireNumber(row.tuple?.viewport?.width, 'TUPLE_WIDTH_MISSING', `${row.id} tuple width`);
    requireNumber(row.tuple?.viewport?.height, 'TUPLE_HEIGHT_MISSING', `${row.id} tuple height`);
    requireNumber(row.tuple?.scale, 'TUPLE_SCALE_MISSING', `${row.id} tuple scale`);
    requireText(row.tuple?.locale, 'TUPLE_LOCALE_MISSING', `${row.id} tuple locale`);
    if (row.screen !== row.tuple.screen) fail('ROW_SCREEN_MISMATCH', `${row.id} screen does not equal tuple.screen`);
    if (!row.declaredStates.includes(row.tuple.state)) fail('ROW_STATE_UNDECLARED', `${row.id} tuple state is not declared`);
    assertRouteMatchesTuple(row);

    for (const key of ['fixture', 'time', 'motion', 'fonts', 'network']) {
      requireText(row.deterministic?.[key], 'DETERMINISTIC_INPUT_MISSING', `${row.id} deterministic.${key}`);
    }
    requireNumber(row.deterministic?.randomSeed, 'DETERMINISTIC_INPUT_MISSING', `${row.id} deterministic.randomSeed`);

    requireText(row.materialDesign3AuditId, 'M3_AUDIT_MISSING', `${row.id} Material Design 3 audit id`);
    const audit = inventory.auditRecords?.[row.materialDesign3AuditId];
    if (!audit) fail('M3_AUDIT_MISSING', `${row.id} references unknown audit ${row.materialDesign3AuditId}`);
    for (const primitive of REQUIRED_PRIMITIVES) {
      const entry = audit.primitives?.[primitive];
      if (!entry || !VALID_AUDIT_STATUSES.has(entry.status) || typeof entry.note !== 'string' || entry.note.trim() === '') {
        fail('M3_PRIMITIVE_AUDIT_MISSING', `${row.id} lacks an exact audit for ${primitive}`);
      }
      if (entry.status === 'intentional-deviation' && (!entry.reason || !entry.approval)) {
        fail('M3_PRIMITIVE_DEVIATION_UNAPPROVED', `${row.id} ${primitive} deviation needs reason and approval`);
      }
    }
    const expectedAuditStatus = REQUIRED_PRIMITIVES.some((primitive) => audit.primitives[primitive].status === 'defect') ? 'defect' : 'conforming';
    if (audit.status !== expectedAuditStatus) fail('M3_AUDIT_SUMMARY_MISMATCH', `${row.id} audit summary ${audit.status} contradicts primitive status ${expectedAuditStatus}`);
    if (mode === 'release') {
      const defects = REQUIRED_PRIMITIVES.filter((primitive) => audit.primitives[primitive].status === 'defect');
      if (audit.status === 'defect' || defects.length > 0) {
        fail('M3_AUDIT_DEFECT', `${row.id} has open Material Design 3 defects: ${defects.join(', ')}`);
      }
    }
    requireText(row.materialDesign3Notes, 'M3_AUDIT_NOTES_MISSING', `${row.id} audit notes`);

    for (const [key, code] of Object.entries(REQUIRED_EVIDENCE)) {
      const evidence = row.evidence?.[key];
      if (!evidence || typeof evidence.path !== 'string' || evidence.path.trim() === '') {
        fail(code, `${row.id} ${key} evidence path is missing`);
      }
      if (evidenceMode) {
        if (evidence.status !== 'verified') fail('EVIDENCE_PENDING', `${row.id} ${key} is ${evidence.status ?? 'missing'}`);
        requireText(evidence.sha256, 'EVIDENCE_HASH_MISSING', `${row.id} ${key} hash`);
        const filePath = evidencePath(evidence.path, 'EVIDENCE_PATH_ESCAPE', `${row.id} ${key}`);
        if (!existsSync(filePath)) fail('EVIDENCE_FILE_ABSENT', `${row.id} ${key} file is absent`);
        if (sha256(filePath) !== evidence.sha256) fail('EVIDENCE_HASH_STALE', `${row.id} ${key} hash is stale`);
        if (key !== 'diff') assertPng(filePath, 'EVIDENCE_PNG_INVALID', `${row.id} ${key}`, key === 'comparison' ? 2560 : 1280, key === 'comparison' ? 840 : 800);
        if (key === 'referenceRaw' || key === 'productRaw') assertPromotionRecord(row, key, evidence, promotionInventory);
        if (key === 'comparison') {
          const manifest = readJsonEvidence(evidence.manifestPath, evidence.manifestSha256, 'COMPARISON_MANIFEST_INVALID', `${row.id} comparison manifest`);
          if (manifest.rowId !== row.id || JSON.stringify(manifest.tuple) !== JSON.stringify(row.tuple) || JSON.stringify(manifest.labels) !== JSON.stringify(['REFERENCE','BUILT PRODUCT']) || manifest.inputs?.referenceSha256 !== row.evidence.referenceRaw.sha256 || manifest.inputs?.productSha256 !== row.evidence.productRaw.sha256) fail('COMPARISON_BINDING_MISMATCH', `${row.id} comparison binding mismatch`);
        }
        if (key === 'diff') {
          const diff = readJsonEvidence(evidence.path, evidence.sha256, 'DIFF_INVALID', `${row.id} diff`);
          if (diff.schemaVersion !== 1 || diff.rowId !== row.id || JSON.stringify(diff.tuple) !== JSON.stringify(row.tuple) || diff.inputs?.reference?.sha256 !== row.evidence.referenceRaw.sha256 || diff.inputs?.product?.sha256 !== row.evidence.productRaw.sha256 || diff.dimensions?.width !== 1280 || diff.dimensions?.height !== 800 || !Number.isFinite(diff.metrics?.changedPixels) || !Number.isFinite(diff.metrics?.changedRatio) || !diff.tool?.name || !diff.tool?.version) fail('DIFF_BINDING_MISMATCH', `${row.id} diff binding/provenance mismatch`);
          if (mode === 'release' && diff.review?.verdict === 'defect') fail('DIFF_REVIEW_DEFECT', `${row.id} has unapproved visual differences`);
        }
      } else if (evidence.status === 'pending') {
        requireText(evidence.reason, 'EVIDENCE_PENDING_REASON_MISSING', `${row.id} ${key} pending reason`);
      } else if (evidence.status !== 'verified') {
        fail('EVIDENCE_STATUS_INVALID', `${row.id} ${key} status must be pending or verified`);
      }
    }

    if (!Array.isArray(row.intentionalDeviations)) fail('DEVIATIONS_MISSING', `${row.id} deviations must be an array`);
    for (const deviation of row.intentionalDeviations) {
      requireText(deviation.reason, 'DEVIATION_REASON_MISSING', `${row.id} deviation reason`);
      requireText(deviation.approval, 'DEVIATION_APPROVAL_MISSING', `${row.id} deviation approval`);
    }
  }

  const missingRows = requiredFiles.filter((file) => !files.has(file));
  if (missingRows.length > 0) fail('REFERENCE_ROW_MISSING', `references without rows: ${missingRows.join(', ')}`);
  if (files.size !== requiredFiles.length) fail('REFERENCE_ROW_COUNT_MISMATCH', 'every reference must appear exactly once');
  const promotionIds = inventory.rows.flatMap((row) => [`${row.id}--reference`, `${row.id}--product`]);
  try {
    validatePromotionInventory(promotionInventory, { expectedIds: promotionIds });
  } catch (error) {
    fail('PROMOTION_INVENTORY_INVALID', error instanceof Error ? error.message : String(error));
  }
  return { rowCount: inventory.rows.length, referenceCount: requiredFiles.length, mode };
}

export function applyNegativeMutation(source, fixtureCase, rowId) {
  const inventory = clone(source);
  const row = inventory.rows.find((candidate) => candidate.id === rowId);
  if (!row) fail('NEGATIVE_FIXTURE_ROW_MISSING', `fixture row ${rowId} does not exist`);
  switch (fixtureCase.mutation) {
    case 'remove-row': inventory.rows = inventory.rows.filter((candidate) => candidate.id !== rowId); break;
    case 'remove-required-reference': inventory.requiredReferenceFiles = inventory.requiredReferenceFiles.filter((file) => file !== row.reference.file); break;
    case 'delete-reference-route': delete row.reference.route; break;
    case 'delete-product-route': delete row.product.route; break;
    case 'delete-declared-states': delete row.declaredStates; break;
    case 'delete-tuple-screen': delete row.tuple.screen; break;
    case 'delete-tuple-state': delete row.tuple.state; break;
    case 'delete-tuple-theme': delete row.tuple.theme; break;
    case 'delete-tuple-width': delete row.tuple.viewport.width; break;
    case 'delete-tuple-height': delete row.tuple.viewport.height; break;
    case 'delete-tuple-scale': delete row.tuple.scale; break;
    case 'delete-tuple-locale': delete row.tuple.locale; break;
    case 'delete-material-audit': delete row.materialDesign3AuditId; break;
    case 'delete-reference-raw': delete row.evidence.referenceRaw; break;
    case 'delete-product-raw': delete row.evidence.productRaw; break;
    case 'delete-comparison': delete row.evidence.comparison; break;
    case 'delete-diff': delete row.evidence.diff; break;
    case 'add-deviation-without-reason': row.intentionalDeviations.push({ approval: 'fixture-only' }); break;
    case 'add-deviation-without-approval': row.intentionalDeviations.push({ reason: 'fixture-only' }); break;
    default: fail('NEGATIVE_FIXTURE_MUTATION_UNKNOWN', `unknown mutation ${fixtureCase.mutation}`);
  }
  return inventory;
}

export function runNegativeProof(inventory = loadInventory(), fixture = loadNegativeFixture()) {
  const results = [];
  for (const fixtureCase of fixture.breaks) {
    const broken = applyNegativeMutation(inventory, fixtureCase, fixture.rowId);
    let observed = null;
    try {
      validateInventory(broken, { mode: 'structure', verifyHashes: false });
    } catch (error) {
      if (error instanceof ParityGuardError) observed = error.code;
      else throw error;
    }
    if (observed !== fixtureCase.expectedCode) {
      fail('NEGATIVE_PROOF_DID_NOT_TURN_RED', `${fixtureCase.id} expected ${fixtureCase.expectedCode}, observed ${observed ?? 'green'}`);
    }
    results.push({ id: fixtureCase.id, red: observed, restored: 'pending' });
  }
  validateInventory(inventory, { mode: 'structure' });
  for (const result of results) result.restored = 'green';
  return results;
}

function main() {
  const modeArg = process.argv[2] ?? '--structure';
  if (modeArg === '--negative') {
    const results = runNegativeProof();
    console.log(`Design parity negative proof: ${results.length} exact breaks turned red, restored inventory green.`);
    for (const result of results) console.log(`- ${result.id}: red=${result.red}; restore=${result.restored}`);
    return;
  }
  if (modeArg !== '--structure' && modeArg !== '--release') fail('MODE_UNKNOWN', `unknown mode ${modeArg}`);
  const mode = modeArg === '--release' ? 'release' : 'structure';
  const result = validateInventory(loadInventory(), { mode });
  console.log(`Design parity ${mode}: ${result.rowCount} hand-written rows cover ${result.referenceCount} references.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

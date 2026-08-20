import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { openIsolatedCdpSession } from './cdp-isolated-session.mjs';
import {
  appendCaptureToRunLedger,
  resolveContained,
  validateRunLedgerFile,
} from './promotion-receipt-contract.mjs';

function fail(message) {
  console.error(`Reference parity capture rejected: ${message}`);
  process.exit(2);
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function relativeTo(root, path) {
  return relative(root, path).replaceAll('\\', '/');
}

async function writeExclusiveJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

async function waitFor(session, expression, expected, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await session.evaluate(expression) === expected) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

const options = parseArgs(process.argv.slice(2));
for (const name of ['port', 'expected-url', 'ledger']) if (!options[name]) fail(`--${name} is required`);
const port = Number(options.port);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) fail('--port is invalid');

let ledgerContext;
try {
  const ledgerPath = resolve(options.ledger);
  const runRoot = resolve(ledgerPath, '..');
  const unvalidated = JSON.parse(await readFile(ledgerPath, 'utf8'));
  ledgerContext = validateRunLedgerFile(ledgerPath, {
    repoRoot: unvalidated.owner?.repoRoot,
    runRoot,
    expectedCommit: unvalidated.source?.startCommit,
    phase: 'capture',
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const { ledger, runRoot } = ledgerContext;
const expectedUrl = new URL(options['expected-url']).href;
if (new URL(ledger.builds.reference.loadedUrl).href !== expectedUrl) fail('--expected-url does not match the reference build receipt');
const origin = new URL(expectedUrl).origin;
const outputRoot = resolve(runRoot, options['output-root'] ?? 'raw');
await mkdir(outputRoot, { recursive: true });
resolveContained(runRoot, outputRoot, 'reference output root');
const inventory = JSON.parse(await readFile(new URL('../design/parity/inventory.json', import.meta.url), 'utf8'));
if (JSON.stringify(inventory.rows.map((row) => row.id).sort()) !== JSON.stringify([...ledger.rows].sort())) {
  fail('run ledger row set does not match the hand-written parity inventory');
}

const runtime = ledger.runtime.reference;
const session = await openIsolatedCdpSession({ port, expectedUrl, timeoutMs: 15_000 });
let captured = 0;
try {
  await session.send('Page.enable');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const row of inventory.rows) {
    const route = new URL(row.reference.route, origin);
    const receiptId = `${row.id}--reference`;
    const startedAt = new Date().toISOString();
    await session.send('Page.navigate', { url: route.href });
    await waitFor(session, 'document.readyState', 'complete');
    await waitFor(session, 'document.querySelector("#route-status")?.dataset.state', 'ready');
    await waitFor(
      session,
      'document.querySelector("#reference-frame")?.contentDocument?.body?.dataset.designParityState',
      row.tuple.state,
    );
    const state = await session.evaluate(`(()=>{
      const frame=document.querySelector('#reference-frame');
      const rect=frame.getBoundingClientRect();
      return {
        file: document.querySelector('#reference-path')?.textContent,
        width: frame.contentWindow.innerWidth,
        height: frame.contentWindow.innerHeight,
        scale: frame.contentWindow.devicePixelRatio,
        lang: frame.contentDocument.documentElement.lang,
        theme: frame.contentDocument.body.dataset.scheme,
        state: frame.contentDocument.body.dataset.designParityState,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    })()`);
    const expectedState = {
      file: row.reference.file,
      width: row.tuple.viewport.width,
      height: row.tuple.viewport.height,
      scale: row.tuple.scale,
      lang: row.tuple.locale,
      theme: row.tuple.theme,
      state: row.tuple.state,
    };
    for (const [field, expected] of Object.entries(expectedState)) {
      if (state[field] !== expected) throw new Error(`${row.id} reference state field ${field} does not match the hand-written tuple`);
    }
    const capture = await session.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: state.rect.x, y: state.rect.y, width: row.tuple.viewport.width, height: row.tuple.viewport.height, scale: row.tuple.scale },
    });
    const bytes = Buffer.from(capture.result.data, 'base64');
    const capturedAt = new Date().toISOString();
    const rowRoot = resolve(outputRoot, row.id);
    await mkdir(rowRoot, { recursive: true });
    const rawPath = resolve(rowRoot, 'reference.png');
    const interactionPath = resolve(rowRoot, 'reference-interaction.json');
    const privacyPath = resolve(rowRoot, 'reference-privacy.json');
    await writeFile(rawPath, bytes, { flag: 'wx' });
    const proofId = `${row.id}-reference-route-ready`;
    const interaction = {
      version: 1,
      id: receiptId,
      proofId,
      side: 'reference',
      rowId: row.id,
      logicalRoute: row.reference.route,
      physicalRoute: route.href,
      tuple: row.tuple,
      observedState: state,
      isolation: { targetCount: 1, expectedPageOnly: true, loopbackDebuggerOnly: true },
      runtime: { launchPid: runtime.launchPid, hwnd: runtime.hwnd, hwndResolvedLive: runtime.hwndResolvedLive },
      startedAt,
      completedAt: capturedAt,
    };
    await writeExclusiveJson(interactionPath, interaction);
    const privacy = {
      version: 1,
      id: receiptId,
      visibleDesktopUntouched: runtime.visibleDesktopUntouched,
      expectedSurfaceOnly: runtime.expectedSurfaceOnly,
      sensitiveDataReviewed: false,
      unrelatedTargetsObserved: runtime.unrelatedTargetsObserved,
      reviewer: null,
      reviewedAt: null,
      reviewRequired: true,
    };
    await writeExclusiveJson(privacyPath, privacy);
    appendCaptureToRunLedger(ledgerContext.ledgerPath, {
      version: 1,
      id: receiptId,
      rowId: row.id,
      side: 'reference',
      rawPath: relativeTo(runRoot, rawPath),
      promotedPath: row.evidence.referenceRaw.path,
      sha256: sha256(bytes),
      width: row.tuple.viewport.width,
      height: row.tuple.viewport.height,
      scale: row.tuple.scale,
      startedAt,
      capturedAt,
      interactionProofId: proofId,
      interactionReceiptPath: relativeTo(runRoot, interactionPath),
      interactionReceiptSha256: sha256(await readFile(interactionPath)),
      privacyScanPath: relativeTo(runRoot, privacyPath),
      privacyScanSha256: sha256(await readFile(privacyPath)),
      inspection: {
        decoded: false,
        pixelsInspected: false,
        targetVisible: false,
        expectedStateVisible: false,
        sensitiveDataReviewed: false,
        reviewer: null,
        reviewedAt: null,
      },
    }, {
      repoRoot: ledger.owner.repoRoot,
      runRoot,
      expectedCommit: ledger.source.startCommit,
      requiredRowIds: ledger.rows,
    });
    captured += 1;
  }
} finally {
  session.close();
}

console.log(JSON.stringify({ captured, side: 'reference', runRoot, reviewRequired: true, cleanupStillRequired: true }, null, 2));

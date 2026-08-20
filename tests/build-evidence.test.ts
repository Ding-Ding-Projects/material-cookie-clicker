import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateOnlyExpectedPageTarget } from '../scripts/cdp-isolated-session.mjs';
import { validateSurfaceKernel } from '../scripts/assert-surface-kernel-ready.mjs';

const root = resolve(import.meta.dirname, '..');

function read(relative: string): string {
  return readFileSync(resolve(root, relative), 'utf8');
}

const REQUIRED_CAPTURE_STATE_IDS = [
  'fresh-start',
  'progressed-game',
  'dark-game',
  'graphics-cookie-only',
  'graphics-first-rung-affordable',
  'graphics-first-rung-purchased',
  'minigame-events',
  'minigame-klondike',
  'minigame-memory',
  'minigame-2048',
  'minigame-minesweeper',
  'minigame-breakout',
  'lucky-chance-drawer',
  'office-building',
  'home-endless',
  'diesel-depot-collapsed',
  'update-ready',
  'installed-launch',
  'event-pool-remaining',
  'milk-focus',
  'home-late-rooms',
  'golden-dial-miss',
  'prestige-keyed',
  'factory-reduced-motion',
  'raid-reduced-motion',
  'command-palette',
  'appearance-editor',
  'narrow-window',
] as const;

const SUPERSEDED_DESIGN_ITERATION_IMAGES = [
  'anim-diesel-2.png',
  'anim-diesel-3.png',
  'chrome-dialog-prestige.png',
  'chrome-game.png',
  'combined-game.png',
  'controls-game.png',
  'controls-tools.png',
  'delight-game.png',
  'final-game.png',
  'graphics-achievements.png',
  'graphics-game.png',
  'overlay-achievements.png',
  'overlay-game.png',
  'overlay-prestige.png',
  'overlay-statistics.png',
  'overlay-tools.png',
  'realism-cookie-dark.png',
  'realism-cookie.png',
  'redesign-achievements.png',
  'redesign-cookie.png',
  'redesign-generators.png',
  'redesign-prestige.png',
  'redesign-statistics.png',
  'redesign-tools.png',
  'redesign-upgrades.png',
  'shell-achievements.png',
  'shell-generators.png',
  'shell-integration-launch.png',
  'shell-prestige.png',
  'shell-statistics.png',
  'shell-tools.png',
  'shell-upgrades.png',
  'surface-achievements.png',
  'surface-game-dark.png',
  'surface-game.png',
  'surface-prestige.png',
  'surface-statistics.png',
  'surface-tools.png',
  'titlebar-dark.png',
] as const;

type EvidenceRecord = {
  state?: string;
  image?: string;
  sourceCommit?: string;
  sha256?: string;
  dimensions?: { width?: number; height?: number };
  method?: string;
  receipt?: string;
  receiptSha256?: string;
  promotionCompliance?: string;
  limitations?: string;
};

type CaptureState = EvidenceRecord & {
  id: string;
  status: string;
  supportingEvidence?: EvidenceRecord;
  supersededEvidence?: { image?: string; sourceCommit?: string; reason?: string };
};

function requireMatch(value: unknown, pattern: RegExp, message: string): asserts value is string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(message);
}

function sectionBetween(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Missing documentation boundary: ${start} -> ${end}`);
  return text.slice(startIndex, endIndex);
}

function validatePngEvidence(stateId: string, evidence: EvidenceRecord): void {
  if (typeof evidence.image !== 'string') throw new Error(`${stateId} image is required.`);
  requireMatch(evidence.sourceCommit, /^[0-9a-f]{40}$/, `${stateId} sourceCommit must be a full lowercase SHA.`);
  requireMatch(evidence.sha256, /^[0-9a-f]{64}$/, `${stateId} sha256 must be lowercase SHA-256.`);
  if (!Number.isInteger(evidence.dimensions?.width) || !Number.isInteger(evidence.dimensions?.height)) {
    throw new Error(`${stateId} dimensions must be integer width and height.`);
  }
  if (typeof evidence.method !== 'string' || evidence.method.length === 0) throw new Error(`${stateId} method is required.`);
  if (typeof evidence.receipt !== 'string' || evidence.receipt.length === 0) throw new Error(`${stateId} receipt is required.`);

  const bytes = readFileSync(resolve(root, evidence.image));
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`${stateId} does not point to a PNG.`);
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== evidence.sha256) throw new Error(`${stateId} image hash does not match.`);
  if (bytes.readUInt32BE(16) !== evidence.dimensions.width || bytes.readUInt32BE(20) !== evidence.dimensions.height) {
    throw new Error(`${stateId} image dimensions do not match.`);
  }

  const receiptBytes = readFileSync(resolve(root, evidence.receipt));
  if (evidence.receiptSha256) {
    requireMatch(evidence.receiptSha256, /^[0-9a-f]{64}$/, `${stateId} receiptSha256 must be lowercase SHA-256.`);
    const receiptHash = createHash('sha256').update(receiptBytes).digest('hex');
    if (receiptHash !== evidence.receiptSha256) throw new Error(`${stateId} receipt hash does not match.`);
  }
}

function validateCaptureInventory(inventory: { schemaVersion?: string; requiredMethod?: string; states?: CaptureState[] }): void {
  if (inventory.schemaVersion !== 'material-cookie-clicker.release-captures.v2') throw new Error('Unexpected capture inventory schema.');
  if (inventory.requiredMethod !== 'lowlevel-cheap-headless') throw new Error('Unexpected required capture method.');
  if (!Array.isArray(inventory.states)) throw new Error('Capture inventory states are required.');
  const ids = inventory.states.map((state) => state.id);
  if (new Set(ids).size !== ids.length) throw new Error('Capture inventory IDs must be unique.');
  if (JSON.stringify(ids) !== JSON.stringify(REQUIRED_CAPTURE_STATE_IDS)) {
    throw new Error('Capture inventory IDs differ from the hand-written completeness list.');
  }

  for (const state of inventory.states) {
    if (!['existing', 'pending'].includes(state.status)) throw new Error(`${state.id} has an unsupported status.`);
    if (state.status === 'existing') {
      validatePngEvidence(state.id, state);
      if (state.method !== inventory.requiredMethod) throw new Error(`${state.id} method does not match requiredMethod.`);
    } else if (state.image !== undefined) {
      throw new Error(`${state.id} is pending and must not claim a promoted image.`);
    }

    if (state.supportingEvidence) {
      validatePngEvidence(`${state.id} supporting evidence`, state.supportingEvidence);
      if (state.supportingEvidence.promotionCompliance !== 'not-claimed') {
        throw new Error(`${state.id} supporting evidence must not claim generic promotion compliance.`);
      }
      if (typeof state.supportingEvidence.limitations !== 'string' || state.supportingEvidence.limitations.length < 20) {
        throw new Error(`${state.id} supporting evidence needs an exact limitation.`);
      }
      const receipt = JSON.parse(read(state.supportingEvidence.receipt!));
      const receiptState = receipt.captures?.find((entry: { state?: string }) => entry.state === state.supportingEvidence?.state);
      if (receipt.sourceCommit !== state.supportingEvidence.sourceCommit || receipt.route !== state.supportingEvidence.method) {
        throw new Error(`${state.id} supporting receipt provenance does not match.`);
      }
      if (
        !receiptState
        || receiptState.path !== state.supportingEvidence.image
        || receiptState.sha256 !== state.supportingEvidence.sha256
        || receiptState.width !== state.supportingEvidence.dimensions?.width
        || receiptState.height !== state.supportingEvidence.dimensions?.height
      ) {
        throw new Error(`${state.id} supporting receipt state does not match.`);
      }
    }

    if (state.supersededEvidence) {
      if (typeof state.supersededEvidence.image !== 'string') throw new Error(`${state.id} superseded image is required.`);
      readFileSync(resolve(root, state.supersededEvidence.image));
      requireMatch(state.supersededEvidence.sourceCommit, /^[0-9a-f]{40}$/, `${state.id} superseded sourceCommit is invalid.`);
      if (typeof state.supersededEvidence.reason !== 'string' || state.supersededEvidence.reason.length < 20) {
        throw new Error(`${state.id} superseded evidence needs an exact reason.`);
      }
    }
  }
}

describe('release build evidence', () => {
  it('builds and independently resolves the cold surface-kernel Node export', async () => {
    const npmCli = process.env.npm_execpath;
    expect(npmCli).toBeTruthy();
    execFileSync(process.execPath, [npmCli!, 'run', 'build:surface-kernel'], { cwd: root, stdio: 'pipe' });
    const ready = await validateSurfaceKernel(root);
    expect(ready.output.replaceAll('\\', '/')).toMatch(/packages\/surface-kernel\/dist\/index\.js$/);
    expect(ready.bytes).toBeGreaterThan(0);
    expect(ready.exports.length).toBeGreaterThan(0);
    const packageJson = JSON.parse(read('package.json'));
    expect(packageJson.scripts.prebuild).toContain('npm run build:surface-kernel');
    expect(packageJson.scripts.precheck).toBe('npm run build:surface-kernel');
    expect(packageJson.scripts.pretest).toContain('npm run build:surface-kernel');
  });
  it('derives the ICO and both social-preview copies exactly from the committed SVG master', () => {
    expect(() => execFileSync(process.execPath, ['scripts/generate-app-icon.mjs', '--check'], { cwd: root, stdio: 'pipe' })).not.toThrow();
    const master = read('assets/material-cookie-clicker-logo-master.svg');
    expect(master).toMatch(/<metadata id="material-cookie-clicker-logo-geometry">\{"canvas":512,/);
    const icon = readFileSync(resolve(root, 'assets/material-cookie-clicker.ico'));
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    expect(icon.readUInt16LE(4)).toBe(4);
    expect([0, 1, 2, 3].map((index) => icon[6 + index * 16] || 256)).toEqual([16, 32, 48, 256]);
    const social = readFileSync(resolve(root, 'social-preview.png'));
    expect(social.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(social.readUInt32BE(16)).toBe(1280);
    expect(social.readUInt32BE(20)).toBe(640);
    const servedSocial = readFileSync(resolve(root, 'site/social-preview.png'));
    expect(servedSocial.equals(social)).toBe(true);
    expect(servedSocial.readUInt32BE(16)).toBe(social.readUInt32BE(16));
    expect(servedSocial.readUInt32BE(20)).toBe(social.readUInt32BE(20));
    for (const page of ['site/index.html', 'site/control-center.html']) {
      const markup = read(page);
      expect(markup).toContain('<meta property="og:image:width" content="1280" />');
      expect(markup).toContain('<meta property="og:image:height" content="640" />');
      expect(markup).toContain('<meta name="twitter:card" content="summary_large_image" />');
      expect(markup).toContain('<meta name="theme-color" content="#7a4a1d" />');
    }
  });

  it('pins Squirrel branding to an immutable full commit URL with current-byte parity', () => {
    const packageJson = JSON.parse(read('package.json'));
    expect(packageJson.build.squirrelWindows.iconUrl).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/Ding-Ding-Projects\/material-cookie-clicker\/[0-9a-f]{40}\/assets\/material-cookie-clicker\.ico$/,
    );
    expect(packageJson.build.squirrelWindows.iconUrl).not.toContain('/main/');
    expect(packageJson.build.squirrelWindows.iconUrl).not.toContain('/latest/');
    expect(packageJson.build.squirrelWindows.iconUrl).toContain('/416d3805761d58a9b626f4d0207b004bef396731/');
    expect(packageJson.build.win).toMatchObject({
      forceCodeSigning: false,
      signExecutable: false,
      signAndEditExecutable: false,
    });
    expect(packageJson.build.squirrelWindows.iconUrl).not.toContain('a98e38c07423a7cfb4cb3190412884a404a7245e');
    expect(packageJson.scripts['brand:check']).toContain('verify-brand-release-integrity.mjs');
    expect(packageJson.scripts['brand:proof']).toContain('verify-brand-release-integrity.mjs --json');
    expect(() => execFileSync(process.execPath, ['scripts/verify-brand-release-integrity.mjs', '--network', 'local'], { cwd: root, stdio: 'pipe' })).not.toThrow();
  });

  it('requires clean pinned source manifests and records delta/icon evidence', () => {
    const common = read('scripts/build-common.ps1').replaceAll('\r\n', '\n');
    expect(common).toMatch(/^function Assert-CleanPinnedSource \{/m);
    expect(common).toMatch(/^function Assert-SourceUnchanged \{/m);
    expect(common).toMatch(/^function Export-ExecutableIconProof \{/m);
    expect(common).toContain("schemaVersion = 'material-cookie-clicker.local-build.v2'");
    expect(common).toContain("schemaVersion = 'material-cookie-clicker.local-installer.v3'");
    expect(common).toContain('sourceClean = $true');
    expect(common).toContain('sourcePinned = $true');
    expect(common).toContain('deltaAvailable = $deltaPackages.Count -gt 0');
    expect(common).not.toContain("schemaVersion = 'material-cookie-clicker.local-installer.v1'");
    expect(common).toContain('Invoke-SquirrelPackagingWithAudit');
    expect(common).toContain('CSC_IDENTITY_AUTO_DISCOVERY');
    expect(common).toContain('signerInvocationCount');
    expect(common).toContain("$expectedApplicationName = 'Material Cookie Clicker.exe'");
    expect(common).not.toMatch(/function Invoke-ProjectInstaller[\s\S]*?Select-Object -First 1/);
    expect(read('scripts/verify-squirrel-artifacts.ps1')).toContain('RELEASES contains a duplicate package row');
    expect(read('scripts/validate-squirrel-runtime-receipt.mjs')).toContain('artifact receipt setup binding does not match');
    const downloader = read('scripts/download-dependencies.ps1').replaceAll('\r\n', '\n');
    expect(downloader).toMatch(/^function Write-DependencyEvidence \{/m);
    expect(downloader).toContain("node_modules\\.material-cookie-clicker-dependency-evidence.json");
    expect(downloader).not.toMatch(/Set-Content -LiteralPath \$manifestPath/);
  });
});

describe('isolated capture evidence', () => {
  const expectedUrl = 'file:///C:/capture/dist/renderer/index.html';
  const validTarget = {
    type: 'page',
    url: expectedUrl,
    webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/page/one',
  };

  it('accepts exactly one expected page on the requested loopback endpoint', () => {
    expect(validateOnlyExpectedPageTarget([validTarget], expectedUrl, 9333)).toEqual(validTarget);
  });

  it.each([
    ['zero targets', []],
    ['two targets', [validTarget, { ...validTarget, webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/page/two' }]],
    ['wrong type', [{ ...validTarget, type: 'background_page' }]],
    ['wrong URL', [{ ...validTarget, url: 'file:///C:/someone-else/index.html' }]],
    ['non-loopback debugger', [{ ...validTarget, webSocketDebuggerUrl: 'ws://example.com:9333/devtools/page/one' }]],
  ])('rejects %s', (_name, targets) => {
    expect(() => validateOnlyExpectedPageTarget(targets, expectedUrl, 9333)).toThrow(/Capture isolation failed/);
  });

  it('keeps every current feature and pre-existing evidence gap explicit', () => {
    const inventory = JSON.parse(read('scripts/release-capture-inventory.json'));
    expect(() => validateCaptureInventory(inventory)).not.toThrow();
  });

  it('turns red when an exact state or required evidence field disappears', () => {
    const inventory = JSON.parse(read('scripts/release-capture-inventory.json'));
    const missingMinigame = structuredClone(inventory);
    missingMinigame.states = missingMinigame.states.filter((state: CaptureState) => state.id !== 'minigame-memory');
    expect(() => validateCaptureInventory(missingMinigame)).toThrow(/hand-written completeness list/);

    const incompleteExisting = structuredClone(inventory);
    incompleteExisting.states[0].status = 'existing';
    expect(() => validateCaptureInventory(incompleteExisting)).toThrow(/fresh-start image is required/);

    const weakSupporting = structuredClone(inventory);
    delete weakSupporting.states.find((state: CaptureState) => state.id === 'graphics-cookie-only').supportingEvidence.sha256;
    expect(() => validateCaptureInventory(weakSupporting)).toThrow(/supporting evidence sha256/);
  });

  it('keeps the historical capture count and superseded archive exact', () => {
    const documentation = read('captures/README.md');
    const historical = sectionBetween(
      documentation,
      '### The EvidenceRefresh historical set — 18 images',
      '### Superseded design-iteration archive — 39 explicitly indexed files',
    );
    const historicalRows = [...historical.matchAll(/^\| `([^`]+\.png)` \|/gm)].map((match) => match[1]);
    expect(historicalRows).toHaveLength(18);

    const archive = sectionBetween(
      documentation,
      '### Superseded design-iteration archive — 39 explicitly indexed files',
      '### The gap-closing set',
    );
    const archivedNames = [...archive.matchAll(/`([^`]+\.png)`/g)].map((match) => match[1]).sort();
    expect(archivedNames).toEqual([...SUPERSEDED_DESIGN_ITERATION_IMAGES].sort());
  });

  it('contains no promise-waiting CDP dead end in capture helpers', () => {
    for (const relative of ['scripts/capture-eval.mjs', 'scripts/capture-seed-localstorage.mjs', 'scripts/clipping-audit.mjs']) {
      expect(read(relative)).not.toContain('awaitPromise');
      expect(read(relative)).toContain('expectedUrl');
    }
  });
});

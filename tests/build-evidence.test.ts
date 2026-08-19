import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateOnlyExpectedPageTarget } from '../scripts/cdp-isolated-session.mjs';
import { validateSurfaceKernel } from '../scripts/assert-surface-kernel-ready.mjs';

const root = resolve(import.meta.dirname, '..');

function read(relative: string): string {
  return readFileSync(resolve(root, relative), 'utf8');
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
  it('derives the ICO and social preview exactly from the committed SVG master', () => {
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
  });

  it('pins Squirrel branding to an immutable full commit URL', () => {
    const packageJson = JSON.parse(read('package.json'));
    expect(packageJson.build.squirrelWindows.iconUrl).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/Ding-Ding-Projects\/material-cookie-clicker\/[0-9a-f]{40}\/assets\/material-cookie-clicker\.ico$/,
    );
    expect(packageJson.build.squirrelWindows.iconUrl).not.toContain('/main/');
    expect(packageJson.build.squirrelWindows.iconUrl).not.toContain('/latest/');
  });

  it('requires clean pinned source manifests and records delta/icon evidence', () => {
    const common = read('scripts/build-common.ps1').replaceAll('\r\n', '\n');
    expect(common).toMatch(/^function Assert-CleanPinnedSource \{/m);
    expect(common).toMatch(/^function Assert-SourceUnchanged \{/m);
    expect(common).toMatch(/^function Export-ExecutableIconProof \{/m);
    expect(common).toContain("schemaVersion = 'material-cookie-clicker.local-build.v2'");
    expect(common).toContain("schemaVersion = 'material-cookie-clicker.local-installer.v2'");
    expect(common).toContain('sourceClean = $true');
    expect(common).toContain('sourcePinned = $true');
    expect(common).toContain('deltaAvailable = $deltaPackages.Count -gt 0');
    expect(common).not.toContain("schemaVersion = 'material-cookie-clicker.local-installer.v1'");
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
    expect(inventory.requiredMethod).toBe('lowlevel-cheap-headless');
    const ids = inventory.states.map((state: { id: string }) => state.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      'minigame-events',
      'minigame-klondike',
      'lucky-chance-drawer',
      'office-building',
      'home-endless',
      'diesel-depot-collapsed',
      'installed-launch',
      'update-ready',
      'event-pool-remaining',
      'command-palette',
      'appearance-editor',
      'narrow-window',
    ]));
    for (const state of inventory.states) {
      expect(['existing', 'pending']).toContain(state.status);
      if (state.status === 'existing') {
        const bytes = readFileSync(resolve(root, state.image));
        expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      } else {
        expect(state.image).toBeUndefined();
      }
    }
  });

  it('contains no promise-waiting CDP dead end in capture helpers', () => {
    for (const relative of ['scripts/capture-eval.mjs', 'scripts/capture-seed-localstorage.mjs', 'scripts/clipping-audit.mjs']) {
      expect(read(relative)).not.toContain('awaitPromise');
      expect(read(relative)).toContain('expectedUrl');
    }
  });
});

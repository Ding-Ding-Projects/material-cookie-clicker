import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const applicationTools = read('src/renderer/screens/ApplicationToolsScreen.tsx');
const settings = read('src/renderer/screens/SettingsScreen.tsx');
const app = read('src/renderer/App.tsx');
const preload = read('src/preload/index.ts');
const main = read('src/main/main.ts');
const canonical = read('src/shared/canonical-ipc.ts');

describe('canonical application-tools integration', () => {
  it('mounts every concrete product tool and dedicated PDF operations', () => {
    for (const token of ['<FileConverterScreen', '<PdfOperationsPanel', '<OllamaSuiteScreen', '<IdentityAppearancePanel', '<AppearanceEditor', '<SecurityStateToolsPanel', '<TotpAuthenticatorPanel']) {
      expect(applicationTools).toContain(token);
    }
    for (const operation of ['inspect', 'merge', 'split', 'extract', 'reorder', 'rotate', 'metadata']) {
      expect(applicationTools).toContain(`'${operation}'`);
    }
  });

  it('routes settings, tool cards, and canonical targets to the exact application tab', () => {
    expect(settings).toContain('<ApplicationToolsScreen teleportTarget={teleportTarget} />');
    expect(app).toContain("fileConverter: 'canonical-converter'");
    expect(app).toContain("localModelManager: 'canonical-ollama'");
    expect(app).toContain("authenticator: 'canonical-authenticator'");
    expect(app).toContain("id: 'tools.converter'");
    expect(app).toContain("id: 'tools.ollama'");
    expect(app).toContain("id: 'tools.authenticator'");
    expect(applicationTools).toContain('function pageForTarget(');
    expect(applicationTools).toContain("<CanonicalTabs key={`${targetPage}:${targetWasClosed ? 'reopening' : 'open'}`}");
  });

  it('keeps privileged operations behind typed preload channels and main-owned path grants', () => {
    for (const channel of ['converterPickSource', 'converterPdf', 'ollamaAction', 'identityInspect', 'securityImportTotp', 'securityExportText']) {
      expect(canonical).toMatch(new RegExp(`^\\s*${channel}:`, 'm'));
      expect(preload).toContain(`CANONICAL_IPC_CHANNELS.${channel}`);
      expect(main).toContain(`CANONICAL_IPC_CHANNELS.${channel}`);
    }
    expect(main).toContain('requireReadGrant(request.sourcePath)');
    expect(main).toContain('requireWriteGrant(request.destinationPath)');
    expect(main).toContain("fetch('http://127.0.0.1:11434/api/version'");
    expect(main).toContain('new SafeStorageCredentialVault(encryptedStore)');
    expect(main).toContain('new LocalGitHistoryService(');
    expect(main).toContain('await securityHistory.initialize()');
    expect(applicationTools).not.toMatch(/\bfetch\s*\(/);
    expect(applicationTools).toContain('#invokeDetached(');
  });

  it('keeps unsupported local-model actions explicit instead of reporting fake success', () => {
    expect(main).toContain('does not yet support ${action}');
    expect(main).toContain('no network, shell, or fake-success fallback was used');
    expect(applicationTools).toContain('if (!result.ok) throw new Error(result.reason)');
  });
});

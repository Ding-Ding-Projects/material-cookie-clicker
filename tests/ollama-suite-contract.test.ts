import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const screen = readFileSync(`${root}/src/renderer/tools/ollama/OllamaSuiteScreen.tsx`, 'utf8').replaceAll('\r\n', '\n');
const service = readFileSync(`${root}/src/shared/ollama-suite-service.ts`, 'utf8').replaceAll('\r\n', '\n');

describe('product-owned Ollama suite surface contract', () => {
  it('renders every engine destination as a real tab panel', () => {
    for (const tab of ['store', 'queue', 'chat', 'harness', 'troubleshooter']) {
      expect(screen).toMatch(new RegExp(`^\\s*\\{state\\.activeTab === '${tab}' \\? <[A-Z]`, 'm'));
    }
    expect(screen).toMatch(/^\s*<div className="ollama-tabs" role="tablist"/m);
    expect(screen).toMatch(/^\s*<main[^>]+role="tabpanel"/m);
    expect(screen).toContain("['ArrowLeft', 'ArrowRight', 'Home', 'End']");
  });

  it('mounts one full anchored regex builder for every filterable collection', () => {
    const scopes = ['catalog', 'installed', 'queue', 'chat-history', 'harness-profiles', 'harness-snapshots'];
    for (const scope of scopes) expect(screen).toContain(`scope="${scope}"`);
    expect(screen).toMatch(/^\s*<SearchWithRegexBuilder$/m);
    expect(screen).toContain("service.setSearch(scope, next)");
  });

  it('keeps the cart payment-free and storage-preflight visible', () => {
    expect(screen).toContain('<p>{state.cart.disclosure}</p>');
    expect(screen).toContain('<dt>Required free storage</dt>');
    expect(screen).toContain('state.cart.blockers.length');
    expect(screen).toContain("service.commitCart()");
  });

  it('keeps attachments capability-gated and chat stoppable', () => {
    expect(screen).toContain('disabled={!state.chat.attachmentsSupported}');
    expect(screen).toContain('state.chat.attachmentSupportReason');
    expect(screen).toContain('totalBytes > state.chat.maxAttachmentBytes');
    expect(screen).toContain('supportedImageSignature(bytes)');
    expect(screen).toContain('service.stopChat()');
    expect(screen).toContain('state.chat.streamingText');
  });

  it('requires preview and snapshot rollback evidence for harness launches', () => {
    expect(screen).toContain('Review preflight');
    expect(screen).toContain("disabled={!harness.preview || Boolean(harness.preview.blockers.length)}");
    expect(screen).toContain('restores it automatically if readiness fails');
    expect(screen).toContain('service.restoreHarnessSnapshot(snapshot.id)');
    expect(screen).not.toMatch(/<input[^>]+(?:command|executable)[^>]*>/i);
  });

  it('requires two independent keys and a completed slider before model removal', () => {
    expect(screen).toContain('const ready = keyOne && keyTwo && completion === 100;');
    expect(screen).toContain('disabled={!keyOne || !keyTwo}');
    expect(screen).toContain('disabled={!ready}');
    expect(screen).toContain('Emergency exit');
    expect(screen).toContain('service.deleteModel(reference)');
  });

  it('keeps privileged values out of the shared service boundary', () => {
    expect(service).toContain('MaterialCookieClickerOllamaSuiteService extends OllamaSuiteActions');
    expect(service).not.toMatch(/^\s*(?:readonly\s+)?(?:url|command|executablePath|environment|secret|token)\??:/m);
    expect(service).toContain('OllamaSuiteResult');
  });
});

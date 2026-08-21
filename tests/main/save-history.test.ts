import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SaveHistoryStore } from '../../src/main/save-history.js';

/**
 * Deleting save progress must never delete anything: the save is committed to a local Git
 * repository so it can always be restored.
 *
 * The store writes Git's loose-object format directly rather than taking a dependency or shelling
 * out to a `git` a player's machine may not have. That is only worth doing if the result is a
 * genuine repository, so the assertion that matters here is the one that runs the REAL Git CLI
 * against what the store produced. Everything else could pass while the format was subtly wrong;
 * `git log` cannot.
 *
 * Git is a development-machine tool, not a runtime dependency of the application, so the CLI-backed
 * assertions skip honestly when it is absent instead of failing a checkout that never had it.
 */
function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const git = (dir: string, args: string[]): string =>
  execFileSync('git', ['--git-dir', dir, ...args], { encoding: 'utf8' }).trim();

describe('save history store', () => {
  let dir: string;
  let store: SaveHistoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcc-save-history-'));
    store = new SaveHistoryStore(join(dir, 'save-history'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports no history before anything is archived', () => {
    expect(store.hasHistory()).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('returns the exact payload it archived', () => {
    // Deliberately awkward content: a real save is JSON, and the round trip must not mangle
    // unicode or newlines on the way through the object store.
    const payload = JSON.stringify({ cookies: 1234, note: 'ç²’ æ›²å¥‡\nsecond line' });
    const id = store.archive(payload, 'Deleted by the player', 1_700_000_000_000);
    expect(id).toMatch(/^[0-9a-f]{40}$/);
    expect(store.read(id)).toBe(payload);
    expect(store.hasHistory()).toBe(true);
  });

  it('keeps every archived save, newest first, and never overwrites an older one', () => {
    const first = store.archive('{"cookies":1}', 'First deletion', 1_700_000_000_000);
    const second = store.archive('{"cookies":2}', 'Second deletion', 1_700_000_060_000);
    const third = store.archive('{"cookies":3}', 'Third deletion', 1_700_000_120_000);

    const entries = store.list();
    expect(entries.map((entry) => entry.id)).toEqual([third, second, first]);
    expect(entries.map((entry) => entry.summary)).toEqual([
      'Third deletion',
      'Second deletion',
      'First deletion',
    ]);
    // The whole promise of the feature: the oldest save is still readable, byte for byte.
    expect(store.read(first)).toBe('{"cookies":1}');
    expect(entries[2].archivedAtEpochMs).toBe(1_700_000_000_000);
  });

  it('is a repository the real Git CLI can read', () => {
    if (!gitAvailable()) {
      // Recorded rather than silently passing: this is the assertion the hand-written object
      // format exists to earn, so a run without Git has proved less than a run with it.
      console.warn('git CLI unavailable; the format-validity assertion did not run');
      return;
    }
    const gitDir = join(dir, 'save-history');
    store.archive('{"cookies":1}', 'First deletion', 1_700_000_000_000);
    store.archive('{"cookies":2}', 'Second deletion', 1_700_000_060_000);

    // If any of the three object types were malformed, these would fail rather than answer.
    expect(git(gitDir, ['log', '--format=%s'])).toBe('Second deletion\nFirst deletion');
    expect(git(gitDir, ['cat-file', '-p', 'HEAD:save.json'])).toBe('{"cookies":2}');
    expect(git(gitDir, ['cat-file', '-p', 'HEAD~1:save.json'])).toBe('{"cookies":1}');
    // fsck is the strongest available statement that the object database is genuinely well-formed.
    expect(() => git(gitDir, ['fsck', '--no-progress'])).not.toThrow();
  });

  it('survives being reopened, because the history outlives the process that wrote it', () => {
    const id = store.archive('{"cookies":7}', 'Deleted', 1_700_000_000_000);
    const reopened = new SaveHistoryStore(join(dir, 'save-history'));
    expect(reopened.hasHistory()).toBe(true);
    expect(reopened.read(id)).toBe('{"cookies":7}');
    // And a later archive from the reopened store keeps the earlier commit as its parent.
    const next = reopened.archive('{"cookies":8}', 'Deleted again', 1_700_000_060_000);
    expect(reopened.list().map((entry) => entry.id)).toEqual([next, id]);
  });
});

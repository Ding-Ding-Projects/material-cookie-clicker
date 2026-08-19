import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { convertFile, inspectConverterFile } from '../src/main/converter-file-service.js';
import { FileConverterQueueStore } from '../src/main/converter-queue-store.js';

const directories: string[] = [];

afterEach(async () => {
  while (directories.length > 0) await rm(directories.pop()!, { recursive: true, force: true });
});

async function fixtureDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mcc-converter-'));
  directories.push(directory);
  return directory;
}

describe('converter file service', () => {
  it('inspects bounded source bytes and writes validated output atomically', async () => {
    const directory = await fixtureDirectory();
    const source = path.join(directory, 'wrong-extension.bin');
    const destination = path.join(directory, 'formatted.json');
    await writeFile(source, '{"answer":42}');
    const inspection = await inspectConverterFile(source);
    expect(inspection.detection.type).toBe('json');
    const outcome = await convertFile({ sourcePath: source, destinationPath: destination, adapterId: 'json-pretty' });
    expect(outcome.detectedType).toBe('json');
    expect(JSON.parse(await readFile(destination, 'utf8'))).toEqual({ answer: 42 });
    expect(await readFile(source, 'utf8')).toBe('{"answer":42}');
  });

  it('does not overwrite without explicit super-confirmation authorization', async () => {
    const directory = await fixtureDirectory();
    const source = path.join(directory, 'source.json');
    const destination = path.join(directory, 'existing.json');
    await writeFile(source, '{"new":true}');
    await writeFile(destination, 'KEEP');
    await expect(convertFile({ sourcePath: source, destinationPath: destination, adapterId: 'json-pretty' })).rejects.toThrow(/super-confirmation/);
    expect(await readFile(destination, 'utf8')).toBe('KEEP');
  });

  it('refuses an unavailable adapter before creating output', async () => {
    const directory = await fixtureDirectory();
    const source = path.join(directory, 'source.png');
    const destination = path.join(directory, 'output.jpg');
    await writeFile(source, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]));
    await expect(convertFile({ sourcePath: source, destinationPath: destination, adapterId: 'image-transcode' })).rejects.toThrow(/codec/);
    await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('disk-backed queue store', () => {
  it('persists records independently and pages without loading file payloads', async () => {
    const directory = await fixtureDirectory();
    const store = new FileConverterQueueStore(path.join(directory, 'queue'));
    await store.append([
      { id: 'a', sourcePath: 'a', destinationPath: 'aa', adapterId: 'json-pretty', addedAt: 1, status: 'queued', processedBytes: 0 },
      { id: 'b', sourcePath: 'b', destinationPath: 'bb', adapterId: 'json-pretty', addedAt: 2, status: 'queued', processedBytes: 0 },
    ]);
    expect((await store.page(['queued'], null, 1)).items).toHaveLength(1);
    await store.update('a', { status: 'converted', processedBytes: 8 });
    expect((await store.get('a'))?.status).toBe('converted');
    expect((await store.page(['queued'], null, 10)).items.map((item) => item.id)).toEqual(['b']);
  });

  it('rejects unsafe queue identifiers', async () => {
    const directory = await fixtureDirectory();
    const store = new FileConverterQueueStore(path.join(directory, 'queue'));
    await expect(store.append([{ id: '../escape', sourcePath: 'a', destinationPath: 'b', adapterId: 'json-pretty', addedAt: 1, status: 'queued', processedBytes: 0 }])).rejects.toThrow(/unsupported characters/);
  });

  it('rejects a queue record whose embedded id does not match its filename', async () => {
    const directory = await fixtureDirectory();
    const queueDirectory = path.join(directory, 'queue');
    const store = new FileConverterQueueStore(queueDirectory);
    await store.append([{ id: 'a', sourcePath: 'a', destinationPath: 'b', adapterId: 'json-pretty', addedAt: 1, status: 'queued', processedBytes: 0 }]);
    await writeFile(path.join(queueDirectory, 'a.json'), JSON.stringify({ version: 1, value: { id: 'b', sourcePath: 'a', destinationPath: 'b', adapterId: 'json-pretty', addedAt: 1, status: 'queued', processedBytes: 0 } }));
    expect((await store.page(['queued'], null, 10)).items).toEqual([]);
    expect(await readdir(path.join(queueDirectory, 'quarantine'))).toHaveLength(1);
  });
});

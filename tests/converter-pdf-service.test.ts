import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { performPdfFileOperation } from '../src/main/converter-pdf-service.js';

const directories: string[] = [];

afterEach(async () => {
  while (directories.length > 0) await rm(directories.pop()!, { recursive: true, force: true });
});

function bytes(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0) & 0xff);
}

function minimalPdf(): Uint8Array {
  const objects = new Map<number, string>([
    [1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [2, '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>'],
    [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>'],
    [4, '<< /Length 0 >>\nstream\n\nendstream'],
    [5, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 6 0 R /Rotate 90 >>'],
    [6, '<< /Length 0 >>\nstream\n\nendstream'],
  ]);
  let output = '%PDF-1.4\n';
  const offsets = new Map<number, number>();
  for (const [id, body] of objects) { offsets.set(id, output.length); output += `${id} 0 obj\n${body}\nendobj\n`; }
  const xref = output.length;
  output += 'xref\n0 7\n0000000000 65535 f \n';
  for (let id = 1; id <= 6; id += 1) output += `${offsets.get(id)!.toString().padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return bytes(output);
}

async function fixtureDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mcc-pdf-service-'));
  directories.push(directory);
  return directory;
}

describe('atomic PDF file operations', () => {
  it('inspects without writing and rotates into a reopened validated destination', async () => {
    const directory = await fixtureDirectory();
    const sourcePath = path.join(directory, 'source.pdf');
    const destinationPath = path.join(directory, 'rotated.pdf');
    await writeFile(sourcePath, minimalPdf());
    const inspected = await performPdfFileOperation({ kind: 'inspect', sourcePath });
    expect(inspected.inspection.pageCount).toBe(2);
    expect(inspected.outputs).toEqual([]);
    const rotated = await performPdfFileOperation({ kind: 'rotate', sourcePath, destinationPath, rotations: [{ pageIndex: 0, degrees: 90 }] });
    expect(rotated.inspection.rotations).toEqual([90, 90]);
    expect(rotated.outputs[0]).toMatchObject({ status: 'written', destinationPath });
    expect((await readFile(destinationPath)).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('preflights every split destination and leaves existing content untouched', async () => {
    const directory = await fixtureDirectory();
    const sourcePath = path.join(directory, 'source.pdf');
    const first = path.join(directory, 'page-1.pdf');
    const existing = path.join(directory, 'page-2.pdf');
    await writeFile(sourcePath, minimalPdf());
    await writeFile(existing, 'KEEP');
    await expect(performPdfFileOperation({ kind: 'split', sourcePath, destinationPaths: [first, existing] })).rejects.toThrow(/super-confirmation/);
    await expect(readFile(first)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(existing, 'utf8')).toBe('KEEP');
  });
});

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function newestFileTime(directory) {
  let newest = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, await newestFileTime(absolute));
    else if (entry.isFile()) newest = Math.max(newest, (await stat(absolute)).mtimeMs);
  }
  return newest;
}

export async function validateSurfaceKernel(root) {
  const packageRoot = path.join(root, 'packages', 'surface-kernel');
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const nodeExport = manifest.exports?.['.']?.node;
  if (typeof nodeExport !== 'string' || !nodeExport.startsWith('./dist/')) {
    throw new Error('The surface-kernel Node export must be an explicit file under ./dist/.');
  }
  const output = path.join(packageRoot, nodeExport);
  let outputStat;
  try { outputStat = await stat(output); } catch { throw new Error(`The surface-kernel Node export is missing: ${nodeExport}`); }
  if (!outputStat.isFile() || outputStat.size === 0) throw new Error(`The surface-kernel Node export is empty: ${nodeExport}`);
  const sourceTime = await newestFileTime(path.join(packageRoot, 'src'));
  const buildScriptTime = (await stat(path.join(packageRoot, 'scripts', 'build.mjs'))).mtimeMs;
  if (outputStat.mtimeMs + 1 < Math.max(sourceTime, buildScriptTime)) {
    throw new Error('The surface-kernel Node export is older than its source or build script.');
  }
  const loaded = await import(`${pathToFileURL(output).href}?ready=${outputStat.mtimeMs}`);
  if (Object.keys(loaded).length === 0) throw new Error('The surface-kernel Node export loaded but exposed no API.');
  return { output, bytes: outputStat.size, exports: Object.keys(loaded).sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await validateSurfaceKernel(process.cwd());
  process.stdout.write(`Surface kernel ready: ${result.output} (${result.bytes} bytes; ${result.exports.length} exports).\n`);
}

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

function option(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${name} is required.`);
  return value;
}

const inventoryPath = path.resolve(option('--inventory'));
const evidencePath = path.resolve(option('--evidence'));
const expectedCommit = option('--commit');
if (!/^[0-9a-f]{40}$/.test(expectedCommit)) throw new Error('--commit must be a full lowercase Git commit SHA.');
const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
if (evidence.schemaVersion !== 'material-cookie-clicker.capture-evidence.v1') throw new Error('Unexpected capture evidence schema.');
if (evidence.method !== inventory.requiredMethod) throw new Error(`Capture method must be ${inventory.requiredMethod}.`);
if (evidence.sourceCommit !== expectedCommit) throw new Error(`Capture evidence is for ${evidence.sourceCommit}, expected ${expectedCommit}.`);
if (!Array.isArray(evidence.states)) throw new Error('Capture evidence must contain a states array.');
const byId = new Map(evidence.states.map((entry) => [entry.id, entry]));
for (const state of inventory.states) {
  const entry = byId.get(state.id);
  if (!entry) throw new Error(`Capture evidence is missing ${state.id}.`);
  if (!['verified', 'blocked'].includes(entry.status)) throw new Error(`${state.id} must be verified or blocked.`);
  if (entry.status === 'blocked') {
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 12) throw new Error(`${state.id} needs an exact blocker reason.`);
    continue;
  }
  if (typeof entry.image !== 'string' || !path.isAbsolute(entry.image)) throw new Error(`${state.id} needs an absolute image path.`);
  const bytes = await readFile(entry.image);
  const info = await stat(entry.image);
  if (info.size < 100 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`${state.id} does not point to a real PNG capture.`);
  }
  if (typeof entry.windowTitle !== 'string' || entry.windowTitle.trim().length === 0 || entry.windowClass !== 'Chrome_WidgetWin_1') {
    throw new Error(`${state.id} needs the dynamically resolved title and Chrome_WidgetWin_1 class.`);
  }
}
process.stdout.write(`Verified ${inventory.states.length} capture evidence records for ${expectedCommit}.\n`);

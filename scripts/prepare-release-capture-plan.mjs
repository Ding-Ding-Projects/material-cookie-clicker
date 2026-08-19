/**
 * Prepare, but never execute, a cheap-Lowlevel headless launch plan.
 * The caller supplies this exact plan to the approved headless tool, then records evidence with
 * validate-release-capture-evidence.mjs. This script deliberately cannot launch visible UI.
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function option(name, required = true) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (required && (!value || value.startsWith('--'))) throw new Error(`${name} is required.`);
  return value;
}

const root = process.cwd();
const executable = path.resolve(option('--executable'));
const profile = path.resolve(option('--profile'));
const output = path.resolve(option('--output'));
const desktop = option('--desktop');
const port = Number(option('--port'));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port must be an unprivileged TCP port.');
const rootPrefix = `${path.resolve(root)}${path.sep}`.toLowerCase();
if (profile.toLowerCase() === path.resolve(root).toLowerCase() || profile.toLowerCase().startsWith(rootPrefix)) {
  throw new Error('The capture profile must live outside the checkout.');
}
const renderer = path.resolve(root, 'dist', 'renderer', 'index.html');
await access(executable);
await access(renderer);
const inventory = JSON.parse(await readFile(path.join(root, 'scripts', 'release-capture-inventory.json'), 'utf8'));
const plan = {
  schemaVersion: 'material-cookie-clicker.capture-plan.v1',
  launchHook: 'lowlevel-computer-use-cheap.launch_on_headless_desktop',
  captureHook: 'lowlevel-computer-use-cheap.screenshot',
  interactionHook: 'lowlevel-computer-use-cheap background input or isolated CDP after target preflight',
  desktop,
  executable,
  arguments: [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--disable-extensions',
  ],
  profile,
  port,
  expectedPageUrl: pathToFileURL(renderer).href,
  targetPreflight: {
    script: 'scripts/cdp-isolated-session.mjs',
    exactTargetCount: 1,
    exactType: 'page',
    exactUrl: pathToFileURL(renderer).href,
  },
  inventorySchemaVersion: inventory.schemaVersion,
  stateIds: inventory.states.map((state) => state.id),
  warnings: [
    'This plan has not launched anything.',
    'Use only the approved cheap Lowlevel named hidden desktop route.',
    'Resolve the application window by title and Chrome_WidgetWin_1 class, never by index.',
    'Keep exactly one application window alive on the hidden desktop.',
    'Delete the isolated profile only after the exact process tree and hidden desktop are closed.',
  ],
};
await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
process.stdout.write(`${output}\n`);

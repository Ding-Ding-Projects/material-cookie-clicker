import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function option(argv, name) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${name} is required.`);
  return value;
}

function outsideCheckout(value, label) {
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error(`${label} must live outside the checkout.`);
  }
  return resolved;
}

function requireVersion(value, label) {
  if (!SEMVER.test(value)) throw new Error(`${label} must be a stable semantic version.`);
  return value;
}

function requireHttps(value, label, { trailingSlash = false, deterministicFeed = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} must be a valid URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
    throw new Error(`${label} must be bounded credential-free HTTPS without query or fragment data.`);
  }
  if (trailingSlash && !url.pathname.endsWith('/')) throw new Error(`${label} must end in a slash.`);
  if (deterministicFeed && url.hostname === 'github.com' && /\/releases\/latest\/download\/?$/i.test(url.pathname)) {
    throw new Error(`${label} cannot use the mutable public latest feed.`);
  }
  return url.href;
}

export function createRuntimeVerificationPlan(options) {
  const priorVersion = requireVersion(options.priorVersion, 'prior version');
  const candidateVersion = requireVersion(options.candidateVersion, 'candidate version');
  const targetVersion = requireVersion(options.targetVersion, 'target version');
  const compare = (left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  if (compare(candidateVersion, priorVersion) <= 0 || compare(targetVersion, candidateVersion) <= 0) {
    throw new Error('The deterministic pair must order prior < candidate < target.');
  }
  const feedUrl = requireHttps(options.feedUrl, 'verification feed URL', { trailingSlash: true, deterministicFeed: true });
  const releaseNotesUrl = requireHttps(options.releaseNotesUrl, 'release notes URL');
  return {
    schemaVersion: 'material-cookie-clicker.squirrel-runtime-plan.v1',
    route: 'cheap-lowlevel-headless',
    desktop: options.desktop,
    port: options.port,
    installer: options.installer,
    artifactReceipt: options.artifactReceipt,
    taskOwnedProfile: options.profile,
    evidenceRoot: options.evidenceRoot,
    installBoundary: 'disposable operating-system user or disposable VM; LOCALAPPDATA redirection is forbidden',
    processEnvironment: {
      MATERIAL_COOKIE_CLICKER_VERIFY_UPDATE_FEED: '1',
      MATERIAL_COOKIE_CLICKER_VERIFY_UPDATE_FEED_URL: feedUrl,
    },
    deterministicPair: { priorVersion, candidateVersion, targetVersion, feedUrl, releaseNotesUrl },
    requiredHooks: {
      install: 'lowlevel-computer-use-cheap.launch_on_headless_desktop',
      launch: 'installed executable launched directly on the same named headless desktop',
      capture: 'lowlevel-computer-use-cheap.screenshot',
      window: 'resolve exact title plus Chrome_WidgetWin_1 and non-zero dimensions',
    },
    requiredReceipt: 'material-cookie-clicker.squirrel-runtime-receipt.v1',
    warnings: [
      'This plan launches nothing and installs nothing.',
      'Preflight the real Squirrel destination and stop if an existing user installation is present.',
      'Validate the runtime receipt while the installed executable and every evidence file still exist.',
      'Cup Chun only the exact ledger-listed task targets after validation.',
    ],
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const installer = path.resolve(option(argv, '--installer'));
  const artifactReceipt = path.resolve(option(argv, '--artifact-receipt'));
  const profile = outsideCheckout(option(argv, '--profile'), 'profile');
  const evidenceRoot = outsideCheckout(option(argv, '--evidence-root'), 'evidence root');
  const output = outsideCheckout(option(argv, '--output'), 'output');
  const desktop = option(argv, '--desktop');
  const port = Number(option(argv, '--port'));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port must be an unprivileged TCP port.');
  await access(installer);
  await access(artifactReceipt);
  const receipt = JSON.parse(await readFile(artifactReceipt, 'utf8'));
  if (receipt.version !== 1 || receipt.valid !== true) throw new Error('The artifact receipt is not a verified version-1 receipt.');
  const plan = createRuntimeVerificationPlan({
    installer,
    artifactReceipt,
    profile,
    evidenceRoot,
    desktop,
    port,
    feedUrl: option(argv, '--feed-url'),
    priorVersion: option(argv, '--prior-version'),
    candidateVersion: option(argv, '--candidate-version'),
    targetVersion: option(argv, '--target-version'),
    releaseNotesUrl: option(argv, '--release-notes-url'),
  });
  if (receipt.packageVersion !== plan.deterministicPair.candidateVersion) throw new Error('Artifact receipt version does not match the candidate version.');
  await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${output}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

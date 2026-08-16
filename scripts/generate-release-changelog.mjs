import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CHANGELOG_SCHEMA_VERSION = 1;
export const MAX_INVENTORY_BYTES = 2 * 1024 * 1024;
export const MAX_RELEASE_PAGES = 32;
export const MAX_RELEASES = 2000;
export const MAX_RELEASE_BODY_BYTES = 64 * 1024;
export const MAX_CHANGE_LENGTH = 240;

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const EXACT_RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+$/;
const LEGACY_RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-\d+)+$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SENSITIVE_PATTERNS = [
  /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/i,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,
  /\b(?:authorization|bearer)\s*[:= ]\s*\S+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /https?:\/\/[^\s/@:]+:[^\s/@]+@/i,
  /(?:^|\s)[A-Za-z]:\\Users\\[^\s\\]+\\/i,
  /(?:^|\s)\/(?:home|Users)\/[^\s/]+\//,
  /\b(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}\b/,
];

function assertPlainText(value, label, maxLength) {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  const text = value.trim();
  if (!text || text.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new Error(`${label} is empty, too long, or contains control characters.`);
  }
  assertNoSensitiveData(text, label);
  return text;
}

function assertExactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown fields: ${unknown.join(', ')}.`);
}

export function assertNoSensitiveData(value, label = 'Generated release data') {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(value)) throw new Error(`${label} contains token-like or private data.`);
  }
}

function requireIsoTimestamp(value, label) {
  const text = assertPlainText(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${label} must be a valid UTC ISO-8601 timestamp.`);
  }
  return new Date(text).toISOString();
}

function requireSha(value, label) {
  const sha = String(value ?? '').toLowerCase();
  if (!SHA_PATTERN.test(sha)) throw new Error(`${label} must be a full 40-character commit SHA.`);
  return sha;
}

function requireTag(value, label = 'Release tag') {
  const tag = String(value ?? '');
  if (!TAG_PATTERN.test(tag)) throw new Error(`${label} is malformed or exceeds 80 characters.`);
  return tag;
}

function requirePublishedTag(value, label = 'Published release tag') {
  const tag = requireTag(value, label);
  if (!EXACT_RELEASE_TAG_PATTERN.test(tag) && !LEGACY_RELEASE_TAG_PATTERN.test(tag)) {
    throw new Error(`${label} is outside the exact or historical release-tag contract.`);
  }
  return tag;
}

function requireProspectiveTag(value, label = 'Prospective release tag') {
  const tag = requireTag(value, label);
  if (!EXACT_RELEASE_TAG_PATTERN.test(tag)) throw new Error(`${label} must exactly equal v<effective-version>.`);
  return tag;
}

function releaseUrl(repository, tag) {
  return `https://github.com/${repository}/releases/tag/${tag}`;
}

export function flattenReleasePages(input) {
  if (!Array.isArray(input)) throw new Error('GitHub release inventory must be an array or paginated array.');
  if (input.length === 0 || !input.every(Array.isArray)) {
    if (input.length > MAX_RELEASES) throw new Error(`GitHub release inventory exceeded ${MAX_RELEASES} records.`);
    return input;
  }
  const pages = input;
  if (pages.length > MAX_RELEASE_PAGES) throw new Error(`GitHub release inventory exceeded ${MAX_RELEASE_PAGES} pages.`);
  const releases = [];
  for (const page of pages) {
    if (!Array.isArray(page) || page.length > 100) throw new Error('A GitHub release inventory page exceeded 100 records.');
    releases.push(...page);
    if (releases.length > MAX_RELEASES) throw new Error(`GitHub release inventory exceeded ${MAX_RELEASES} records.`);
  }
  return releases;
}

export function extractSourceCommit(body, tag) {
  if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > MAX_RELEASE_BODY_BYTES) {
    throw new Error(`Release ${tag} has a missing or oversized body.`);
  }
  assertNoSensitiveData(body, `Release ${tag} body`);
  const matches = [...body.matchAll(/^\s*-\s*Source commit:\s*`([0-9a-fA-F]{40})`\s*$/gmi)];
  if (matches.length !== 1) throw new Error(`Release ${tag} must carry exactly one full Source commit SHA.`);
  return requireSha(matches[0][1], `Release ${tag} source commit`);
}

function normalizeDish(value, label) {
  if (!value || value.available === false) return null;
  assertExactKeys(value, ['available', 'id', 'codeName', 'nameEn', 'nameZhHant', 'photoUrl', 'assetName', 'alt'], label);
  const codeName = assertPlainText(value.codeName, `${label} dim-sum code name`, 160);
  const photoUrl = assertPlainText(value.photoUrl, `${label} dim-sum photo URL`, 500);
  const assetName = assertPlainText(value.assetName, `${label} dim-sum asset name`, 180);
  let parsed;
  try { parsed = new URL(photoUrl); } catch { throw new Error(`${label} dim-sum photo URL is malformed.`); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' ||
      !parsed.pathname.startsWith('/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1')) {
    throw new Error(`${label} dim-sum photo URL is outside the published catalog-v1 releases.`);
  }
  if (path.posix.basename(parsed.pathname) !== assetName) throw new Error(`${label} dim-sum asset name does not match its photo URL.`);
  return { codeName, photoUrl, assetName };
}

export function extractPublishedDish(body, tag) {
  if (typeof body !== 'string') return null;
  const codeName = body.match(/^\s*-\s*Dim sum code name:\s*(.+?)\s*$/mi)?.[1];
  const photo = body.match(/^\s*-\s*Public dish photo:\s*\[([^\]]+)\]\((https:\/\/github\.com\/Ding-Ding-Projects\/dim-sum-photos\/releases\/download\/catalog-v1[^\s)]*\/[^\s)]+)\)\s*$/mi);
  if (!codeName || !photo) return null;
  return normalizeDish({ available: true, codeName, assetName: photo[1], photoUrl: photo[2] }, `Release ${tag}`);
}

function categoryForCommit(subject, files = []) {
  if (/^merge\b/i.test(subject)) return 'Integration';
  const normalized = files.map((file) => String(file).replaceAll('\\', '/'));
  if (normalized.some((file) => file.startsWith('src/renderer/'))) return 'Interface';
  if (normalized.some((file) => /^(src\/(?:main|preload|shared)|packages)\//.test(file))) return 'Application';
  if (normalized.some((file) => /^(docs|site|wiki)\//.test(file) || /^(?:README|ROADMAP|HANDOFF)\.md$/.test(file))) return 'Documentation';
  if (normalized.some((file) => file.startsWith('tests/'))) return 'Verification';
  if (normalized.some((file) => /^(?:\.github|scripts)\//.test(file))) return 'Delivery';
  return 'Repository';
}

export function changeFromCommitMetadata(metadata, sha) {
  if (!metadata || typeof metadata !== 'object') throw new Error(`Commit metadata is missing for ${sha}.`);
  const subject = assertPlainText(metadata.subject, `Commit ${sha} subject`, 180);
  const files = Array.isArray(metadata.files) ? metadata.files : [];
  if (files.length > 5000 || files.some((file) => typeof file !== 'string' || file.length > 500)) {
    throw new Error(`Commit ${sha} file metadata exceeded its bounds.`);
  }
  return `${categoryForCommit(subject, files)}: ${subject}`;
}

export function readGitCommitMetadata(shas, cwd = process.cwd()) {
  const result = {};
  for (const shaValue of new Set(shas)) {
    const sha = requireSha(shaValue, 'Requested commit');
    const subjectRun = spawnSync('git', ['show', '-s', '--format=%s', '--no-patch', sha], { cwd, encoding: 'utf8', windowsHide: true });
    if (subjectRun.status !== 0) throw new Error(`Committed metadata is unavailable for ${sha}.`);
    const filesRun = spawnSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', '-m', '--root', sha], { cwd, encoding: 'utf8', windowsHide: true });
    if (filesRun.status !== 0) throw new Error(`Committed file metadata is unavailable for ${sha}.`);
    result[sha] = { subject: subjectRun.stdout.trim(), files: filesRun.stdout.split(/\r?\n/).filter(Boolean) };
  }
  return result;
}

export function assertProspectiveCommitIsHead(commit, cwd = process.cwd()) {
  const expected = requireSha(commit, 'Prospective release commit');
  const headRun = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', windowsHide: true });
  if (headRun.status !== 0) throw new Error('The checked-out HEAD could not be resolved.');
  const actual = requireSha(headRun.stdout.trim(), 'Checked-out HEAD');
  if (actual !== expected) throw new Error(`Prospective release commit ${expected} does not match checked-out HEAD ${actual}.`);
  return actual;
}

function publishedReleaseDetails(repository, inventory, commitMetadata) {
  if (!REPOSITORY_PATTERN.test(repository)) throw new Error('Repository must be an owner/name pair.');
  const inventoryRows = flattenReleasePages(inventory);
  for (const [index, release] of inventoryRows.entries()) {
    if (!release || typeof release !== 'object' || Array.isArray(release)) throw new Error(`Release inventory row ${index} is malformed.`);
    if (typeof release.draft !== 'boolean') throw new Error(`Release inventory row ${index} has an invalid draft state.`);
    if (release.published_at !== null && release.published_at !== undefined && typeof release.published_at !== 'string') {
      throw new Error(`Release inventory row ${index} has an invalid publication time.`);
    }
  }
  const releases = inventoryRows.filter((release) => release.draft === false && release.published_at);
  const seenTags = new Set();
  const details = [];
  for (const release of releases) {
    if (typeof release !== 'object') throw new Error('A release inventory row was malformed.');
    const version = requirePublishedTag(release.tag_name);
    if (seenTags.has(version)) throw new Error(`Duplicate release tag: ${version}.`);
    seenTags.add(version);
    const expectedUrl = releaseUrl(repository, version);
    if (release.html_url !== expectedUrl) throw new Error(`Release ${version} has an untrusted release URL.`);
    const commit = extractSourceCommit(release.body, version);
    details.push({
      version,
      releasedAt: requireIsoTimestamp(release.published_at, `Release ${version} publication time`),
      commit,
      changes: [changeFromCommitMetadata(commitMetadata[commit], commit)],
      releaseUrl: expectedUrl,
      publicationState: 'published',
      dimSum: extractPublishedDish(release.body, version),
    });
  }
  return { details, seenTags };
}

export function generateFallbackManifest({ repository, inventory, commitMetadata }) {
  const { details } = publishedReleaseDetails(repository, inventory, commitMetadata);
  if (details.length === 0) throw new Error('A fallback manifest needs at least one published release.');
  details.sort((left, right) => right.releasedAt.localeCompare(left.releasedAt) || right.version.localeCompare(left.version));
  const manifest = {
    schemaVersion: CHANGELOG_SCHEMA_VERSION,
    repository,
    generatedAt: details[0].releasedAt,
    entries: details,
  };
  validateManifest(manifest, { allowPending: false });
  return manifest;
}

export function generateReleaseManifest({ repository, inventory, prospective, commitMetadata, dish = null }) {
  const { details, seenTags } = publishedReleaseDetails(repository, inventory, commitMetadata);
  const version = requireProspectiveTag(prospective?.version, 'Prospective release tag');
  if (seenTags.has(version)) throw new Error(`Prospective release tag duplicates published tag ${version}.`);
  const commit = requireSha(prospective?.commit, 'Prospective release commit');
  details.push({
    version,
    releasedAt: requireIsoTimestamp(prospective?.releasedAt, 'Prospective release timestamp'),
    commit,
    changes: [changeFromCommitMetadata(commitMetadata[commit], commit)],
    releaseUrl: releaseUrl(repository, version),
    publicationState: 'pending',
    dimSum: normalizeDish(dish, 'Prospective release'),
  });
  details.sort((left, right) => right.releasedAt.localeCompare(left.releasedAt) || right.version.localeCompare(left.version));
  const manifest = {
    schemaVersion: CHANGELOG_SCHEMA_VERSION,
    repository,
    generatedAt: requireIsoTimestamp(prospective.releasedAt, 'Manifest generation time'),
    entries: details,
  };
  assertNoSensitiveData(JSON.stringify(manifest));
  return manifest;
}

export function reconcilePublishedManifest(input, publishedAt) {
  validateManifest(input);
  const pending = input.entries.filter((entry) => entry.publicationState === 'pending');
  if (pending.length !== 1) throw new Error('A release manifest must have exactly one pending entry before reconciliation.');
  const timestamp = requireIsoTimestamp(publishedAt, 'Published release timestamp');
  const entries = input.entries.map((entry) => entry === pending[0]
    ? { ...entry, releasedAt: timestamp, publicationState: 'published' }
    : { ...entry });
  entries.sort((left, right) => right.releasedAt.localeCompare(left.releasedAt) || right.version.localeCompare(left.version));
  const manifest = { ...input, generatedAt: timestamp, entries };
  validateManifest(manifest, { allowPending: false });
  return manifest;
}

export function validateManifest(manifest, { allowPending = true } = {}) {
  assertExactKeys(manifest, ['schemaVersion', 'repository', 'generatedAt', 'entries'], 'Release manifest');
  if (!manifest || typeof manifest !== 'object' || manifest.schemaVersion !== CHANGELOG_SCHEMA_VERSION ||
      !REPOSITORY_PATTERN.test(String(manifest.repository ?? '')) || !Array.isArray(manifest.entries)) {
    throw new Error('Release manifest schema is invalid.');
  }
  if (manifest.entries.length < 1 || manifest.entries.length > MAX_RELEASES + 1) throw new Error('Release manifest entry count is outside its bounds.');
  requireIsoTimestamp(manifest.generatedAt, 'Manifest generatedAt');
  const tags = new Set();
  let previous = null;
  let previousVersion = null;
  for (const entry of manifest.entries) {
    assertExactKeys(entry, ['version', 'releasedAt', 'commit', 'changes', 'releaseUrl', 'publicationState', 'dimSum'], 'Release manifest entry');
    const tag = requirePublishedTag(entry.version, 'Release manifest tag');
    if (tags.has(tag)) throw new Error(`Duplicate manifest tag: ${tag}.`);
    tags.add(tag);
    const timestamp = requireIsoTimestamp(entry.releasedAt, `Release ${tag} timestamp`);
    if (previous && previous < timestamp) throw new Error('Release manifest entries are not newest-first.');
    if (previous === timestamp && previousVersion.localeCompare(tag) < 0) throw new Error('Release manifest entries have invalid equal-time tag ordering.');
    previous = timestamp;
    previousVersion = tag;
    requireSha(entry.commit, `Release ${tag} commit`);
    if (!Array.isArray(entry.changes) || entry.changes.length < 1 || entry.changes.length > 20) throw new Error(`Release ${tag} changes are outside their bounds.`);
    entry.changes.forEach((change) => assertPlainText(change, `Release ${tag} change`, MAX_CHANGE_LENGTH));
    if (entry.releaseUrl !== releaseUrl(manifest.repository, tag)) throw new Error(`Release ${tag} URL is invalid.`);
    if (!['published', ...(allowPending ? ['pending'] : [])].includes(entry.publicationState)) throw new Error(`Release ${tag} publication state is invalid.`);
    if (entry.dimSum) {
      assertExactKeys(entry.dimSum, ['codeName', 'photoUrl', 'assetName'], `Release ${tag} dim-sum data`);
      normalizeDish({ available: true, ...entry.dimSum }, `Release ${tag}`);
    }
  }
  assertNoSensitiveData(JSON.stringify(manifest));
  return manifest;
}

export function renderGeneratedModule(manifest) {
  validateManifest(manifest);
  const rows = manifest.entries.map(({ version, releasedAt, commit, changes }) => ({ version, releasedAt, commit, changes }));
  return `// Generated by scripts/generate-release-changelog.mjs. Do not hand-edit release builds.\n` +
    `// The committed version is a safe local/unreleased fallback; the release workflow replaces it before Vite runs.\n` +
    `export const GENERATED_CHANGELOG_SCHEMA_VERSION = ${CHANGELOG_SCHEMA_VERSION} as const;\n` +
    `export const GENERATED_CHANGELOG_ENTRIES = ${JSON.stringify(rows, null, 2)} as const;\n` +
    `export const GENERATED_RELEASE_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;\n`;
}

export function renderGeneratedSiteModule(manifest) {
  validateManifest(manifest);
  if (manifest.entries.some((entry) => !EXACT_RELEASE_TAG_PATTERN.test(entry.version) && !LEGACY_RELEASE_TAG_PATTERN.test(entry.version))) throw new Error('The site release manifest contains a tag outside the exact or historical static-site version contract.');
  const siteManifest = {
    schemaVersion: manifest.schemaVersion,
    repository: manifest.repository,
    generatedAt: manifest.generatedAt,
    entries: manifest.entries.map(({ version, releasedAt, commit, changes, releaseUrl }) => ({ version, releasedAt, commit, changes, releaseUrl })),
  };
  return `// Generated by scripts/generate-release-changelog.mjs. Do not hand-edit release builds.\n` +
    `// The static site consumes this same validated manifest locally; it never fetches release data at runtime.\n` +
    `export const GENERATED_SITE_CHANGELOG_SCHEMA_VERSION = ${CHANGELOG_SCHEMA_VERSION};\n` +
    `export const GENERATED_SITE_RELEASE_MANIFEST = ${JSON.stringify(siteManifest, null, 2)};\n`;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readBoundedJson(file, label, limit = MAX_INVENTORY_BYTES) {
  const details = await stat(file);
  if (details.size > limit) throw new Error(`${label} exceeded ${limit} bytes.`);
  return JSON.parse(await readFile(file, 'utf8'));
}

async function main() {
  const reconcileInput = argument('--reconcile');
  const outputJson = argument('--output-json');
  if (reconcileInput) {
    if (!outputJson) throw new Error('--output-json is required when reconciling.');
    const manifest = reconcilePublishedManifest(await readBoundedJson(reconcileInput, 'Release manifest'), argument('--published-at'));
    await writeFile(outputJson, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return;
  }
  const inventoryFile = argument('--inventory');
  const outputTs = argument('--output-ts');
  const outputSite = argument('--output-site');
  if (!inventoryFile || !outputTs || !outputJson) throw new Error('--inventory, --output-ts, and --output-json are required.');
  const inventory = await readBoundedJson(inventoryFile, 'GitHub release inventory');
  const repository = argument('--repository');
  const fallback = process.argv.includes('--fallback');
  const prospective = { version: argument('--tag'), commit: argument('--commit'), releasedAt: argument('--released-at') };
  if (!fallback) assertProspectiveCommitIsHead(prospective.commit);
  const releases = flattenReleasePages(inventory).filter((release) => release && release.draft === false && release.published_at);
  const shas = releases.map((release) => extractSourceCommit(release.body, String(release.tag_name)));
  if (!fallback) shas.push(prospective.commit);
  const commitMetadata = readGitCommitMetadata(shas);
  const dishFile = argument('--dish');
  const dish = dishFile ? await readBoundedJson(dishFile, 'Dim-sum selection', 64 * 1024) : null;
  const manifest = fallback
    ? generateFallbackManifest({ repository, inventory, commitMetadata })
    : generateReleaseManifest({ repository, inventory, prospective, commitMetadata, dish });
  await writeFile(outputTs, renderGeneratedModule(manifest), 'utf8');
  await writeFile(outputJson, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (outputSite) await writeFile(outputSite, renderGeneratedSiteModule(manifest), 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Release changelog generation failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

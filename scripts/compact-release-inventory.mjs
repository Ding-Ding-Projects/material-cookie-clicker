import { readFile, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { assertNoSensitiveData, MAX_INVENTORY_BYTES, MAX_RELEASE_BODY_BYTES, MAX_RELEASE_PAGES, MAX_RELEASES } from './generate-release-changelog.mjs';

export const MAX_RAW_INVENTORY_BYTES = 16 * 1024 * 1024;

function flattenPages(input) {
  if (!Array.isArray(input)) throw new Error('GitHub release inventory must be an array or paginated array.');
  if (input.length === 0 || !input.every(Array.isArray)) {
    if (input.length > MAX_RELEASES) throw new Error(`GitHub release inventory exceeded ${MAX_RELEASES} records.`);
    return input;
  }
  const pages = input;
  if (pages.length > MAX_RELEASE_PAGES) throw new Error(`GitHub release inventory exceeded ${MAX_RELEASE_PAGES} pages.`);
  const rows = [];
  for (const page of pages) {
    if (!Array.isArray(page) || page.length > 100) throw new Error('A GitHub release inventory page exceeded 100 records.');
    rows.push(...page);
    if (rows.length > MAX_RELEASES) throw new Error(`GitHub release inventory exceeded ${MAX_RELEASES} records.`);
  }
  return rows;
}

function compactBody(body, tag) {
  if (body === undefined || body === null) return '';
  if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > MAX_RELEASE_BODY_BYTES) {
    throw new Error(`Release ${tag} has a missing or oversized body.`);
  }
  assertNoSensitiveData(body, `Release ${tag} body`);
  const relevant = body.split(/\r?\n/).filter((line) =>
    /^\s*-\s*(?:Source commit:\s*`[0-9a-fA-F]{40}`|Dim sum code name:\s*.+|Public dish photo:\s*\[[^\]]+\]\(https:\/\/github\.com\/Ding-Ding-Projects\/dim-sum-photos\/releases\/download\/catalog-v1[^\s)]*\/[^\s)]+\))\s*$/i.test(line),
  );
  return relevant.join('\n');
}

export function compactReleaseInventory(input) {
  const compacted = flattenPages(input).map((release, index) => {
    if (!release || typeof release !== 'object' || Array.isArray(release)) {
      throw new Error(`Release inventory row ${index} is malformed.`);
    }
    if (typeof release.draft !== 'boolean') throw new Error(`Release inventory row ${index} has an invalid draft state.`);
    if (release.published_at !== null && release.published_at !== undefined && typeof release.published_at !== 'string') {
      throw new Error(`Release inventory row ${index} has an invalid publication time.`);
    }
    const tag = String(release.tag_name ?? '');
    if (!tag || tag.length > 80) throw new Error(`Release inventory row ${index} has an invalid tag.`);
    if (typeof release.html_url !== 'string' || release.html_url.length > 500) {
      throw new Error(`Release inventory row ${index} has an invalid release URL.`);
    }
    return {
      tag_name: tag,
      draft: release.draft,
      published_at: release.published_at ?? null,
      html_url: release.html_url,
      body: compactBody(release.body, tag),
    };
  });
  // GitHub's paginated release listing can repeat an identical row when a
  // release is created while pages are being read. Remove only byte-identical
  // rows; same-tag rows with different evidence remain for the generator to
  // reject as ambiguous rather than being silently merged.
  const unique = [];
  const fingerprints = new Set();
  for (const release of compacted) {
    const fingerprint = JSON.stringify(release);
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    unique.push(release);
  }
  const compactBytes = Buffer.byteLength(JSON.stringify(unique), 'utf8');
  if (compactBytes > MAX_INVENTORY_BYTES) throw new Error(`Compacted GitHub release inventory exceeded ${MAX_INVENTORY_BYTES} bytes.`);
  return unique;
}

async function main() {
  const inputIndex = process.argv.indexOf('--input');
  const outputIndex = process.argv.indexOf('--output');
  const inputFile = inputIndex >= 0 ? process.argv[inputIndex + 1] : null;
  const outputFile = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
  if (!inputFile || !outputFile) throw new Error('--input and --output are required.');
  const details = await stat(inputFile);
  if (details.size > MAX_RAW_INVENTORY_BYTES) throw new Error(`Raw GitHub release inventory exceeded ${MAX_RAW_INVENTORY_BYTES} bytes.`);
  const input = JSON.parse(await readFile(inputFile, 'utf8').then((value) => value.replace(/^\uFEFF/, '')));
  const compacted = compactReleaseInventory(input);
  await writeFile(outputFile, `${JSON.stringify(compacted)}\n`, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}

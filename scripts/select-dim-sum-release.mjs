import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const CATALOG_REPOSITORY = 'Ding-Ding-Projects/dim-sum-photos';
export const CATALOG_URL = `https://raw.githubusercontent.com/${CATALOG_REPOSITORY}/main/catalog/index.json`;

function requestHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'oak-kay-release',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson(url, token) {
  const response = await fetch(url, { headers: requestHeaders(token), redirect: 'error' });
  if (!response.ok) throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}`);
  return response.json();
}

async function fetchPages(url, token, maxPages = 20) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = url.includes('?') ? '&' : '?';
    const batch = await fetchJson(`${url}${separator}per_page=100&page=${page}`, token);
    if (!Array.isArray(batch)) throw new Error('GitHub release inventory was not an array.');
    rows.push(...batch);
    if (batch.length < 100) return rows;
  }
  throw new Error(`GitHub release inventory exceeded ${maxPages * 100} records.`);
}

export function selectPublishedDish(catalog, catalogReleases, projectReleases) {
  const published = new Map();
  for (const release of catalogReleases) {
    if (release.draft || !String(release.tag_name ?? '').startsWith('catalog-v1')) continue;
    for (const asset of release.assets ?? []) {
      if (typeof asset.name === 'string' && typeof asset.browser_download_url === 'string') published.set(asset.name, asset.browser_download_url);
    }
  }

  const priorBodies = projectReleases.map((release) => String(release.body ?? '')).join('\n');
  for (const dish of catalog.dishes ?? []) {
    const assetName = path.posix.basename(String(dish.image?.path ?? ''));
    const photoUrl = published.get(assetName);
    const nameEn = String(dish.name?.en ?? '').trim();
    const nameZhHant = String(dish.name?.zhHant ?? '').trim();
    if (!assetName || !photoUrl || !nameEn || !nameZhHant) continue;
    const codeName = `${nameEn} · ${nameZhHant}`;
    if (priorBodies.includes(`Dim sum code name: ${codeName}`)) continue;
    return {
      available: true,
      id: String(dish.id ?? ''),
      codeName,
      nameEn,
      nameZhHant,
      assetName,
      photoUrl,
      alt: String(dish.image?.alt?.en ?? `${nameEn} dim sum`),
    };
  }

  return { available: false, reason: 'No unused dish with a published catalog-v1 photo asset was available.' };
}

export async function resolvePublishedDish(repository, token = process.env.GH_TOKEN) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Repository must be an owner/name pair.');
  const [catalog, catalogReleases, projectReleases] = await Promise.all([
    fetchJson(CATALOG_URL),
    fetchPages(`https://api.github.com/repos/${CATALOG_REPOSITORY}/releases`, token),
    fetchPages(`https://api.github.com/repos/${repository}/releases`, token),
  ]);
  if (!/^1(?:\.|$)/.test(String(catalog.schemaVersion)) || !Array.isArray(catalog.dishes)) throw new Error('The public dim-sum catalog schema is unsupported.');
  return selectPublishedDish(catalog, catalogReleases, projectReleases);
}

async function main() {
  const repositoryIndex = process.argv.indexOf('--repository');
  const repository = repositoryIndex >= 0 ? process.argv[repositoryIndex + 1] : process.env.GITHUB_REPOSITORY;
  try {
    if (!repository) throw new Error('No repository was supplied.');
    process.stdout.write(`${JSON.stringify(await resolvePublishedDish(repository))}\n`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Dim sum code name unavailable: ${reason}\n`);
    process.stdout.write(`${JSON.stringify({ available: false, reason })}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

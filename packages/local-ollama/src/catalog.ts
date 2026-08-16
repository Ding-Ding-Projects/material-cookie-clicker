import { matchesSearch, type SearchState } from "@material-cookie-clicker/surface-kernel";

const OFFICIAL_LIBRARY_ORIGIN = "https://ollama.com";
const OFFICIAL_LIBRARY_PATH = "/library";

export interface OfficialCatalogModel {
  name: string;
  description: string | null;
  capabilities: string[];
  officialUrl: string;
}

export interface OfficialCatalogVariant {
  model: string;
  tag: string;
  reference: string;
  displayLabel: string;
  sizeBytes: number | null;
  parameterSize: string | null;
  quantization: string | null;
  capabilities: string[];
  officialUrl: string;
}

export interface OfficialCatalogSnapshot {
  schemaVersion: 1;
  source: "ollama-official-library";
  sourceUrl: string;
  sourceIdentity: string;
  refreshedAt: string;
  modelPageCount: number;
  tagPageCount: number;
  modelCount: number;
  variantCount: number;
  complete: boolean;
  stale: boolean;
  staleAfterMs: number;
  models: OfficialCatalogModel[];
  variants: OfficialCatalogVariant[];
  warnings: string[];
}

export interface OfficialCatalogCache {
  read(): Promise<OfficialCatalogSnapshot | null>;
  write(snapshot: OfficialCatalogSnapshot): Promise<void>;
}

export interface CatalogRefreshOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  now?: () => Date;
  staleAfterMs?: number;
  maxModelPages?: number;
  maxTagPagesPerModel?: number;
  tagConcurrency?: number;
  maxResponseBytes?: number;
}

export interface CatalogRefreshResult {
  snapshot: OfficialCatalogSnapshot | null;
  state: "fresh" | "stale-cache" | "unavailable" | "incomplete";
  reason: string | null;
}

interface SourcePage {
  url: string;
  html: string;
  identity: string;
  hasNext: boolean;
}

interface ParsedTag {
  reference: string;
  tag: string;
  label: string;
  sizeBytes: number | null;
  parameterSize: string | null;
  quantization: string | null;
}

const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function stripMarkup(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function sourceIdentity(response: Response, body: string): string {
  const headerIdentity = response.headers.get("etag") ?? response.headers.get("last-modified");
  if (headerIdentity) return `${response.url}#${headerIdentity}`;
  let hash = 2166136261;
  for (let index = 0; index < body.length; index += 1) {
    hash ^= body.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${response.url}#fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.ok) throw new Error(`Official catalog request returned HTTP ${response.status}.`);
  const advertised = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(advertised) && advertised > maxBytes) {
    throw new Error(`Official catalog response exceeded the ${maxBytes}-byte limit.`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new Error(`Official catalog response exceeded the ${maxBytes}-byte limit.`);
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function officialUrl(path: string, page: number): string {
  const url = new URL(path, OFFICIAL_LIBRARY_ORIGIN);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.href;
}

async function fetchPage(
  fetcher: typeof fetch,
  path: string,
  page: number,
  signal: AbortSignal | undefined,
  maxBytes: number,
): Promise<SourcePage> {
  const url = officialUrl(path, page);
  const response = await fetcher(url, {
    method: "GET",
    headers: { Accept: "text/html; charset=utf-8" },
    credentials: "omit",
    redirect: "error",
    ...(signal ? { signal } : {}),
  });
  if (new URL(response.url).origin !== OFFICIAL_LIBRARY_ORIGIN) {
    throw new Error("Official catalog response changed origin.");
  }
  const html = await readBoundedText(response, maxBytes);
  const nextPage = page + 1;
  const hasNext = html.includes(`page=${nextPage}`) || html.includes(`rel="next"`);
  return { url: response.url, html, identity: sourceIdentity(response, html), hasNext };
}

function modelNamesFromHtml(html: string): string[] {
  const names = new Set<string>();
  const pattern = /href="\/library\/([a-z0-9][a-z0-9._-]*)(?:["/?#])/gi;
  for (const match of html.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (name && !name.includes(":")) names.add(name);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function textAround(html: string, needle: string, radius = 1600): string {
  const index = html.indexOf(needle);
  if (index < 0) return "";
  return stripMarkup(html.slice(Math.max(0, index - radius), Math.min(html.length, index + radius)));
}

function modelFromHtml(name: string, html: string): OfficialCatalogModel {
  const around = textAround(html, `href="/library/${name}"`, 1200);
  const knownCapabilities = ["vision", "tools", "thinking", "embedding"];
  const capabilities = knownCapabilities.filter((capability) =>
    new RegExp(`(?:^|\\s)${escapeRegExp(capability)}(?:\\s|$)`, "i").test(around),
  );
  return {
    name,
    description: around || null,
    capabilities,
    officialUrl: `${OFFICIAL_LIBRARY_ORIGIN}${OFFICIAL_LIBRARY_PATH}/${encodeURIComponent(name)}`,
  };
}

function parseByteSize(value: string): number | null {
  const match = /(?:^|\s)(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)(?:\s|$)/i.exec(value);
  if (!match?.[1] || !match[2]) return null;
  const amount = Number(match[1]);
  const powers: Record<string, number> = { KB: 1, MB: 2, GB: 3, TB: 4 };
  const power = powers[match[2].toUpperCase()];
  return power ? Math.round(amount * 1000 ** power) : null;
}

function parseTags(model: string, html: string): ParsedTag[] {
  const tags = new Map<string, ParsedTag>();
  const pattern = new RegExp(`href="/library/${escapeRegExp(model)}:([^"/?#]+)"`, "gi");
  for (const match of html.matchAll(pattern)) {
    const rawTag = match[1];
    if (!rawTag) continue;
    const tag = decodeURIComponent(rawTag);
    const reference = `${model}:${tag}`;
    if (tags.has(reference)) continue;
    const around = textAround(html, match[0], 900);
    const parameter = /(?:^|\s)(\d+(?:\.\d+)?[BM])(?:\s|$)/i.exec(around)?.[1] ?? null;
    const quantization = /(?:^|\s)((?:Q\d|IQ\d|FP\d|BF\d)[A-Z0-9_-]*)(?:\s|$)/i.exec(around)?.[1] ?? null;
    tags.set(reference, {
      reference,
      tag,
      label: reference,
      sizeBytes: parseByteSize(around),
      parameterSize: parameter,
      quantization,
    });
  }
  return [...tags.values()].sort((left, right) => left.reference.localeCompare(right.reference));
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value !== undefined) results[index] = await operation(value);
    }
  });
  await Promise.all(workers);
  return results;
}

function isStale(snapshot: OfficialCatalogSnapshot, now: Date): boolean {
  const refreshed = Date.parse(snapshot.refreshedAt);
  return !Number.isFinite(refreshed) || now.getTime() - refreshed > snapshot.staleAfterMs;
}

export async function refreshOfficialCatalog(
  cache: OfficialCatalogCache,
  options: CatalogRefreshOptions = {},
): Promise<CatalogRefreshResult> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now?.() ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const maxModelPages = Math.max(1, Math.min(options.maxModelPages ?? 100, 500));
  const maxTagPages = Math.max(1, Math.min(options.maxTagPagesPerModel ?? 100, 500));
  const concurrency = Math.max(1, Math.min(options.tagConcurrency ?? 4, 8));
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const cached = await cache.read();

  try {
    const modelPages: SourcePage[] = [];
    const modelNames = new Set<string>();
    const modelsByName = new Map<string, OfficialCatalogModel>();
    let modelPagesComplete = false;
    for (let page = 1; page <= maxModelPages; page += 1) {
      const sourcePage = await fetchPage(fetcher, OFFICIAL_LIBRARY_PATH, page, options.signal, maxResponseBytes);
      const names = modelNamesFromHtml(sourcePage.html);
      const newlySeen = names.filter((name) => !modelNames.has(name));
      if (page > 1 && newlySeen.length === 0) {
        modelPagesComplete = true;
        break;
      }
      modelPages.push(sourcePage);
      for (const name of names) {
        modelNames.add(name);
        if (!modelsByName.has(name)) modelsByName.set(name, modelFromHtml(name, sourcePage.html));
      }
      if (!sourcePage.hasNext) {
        modelPagesComplete = true;
        break;
      }
    }
    if (modelNames.size === 0) throw new Error("The official library returned no model entries.");

    let tagPageCount = 0;
    let tagsComplete = true;
    const identities = modelPages.map((page) => page.identity);
    const variantsByReference = new Map<string, OfficialCatalogVariant>();
    await mapWithConcurrency([...modelNames].sort(), concurrency, async (model) => {
      let completeForModel = false;
      const modelDetails = modelsByName.get(model);
      for (let page = 1; page <= maxTagPages; page += 1) {
        const sourcePage = await fetchPage(
          fetcher,
          `${OFFICIAL_LIBRARY_PATH}/${encodeURIComponent(model)}/tags`,
          page,
          options.signal,
          maxResponseBytes,
        );
        tagPageCount += 1;
        identities.push(sourcePage.identity);
        const parsed = parseTags(model, sourcePage.html);
        const before = variantsByReference.size;
        for (const tag of parsed) {
          variantsByReference.set(tag.reference, {
            model,
            tag: tag.tag,
            reference: tag.reference,
            displayLabel: tag.label,
            sizeBytes: tag.sizeBytes,
            parameterSize: tag.parameterSize,
            quantization: tag.quantization,
            capabilities: modelDetails?.capabilities ?? [],
            officialUrl: `${OFFICIAL_LIBRARY_ORIGIN}${OFFICIAL_LIBRARY_PATH}/${encodeURIComponent(tag.reference)}`,
          });
        }
        if (!sourcePage.hasNext || (page > 1 && variantsByReference.size === before)) {
          completeForModel = true;
          break;
        }
      }
      if (!completeForModel) tagsComplete = false;
    });

    const complete = modelPagesComplete && tagsComplete && variantsByReference.size >= modelNames.size;
    const warnings: string[] = [];
    if (!modelPagesComplete) warnings.push("The official model listing reached the configured page limit.");
    if (!tagsComplete) warnings.push("At least one official tag listing reached the configured page limit.");
    if (variantsByReference.size < modelNames.size) warnings.push("At least one official model had no discoverable tag.");
    const snapshot: OfficialCatalogSnapshot = {
      schemaVersion: 1,
      source: "ollama-official-library",
      sourceUrl: `${OFFICIAL_LIBRARY_ORIGIN}${OFFICIAL_LIBRARY_PATH}`,
      sourceIdentity: identities.sort().join("|"),
      refreshedAt: now.toISOString(),
      modelPageCount: modelPages.length,
      tagPageCount,
      modelCount: modelNames.size,
      variantCount: variantsByReference.size,
      complete,
      stale: false,
      staleAfterMs,
      models: [...modelsByName.values()].sort((left, right) => left.name.localeCompare(right.name)),
      variants: [...variantsByReference.values()].sort((left, right) => left.reference.localeCompare(right.reference)),
      warnings,
    };
    if (!complete) {
      return { snapshot: cached, state: "incomplete", reason: warnings.join(" ") };
    }
    await cache.write(snapshot);
    return { snapshot, state: "fresh", reason: null };
  } catch (error) {
    if (!cached) {
      return { snapshot: null, state: "unavailable", reason: error instanceof Error ? error.message : String(error) };
    }
    const stale = isStale(cached, now);
    return {
      snapshot: { ...cached, stale },
      state: "stale-cache",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface CatalogFilter {
  /**
   * Search state from the shared anchored search engine. The package compiles
   * no regular expression of its own for searching, so a pattern behaves the
   * same way here as it does in every other search field.
   */
  search?: SearchState;
  installed?: Set<string>;
  running?: Set<string>;
  families?: Set<string>;
  capabilities?: Set<string>;
  quantizations?: Set<string>;
}

/** The text one catalog variant is searched against. */
export function catalogVariantHaystack(variant: OfficialCatalogVariant): string {
  return [variant.reference, variant.model, variant.tag, variant.parameterSize, variant.quantization]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

export function filterCatalogVariants(
  variants: OfficialCatalogVariant[],
  filter: CatalogFilter,
): OfficialCatalogVariant[] {
  const search = filter.search;
  return variants.filter((variant) => {
    if (search && !matchesSearch(catalogVariantHaystack(variant), search)) return false;
    if (filter.installed && !filter.installed.has(variant.reference)) return false;
    if (filter.running && !filter.running.has(variant.reference)) return false;
    if (filter.families && !filter.families.has(variant.model)) return false;
    if (filter.capabilities && ![...filter.capabilities].every((value) => variant.capabilities.includes(value))) return false;
    if (filter.quantizations && (!variant.quantization || !filter.quantizations.has(variant.quantization))) return false;
    return true;
  });
}

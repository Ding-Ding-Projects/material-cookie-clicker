export type SearchState = { query: string; regex: boolean; pattern: string; flags: string };
export type DocArticle = { slug: string; title: string; path: string; markdown: string };
export type DocsIndexEntry = { slug: string; title: string; path: string; plainText: string };
export type DocsIndex = { articles: DocsIndexEntry[]; bySlug: Record<string, DocsIndexEntry>; unresolvedLinks: { fromSlug: string; href: string }[] };
export type ChangelogEntry = { area: string; version: string; date: string | null; section: string; entry: string; commit: string | null; verification: string | null };

function matches(value: string, state: SearchState): boolean {
  if (!state.regex) return value.toLowerCase().includes(state.query.toLowerCase());
  if (!state.pattern || state.pattern.length > 256) return false;
  try { return new RegExp(state.pattern, state.flags.replaceAll("g", "")).test(value); } catch { return false; }
}

function normalizePath(fromPath: string, href: string): string {
  const segments = fromPath.split("/").slice(0, -1);
  for (const segment of href.split("#")[0]?.split("/") ?? []) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop(); else segments.push(segment);
  }
  return segments.join("/");
}

function buildDocsIndex(articles: readonly DocArticle[]): DocsIndex {
  const paths = new Map(articles.map((article) => [article.path, article.slug]));
  const unresolvedLinks: { fromSlug: string; href: string }[] = [];
  const entries = articles.map((article) => {
    for (const match of article.markdown.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
      const href = match[1] ?? "";
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
      if (!paths.has(normalizePath(article.path, href))) unresolvedLinks.push({ fromSlug: article.slug, href });
    }
    const plainText = article.markdown.replace(/```[^]*?```/g, " ").replace(/\[[^\]]+\]\([^)]+\)/g, (link) => link.slice(1, link.indexOf("]"))).replace(/[#*`|>-]/g, " ").replace(/\s+/g, " ").trim();
    return { slug: article.slug, title: article.title, path: article.path, plainText };
  });
  return { articles: entries, bySlug: Object.fromEntries(entries.map((entry) => [entry.slug, entry])), unresolvedLinks };
}

function parseChangelog(markdown: string, area: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let version = "";
  let date: string | null = null;
  let section = "Changed";
  for (const raw of markdown.replaceAll("\r\n", "\n").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("## ") && !line.startsWith("### ")) { version = line.slice(3).trim(); date = /\d{4}-\d{2}-\d{2}/.exec(version)?.[0] ?? null; section = "Changed"; continue; }
    if (line.startsWith("### ")) { section = line.slice(4).trim() || "Changed"; continue; }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (!bullet || !version) continue;
    const text = bullet[1] ?? "";
    const commit = /\(([0-9a-f]{7,40})\)\s*$/i.exec(text)?.[1]?.toLowerCase() ?? null;
    entries.push({ area, version, date, section, entry: commit ? text.replace(/\s*\([0-9a-f]{7,40}\)\s*$/i, "") : text, commit, verification: null });
  }
  return entries;
}

function commitUrl(repository: string, sha: string | null): string | null {
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha) || !/^https:\/\/[^/]+\/[^/]+\/[^/]+\/?$/i.test(repository)) return null;
  return `${repository.replace(/\/$/, "")}/commit/${sha}`;
}

export type OfflineDocsBundle = DocsIndex & { readonly expectedPaths: readonly string[] };

export function buildOfflineDocsBundle(articles: readonly DocArticle[], expectedPaths: readonly string[]): OfflineDocsBundle {
  const actual = new Set(articles.map((article) => article.path));
  const missing = expectedPaths.filter((path) => !actual.has(path));
  if (missing.length > 0) throw new Error(`Offline documentation bundle is missing: ${missing.join(", ")}`);
  const index = buildDocsIndex(articles);
  if (index.unresolvedLinks.length > 0) {
    throw new Error(`Offline documentation contains unresolved links: ${index.unresolvedLinks.map((item) => item.href).join(", ")}`);
  }
  return { ...index, expectedPaths: [...expectedPaths] };
}

export function searchDocs(bundle: DocsIndex, search: SearchState): { slug: string; title: string; heading: string | null; excerpt: string }[] {
  return bundle.articles.filter((article) => matches(`${article.title} ${article.plainText}`, search)).map((article) => ({ slug: article.slug, title: article.title, heading: null, excerpt: article.plainText.slice(0, 160) }));
}

export interface CommitVerifier {
  exists(sha: string): Promise<boolean>;
}

export async function buildVerifiedChangelog(input: {
  areas: readonly { area: string; markdown: string }[];
  repositoryUrl: string;
  verifier: CommitVerifier;
}): Promise<(ChangelogEntry & { commitHref: string | null })[]> {
  const entries = input.areas.flatMap((area) => parseChangelog(area.markdown, area.area));
  for (const entry of entries) {
    if (entry.commit && !(await input.verifier.exists(entry.commit))) {
      throw new Error(`Changelog commit ${entry.commit} does not exist.`);
    }
  }
  return entries.map((entry) => ({ ...entry, commitHref: commitUrl(input.repositoryUrl, entry.commit) }));
}

export function filterVerifiedChangelog(
  entries: readonly ChangelogEntry[],
  range: { from?: string; to?: string; areas?: readonly string[] },
  search: SearchState,
): ChangelogEntry[] {
  const areas = range.areas?.length ? new Set(range.areas) : null;
  return entries.filter((entry) => (!range.from || (entry.date !== null && entry.date >= range.from)) && (!range.to || (entry.date !== null && entry.date <= range.to)) && (!areas || areas.has(entry.area)) && matches(`${entry.entry} ${entry.section} ${entry.version} ${entry.area}`, search));
}

export function exportChangelogMarkdown(entries: readonly ChangelogEntry[], from: string | null, to: string | null): string {
  const lines = ["# Changelog export", "", `Range: ${from ?? "beginning"} to ${to ?? "latest"}`, ""];
  for (const entry of entries) {
    const trace = entry.commit ? ` (${entry.commit})` : " (commit unavailable)";
    lines.push(`- ${entry.version} · ${entry.section}: ${entry.entry}${trace}`);
  }
  return `${lines.join("\n")}\n`;
}

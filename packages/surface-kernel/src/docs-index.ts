/**
 * Documentation parsing, indexing and search.
 *
 * The parser produces a typed node list and never an HTML string, so no
 * consumer is ever tempted to inject markup into a page. Rendering each node
 * kind is the surface's job.
 *
 * The supported subset is the one the repository's own articles use: ATX
 * headings, paragraphs, unordered and ordered lists, fenced code blocks, and
 * pipe tables, with inline links and inline code inside paragraphs and list
 * items.
 */

import { matchesSearch, type SearchState } from "./regex-builder.ts";

export type InlineNode =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; text: string; href: string };

export type DocNode =
  | { kind: "heading"; level: number; text: string; id: string }
  | { kind: "paragraph"; inline: InlineNode[] }
  | { kind: "list"; ordered: boolean; items: InlineNode[][] }
  | { kind: "code"; language: string | null; value: string }
  | { kind: "table"; headers: string[]; rows: string[][] };

export type DocArticle = {
  slug: string;
  title: string;
  path: string;
  markdown: string;
};

export type DocOutlineEntry = {
  level: number;
  text: string;
  id: string;
};

export type DocsIndexEntry = {
  slug: string;
  title: string;
  path: string;
  nodes: DocNode[];
  outline: DocOutlineEntry[];
  plainText: string;
  /** Internal links that resolve to another indexed article. */
  links: { href: string; targetSlug: string | null; text: string }[];
};

export type DocsIndex = {
  articles: DocsIndexEntry[];
  bySlug: Record<string, DocsIndexEntry>;
  unresolvedLinks: { fromSlug: string; href: string }[];
};

export type DocSearchResult = {
  slug: string;
  title: string;
  heading: string | null;
  excerpt: string;
};

/** Stable heading identifier for in-page links. */
export function headingId(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g;
  let cursor = 0;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    if (match.index > cursor) nodes.push({ kind: "text", value: text.slice(cursor, match.index) });
    if (match[1] !== undefined && match[2] !== undefined) {
      nodes.push({ kind: "link", text: match[1], href: match[2] });
    } else if (match[3] !== undefined) {
      nodes.push({ kind: "code", value: match[3] });
    }
    cursor = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (cursor < text.length) nodes.push({ kind: "text", value: text.slice(cursor) });
  return nodes;
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Parses the supported Markdown subset into typed nodes. */
export function parseMarkdown(md: string): DocNode[] {
  const lines = md.replaceAll("\r\n", "\n").split("\n");
  const nodes: DocNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const fence = /^```\s*([A-Za-z0-9+-]*)\s*$/.exec(line);
    if (fence) {
      const language = (fence[1] ?? "").length > 0 ? (fence[1] ?? null) : null;
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      nodes.push({ kind: "code", language, value: body.join("\n") });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const text = (heading[2] ?? "").trim();
      nodes.push({ kind: "heading", level: (heading[1] ?? "#").length, text, id: headingId(text) });
      index += 1;
      continue;
    }

    if (/^\|.*\|\s*$/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[index + 1] ?? "")) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && /^\|.*\|\s*$/.test(lines[index] ?? "")) {
        rows.push(splitTableRow(lines[index] ?? ""));
        index += 1;
      }
      nodes.push({ kind: "table", headers, rows });
      continue;
    }

    const bullet = /^\s*([-*])\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = numbered !== null && bullet === null;
      const items: InlineNode[][] = [];
      while (index < lines.length) {
        const current = lines[index] ?? "";
        const itemMatch = ordered ? /^\s*\d+\.\s+(.*)$/.exec(current) : /^\s*[-*]\s+(.*)$/.exec(current);
        if (!itemMatch) break;
        items.push(parseInline((itemMatch[1] ?? "").trim()));
        index += 1;
      }
      nodes.push({ kind: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (
        current.trim().length === 0 ||
        /^(#{1,6})\s+/.test(current) ||
        /^```/.test(current) ||
        /^\s*[-*]\s+/.test(current) ||
        /^\s*\d+\.\s+/.test(current) ||
        /^\|.*\|\s*$/.test(current)
      ) {
        break;
      }
      paragraph.push(current.trim());
      index += 1;
    }
    nodes.push({ kind: "paragraph", inline: parseInline(paragraph.join(" ")) });
  }

  return nodes;
}

function inlineText(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => (node.kind === "link" ? node.text : node.value))
    .join("");
}

/** Flattens a node list to searchable plain text. */
export function nodesToPlainText(nodes: readonly DocNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.kind === "heading") parts.push(node.text);
    else if (node.kind === "paragraph") parts.push(inlineText(node.inline));
    else if (node.kind === "list") for (const item of node.items) parts.push(inlineText(item));
    else if (node.kind === "code") parts.push(node.value);
    else parts.push([...node.headers, ...node.rows.flat()].join(" "));
  }
  return parts.join("\n");
}

function collectLinks(nodes: readonly DocNode[]): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = [];
  for (const node of nodes) {
    if (node.kind === "paragraph") {
      for (const inline of node.inline) if (inline.kind === "link") links.push({ href: inline.href, text: inline.text });
    } else if (node.kind === "list") {
      for (const item of node.items) {
        for (const inline of item) if (inline.kind === "link") links.push({ href: inline.href, text: inline.text });
      }
    }
  }
  return links;
}

function resolveInternal(fromPath: string, href: string, byPath: Map<string, string>): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return null;
  const [target] = href.split("#");
  if (target === undefined || target.length === 0) return null;
  const segments = fromPath.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "." || segment.length === 0) continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return byPath.get(segments.join("/")) ?? null;
}

/** Builds the searchable index, with a heading outline and resolved links. */
export function buildDocsIndex(articles: readonly DocArticle[]): DocsIndex {
  const byPath = new Map<string, string>();
  for (const article of articles) byPath.set(article.path, article.slug);

  const entries: DocsIndexEntry[] = [];
  const unresolvedLinks: { fromSlug: string; href: string }[] = [];

  for (const article of articles) {
    const nodes = parseMarkdown(article.markdown);
    const links = collectLinks(nodes).map((link) => {
      const targetSlug = resolveInternal(article.path, link.href, byPath);
      if (targetSlug === null && !/^[a-z][a-z0-9+.-]*:/i.test(link.href) && !link.href.startsWith("#")) {
        unresolvedLinks.push({ fromSlug: article.slug, href: link.href });
      }
      return { href: link.href, targetSlug, text: link.text };
    });
    entries.push({
      slug: article.slug,
      title: article.title,
      path: article.path,
      nodes,
      outline: nodes
        .filter((node): node is Extract<DocNode, { kind: "heading" }> => node.kind === "heading")
        .map((node) => ({ level: node.level, text: node.text, id: node.id })),
      plainText: nodesToPlainText(nodes),
      links,
    });
  }

  const bySlug: Record<string, DocsIndexEntry> = {};
  for (const entry of entries) bySlug[entry.slug] = entry;
  return { articles: entries, bySlug, unresolvedLinks };
}

function nearestHeading(entry: DocsIndexEntry, needle: string): string | null {
  let current: string | null = null;
  for (const node of entry.nodes) {
    if (node.kind === "heading") {
      current = node.text;
      if (matchesSearchText(node.text, needle)) return node.text;
      continue;
    }
    const text =
      node.kind === "paragraph"
        ? inlineText(node.inline)
        : node.kind === "list"
          ? node.items.map(inlineText).join(" ")
          : node.kind === "code"
            ? node.value
            : [...node.headers, ...node.rows.flat()].join(" ");
    if (matchesSearchText(text, needle)) return current;
  }
  return current;
}

function matchesSearchText(haystack: string, needle: string): boolean {
  return needle.length > 0 && haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

function excerptFor(entry: DocsIndexEntry, needle: string): string {
  if (needle.length === 0) return entry.plainText.slice(0, 160);
  const position = entry.plainText.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (position === -1) return entry.plainText.slice(0, 160);
  const start = Math.max(0, position - 60);
  return entry.plainText.slice(start, start + 160).trim();
}

/** Searches article body text and reports the heading each match sits under. */
export function searchDocs(index: DocsIndex, state: SearchState): DocSearchResult[] {
  const needle = state.regex ? state.pattern : state.query;
  return index.articles
    .filter((entry) => matchesSearch(`${entry.title}\n${entry.plainText}`, state))
    .map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      heading: state.regex ? (entry.outline[0]?.text ?? null) : nearestHeading(entry, needle),
      excerpt: state.regex ? entry.plainText.slice(0, 160) : excerptFor(entry, needle),
    }));
}

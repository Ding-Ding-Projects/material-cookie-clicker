/**
 * Changelog parsing.
 *
 * The repository keeps one changelog per area, each written as a heading per
 * version, an optional section heading, and one bullet per entry. A commit
 * link is only produced when a real commit identifier was recorded; the parser
 * never guesses one.
 */

import { matchesSearch, type SearchState } from "./regex-builder.ts";

export type ChangelogEntry = {
  area: string;
  version: string;
  date: string | null;
  section: string;
  entry: string;
  commit: string | null;
  verification: string | null;
};

const VERSION_HEADING = /^##\s+(.*)$/;
const SECTION_HEADING = /^###\s+(.*)$/;
const BULLET = /^[-*]\s+(.+)$/;
const DATE_IN_HEADING = /(\d{4}-\d{2}-\d{2})/;
const COMMIT_IN_ENTRY = /\(([0-9a-f]{7,40})\)\s*$/i;
const VERIFICATION_LINE = /^Verification[^:]*:\s*(.+)$/i;

/** Parses one area changelog into flat, filterable entries. */
export function parseChangelog(markdown: string, area: string): ChangelogEntry[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const entries: ChangelogEntry[] = [];

  let version = "";
  let date: string | null = null;
  let section = "Changed";
  const verificationByVersion = new Map<string, string>();

  // First pass: attach any verification statement to the version it sits under.
  let scanVersion = "";
  for (const line of lines) {
    const versionMatch = VERSION_HEADING.exec(line.trim());
    if (versionMatch) {
      scanVersion = (versionMatch[1] ?? "").trim();
      continue;
    }
    const verification = VERIFICATION_LINE.exec(line.trim());
    if (verification && scanVersion) {
      verificationByVersion.set(scanVersion, (verification[1] ?? "").trim());
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    const versionMatch = VERSION_HEADING.exec(line);
    if (versionMatch) {
      const heading = (versionMatch[1] ?? "").trim();
      version = heading;
      date = DATE_IN_HEADING.exec(heading)?.[1] ?? null;
      section = "Changed";
      continue;
    }
    const sectionMatch = SECTION_HEADING.exec(line);
    if (sectionMatch) {
      section = (sectionMatch[1] ?? "").trim() || "Changed";
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet && version) {
      const text = (bullet[1] ?? "").trim();
      const commit = COMMIT_IN_ENTRY.exec(text)?.[1]?.toLowerCase() ?? null;
      entries.push({
        area,
        version,
        date,
        section,
        entry: commit ? text.replace(COMMIT_IN_ENTRY, "").trim() : text,
        commit,
        verification: verificationByVersion.get(version) ?? null,
      });
    }
  }

  return entries;
}

/** Filters entries by date range, area set and the shared search engine. */
export function filterChangelogEntries(
  entries: readonly ChangelogEntry[],
  range: { from?: string; to?: string; areas?: readonly string[] },
  state: SearchState,
): ChangelogEntry[] {
  const areas = range.areas && range.areas.length > 0 ? new Set(range.areas) : null;
  return entries.filter((entry) => {
    if (areas && !areas.has(entry.area)) return false;
    if (range.from && (entry.date === null || entry.date < range.from)) return false;
    if (range.to && (entry.date === null || entry.date > range.to)) return false;
    return matchesSearch(`${entry.entry} ${entry.section} ${entry.version} ${entry.area}`, state);
  });
}

/**
 * Builds a commit link, or returns null. A missing or malformed identifier
 * produces null rather than a guessed address.
 */
export function commitUrl(repository: string, sha: string | null): string | null {
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return null;
  const base = repository.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+\/[^/]+\/[^/]+$/i.test(base)) return null;
  return `${base}/commit/${sha.toLowerCase()}`;
}

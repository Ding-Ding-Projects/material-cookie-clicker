import { describe, expect, it } from "vitest";
import { createSearchState } from "@material-cookie-clicker/surface-kernel";

import { buildOfflineDocsBundle, buildVerifiedChangelog, exportChangelogMarkdown, searchDocs } from "../src/shared/security-content";

describe("offline docs and changelog tools", () => {
  it("fails closed when the handwritten offline article inventory loses an article", () => {
    expect(() => buildOfflineDocsBundle([{ slug: "one", title: "One", path: "docs/one.md", markdown: "# One" }], ["docs/one.md", "docs/two.md"])).toThrow("docs/two.md");
  });

  it("builds a searchable offline bundle with resolved internal links", () => {
    const bundle = buildOfflineDocsBundle([
      { slug: "one", title: "One", path: "docs/one.md", markdown: "# One\n\nRead [Two](two.md)." },
      { slug: "two", title: "Two", path: "docs/two.md", markdown: "# Two\n\nOffline body." },
    ], ["docs/one.md", "docs/two.md"]);
    expect(searchDocs(bundle, createSearchState({ query: "Offline body" }))).toHaveLength(1);
  });

  it("verifies every recorded changelog commit and preserves the SHA in export", async () => {
    const sha = "a".repeat(40);
    const entries = await buildVerifiedChangelog({
      areas: [{ area: "desktop", markdown: `## 1.0.0 — 2027-01-01\n### Added\n- Added tools (${sha})` }],
      repositoryUrl: "https://github.com/example/project",
      verifier: { exists: async (candidate) => candidate === sha },
    });
    expect(entries[0]?.commitHref).toContain(sha);
    expect(exportChangelogMarkdown(entries, null, null)).toContain(sha);
  });
});

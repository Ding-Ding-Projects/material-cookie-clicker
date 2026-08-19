import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY = resolve(ROOT, "docs/completeness.md");

const COLUMNS = [
  "Inventory ID",
  "Surface",
  "Capability",
  "Implementation",
  "Article",
  "Localization",
  "Persistence",
  "Focused tests",
  "Bundled proof",
  "Built interaction",
  "Capture evidence",
  "Truthful state",
] as const;

const REQUIRED_IDS = [
  "desktop-game-core", "desktop-generator-ladder", "desktop-endless-progression",
  "desktop-golden-random-events", "desktop-minigame-events", "desktop-home", "desktop-diesel",
  "desktop-achievements", "desktop-prestige", "desktop-settings", "desktop-language",
  "desktop-funny-levels", "desktop-emoji-dialog-toggle", "desktop-school-mode", "desktop-narrator",
  "desktop-scheduled-settings", "desktop-personal-vocabulary", "desktop-regex-builder",
  "desktop-command-palette", "desktop-notifications", "desktop-appearance-editor",
  "desktop-logo-customization", "desktop-tabs", "desktop-toy-locks", "desktop-authenticator",
  "desktop-unlock-ladder", "desktop-support-tickets", "desktop-file-converter", "desktop-ollama",
  "desktop-local-history", "desktop-exports", "desktop-bulk-actions", "desktop-changelog",
  "desktop-offline-docs", "desktop-external-editor", "desktop-status-hub",
  "desktop-destructive-confirmation", "desktop-auto-update", "desktop-download-dialogs",
  "site-landing", "site-feature-articles", "site-language", "site-funny", "site-emoji",
  "site-school", "site-narrator", "site-scheduled", "site-personal-vocabulary", "site-regex",
  "site-command-palette", "site-notifications", "site-appearance", "site-logo", "site-tabs",
  "site-locks", "site-authenticator", "site-unlock-ladder", "site-support-tickets",
  "site-file-converter", "site-ollama", "site-history", "site-exports", "site-bulk",
  "site-changelog", "site-status-hub", "site-link-preview", "site-installer-link",
  "site-playable-game-boundary",
] as const;

const EVIDENCE_COLUMNS = [
  "Implementation",
  "Localization",
  "Persistence",
  "Focused tests",
  "Bundled proof",
  "Built interaction",
  "Capture evidence",
] as const;

const TRACE_COLUMNS = [
  "Implementation",
  "Focused tests",
  "Bundled proof",
  "Built interaction",
  "Capture evidence",
] as const;

const PAGE_COLUMNS = ["Page ID", "Local file", "Required capability contract", "Page-specific evidence state"] as const;

const SITE_PAGES = [
  ["site-page-home", "site/index.html"],
  ["site-page-feature-index", "site/features/index.html"],
  ["site-page-achievements", "site/features/achievements.html"],
  ["site-page-control-economy", "site/features/control-economy.html"],
  ["site-page-cookie-clicking", "site/features/cookie-clicking.html"],
  ["site-page-diesel-factory", "site/features/diesel-factory.html"],
  ["site-page-generator-ladder", "site/features/generator-ladder.html"],
  ["site-page-golden-cookies", "site/features/golden-cookies.html"],
  ["site-page-home-construction", "site/features/home-construction.html"],
  ["site-page-language-humour", "site/features/language-and-humour.html"],
  ["site-page-minigame-events", "site/features/minigame-events.html"],
  ["site-page-prestige", "site/features/prestige.html"],
  ["site-page-random-events", "site/features/random-events.html"],
  ["site-page-statistics", "site/features/statistics.html"],
  ["site-page-tools-tree", "site/features/tools-tech-tree.html"],
  ["site-page-upgrades", "site/features/upgrades.html"],
] as const;

const FEATURE_ARTICLES = [
  "docs/accessibility/contrast-and-reduced-motion.md",
  "docs/accessibility/keyboard-and-screen-reader.md",
  "docs/build-and-release/automatic-updates.md",
  "docs/build-and-release/build-scripts.md",
  "docs/build-and-release/ci-and-release-workflow.md",
  "docs/build-and-release/dependency-bootstrap.md",
  "docs/build-and-release/unsigned-installer-policy.md",
  "docs/data/changelog-viewer.md",
  "docs/data/exports-and-privacy.md",
  "docs/data/local-version-history.md",
  "docs/data/offline-and-no-network.md",
  "docs/interface/destructive-confirmation.md",
  "docs/interface/dialog-emoji-setting.md",
  "docs/interface/material-design-appearance.md",
  "docs/interface/settings-surface.md",
  "docs/interface/tabbed-navigation.md",
  "docs/localization/funny-level-sliders.md",
  "docs/localization/language-modes.md",
  "docs/tools/app-logo-customization.md",
  "docs/tools/appearance-editor.md",
  "docs/tools/authenticator.md",
  "docs/tools/bulk-actions.md",
  "docs/tools/command-palette.md",
  "docs/tools/download-dialogs.md",
  "docs/tools/exports.md",
  "docs/tools/external-editor.md",
  "docs/tools/file-converter.md",
  "docs/tools/local-history.md",
  "docs/tools/local-model-manager.md",
  "docs/tools/narrator.md",
  "docs/tools/notification-centre.md",
  "docs/tools/personal-vocabulary.md",
  "docs/tools/regex-builder.md",
  "docs/tools/scheduled-settings.md",
  "docs/tools/school-mode.md",
  "docs/tools/status-hub.md",
  "docs/tools/support-tickets.md",
  "docs/tools/tools-tech-tree.md",
  "docs/tools/unlock-ladder.md",
] as const;

const ARTICLE_SECTIONS = ["Behavior", "Configuration", "Failure modes", "Security and privacy", "Verification", "Suggested articles"] as const;

type Row = Record<(typeof COLUMNS)[number], string>;

function tableCells(line: string): string[] {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function parseRows(markdown: string): { foundHeader: boolean; rows: Row[] } {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const rows: Row[] = [];
  let foundHeader = false;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const cells = tableCells(lines[index]);
    const separator = tableCells(lines[index + 1]);
    if (
      cells.join("\u0000") === COLUMNS.join("\u0000") &&
      separator.length === COLUMNS.length &&
      separator.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      foundHeader = true;
      index += 2;
      while (index < lines.length && lines[index].startsWith("|")) {
        const values = tableCells(lines[index]);
        if (values.length !== COLUMNS.length) break;
        rows.push(Object.fromEntries(COLUMNS.map((column, cell) => [column, values[cell]])) as Row);
        index += 1;
      }
    }
  }
  return { foundHeader, rows };
}

function validate(markdown: string, articleExists = existsSync): string[] {
  const errors: string[] = [];
  const { foundHeader, rows } = parseRows(markdown);
  if (!foundHeader) errors.push("The exact completeness table header is missing.");

  const byId = new Map<string, Row>();
  for (const row of rows) {
    const id = row["Inventory ID"];
    if (byId.has(id)) errors.push(`Duplicate inventory row: ${id}`);
    byId.set(id, row);
    for (const column of COLUMNS) {
      if (!row[column]) errors.push(`${id || "<missing id>"} has a blank ${column} cell.`);
    }
    for (const column of TRACE_COLUMNS) {
      const cell = row[column];
      if (/^(?:None|No )\b/.test(cell)) continue;
      const references = [...cell.matchAll(/`([^`]+)`/g)]
        .map((match) => match[1])
        .filter((value) => value === "package.json" || value.includes("/"));
      if (references.length === 0) {
        errors.push(`${id} ${column} has no exact local path or explicit None.`);
        continue;
      }
      for (const reference of references) {
        if (reference.includes("*")) {
          errors.push(`${id} ${column} uses a wildcard instead of exact evidence: ${reference}`);
        } else if (!existsSync(resolve(ROOT, reference))) {
          errors.push(`${id} ${column} points to missing evidence: ${reference}`);
        }
      }
    }
    const article = row.Article.match(/^\[[^\]]+\]\(([^)]+\.md)\)$/);
    if (!article) {
      errors.push(`${id} does not have one exact local Markdown article link.`);
    } else if (!articleExists(resolve(ROOT, "docs", article[1]))) {
      errors.push(`${id} links to a missing article: ${article[1]}`);
    }
  }

  for (const id of REQUIRED_IDS) {
    if (!byId.has(id)) errors.push(`Missing required inventory row: ${id}`);
  }
  if (byId.size !== REQUIRED_IDS.length) {
    errors.push(`Expected exactly ${REQUIRED_IDS.length} inventory rows, found ${byId.size}.`);
  }
  return errors;
}

function parsePageRows(markdown: string): Record<(typeof PAGE_COLUMNS)[number], string>[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const rows: Record<(typeof PAGE_COLUMNS)[number], string>[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (tableCells(lines[index]).join("\u0000") !== PAGE_COLUMNS.join("\u0000")) continue;
    index += 2;
    while (index < lines.length && lines[index].startsWith("|")) {
      const values = tableCells(lines[index]);
      if (values.length !== PAGE_COLUMNS.length) break;
      rows.push(Object.fromEntries(PAGE_COLUMNS.map((column, cell) => [column, values[cell]])) as Record<(typeof PAGE_COLUMNS)[number], string>);
      index += 1;
    }
  }
  return rows;
}

function validatePages(markdown: string): string[] {
  const errors: string[] = [];
  const rows = parsePageRows(markdown);
  const byId = new Map(rows.map((row) => [row["Page ID"], row]));
  for (const [id, path] of SITE_PAGES) {
    const row = byId.get(id);
    if (!row) {
      errors.push(`Missing required site page row: ${id}`);
      continue;
    }
    if (row["Local file"] !== `\`${path}\``) errors.push(`${id} does not cite exact page path ${path}.`);
    if (!existsSync(resolve(ROOT, path))) errors.push(`${id} page path is missing: ${path}`);
    if (row["Required capability contract"] !== "`SITE-CAPABILITY-CONTRACT-V1`") {
      errors.push(`${id} does not inherit SITE-CAPABILITY-CONTRACT-V1.`);
    }
    if (!row["Page-specific evidence state"]) errors.push(`${id} has a blank page evidence state.`);
  }
  if (byId.size !== SITE_PAGES.length) errors.push(`Expected exactly ${SITE_PAGES.length} site page rows, found ${byId.size}.`);
  return errors;
}

function validateArticleSections(path: string, markdown: string): string[] {
  return ARTICLE_SECTIONS.flatMap((section) =>
    new RegExp(`^## ${section.replaceAll(" ", "\\s+")}(?:$|\\s)`, "m").test(markdown)
      ? []
      : [`${path} is missing section: ${section}`],
  );
}

function blankCell(markdown: string, id: string, column: (typeof COLUMNS)[number]): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const rowIndex = lines.findIndex((line) => line.startsWith(`| ${id} |`));
  if (rowIndex < 0) return markdown;
  const cells = tableCells(lines[rowIndex]);
  cells[COLUMNS.indexOf(column)] = "";
  lines[rowIndex] = `| ${cells.join(" | ")} |`;
  return lines.join("\n");
}

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith(".md") ? [path] : [];
  });
}

function brokenLocalLinks(files: string[], overrides = new Map<string, string>()): string[] {
  const failures: string[] = [];
  for (const file of files) {
    const source = overrides.get(file) ?? readFileSync(file, "utf8");
    for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1].trim().replace(/^<|>$/g, "");
      if (/^(?:https?:|mailto:)/.test(href)) continue;
      const [targetPart, fragment] = href.split("#", 2);
      const target = targetPart ? resolve(dirname(file), decodeURIComponent(targetPart)) : file;
      if (!existsSync(target) || (!statSync(target).isFile() && !statSync(target).isDirectory())) {
        failures.push(`${file.slice(ROOT.length + 1)} -> ${href}`);
      } else if (fragment && target.endsWith(".md")) {
        const headings = (overrides.get(target) ?? readFileSync(target, "utf8"))
          .replaceAll("\r\n", "\n")
          .split("\n")
          .filter((line) => /^#{1,6}\s+/.test(line))
          .map((line) => line.replace(/^#{1,6}\s+/, ""))
          .map((heading) => heading.replace(/[`*_~]/g, "").toLocaleLowerCase())
          .map((heading) => heading.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s/g, "-"));
        if (!headings.includes(decodeURIComponent(fragment).toLocaleLowerCase())) {
          failures.push(`${file.slice(ROOT.length + 1)} -> ${href} (missing heading)`);
        }
      }
    }
  }
  return failures;
}

describe("hand-written per-surface completeness inventory", () => {
  const inventory = readFileSync(INVENTORY, "utf8");

  it("contains every exact row, evidence field, and article", () => {
    expect(validate(inventory)).toEqual([]);
    expect(validatePages(inventory)).toEqual([]);
  });

  it("turns red when a required row disappears", () => {
    const broken = inventory.replace(/^\| desktop-status-hub \|.*\r?\n/m, "");
    expect(broken).not.toBe(inventory);
    expect(validate(broken)).toContain("Missing required inventory row: desktop-status-hub");
  });

  it("turns red when any required evidence class becomes blank", () => {
    for (const column of EVIDENCE_COLUMNS) {
      const broken = blankCell(inventory, "desktop-game-core", column);
      expect(broken).not.toBe(inventory);
      expect(validate(broken)).toContain(`desktop-game-core has a blank ${column} cell.`);
    }
  });

  it("turns red when an article destination disappears", () => {
    const broken = inventory.replace(
      "[Status Hub](tools/status-hub.md)",
      "[Status Hub](tools/definitely-missing.md)",
    );
    expect(broken).not.toBe(inventory);
    expect(validate(broken).some((error) => error.includes("tools/definitely-missing.md"))).toBe(true);
  });

  it("keeps every local link in the documentation set reachable", () => {
    const files = [
      resolve(ROOT, "README.md"),
      resolve(ROOT, "HANDOFF.md"),
      resolve(ROOT, "ROADMAP.md"),
      ...markdownFiles(resolve(ROOT, "docs")),
    ];
    expect(brokenLocalLinks(files)).toEqual([]);
  });

  it("turns red when a site page row disappears", () => {
    const broken = inventory.replace(/^\| site-page-home \|.*\r?\n/m, "");
    expect(broken).not.toBe(inventory);
    expect(validatePages(broken)).toContain("Missing required site page row: site-page-home");
  });

  it("guards every feature article's required sections with red fixtures", () => {
    for (const path of FEATURE_ARTICLES) {
      const source = readFileSync(resolve(ROOT, path), "utf8");
      expect(validateArticleSections(path, source)).toEqual([]);
    }
    const fixturePath = FEATURE_ARTICLES[0];
    const fixture = readFileSync(resolve(ROOT, fixturePath), "utf8");
    for (const section of ARTICLE_SECTIONS) {
      const broken = fixture.replace(new RegExp(`^## ${section.replaceAll(" ", "\\s+")}(?:$|\\s.*$)`, "m"), `### removed-${section}`);
      expect(broken).not.toBe(fixture);
      expect(validateArticleSections(fixturePath, broken)).toContain(`${fixturePath} is missing section: ${section}`);
    }
  });

  it("turns red for broken same-file and cross-file heading anchors", () => {
    const rootReadme = resolve(ROOT, "README.md");
    expect(brokenLocalLinks([rootReadme])).toEqual([]);
    const brokenSameFile = readFileSync(rootReadme, "utf8").replace("(#install)", "(#definitely-missing)");
    expect(brokenSameFile).not.toBe(readFileSync(rootReadme, "utf8"));
    expect(brokenLocalLinks([rootReadme], new Map([[rootReadme, brokenSameFile]]))).toContain(
      "README.md -> #definitely-missing (missing heading)",
    );

    const docsReadme = resolve(ROOT, "docs/README.md");
    const brokenCrossFile = readFileSync(docsReadme, "utf8").replace(
      "(gameplay/README.md)",
      "(gameplay/README.md#definitely-missing)",
    );
    expect(brokenCrossFile).not.toBe(readFileSync(docsReadme, "utf8"));
    expect(brokenLocalLinks([docsReadme], new Map([[docsReadme, brokenCrossFile]]))).toContain(
      "docs\\README.md -> gameplay/README.md#definitely-missing (missing heading)",
    );
  });
});

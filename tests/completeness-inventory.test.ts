import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { GAME_SURFACE_IDS } from "../src/renderer/game/console-panels.js";
import {
  ParityGuardError,
  loadInventory as loadDesignParityInventory,
  validateInventory as validateDesignParityInventory,
} from "../design/_verify/design-parity-guard.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY = resolve(ROOT, "docs/completeness.md");
const GRAPHICS_RECEIPT = resolve(ROOT, "design/parity/evidence/graphics-progression/receipt.json");

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
  "desktop-game-core", "desktop-graphics-progression", "desktop-generator-ladder", "desktop-endless-progression",
  "desktop-golden-random-events", "desktop-minigame-events", "desktop-playable-minigames", "desktop-home", "desktop-diesel",
  "desktop-achievements", "desktop-prestige", "desktop-settings", "desktop-language",
  "desktop-funny-levels", "desktop-emoji-dialog-toggle", "desktop-school-mode", "desktop-narrator",
  "desktop-scheduled-settings", "desktop-personal-vocabulary", "desktop-regex-builder",
  "desktop-command-palette", "desktop-notifications", "desktop-design-reference-parity", "desktop-appearance-editor",
  "desktop-logo-customization", "desktop-tabs", "desktop-toy-locks", "desktop-authenticator",
  "desktop-unlock-ladder", "desktop-support-tickets", "desktop-file-converter", "desktop-ollama",
  "desktop-local-history", "desktop-exports", "desktop-bulk-actions", "desktop-changelog",
  "desktop-offline-docs", "desktop-external-editor", "desktop-status-hub",
  "desktop-destructive-confirmation", "desktop-auto-update", "desktop-download-dialogs",
  "site-landing", "site-feature-articles", "site-graphics-progression", "site-language", "site-funny", "site-emoji",
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
  "docs/gameplay/graphics-progression.md",
  "docs/gameplay/minigame-events.md",
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

type SourceReader = (relativePath: string) => string;

const GRAPHICS_IMPLEMENTATION_PATHS = [
  "src/renderer/App.tsx",
  "src/renderer/screens/CookieHero.tsx",
  "src/shared/game/control-unlocks.ts",
  "src/shared/game/look-tiers.ts",
  "src/renderer/styles/index.css",
] as const;

const MINIGAME_IMPLEMENTATION_PATHS = [
  "src/renderer/App.tsx",
  "src/renderer/screens/MinigamesScreen.tsx",
  "src/renderer/game/console-panels.ts",
  "src/shared/game/disclosure.ts",
  "src/shared/game/minigames.ts",
  "src/shared/game/reducer.ts",
] as const;

const DESIGN_PARITY_PATHS = [
  "design/reference-app/index.html",
  "design/reference-app/app.js",
  "src/renderer/DesignParityRoute.tsx",
  "design/parity/inventory.json",
  "design/_verify/design-parity-guard.mjs",
] as const;

function sourceReader(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function hasExactPath(cell: string, path: string): boolean {
  return cell.includes(`\`${path}\``);
}

function rowMap(markdown: string): Map<string, Row> {
  return new Map(parseRows(markdown).rows.map((row) => [row["Inventory ID"], row]));
}

function validateMountedMinigames(
  markdown: string,
  readSource: SourceReader = sourceReader,
  rejectObsoleteAdapter = false,
): string[] {
  const errors: string[] = [];
  const rows = rowMap(markdown);
  for (const id of ["desktop-minigame-events", "desktop-playable-minigames"]) {
    const row = rows.get(id);
    if (!row) continue;
    for (const path of MINIGAME_IMPLEMENTATION_PATHS) {
      if (!hasExactPath(row.Implementation, path)) errors.push(`${id} omits mounted minigame path: ${path}`);
    }
    if (row.Implementation.includes("MinigameEventsScreen.tsx")) {
      errors.push(`${id} cites the unmounted MinigameEventsScreen adapter.`);
    }
  }

  const app = readSource("src/renderer/App.tsx");
  const appSource = ts.createSourceFile("App.tsx", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let hasPlayableImport = false;
  let hasPlayableMount = false;
  let hasObsoleteImport = false;
  let hasObsoleteAdapter = false;

  for (const statement of appSource.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (statement.moduleSpecifier.text === "./screens/MinigamesScreen") {
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          hasPlayableImport = bindings.elements.some((element) =>
            element.propertyName?.text === "MinigamesScreen" && element.name.text === "PlayableMinigamesScreen");
        }
      }
      if (statement.moduleSpecifier.text === "./screens/MinigameEventsScreen") hasObsoleteImport = true;
    }
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === "MinigamesScreen") hasObsoleteAdapter = true;
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === "GameShell" && statement.body) {
      const visit = (node: ts.Node): void => {
        if (
          ts.isBinaryExpression(node)
          && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
          && ts.isBinaryExpression(node.left)
          && node.left.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
          && ts.isIdentifier(node.left.left)
          && node.left.left.text === "openSurface"
          && ts.isStringLiteral(node.left.right)
          && node.left.right.text === "minigames"
          && ts.isJsxSelfClosingElement(node.right)
          && ts.isIdentifier(node.right.tagName)
          && node.right.tagName.text === "PlayableMinigamesScreen"
        ) {
          hasPlayableMount = true;
        }
        ts.forEachChild(node, visit);
      };
      visit(statement.body);
    }
  }

  if (!hasPlayableImport) {
    errors.push("The playable minigame screen import is missing or renamed.");
  }
  if (!hasPlayableMount) {
    errors.push("The registered minigames surface does not mount PlayableMinigamesScreen.");
  }

  if (!GAME_SURFACE_IDS.includes("minigames")) errors.push("GAME_SURFACE_IDS does not register minigames.");

  const disclosure = readSource("src/shared/game/disclosure.ts");
  const disclosureSource = ts.createSourceFile("disclosure.ts", disclosure, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let disclosureBindings = 0;
  const visitDisclosure = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node)
      && ((ts.isIdentifier(node.name) && node.name.text === "minigames") || (ts.isStringLiteral(node.name) && node.name.text === "minigames"))
      && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression)
      && node.initializer.expression.text === "areMinigameEventsUnlocked"
      && node.initializer.arguments.length === 1
      && ts.isIdentifier(node.initializer.arguments[0])
      && node.initializer.arguments[0].text === "state"
    ) {
      disclosureBindings += 1;
    }
    ts.forEachChild(node, visitDisclosure);
  };
  visitDisclosure(disclosureSource);
  if (disclosureBindings < 2) {
    errors.push("Minigame disclosure does not bind both feature and console availability.");
  }
  if (rejectObsoleteAdapter && (hasObsoleteImport || hasObsoleteAdapter)) {
    errors.push("App.tsx still contains the obsolete unmounted MinigameEventsScreen adapter.");
  }
  return errors;
}

type GraphicsReceipt = {
  version?: number;
  sourceCommit?: string;
  route?: string;
  launchPid?: number;
  hwnd?: string;
  cleanupCompleted?: boolean;
  buildReceiptPath?: string;
  buildReceiptSha256?: string;
  captures?: Array<{ state?: string; path?: string; sha256?: string; width?: number; height?: number }>;
};

type GraphicsBuildReceipt = {
  version?: number;
  sourceCommit?: string;
  artifactPath?: string;
  artifactSha256?: string;
  verifiedDimensions?: { width?: number; height?: number; scale?: number };
};

type GitEvidenceProbe = (sourceCommit: string, paths: readonly string[]) => { ancestor: boolean; changed: boolean; error?: string };

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function defaultGitEvidenceProbe(sourceCommit: string, paths: readonly string[]): ReturnType<GitEvidenceProbe> {
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", sourceCommit, "HEAD"], { cwd: ROOT });
  if (ancestor.status !== 0) {
    return { ancestor: false, changed: true, error: ancestor.error?.message ?? ancestor.stderr?.toString().trim() };
  }
  const diff = spawnSync("git", ["diff", "--quiet", sourceCommit, "--", ...paths], { cwd: ROOT });
  if (diff.status !== 0 && diff.status !== 1) {
    return { ancestor: true, changed: true, error: diff.error?.message ?? diff.stderr?.toString().trim() };
  }
  return { ancestor: true, changed: diff.status === 1 };
}

function validateGraphicsRegistration(markdown: string): string[] {
  const errors: string[] = [];
  const row = rowMap(markdown).get("desktop-graphics-progression");
  if (!row) return ["Missing required inventory row: desktop-graphics-progression"];
  for (const path of GRAPHICS_IMPLEMENTATION_PATHS) {
    if (!hasExactPath(row.Implementation, path)) errors.push(`desktop-graphics-progression omits implementation path: ${path}`);
  }
  const receiptPath = "design/parity/evidence/graphics-progression/receipt.json";
  if (!hasExactPath(row["Built interaction"], receiptPath)) {
    errors.push(`desktop-graphics-progression does not cite ${receiptPath}.`);
  }
  return errors;
}

function validateGraphicsEvidence(
  markdown: string,
  receipt: GraphicsReceipt = JSON.parse(readFileSync(GRAPHICS_RECEIPT, "utf8")) as GraphicsReceipt,
  probe: GitEvidenceProbe = defaultGitEvidenceProbe,
): string[] {
  const errors = validateGraphicsRegistration(markdown);
  const row = rowMap(markdown).get("desktop-graphics-progression");
  if (!row) return errors;

  if (
    receipt.version !== 1
    || receipt.route !== "cheap-lowlevel-headless"
    || !Number.isInteger(receipt.launchPid)
    || typeof receipt.hwnd !== "string"
    || receipt.hwnd.trim() === ""
    || receipt.cleanupCompleted !== true
  ) {
    errors.push("Graphics progression receipt identity, route, or cleanup state is invalid.");
  }
  if (typeof receipt.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(receipt.sourceCommit)) {
    errors.push("Graphics progression receipt source commit is missing or invalid.");
    return errors;
  }

  const expectedCaptures = new Map([
    ["before", "design/parity/evidence/graphics-progression/before.png"],
    ["affordable", "design/parity/evidence/graphics-progression/affordable.png"],
    ["after", "design/parity/evidence/graphics-progression/after.png"],
  ]);
  const captures = new Map((receipt.captures ?? []).map((capture) => [capture.state, capture]));
  for (const [state, path] of expectedCaptures) {
    const capture = captures.get(state);
    if (!capture || capture.path !== path || capture.width !== 1440 || capture.height !== 900) {
      errors.push(`Graphics progression receipt does not bind the exact ${state} capture.`);
      continue;
    }
    if (!hasExactPath(row["Capture evidence"], path)) {
      errors.push(`desktop-graphics-progression does not cite ${path}.`);
    }
    const absolute = resolve(ROOT, path);
    if (!existsSync(absolute) || capture.sha256 !== sha256(absolute)) {
      errors.push(`Graphics progression ${state} capture is absent or its hash is stale.`);
    } else {
      const bytes = readFileSync(absolute);
      if (
        bytes.length < 24
        || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
        || bytes.readUInt32BE(16) !== 1440
        || bytes.readUInt32BE(20) !== 900
      ) {
        errors.push(`Graphics progression ${state} capture is not a 1440x900 PNG.`);
      }
    }
  }
  if ((receipt.captures ?? []).length !== expectedCaptures.size || captures.size !== expectedCaptures.size) {
    errors.push("Graphics progression receipt has an unexpected or duplicate capture set.");
  }

  const gitState = probe(receipt.sourceCommit, GRAPHICS_IMPLEMENTATION_PATHS);
  if (!gitState.ancestor) errors.push("Graphics progression receipt source is not an ancestor of HEAD.");
  if (gitState.error) errors.push(`Graphics progression receipt freshness could not be proven: ${gitState.error}`);
  if (gitState.changed) errors.push("Graphics progression receipt is stale for the cited implementation paths.");
  return errors;
}

function validateGraphicsCompletion(
  markdown: string,
  receipt: GraphicsReceipt = JSON.parse(readFileSync(GRAPHICS_RECEIPT, "utf8")) as GraphicsReceipt,
): string[] {
  const errors = validateGraphicsEvidence(markdown, receipt);
  if (!receipt.buildReceiptPath || !receipt.buildReceiptSha256) {
    errors.push("Graphics progression receipt has no build-artifact hash binding.");
    return errors;
  }

  const buildPath = resolve(ROOT, receipt.buildReceiptPath);
  if (buildPath !== ROOT && !buildPath.startsWith(`${ROOT}\\`) && !buildPath.startsWith(`${ROOT}/`)) {
    errors.push("Graphics progression build-receipt path escapes the repository.");
    return errors;
  }
  if (!existsSync(buildPath) || !statSync(buildPath).isFile() || sha256(buildPath) !== receipt.buildReceiptSha256) {
    errors.push("Graphics progression build receipt is absent or its hash is stale.");
    return errors;
  }

  let build: GraphicsBuildReceipt;
  try {
    build = JSON.parse(readFileSync(buildPath, "utf8")) as GraphicsBuildReceipt;
  } catch {
    errors.push("Graphics progression build receipt is not valid JSON.");
    return errors;
  }
  if (
    build.version !== 1
    || build.sourceCommit !== receipt.sourceCommit
    || typeof build.artifactPath !== "string"
    || typeof build.artifactSha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(build.artifactSha256)
    || build.verifiedDimensions?.width !== 1440
    || build.verifiedDimensions?.height !== 900
    || build.verifiedDimensions?.scale !== 1
  ) {
    errors.push("Graphics progression build receipt does not bind the capture source, artifact, and tuple.");
    return errors;
  }

  const artifactPath = resolve(ROOT, build.artifactPath);
  if (artifactPath !== ROOT && !artifactPath.startsWith(`${ROOT}\\`) && !artifactPath.startsWith(`${ROOT}/`)) {
    errors.push("Graphics progression build artifact path escapes the repository.");
  } else if (!existsSync(artifactPath) || !statSync(artifactPath).isFile() || sha256(artifactPath) !== build.artifactSha256) {
    errors.push("Graphics progression build artifact is absent or its hash is stale.");
  }
  return errors;
}

type DesignParityReleaseValidator = (inventory: ReturnType<typeof loadDesignParityInventory>) => unknown;

function validateDesignParityRegistration(markdown: string): string[] {
  const row = rowMap(markdown).get("desktop-design-reference-parity");
  if (!row) return ["Missing required inventory row: desktop-design-reference-parity"];
  const errors: string[] = [];
  for (const path of DESIGN_PARITY_PATHS) {
    if (!hasExactPath(row.Implementation, path)) errors.push(`desktop-design-reference-parity omits implementation path: ${path}`);
  }
  return errors;
}

function validateDesignParityRelease(
  inventory = loadDesignParityInventory(),
  releaseValidator: DesignParityReleaseValidator = (candidate) => validateDesignParityInventory(candidate, { mode: "release" }),
): string[] {
  try {
    releaseValidator(inventory);
    return [];
  } catch (error) {
    if (error instanceof ParityGuardError) return [`Design parity release verdict is red: ${error.code}`];
    throw error;
  }
}

function validateDesignParityStructure(
  inventory = loadDesignParityInventory(),
  structureValidator: DesignParityReleaseValidator = (candidate) => validateDesignParityInventory(candidate, { mode: "structure" }),
): string[] {
  try {
    structureValidator(inventory);
    return [];
  } catch (error) {
    if (error instanceof ParityGuardError) return [`Design parity structure verdict is red: ${error.code}`];
    throw error;
  }
}

function validateCompletion(markdown: string): string[] {
  const errors = [
    ...validate(markdown),
    ...validatePages(markdown),
    ...validateMountedMinigames(markdown, sourceReader, true),
    ...validateGraphicsCompletion(markdown),
    ...validateDesignParityRegistration(markdown),
    ...validateDesignParityStructure(),
    ...validateDesignParityRelease(),
  ];
  for (const row of parseRows(markdown).rows) {
    if (!/^Verified(?:\b|\s|—)/.test(row["Truthful state"])) {
      errors.push(`${row["Inventory ID"]} is not completion-ready: ${row["Truthful state"]}`);
    }
  }
  for (const row of parsePageRows(markdown)) {
    if (!/^Verified(?:\b|\s|—)/.test(row["Page-specific evidence state"])) {
      errors.push(`${row["Page ID"]} page evidence is not completion-ready.`);
    }
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
    expect(validateMountedMinigames(inventory)).toEqual([]);
    expect(validateGraphicsRegistration(inventory)).toEqual([]);
    expect(validateDesignParityRegistration(inventory)).toEqual([]);
  });

  it("turns red for each newly inventoried capability row and green after restore", () => {
    for (const id of [
      "desktop-graphics-progression",
      "desktop-playable-minigames",
      "desktop-design-reference-parity",
      "site-graphics-progression",
    ]) {
      const broken = inventory.replace(new RegExp(`^\\| ${id} \\|.*\\r?\\n`, "m"), "");
      expect(broken, id).not.toBe(inventory);
      expect(validate(broken), id).toContain(`Missing required inventory row: ${id}`);
      expect(validate(inventory), `${id} restore`).toEqual([]);
    }
  });

  it("turns red when the real minigame mount disappears and green after restore", () => {
    const appPath = "src/renderer/App.tsx";
    const source = sourceReader(appPath);
    const broken = source.replace(
      "{openSurface === 'minigames' && <PlayableMinigamesScreen />}",
      "{openSurface === 'minigames' && null}",
    );
    expect(broken).not.toBe(source);
    const brokenReader: SourceReader = (relativePath) => relativePath === appPath ? broken : sourceReader(relativePath);
    expect(validateMountedMinigames(inventory, brokenReader)).toContain(
      "The registered minigames surface does not mount PlayableMinigamesScreen.",
    );
    expect(validateMountedMinigames(inventory)).toEqual([]);
  });

  it("turns red for a stale graphics receipt and green for the restored receipt", () => {
    const receipt = JSON.parse(readFileSync(GRAPHICS_RECEIPT, "utf8")) as GraphicsReceipt;
    const stale = structuredClone(receipt);
    stale.sourceCommit = "da632899b0ca6405a49a5c2367f4938a2a233759";
    expect(validateGraphicsEvidence(inventory, stale)).toContain(
      "Graphics progression receipt is stale for the cited implementation paths.",
    );
    expect(validateGraphicsEvidence(inventory, receipt)).toEqual([]);

    const forgedBuildBinding = { ...receipt, buildReceiptPath: "package.json", buildReceiptSha256: "0".repeat(64) };
    expect(validateGraphicsCompletion(inventory, forgedBuildBinding)).toContain(
      "Graphics progression build receipt is absent or its hash is stale.",
    );
  });

  it("records the actual parity release-red verdict and proves the cross-check wrapper restores", () => {
    expect(validateDesignParityStructure()).toEqual(["Design parity structure verdict is red: REFERENCE_HASH_STALE"]);
    expect(validateDesignParityRelease()).toEqual(["Design parity release verdict is red: DIFF_REVIEW_DEFECT"]);
    const candidate = loadDesignParityInventory();
    const redFixture: DesignParityReleaseValidator = () => {
      throw new ParityGuardError("DIFF_REVIEW_DEFECT", "fixture-only visual difference");
    };
    const greenFixture: DesignParityReleaseValidator = () => ({ mode: "release" });
    expect(validateDesignParityStructure(candidate, redFixture)).toEqual([
      "Design parity structure verdict is red: DIFF_REVIEW_DEFECT",
    ]);
    expect(validateDesignParityStructure(candidate, greenFixture)).toEqual([]);
    expect(validateDesignParityRelease(candidate, redFixture)).toEqual([
      "Design parity release verdict is red: DIFF_REVIEW_DEFECT",
    ]);
    expect(validateDesignParityRelease(candidate, greenFixture)).toEqual([]);
    expect(validateDesignParityRegistration(inventory)).toEqual([]);
  });

  it("keeps honest structural rows green while completion mode reports exact open blockers", () => {
    expect(validate(inventory)).toEqual([]);
    const blockers = validateCompletion(inventory);
    expect(blockers).toContain("Design parity structure verdict is red: REFERENCE_HASH_STALE");
    expect(blockers).toContain("Design parity release verdict is red: DIFF_REVIEW_DEFECT");
    expect(blockers).toContain("App.tsx still contains the obsolete unmounted MinigameEventsScreen adapter.");
    expect(blockers).toContain("Graphics progression receipt has no build-artifact hash binding.");
    expect(blockers).toEqual(expect.arrayContaining([
      expect.stringMatching(/^desktop-minigame-events is not completion-ready:/),
      expect.stringMatching(/^desktop-playable-minigames is not completion-ready:/),
      expect.stringMatching(/^site-graphics-progression is not completion-ready:/),
    ]));
    expect(blockers).not.toContain("Graphics progression receipt is stale for the cited implementation paths.");
  });

  if (process.env.COMPLETENESS_MODE === "completion") {
    it("requires every completion boundary and cross-check to be green", () => {
      expect(validateCompletion(inventory)).toEqual([]);
    });
  }

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

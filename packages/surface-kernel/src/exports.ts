/**
 * Export serialization.
 *
 * An export always carries a manifest so the reader can tell what the file
 * contains, what was filtered out, and what was redacted. CSV cells are
 * neutralized so a value cannot be interpreted as a formula by a spreadsheet
 * application.
 */

export type ExportFormat = "json" | "csv" | "markdown" | "text";

export type ExportColumn = {
  key: string;
  label: string;
};

export type ExportRow = Record<string, string>;

export type ExportManifest = {
  generatedAt: string;
  surface: string;
  collection: string;
  filterDescription: string;
  rowCount: number;
  omitted: string[];
  redacted: string[];
};

export type ExportBundle = {
  fileName: string;
  mimeType: string;
  body: string;
};

export type BulkScopeSelection = {
  mode: "all" | "filtered" | "selected";
  filtered?: readonly ExportRow[];
  ids?: readonly string[];
  idKey?: string;
};

const MIME_TYPES: Record<ExportFormat, string> = {
  json: "application/json",
  csv: "text/csv",
  markdown: "text/markdown",
  text: "text/plain",
};

const EXTENSIONS: Record<ExportFormat, string> = {
  json: "json",
  csv: "csv",
  markdown: "md",
  text: "txt",
};

const FORMULA_LEADS = new Set(["=", "+", "-", "@"]);

/**
 * Quotes and escapes a CSV cell, and prefixes a leading `=`, `+`, `-` or `@`
 * with an apostrophe so the cell cannot execute as a spreadsheet formula.
 */
export function neutralizeCsvCell(value: string): string {
  const first = value.slice(0, 1);
  const guarded = FORMULA_LEADS.has(first) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replaceAll('"', '""')}"`;
  }
  return guarded;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "export";
}

function fileStamp(generatedAt: string): string {
  return generatedAt.replace(/[:.]/g, "-");
}

function manifestLines(manifest: ExportManifest): string[] {
  return [
    `Surface: ${manifest.surface}`,
    `Collection: ${manifest.collection}`,
    `Generated: ${manifest.generatedAt}`,
    `Filter: ${manifest.filterDescription}`,
    `Rows: ${manifest.rowCount}`,
    describeOmissions(manifest.omitted, manifest.redacted),
  ];
}

/** Plain-language statement of what the export leaves out. */
export function describeOmissions(omitted: readonly string[], redacted: readonly string[]): string {
  const parts: string[] = [];
  parts.push(omitted.length === 0 ? "Nothing was omitted." : `Omitted: ${omitted.join(", ")}.`);
  parts.push(redacted.length === 0 ? "Nothing was redacted." : `Redacted: ${redacted.join(", ")}.`);
  return parts.join(" ");
}

function cell(row: ExportRow, key: string): string {
  return row[key] ?? "";
}

function toCsv(rows: readonly ExportRow[], columns: readonly ExportColumn[], manifest: ExportManifest): string {
  const lines: string[] = [];
  for (const line of manifestLines(manifest)) lines.push(neutralizeCsvCell(`# ${line}`));
  lines.push(columns.map((column) => neutralizeCsvCell(column.label)).join(","));
  for (const row of rows) {
    lines.push(columns.map((column) => neutralizeCsvCell(cell(row, column.key))).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function toMarkdown(rows: readonly ExportRow[], columns: readonly ExportColumn[], manifest: ExportManifest): string {
  const lines: string[] = [`# ${manifest.collection}`, ""];
  for (const line of manifestLines(manifest)) lines.push(`- ${line}`);
  lines.push("");
  lines.push(`| ${columns.map((column) => column.label.replaceAll("|", "\\|")).join(" | ")} |`);
  lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${columns.map((column) => cell(row, column.key).replaceAll("|", "\\|")).join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

function toText(rows: readonly ExportRow[], columns: readonly ExportColumn[], manifest: ExportManifest): string {
  const lines: string[] = [manifest.collection, ...manifestLines(manifest), ""];
  for (const row of rows) {
    for (const column of columns) lines.push(`${column.label}: ${cell(row, column.key)}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/** Serializes rows and a manifest into one downloadable body. */
export function serializeExport(input: {
  rows: readonly ExportRow[];
  columns: readonly ExportColumn[];
  manifest: ExportManifest;
  format: ExportFormat;
}): ExportBundle {
  const { rows, columns, manifest, format } = input;
  const fileName = `${slug(manifest.surface)}-${slug(manifest.collection)}-${fileStamp(manifest.generatedAt)}.${EXTENSIONS[format]}`;
  const mimeType = MIME_TYPES[format];
  if (format === "json") {
    return { fileName, mimeType, body: `${JSON.stringify({ manifest, columns, rows }, null, 2)}\n` };
  }
  if (format === "csv") return { fileName, mimeType, body: toCsv(rows, columns, manifest) };
  if (format === "markdown") return { fileName, mimeType, body: toMarkdown(rows, columns, manifest) };
  return { fileName, mimeType, body: toText(rows, columns, manifest) };
}

/** Resolves the exact rows a bulk export or bulk edit will act on. */
export function previewBulkScope(rows: readonly ExportRow[], selection: BulkScopeSelection): ExportRow[] {
  if (selection.mode === "all") return [...rows];
  if (selection.mode === "filtered") return [...(selection.filtered ?? [])];
  const idKey = selection.idKey ?? "id";
  const ids = new Set(selection.ids ?? []);
  return rows.filter((row) => ids.has(cell(row, idKey)));
}

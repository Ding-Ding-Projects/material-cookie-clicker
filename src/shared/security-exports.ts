export type CodingExportFormat =
  | "json" | "jsonl" | "yaml" | "toml" | "xml" | "csv" | "tsv" | "markdown" | "html" | "sql"
  | "typescript" | "javascript" | "python" | "go" | "rust" | "json-schema" | "protobuf";

export type ArchiveFormat = "zip" | "7z";
export type SevenZipMethod = "LZMA2" | "LZMA" | "PPMd" | "BZip2" | "Deflate";

export type ExportFormatDefinition = {
  readonly id: CodingExportFormat;
  readonly label: string;
  readonly mediaType: string;
  readonly extension: string;
  readonly supportsRoundTrip: boolean;
  readonly limitations: readonly string[];
};

export const CODING_EXPORT_FORMATS: readonly ExportFormatDefinition[] = [
  ["json", "JSON", "application/json", "json", true, []],
  ["jsonl", "JSON Lines", "application/x-ndjson", "jsonl", true, ["One record per line."]],
  ["yaml", "YAML", "application/yaml", "yaml", true, ["Comments are not preserved."]],
  ["toml", "TOML", "application/toml", "toml", true, ["Deep mixed arrays may need normalization."]],
  ["xml", "XML", "application/xml", "xml", true, ["Object key ordering is not significant."]],
  ["csv", "CSV", "text/csv", "csv", false, ["Nested values require flattening."]],
  ["tsv", "TSV", "text/tab-separated-values", "tsv", false, ["Nested values require flattening."]],
  ["markdown", "Markdown", "text/markdown", "md", false, ["Interactive state is descriptive only."]],
  ["html", "HTML", "text/html", "html", false, ["Scripts are never included."]],
  ["sql", "SQL", "application/sql", "sql", true, ["Uses explicit CREATE and INSERT statements."]],
  ["typescript", "TypeScript", "text/typescript", "ts", true, []],
  ["javascript", "JavaScript", "text/javascript", "js", true, []],
  ["python", "Python", "text/x-python", "py", true, []],
  ["go", "Go", "text/x-go", "go", true, []],
  ["rust", "Rust", "text/x-rust", "rs", true, []],
  ["json-schema", "JSON Schema", "application/schema+json", "schema.json", false, ["Describes shape, not record values."]],
  ["protobuf", "Protocol Buffers", "text/plain", "proto", false, ["Describes shape; field numbers become stable API."]],
].map(([id, label, mediaType, extension, supportsRoundTrip, limitations]) => ({
  id: id as CodingExportFormat,
  label: label as string,
  mediaType: mediaType as string,
  extension: extension as string,
  supportsRoundTrip: supportsRoundTrip as boolean,
  limitations: limitations as string[],
}));

export type ArchiveOptions = {
  readonly format: ArchiveFormat;
  readonly method?: SevenZipMethod;
  readonly level: 0 | 1 | 3 | 5 | 7 | 9;
  readonly dictionaryMiB?: number;
  readonly wordSize?: number;
  readonly solid?: boolean;
  readonly threads?: number;
  readonly splitVolumeMiB?: number;
  readonly encryptContent: boolean;
  readonly encryptHeaders: boolean;
  readonly passwordRef?: string;
};

export function validateArchiveOptions(options: ArchiveOptions): string[] {
  const errors: string[] = [];
  if (options.format === "zip" && (options.method || options.solid || options.encryptHeaders)) {
    errors.push("The selected 7z-only controls are unavailable for ZIP.");
  }
  if ((options.encryptContent || options.encryptHeaders) && !options.passwordRef) {
    errors.push("Encrypted archives require a credential-vault password reference.");
  }
  if (options.encryptHeaders && !options.encryptContent) errors.push("Header encryption requires content encryption too.");
  if (options.threads !== undefined && (!Number.isInteger(options.threads) || options.threads < 1 || options.threads > 64)) {
    errors.push("Thread count must be an integer from 1 to 64.");
  }
  return errors;
}

export interface VsCodeHandoff {
  detect(): Promise<{ command: string; label: string } | null>;
  openWorkspace(command: string, folder: string, exportedPath: string): Promise<void>;
}

export async function openExportInVsCode(input: {
  handoff: VsCodeHandoff;
  folder: string;
  exportedPath: string;
}): Promise<{ ok: true; editor: string } | { ok: false; reason: string }> {
  const editor = await input.handoff.detect();
  if (!editor) return { ok: false, reason: "Visual Studio Code was not detected. The export remains available on disk." };
  await input.handoff.openWorkspace(editor.command, input.folder, input.exportedPath);
  return { ok: true, editor: editor.label };
}

import { describe, expect, it } from "vitest";

import { CODING_EXPORT_FORMATS, openExportInVsCode, validateArchiveOptions } from "../src/shared/security-exports";

describe("export and archive registry", () => {
  it("enumerates every required coding representation explicitly", () => {
    expect(CODING_EXPORT_FORMATS.map((format) => format.id)).toEqual([
      "json", "jsonl", "yaml", "toml", "xml", "csv", "tsv", "markdown", "html", "sql",
      "typescript", "javascript", "python", "go", "rust", "json-schema", "protobuf",
    ]);
  });

  it("refuses dishonest archive encryption combinations", () => {
    expect(validateArchiveOptions({ format: "7z", method: "LZMA2", level: 9, encryptContent: true, encryptHeaders: true }).some((error) => error.includes("credential-vault"))).toBe(true);
    expect(validateArchiveOptions({ format: "7z", method: "LZMA2", level: 9, encryptContent: false, encryptHeaders: true, passwordRef: "archive" }).some((error) => error.includes("requires content encryption"))).toBe(true);
    expect(validateArchiveOptions({ format: "zip", method: "PPMd", level: 5, encryptContent: false, encryptHeaders: false }).some((error) => error.includes("7z-only"))).toBe(true);
  });

  it("opens the containing folder as a VS Code workspace and keeps a truthful missing-editor result", async () => {
    const calls: string[][] = [];
    await expect(openExportInVsCode({ handoff: { detect: async () => null, openWorkspace: async () => undefined }, folder: "C:/exports", exportedPath: "C:/exports/a.json" })).resolves.toMatchObject({ ok: false });
    const success = await openExportInVsCode({
      handoff: { detect: async () => ({ command: "code", label: "Visual Studio Code" }), openWorkspace: async (...args) => { calls.push(args); } },
      folder: "C:/exports",
      exportedPath: "C:/exports/a.json",
    });
    expect(success).toEqual({ ok: true, editor: "Visual Studio Code" });
    expect(calls[0]).toEqual(["code", "C:/exports", "C:/exports/a.json"]);
  });
});

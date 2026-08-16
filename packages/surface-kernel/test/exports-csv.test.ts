import assert from "node:assert/strict";
import test from "node:test";

import {
  neutralizeCsvCell,
  serializeExport,
  previewBulkScope,
  describeOmissions,
  type ExportManifest,
} from "../src/exports.ts";

// Synthetic rows only: invented labels with no personal or financial meaning.
const manifest: ExportManifest = {
  generatedAt: "2026-01-02T03:04:05.000Z",
  surface: "Documentation site",
  collection: "Sample list",
  filterDescription: "No filter applied",
  rowCount: 2,
  omitted: ["internal identifier"],
  redacted: ["file path"],
};

test("a leading equals sign cannot execute as a formula", () => {
  assert.equal(neutralizeCsvCell("=1+1"), "'=1+1");
});

test("a leading plus sign cannot execute as a formula", () => {
  assert.equal(neutralizeCsvCell("+1"), "'+1");
});

test("a leading minus sign cannot execute as a formula", () => {
  assert.equal(neutralizeCsvCell("-1"), "'-1");
});

test("a leading at sign cannot execute as a formula", () => {
  assert.equal(neutralizeCsvCell("@name"), "'@name");
});

test("commas, quotes and line breaks are quoted and escaped", () => {
  assert.equal(neutralizeCsvCell('a,b'), '"a,b"');
  assert.equal(neutralizeCsvCell('say "hello"'), '"say ""hello"""');
  assert.equal(neutralizeCsvCell("first\nsecond"), '"first\nsecond"');
});

test("a neutralized cell that also needs quoting keeps both guards", () => {
  assert.equal(neutralizeCsvCell("=a,b"), '"\'=a,b"');
});

test("ordinary text is left alone", () => {
  assert.equal(neutralizeCsvCell("Ordinary label"), "Ordinary label");
});

test("a csv export carries its manifest and neutralized cells", () => {
  const bundle = serializeExport({
    rows: [
      { id: "row-1", label: "=danger" },
      { id: "row-2", label: "safe" },
    ],
    columns: [
      { key: "id", label: "Identifier" },
      { key: "label", label: "Label" },
    ],
    manifest,
    format: "csv",
  });
  assert.equal(bundle.mimeType, "text/csv");
  assert.match(bundle.fileName, /\.csv$/);
  assert.ok(bundle.body.includes("row-1,'=danger"));
  assert.ok(bundle.body.includes("Surface: Documentation site"));
});

test("a json export is valid json containing the manifest", () => {
  const bundle = serializeExport({
    rows: [{ id: "row-1", label: "safe" }],
    columns: [{ key: "id", label: "Identifier" }],
    manifest,
    format: "json",
  });
  const parsed = JSON.parse(bundle.body) as { manifest: ExportManifest };
  assert.equal(parsed.manifest.collection, "Sample list");
});

test("omissions are described in plain language", () => {
  assert.equal(describeOmissions([], []), "Nothing was omitted. Nothing was redacted.");
  assert.match(describeOmissions(["a"], ["b"]), /Omitted: a\. Redacted: b\./);
});

test("a bulk scope preview reports the exact rows a selection covers", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(previewBulkScope(rows, { mode: "selected", ids: ["a", "c"] }), [{ id: "a" }, { id: "c" }]);
  assert.equal(previewBulkScope(rows, { mode: "all" }).length, 3);
});

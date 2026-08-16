import assert from "node:assert/strict";
import test from "node:test";

import { createFixedClock, createSequenceIdFactory } from "../src/ports.ts";
import {
  DEFAULT_REDACTION_RULES,
  filterHistory,
  redactRecord,
  restoreAsNewRevision,
  type HistoryRecord,
} from "../src/history.ts";
import { createSearchState } from "../src/regex-builder.ts";

// Synthetic records: invented summaries with no personal or financial content.
function record(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: "record-1",
    revisionId: "revision-1",
    action: "answer",
    at: "2026-01-01T00:00:00.000Z",
    actorSurface: "desktop",
    summary: "Recorded a sample answer",
    redactedDiff: [{ path: "/sample/field", before: null, after: "value" }],
    ...overrides,
  };
}

test("restoring a revision appends a new record and rewrites nothing", () => {
  const original = record();
  const frozen = structuredClone(original);
  const restored = restoreAsNewRevision([original], "revision-1", {
    clock: createFixedClock(Date.parse("2026-02-02T00:00:00.000Z")),
    ids: createSequenceIdFactory("generated-"),
  });

  assert.deepEqual(original, frozen);
  assert.notEqual(restored.id, original.id);
  assert.notEqual(restored.revisionId, original.revisionId);
  assert.equal(restored.action, "restore");
  assert.equal(restored.at, "2026-02-02T00:00:00.000Z");
  assert.match(restored.summary, /revision-1/);
});

test("the restored record carries a copy of the diff, not the same objects", () => {
  const original = record();
  const restored = restoreAsNewRevision([original], "revision-1", {
    clock: createFixedClock(0),
    ids: createSequenceIdFactory("generated-"),
  });
  assert.notEqual(restored.redactedDiff[0], original.redactedDiff[0]);
  assert.deepEqual(restored.redactedDiff, original.redactedDiff);
});

test("an undo is recorded as its own append action", () => {
  const restored = restoreAsNewRevision([record()], "revision-1", {
    clock: createFixedClock(0),
    ids: createSequenceIdFactory("generated-"),
    action: "undo",
  });
  assert.equal(restored.action, "undo");
});

test("restoring an unknown revision fails instead of inventing one", () => {
  assert.throws(() => restoreAsNewRevision([record()], "missing"), /not present/);
});

test("redaction replaces supplied values and leaves the input untouched", () => {
  const source = record({
    summary: "Replaced Overview with Summary",
    redactedDiff: [{ path: "/label", before: "Overview", after: "Summary" }],
  });
  const frozen = structuredClone(source);
  const redacted = redactRecord(source, {
    ...DEFAULT_REDACTION_RULES,
    vocabularyValues: ["Summary"],
  });
  assert.deepEqual(source, frozen);
  assert.equal(redacted.summary, "Replaced Overview with [redacted]");
  assert.equal(redacted.redactedDiff[0]?.after, "[redacted]");
});

test("absolute paths are replaced by default", () => {
  const redacted = redactRecord(
    record({ summary: "Imported from /example/reports/sample.json" }),
    DEFAULT_REDACTION_RULES,
  );
  assert.equal(redacted.summary, "Imported from [redacted]");
});

test("history filters by action, range and the shared search engine", () => {
  const records = [
    record({ id: "a", revisionId: "a", action: "answer", at: "2026-01-01T00:00:00.000Z", summary: "First entry" }),
    record({ id: "b", revisionId: "b", action: "export", at: "2026-03-01T00:00:00.000Z", summary: "Second entry" }),
  ];
  assert.equal(filterHistory(records, { actions: ["export"] }, createSearchState()).length, 1);
  assert.equal(filterHistory(records, { from: "2026-02-01T00:00:00.000Z" }, createSearchState()).length, 1);
  assert.equal(filterHistory(records, {}, createSearchState({ query: "second" })).length, 1);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_VOCABULARY_ENTRIES,
  applyVocabulary,
  compileReplacements,
  validateVocabularyDocument,
} from "../src/vocabulary.ts";

// All fixtures below are invented wording pairs used purely to exercise the
// validator. They contain no real personal or financial information.
const validDocument = JSON.stringify({
  version: 1,
  replacements: { Overview: "Summary", Settings: "Preferences" },
});

test("a well-formed document is accepted", () => {
  const verdict = validateVocabularyDocument(validDocument);
  assert.equal(verdict.ok, true);
  if (verdict.ok) assert.equal(verdict.replacements.Overview, "Summary");
});

test("a prototype-shaped key is rejected", () => {
  const raw = '{"version":1,"replacements":{"__proto__":"Summary"}}';
  const verdict = validateVocabularyDocument(raw);
  assert.equal(verdict.ok, false);
});

test("an unknown root field is rejected", () => {
  const raw = JSON.stringify({ version: 1, replacements: {}, notes: "extra" });
  const verdict = validateVocabularyDocument(raw);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.reason, /version 1/);
});

test("a wrong schema version is rejected", () => {
  const verdict = validateVocabularyDocument(JSON.stringify({ version: 2, replacements: {} }));
  assert.equal(verdict.ok, false);
});

test("too many entries are rejected", () => {
  const replacements: Record<string, string> = {};
  for (let index = 0; index <= MAX_VOCABULARY_ENTRIES; index += 1) {
    replacements[`key${index}`] = `value${index}`;
  }
  const verdict = validateVocabularyDocument(JSON.stringify({ version: 1, replacements }));
  assert.equal(verdict.ok, false);
});

test("an over-length value is rejected", () => {
  const raw = JSON.stringify({ version: 1, replacements: { Overview: "x".repeat(201) } });
  assert.equal(validateVocabularyDocument(raw).ok, false);
});

test("a rejected document leaves the previously accepted map in place", () => {
  const accepted = validateVocabularyDocument(validDocument);
  assert.equal(accepted.ok, true);
  const cached = accepted.ok ? accepted.replacements : {};

  const rejected = validateVocabularyDocument("{ not json");
  assert.equal(rejected.ok, false);
  assert.deepEqual({ ...cached }, { Overview: "Summary", Settings: "Preferences" });
});

test("substitution replaces whole tokens only", () => {
  const compiled = compileReplacements({ Overview: "Summary" });
  const output = applyVocabulary("Overview and Overviewing", compiled, { immutableSpans: [] });
  assert.equal(output, "Summary and Overviewing");
});

test("an immutable span is never rewritten", () => {
  const compiled = compileReplacements({ Summary: "Digest" });
  const output = applyVocabulary("Summary of Form Summary", compiled, {
    immutableSpans: ["Form Summary"],
  });
  assert.equal(output, "Digest of Form Summary");
});

test("substitution is a single pass and does not re-substitute its own output", () => {
  const compiled = compileReplacements({ one: "two", two: "three" });
  assert.equal(applyVocabulary("one two", compiled, { immutableSpans: [] }), "two three");
});

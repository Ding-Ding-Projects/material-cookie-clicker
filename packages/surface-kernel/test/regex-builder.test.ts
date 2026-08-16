import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILDER_TOKENS,
  MAX_PATTERN_LENGTH,
  MAX_SAMPLE_LENGTH,
  MAX_SAMPLE_MATCHES,
  analyzeSearchPattern,
  compileSearchPattern,
  createSearchState,
  insertToken,
  matchesSearch,
  validateFlags,
} from "../src/regex-builder.ts";

test("the builder palette offers an explicit start and end anchor", () => {
  const inserts = BUILDER_TOKENS.map((token) => token.insert);
  assert.ok(inserts.includes("^"));
  assert.ok(inserts.includes("$"));
});

test("only allowlisted, non-repeating flags are accepted", () => {
  assert.deepEqual(validateFlags("gim"), { ok: true });
  const unsupported = validateFlags("x");
  assert.equal(unsupported.ok, false);
  const repeated = validateFlags("ii");
  assert.equal(repeated.ok, false);
  const conflicting = validateFlags("uv");
  assert.equal(conflicting.ok, false);
});

test("an unsupported flag stops a pattern from compiling", () => {
  const state = createSearchState({ regex: true, pattern: "a", flags: "x" });
  const compiled = compileSearchPattern(state, "filter");
  assert.ok("error" in compiled);
  assert.equal(matchesSearch("a", state), false);
});

test("filtering strips the global flag and analysis adds it", () => {
  const state = createSearchState({ regex: true, pattern: "a", flags: "gi" });
  const filter = compileSearchPattern(state, "filter");
  const analyse = compileSearchPattern(state, "analyse");
  assert.ok("expression" in filter);
  assert.ok("expression" in analyse);
  assert.equal(filter.expression.flags.includes("g"), false);
  assert.equal(analyse.expression.flags.includes("g"), true);
});

test("filtering is not stateful across repeated calls", () => {
  const state = createSearchState({ regex: true, pattern: "a", flags: "g" });
  assert.equal(matchesSearch("aa", state), true);
  assert.equal(matchesSearch("aa", state), true);
  assert.equal(matchesSearch("aa", state), true);
});

test("a zero-width pattern terminates instead of looping", () => {
  const state = createSearchState({ regex: true, pattern: "b*", flags: "", sample: "aaa" });
  const analysis = analyzeSearchPattern(state);
  assert.ok(analysis.matches.length > 0);
  assert.ok(analysis.matches.length <= MAX_SAMPLE_MATCHES);
  assert.ok(analysis.matches.every((match) => match.value === ""));
});

test("an over-length pattern or sample reports a reason instead of throwing", () => {
  const longPattern = createSearchState({
    regex: true,
    pattern: "a".repeat(MAX_PATTERN_LENGTH + 1),
    sample: "aaa",
  });
  assert.match(analyzeSearchPattern(longPattern).feedback, /exceeds/);
  assert.deepEqual(analyzeSearchPattern(longPattern).matches, []);

  const longSample = createSearchState({
    regex: true,
    pattern: "a",
    sample: "a".repeat(MAX_SAMPLE_LENGTH + 1),
  });
  assert.match(analyzeSearchPattern(longSample).feedback, /Sample exceeds/);
});

test("an invalid expression reports its reason and matches nothing", () => {
  const state = createSearchState({ regex: true, pattern: "(" });
  assert.equal(matchesSearch("anything", state), false);
  assert.equal(analyzeSearchPattern(state).matches.length, 0);
});

test("an empty search matches every value", () => {
  assert.equal(matchesSearch("any value", createSearchState()), true);
});

test("plain text search is case-insensitive", () => {
  const state = createSearchState({ query: "REPORT" });
  assert.equal(matchesSearch("Quarterly report summary", state), true);
});

test("inserting a token switches the field into pattern mode and stays bounded", () => {
  const anchor = BUILDER_TOKENS.find((token) => token.insert === "^");
  assert.ok(anchor);
  const state = insertToken(createSearchState(), anchor);
  assert.equal(state.regex, true);
  assert.equal(state.pattern, "^");

  const nearLimit = createSearchState({ pattern: "a".repeat(MAX_PATTERN_LENGTH) });
  assert.equal(insertToken(nearLimit, anchor).pattern.length, MAX_PATTERN_LENGTH);
});

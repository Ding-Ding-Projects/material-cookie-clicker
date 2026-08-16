/**
 * The single anchored regular-expression search engine.
 *
 * Before this module the repository carried two incompatible implementations:
 * one in the documentation site component and one in the local model
 * controller. They disagreed on the flag allowlist, on the pattern length
 * limit, and on whether the global flag was added or removed. Both surfaces now
 * call this module, so a pattern typed into any search field behaves the same
 * way everywhere.
 *
 * Fixed semantics:
 *   - filtering compiles without the global flag, so `test` is not stateful;
 *   - analysis compiles with the global flag so every match can be listed;
 *   - a zero-width match advances the cursor instead of looping forever;
 *   - an over-length pattern or sample returns a reason string, never a throw.
 */

/** The JavaScript regular-expression flags a search field may use. */
export const SEARCH_FLAG_ALLOWLIST = "dgimsuvy";

/** Longest pattern a search field accepts. */
export const MAX_PATTERN_LENGTH = 256;

/** Longest sample text the builder will analyse. */
export const MAX_SAMPLE_LENGTH = 2000;

/** Most matches the builder reports for one sample. */
export const MAX_SAMPLE_MATCHES = 50;

export type SearchState = {
  query: string;
  regex: boolean;
  pattern: string;
  flags: string;
  sample: string;
  builderOpen: boolean;
};

export type BuilderToken = {
  id: string;
  label: string;
  detail: string;
  insert: string;
};

export type SearchMatch = {
  value: string;
  index: number;
  groups: string[];
};

export type FlagVerdict = { ok: true } | { ok: false; reason: string };

export type CompiledSearch = { expression: RegExp } | { error: string };

export type SearchAnalysis = {
  feedback: string;
  matches: SearchMatch[];
};

/**
 * The builder palette. The start-anchor and end-anchor tokens are the reason
 * the product copy is allowed to call this an anchored builder: a person can
 * anchor a pattern without typing regular-expression syntax by hand.
 */
export const BUILDER_TOKENS: BuilderToken[] = [
  { id: "start-anchor", label: "Start anchor", detail: "Match only at the start of the value.", insert: "^" },
  { id: "end-anchor", label: "End anchor", detail: "Match only at the end of the value.", insert: "$" },
  { id: "word-boundary", label: "Word boundary", detail: "Match at the edge of a word.", insert: "\\b" },
  { id: "character-class", label: "Character class", detail: "Match any one of the listed characters.", insert: "[abc]" },
  { id: "range", label: "Range", detail: "Match any character in a range.", insert: "[a-z]" },
  { id: "digit", label: "Digit", detail: "Match any digit.", insert: "\\d" },
  { id: "group", label: "Group", detail: "Capture part of the match.", insert: "()" },
  { id: "alternation", label: "Alternation", detail: "Match either side.", insert: "(a|b)" },
  { id: "quantifier-optional", label: "Optional", detail: "Match the previous item zero or one time.", insert: "?" },
  { id: "quantifier-repeat", label: "One or more", detail: "Match the previous item at least once.", insert: "+" },
  { id: "quantifier-count", label: "Exact count", detail: "Match the previous item a fixed number of times.", insert: "{2}" },
  { id: "any", label: "Any character", detail: "Match any single character.", insert: "." },
  { id: "whitespace", label: "Whitespace", detail: "Match a space, tab or line break.", insert: "\\s" },
];

/** Builds a search state, optionally overriding individual fields. */
export function createSearchState(overrides?: Partial<SearchState>): SearchState {
  return {
    query: "",
    regex: false,
    pattern: "",
    flags: "i",
    sample: "",
    builderOpen: false,
    ...overrides,
  };
}

/** Accepts only allowlisted, non-repeating flags, and never both `u` and `v`. */
export function validateFlags(flags: string): FlagVerdict {
  const seen = new Set<string>();
  for (const flag of flags) {
    if (!SEARCH_FLAG_ALLOWLIST.includes(flag)) {
      return { ok: false, reason: `The flag "${flag}" is not one of the supported flags ${SEARCH_FLAG_ALLOWLIST}.` };
    }
    if (seen.has(flag)) {
      return { ok: false, reason: `The flag "${flag}" is repeated.` };
    }
    seen.add(flag);
  }
  if (seen.has("u") && seen.has("v")) {
    return { ok: false, reason: 'The flags "u" and "v" cannot be combined.' };
  }
  return { ok: true };
}

function purposeFlags(flags: string, purpose: "filter" | "analyse"): string {
  const stripped = flags.replaceAll("g", "");
  return purpose === "analyse" ? `${stripped}g` : stripped;
}

/**
 * Compiles the pattern for one purpose. Filtering never carries the global
 * flag; analysis always does.
 */
export function compileSearchPattern(state: SearchState, purpose: "filter" | "analyse"): CompiledSearch {
  if (!state.pattern) return { error: "Enter a pattern to inspect it." };
  if (state.pattern.length > MAX_PATTERN_LENGTH) {
    return { error: `Pattern exceeds ${MAX_PATTERN_LENGTH} characters.` };
  }
  const verdict = validateFlags(state.flags);
  if (!verdict.ok) return { error: verdict.reason };
  try {
    return { expression: new RegExp(state.pattern, purposeFlags(state.flags, purpose)) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid regular expression." };
  }
}

/**
 * The one filter predicate every list, picker, menu and settings grid uses.
 * An empty search matches everything; an invalid pattern matches nothing.
 */
export function matchesSearch(value: string, state: SearchState): boolean {
  if (!state.query && !state.pattern) return true;
  if (!state.regex) {
    return value.toLocaleLowerCase().includes(state.query.toLocaleLowerCase());
  }
  const compiled = compileSearchPattern(state, "filter");
  if ("error" in compiled) return false;
  return compiled.expression.test(value);
}

/** Lists the matches a pattern produces against the builder's sample text. */
export function analyzeSearchPattern(state: SearchState): SearchAnalysis {
  if (!state.pattern) return { feedback: "Enter a pattern to inspect it.", matches: [] };
  if (state.pattern.length > MAX_PATTERN_LENGTH) {
    return { feedback: `Pattern exceeds ${MAX_PATTERN_LENGTH} characters.`, matches: [] };
  }
  if (state.sample.length > MAX_SAMPLE_LENGTH) {
    return { feedback: `Sample exceeds ${MAX_SAMPLE_LENGTH} characters.`, matches: [] };
  }
  const compiled = compileSearchPattern(state, "analyse");
  if ("error" in compiled) return { feedback: compiled.error, matches: [] };

  const expression = compiled.expression;
  const matches: SearchMatch[] = [];
  let found: RegExpExecArray | null = expression.exec(state.sample);
  while (found !== null && matches.length < MAX_SAMPLE_MATCHES) {
    matches.push({
      value: found[0],
      index: found.index,
      groups: found.slice(1).map((group) => group ?? ""),
    });
    if (found[0] === "") expression.lastIndex += 1;
    found = expression.exec(state.sample);
  }
  return {
    feedback: `${matches.length} local match${matches.length === 1 ? "" : "es"}.`,
    matches,
  };
}

/** Appends a builder token, switching the field into pattern mode. */
export function insertToken(state: SearchState, token: BuilderToken): SearchState {
  const pattern = `${state.pattern}${token.insert}`.slice(0, MAX_PATTERN_LENGTH);
  return { ...state, pattern, regex: true };
}

/** Plain-language description of what a search field is currently doing. */
export function describeSearch(state: SearchState): string {
  if (state.regex) {
    return state.pattern ? `Pattern search with flags "${state.flags}".` : "Pattern search with no pattern entered.";
  }
  return state.query ? "Case-insensitive text search." : "No search term entered.";
}

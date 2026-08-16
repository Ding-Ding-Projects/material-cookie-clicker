/**
 * A local, self-contained equivalent of `@material-cookie-clicker/surface-kernel`'s
 * `regex-builder.ts` — same semantics, same shapes, deliberately NOT re-exported from the
 * vendored package.
 *
 * WHY THIS EXISTS: `packages/surface-kernel/src/*.ts` writes its own relative imports with a
 * literal `.ts` extension (e.g. `from "./regex-builder.ts"`), which is only legal for a
 * consumer whose tsconfig sets `allowImportingTsExtensions`. `tsconfig.renderer.json` does not
 * set that flag, and this lane's task explicitly forbids editing any tsconfig or anything under
 * `packages/**` to add it — so `npx tsc -p tsconfig.renderer.json --noEmit` fails with TS5097
 * the moment ANY file under `src/renderer/**` imports the package by specifier, transitively
 * pulling its whole module graph into this program under the renderer's (incompatible)
 * compiler options. This module reimplements the small subset this lane's screens need
 * (`matchesSearch`, `compileSearchPattern`, `createSearchState`, `insertToken`,
 * `BUILDER_TOKENS`, and `SearchState`/`BuilderToken`) so every list search field still gets a
 * real, working, bounded, locally-evaluated regex builder without depending on a package this
 * program cannot type-check. See HANDOFF.md/ROADMAP.md for the actual fix (giving the renderer
 * program `allowImportingTsExtensions`), which belongs to whichever lane owns tsconfig.
 */

/** The JavaScript regular-expression flags a search field may use. */
export const SEARCH_FLAG_ALLOWLIST = "dgimsuvy";

/** Longest pattern a search field accepts. */
export const MAX_PATTERN_LENGTH = 256;

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

export type FlagVerdict = { ok: true } | { ok: false; reason: string };

export type CompiledSearch = { expression: RegExp } | { error: string };

/**
 * The builder palette. The start-anchor and end-anchor tokens are the reason the product copy
 * is allowed to call this an anchored builder: a person can anchor a pattern without typing
 * regular-expression syntax by hand.
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

/** Compiles the pattern for one purpose. Filtering never carries the global flag. */
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
 * The one filter predicate every list search field in this lane's screens uses. An empty
 * search matches everything; an invalid pattern matches nothing (never throws).
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

/** Appends a builder token, switching the field into pattern mode. */
export function insertToken(state: SearchState, token: BuilderToken): SearchState {
  const pattern = `${state.pattern}${token.insert}`.slice(0, MAX_PATTERN_LENGTH);
  return { ...state, pattern, regex: true };
}

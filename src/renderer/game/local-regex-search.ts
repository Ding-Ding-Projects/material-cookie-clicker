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

import type { Bilingual } from "./copy.js";

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
  label: Bilingual;
  detail: Bilingual;
  insert: string;
};

export type FlagVerdict = { ok: true } | { ok: false; reason: Bilingual };

export type CompiledSearch = { expression: RegExp } | { error: Bilingual };

/**
 * The builder palette. The start-anchor and end-anchor tokens are the reason the product copy
 * is allowed to call this an anchored builder: a person can anchor a pattern without typing
 * regular-expression syntax by hand.
 */
export const BUILDER_TOKENS: BuilderToken[] = [
  {
    id: "start-anchor",
    label: { en: "Start anchor", yue: "開頭錨點" },
    detail: { en: "Match only at the start of the value.", yue: "淨係喺個值嘅開頭先配對。" },
    insert: "^",
  },
  {
    id: "end-anchor",
    label: { en: "End anchor", yue: "結尾錨點" },
    detail: { en: "Match only at the end of the value.", yue: "淨係喺個值嘅結尾先配對。" },
    insert: "$",
  },
  {
    id: "word-boundary",
    label: { en: "Word boundary", yue: "字詞邊界" },
    detail: { en: "Match at the edge of a word.", yue: "喺一個字詞嘅邊界配對。" },
    insert: "\\b",
  },
  {
    id: "character-class",
    label: { en: "Character class", yue: "字元集合" },
    detail: { en: "Match any one of the listed characters.", yue: "配對所列字元入面任何一個。" },
    insert: "[abc]",
  },
  {
    id: "range",
    label: { en: "Range", yue: "範圍" },
    detail: { en: "Match any character in a range.", yue: "配對範圍入面任何一個字元。" },
    insert: "[a-z]",
  },
  {
    id: "digit",
    label: { en: "Digit", yue: "數字" },
    detail: { en: "Match any digit.", yue: "配對任何一個數字。" },
    insert: "\\d",
  },
  {
    id: "group",
    label: { en: "Group", yue: "群組" },
    detail: { en: "Capture part of the match.", yue: "擷取配對嘅其中一部分。" },
    insert: "()",
  },
  {
    id: "alternation",
    label: { en: "Alternation", yue: "二選一" },
    detail: { en: "Match either side.", yue: "任何一邊配對到都得。" },
    insert: "(a|b)",
  },
  {
    id: "quantifier-optional",
    label: { en: "Optional", yue: "可有可無" },
    detail: { en: "Match the previous item zero or one time.", yue: "上一項配對零次或者一次。" },
    insert: "?",
  },
  {
    id: "quantifier-repeat",
    label: { en: "One or more", yue: "一次或以上" },
    detail: { en: "Match the previous item at least once.", yue: "上一項至少配對一次。" },
    insert: "+",
  },
  {
    id: "quantifier-count",
    label: { en: "Exact count", yue: "指定次數" },
    detail: { en: "Match the previous item a fixed number of times.", yue: "上一項配對指定嘅次數。" },
    insert: "{2}",
  },
  {
    id: "any",
    label: { en: "Any character", yue: "任何字元" },
    detail: { en: "Match any single character.", yue: "配對任何單一字元。" },
    insert: ".",
  },
  {
    id: "whitespace",
    label: { en: "Whitespace", yue: "空白字元" },
    detail: { en: "Match a space, tab or line break.", yue: "配對空格、Tab 或者轉行。" },
    insert: "\\s",
  },
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
      return {
        ok: false,
        reason: {
          en: `The flag "${flag}" is not one of the supported flags ${SEARCH_FLAG_ALLOWLIST}.`,
          yue: `旗標「${flag}」唔喺支援嘅旗標 ${SEARCH_FLAG_ALLOWLIST} 入面。`,
        },
      };
    }
    if (seen.has(flag)) {
      return { ok: false, reason: { en: `The flag "${flag}" is repeated.`, yue: `旗標「${flag}」重複咗。` } };
    }
    seen.add(flag);
  }
  if (seen.has("u") && seen.has("v")) {
    return {
      ok: false,
      reason: { en: 'The flags "u" and "v" cannot be combined.', yue: "旗標「u」同「v」唔可以一齊用。" },
    };
  }
  return { ok: true };
}

function purposeFlags(flags: string, purpose: "filter" | "analyse"): string {
  const stripped = flags.replaceAll("g", "");
  return purpose === "analyse" ? `${stripped}g` : stripped;
}

/** Compiles the pattern for one purpose. Filtering never carries the global flag. */
export function compileSearchPattern(state: SearchState, purpose: "filter" | "analyse"): CompiledSearch {
  if (!state.pattern) {
    return { error: { en: "Enter a pattern to inspect it.", yue: "輸入一個規則先可以檢查佢。" } };
  }
  if (state.pattern.length > MAX_PATTERN_LENGTH) {
    return {
      error: {
        en: `Pattern exceeds ${MAX_PATTERN_LENGTH} characters.`,
        yue: `規則超過 ${MAX_PATTERN_LENGTH} 個字元。`,
      },
    };
  }
  const verdict = validateFlags(state.flags);
  if (!verdict.ok) return { error: verdict.reason };
  try {
    return { expression: new RegExp(state.pattern, purposeFlags(state.flags, purpose)) };
  } catch (error) {
    // The JS engine's own message cannot be translated, so it is framed bilingually instead of
    // being dropped into the Cantonese line raw.
    if (error instanceof Error) {
      return { error: { en: `Invalid regular expression: ${error.message}`, yue: `規則運算式無效：${error.message}` } };
    }
    return { error: { en: "Invalid regular expression.", yue: "規則運算式無效。" } };
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

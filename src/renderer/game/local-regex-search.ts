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

/** Longest sample text the live lab will analyse. */
export const MAX_SAMPLE_LENGTH = 2000;

/** Most matches the lab reports for one sample. */
export const MAX_SAMPLE_MATCHES = 50;

/** How many patterns the popover's local history remembers. */
export const PATTERN_HISTORY_LIMIT = 10;

/**
 * The shelf a token sits on inside the palette. The palette is grouped rather than being one
 * long strip, because a strip of twenty-five buttons is a worse builder than a strip of
 * thirteen — the point of the advanced tiers is more capability, not more clutter.
 */
export type TokenCategory = "anchors" | "classes" | "quantifiers" | "groups" | "lookaround";

/**
 * Which rung of the SHARED advanced ladder a token needs (control-unlocks.ts, control id
 * `regex`). 0 is the per-surface token palette a surface already bought; 1 is
 * "Groups and lookarounds"; the live lab (rung 2) adds no tokens, it adds a workbench.
 */
export type TokenTier = 0 | 1;

export type BuilderToken = {
  id: string;
  label: Bilingual;
  detail: Bilingual;
  insert: string;
  category: TokenCategory;
  tier: TokenTier;
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
    category: "anchors",
    tier: 0,
  },
  {
    id: "end-anchor",
    label: { en: "End anchor", yue: "結尾錨點" },
    detail: { en: "Match only at the end of the value.", yue: "淨係喺個值嘅結尾先配對。" },
    insert: "$",
    category: "anchors",
    tier: 0,
  },
  {
    id: "word-boundary",
    label: { en: "Word boundary", yue: "字詞邊界" },
    detail: { en: "Match at the edge of a word.", yue: "喺一個字詞嘅邊界配對。" },
    insert: "\\b",
    category: "anchors",
    tier: 0,
  },
  {
    id: "character-class",
    label: { en: "Character class", yue: "字元集合" },
    detail: { en: "Match any one of the listed characters.", yue: "配對所列字元入面任何一個。" },
    insert: "[abc]",
    category: "classes",
    tier: 0,
  },
  {
    id: "range",
    label: { en: "Range", yue: "範圍" },
    detail: { en: "Match any character in a range.", yue: "配對範圍入面任何一個字元。" },
    insert: "[a-z]",
    category: "classes",
    tier: 0,
  },
  {
    id: "digit",
    label: { en: "Digit", yue: "數字" },
    detail: { en: "Match any digit.", yue: "配對任何一個數字。" },
    insert: "\\d",
    category: "classes",
    tier: 0,
  },
  {
    id: "group",
    label: { en: "Group", yue: "群組" },
    detail: { en: "Capture part of the match.", yue: "擷取配對嘅其中一部分。" },
    insert: "()",
    category: "groups",
    tier: 0,
  },
  {
    id: "alternation",
    label: { en: "Alternation", yue: "二選一" },
    detail: { en: "Match either side.", yue: "任何一邊配對到都得。" },
    insert: "(a|b)",
    category: "groups",
    tier: 0,
  },
  {
    id: "quantifier-optional",
    label: { en: "Optional", yue: "可有可無" },
    detail: { en: "Match the previous item zero or one time.", yue: "上一項配對零次或者一次。" },
    insert: "?",
    category: "quantifiers",
    tier: 0,
  },
  {
    id: "quantifier-repeat",
    label: { en: "One or more", yue: "一次或以上" },
    detail: { en: "Match the previous item at least once.", yue: "上一項至少配對一次。" },
    insert: "+",
    category: "quantifiers",
    tier: 0,
  },
  {
    id: "quantifier-count",
    label: { en: "Exact count", yue: "指定次數" },
    detail: { en: "Match the previous item a fixed number of times.", yue: "上一項配對指定嘅次數。" },
    insert: "{2}",
    category: "quantifiers",
    tier: 0,
  },
  {
    id: "any",
    label: { en: "Any character", yue: "任何字元" },
    detail: { en: "Match any single character.", yue: "配對任何單一字元。" },
    insert: ".",
    category: "classes",
    tier: 0,
  },
  {
    id: "whitespace",
    label: { en: "Whitespace", yue: "空白字元" },
    detail: { en: "Match a space, tab or line break.", yue: "配對空格、Tab 或者轉行。" },
    insert: "\\s",
    category: "classes",
    tier: 0,
  },

  /* ── Tier "Groups and lookarounds" (shared rung `regex.groups`) ─────────────────────────
   * Every one of these carries a plain-language `detail`, in both languages, because the
   * whole argument for selling a lookbehind button is that the button explains the thing the
   * syntax does not. `(?<=…)` is unreadable; "match only if this comes just before it" is not.
   */
  {
    id: "named-group",
    label: { en: "Named group", yue: "具名群組" },
    detail: {
      en: "Capture a part of the match under a name you choose, so the capture table can label it.",
      yue: "用你改嘅名擷取配對嘅一部分，擷取表就會標返個名。",
    },
    insert: "(?<name>)",
    category: "groups",
    tier: 1,
  },
  {
    id: "non-capturing-group",
    label: { en: "Plain group", yue: "唔擷取群組" },
    detail: {
      en: "Group things together without capturing them — for grouping an either/or, not for keeping it.",
      yue: "淨係將幾樣嘢圈埋一齊，唔會擷取——用嚟圈住二選一，唔係用嚟留低佢。",
    },
    insert: "(?:)",
    category: "groups",
    tier: 1,
  },
  {
    id: "backreference",
    label: { en: "Same again", yue: "同上一個一樣" },
    detail: {
      en: "Match exactly what the first group already matched, a second time.",
      yue: "再配對一次第一個群組已經配對到嘅嘢，一模一樣。",
    },
    insert: "\\1",
    category: "groups",
    tier: 1,
  },
  {
    id: "lookahead",
    label: { en: "Followed by", yue: "後面跟住" },
    detail: {
      en: "Match only where this comes next — the part that comes next is not part of the match.",
      yue: "淨係喺後面跟住呢樣嘢嗰陣先配對——跟住嗰部分唔算入配對入面。",
    },
    insert: "(?=)",
    category: "lookaround",
    tier: 1,
  },
  {
    id: "negative-lookahead",
    label: { en: "Not followed by", yue: "後面唔係" },
    detail: {
      en: "Match only where this does NOT come next.",
      yue: "淨係喺後面唔係呢樣嘢嗰陣先配對。",
    },
    insert: "(?!)",
    category: "lookaround",
    tier: 1,
  },
  {
    id: "lookbehind",
    label: { en: "Preceded by", yue: "前面有" },
    detail: {
      en: "Match only where this came just before — the part before is not part of the match.",
      yue: "淨係喺前面啱啱有呢樣嘢嗰陣先配對——前面嗰部分唔算入配對入面。",
    },
    insert: "(?<=)",
    category: "lookaround",
    tier: 1,
  },
  {
    id: "negative-lookbehind",
    label: { en: "Not preceded by", yue: "前面唔係" },
    detail: {
      en: "Match only where this did NOT come just before.",
      yue: "淨係喺前面啱啱唔係呢樣嘢嗰陣先配對。",
    },
    insert: "(?<!)",
    category: "lookaround",
    tier: 1,
  },
  {
    id: "quantifier-lazy",
    label: { en: "As few as possible", yue: "越少越好" },
    detail: {
      en: "Make the quantifier before it stop at the first chance instead of running as far as it can.",
      yue: "叫前面嗰個數量詞一有機會就收手，唔好一路食落去。",
    },
    insert: "?",
    category: "quantifiers",
    tier: 1,
  },
  {
    id: "quantifier-range",
    label: { en: "Between n and m", yue: "n 到 m 次" },
    detail: {
      en: "Match the previous item at least n times and at most m times.",
      yue: "上一項至少配對 n 次，最多 m 次。",
    },
    insert: "{2,4}",
    category: "quantifiers",
    tier: 1,
  },
  {
    id: "quantifier-star",
    label: { en: "Zero or more", yue: "零次或以上" },
    detail: { en: "Match the previous item any number of times, including none.", yue: "上一項配對幾多次都得，包括零次。" },
    insert: "*",
    category: "quantifiers",
    tier: 1,
  },
];

/** The palette headings, in palette order. */
export const TOKEN_CATEGORY_ORDER: readonly TokenCategory[] = [
  "anchors",
  "classes",
  "quantifiers",
  "groups",
  "lookaround",
];

export const TOKEN_CATEGORY_LABELS: Readonly<Record<TokenCategory, Bilingual>> = {
  anchors: { en: "Anchors", yue: "錨點" },
  classes: { en: "Characters", yue: "字元" },
  quantifiers: { en: "How many", yue: "幾多次" },
  groups: { en: "Groups", yue: "群組" },
  lookaround: { en: "Lookaround", yue: "前後顧" },
};

/**
 * The tokens a popover may show, given how many rungs of the SHARED advanced ladder are bought.
 * `advancedLevel` 0 is the plain palette a surface's own `search.<surface>.tokens` rung buys;
 * 1 or more adds the groups-and-lookaround shelf. Nothing is ever removed by a purchase.
 */
export function tokensForLevel(advancedLevel: number): BuilderToken[] {
  return BUILDER_TOKENS.filter((token) => token.tier <= advancedLevel);
}

/** The tokens of one category, at one advanced level, in palette order. */
export function tokensByCategory(advancedLevel: number): { category: TokenCategory; tokens: BuilderToken[] }[] {
  return TOKEN_CATEGORY_ORDER.map((category) => ({
    category,
    tokens: tokensForLevel(advancedLevel).filter((token) => token.category === category),
  })).filter((shelf) => shelf.tokens.length > 0);
}

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

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * TIER "GROUPS AND LOOKAROUNDS" — the composers.
 *
 * These are pure string builders rather than free-text fields with a regex in them: the point
 * of selling a "capture group UI" is that a player types a NAME and a MEANING, and the module
 * writes the syntax. Everything a player types as a literal is escaped, so an alternative
 * containing a dot means a dot.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** The characters that mean something in a pattern and therefore have to be escaped in a literal. */
const LITERAL_ESCAPE = /[.*+?^${}()|[\]\\\/-]/g;

/** Escapes a run of plain text so it matches itself and nothing else. */
export function escapeLiteral(text: string): string {
  return text.replace(LITERAL_ESCAPE, "\\$&");
}

/** A JavaScript group name: a letter, `_` or `$` first, then letters, digits, `_` or `$`. */
const GROUP_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export type GroupBuild = { ok: true; fragment: string } | { ok: false; reason: Bilingual };

/**
 * Builds `(?<name>body)`. The body is taken as PATTERN, not literal — it is what the rest of
 * the builder produced — but the name is validated, because an invalid name is the one mistake
 * that turns the whole pattern into a syntax error a player cannot read.
 */
export function buildNamedGroup(name: string, body: string): GroupBuild {
  if (!GROUP_NAME.test(name)) {
    return {
      ok: false,
      reason: {
        en: `"${name}" is not a usable group name. Start with a letter, then letters or digits, no spaces.`,
        yue: `「${name}」唔可以做群組名。要用字母開頭，之後淨係得字母或者數字，唔可以有空格。`,
      },
    };
  }
  return { ok: true, fragment: `(?<${name}>${body})` };
}

/**
 * Builds an alternation out of plain alternatives: `(?:cat|dog)`. Each alternative is escaped,
 * so "3.5" means three point five and not "3 any-character 5". Blank alternatives are dropped;
 * an empty list is an error rather than a `(?:)` that silently matches nothing useful.
 */
export function buildAlternation(alternatives: readonly string[]): GroupBuild {
  const kept = alternatives.map((one) => one.trim()).filter((one) => one.length > 0);
  if (kept.length === 0) {
    return {
      ok: false,
      reason: { en: "Type at least one alternative first.", yue: "最少要打一個選項先。" },
    };
  }
  return { ok: true, fragment: `(?:${kept.map(escapeLiteral).join("|")})` };
}

/** The four lookaround shapes, as a composer rather than a bare token. */
export type LookaroundKind = "ahead" | "notAhead" | "behind" | "notBehind";

const LOOKAROUND_OPENER: Readonly<Record<LookaroundKind, string>> = {
  ahead: "(?=",
  notAhead: "(?!",
  behind: "(?<=",
  notBehind: "(?<!",
};

export const LOOKAROUND_LABELS: Readonly<Record<LookaroundKind, Bilingual>> = {
  ahead: { en: "followed by", yue: "後面跟住" },
  notAhead: { en: "not followed by", yue: "後面唔係" },
  behind: { en: "preceded by", yue: "前面有" },
  notBehind: { en: "not preceded by", yue: "前面唔係" },
};

/** Builds one lookaround around a LITERAL body, escaped the same way alternatives are. */
export function buildLookaround(kind: LookaroundKind, body: string): GroupBuild {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: { en: "Type what to look for first.", yue: "打低要睇乜嘢先。" } };
  }
  return { ok: true, fragment: `${LOOKAROUND_OPENER[kind]}${escapeLiteral(trimmed)})` };
}

/** Appends any composed fragment to the pattern under the same bound a token insert obeys. */
export function appendFragment(state: SearchState, fragment: string): SearchState {
  return { ...state, pattern: `${state.pattern}${fragment}`.slice(0, MAX_PATTERN_LENGTH), regex: true };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * TIER "LIVE LAB" — the pure computation behind the test-string workbench.
 *
 * Everything here is a pure function of (pattern, flags, sample). The component renders what it
 * returns and holds no matching logic of its own, which is what makes the lab testable without
 * a DOM.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export type LabCapture = {
  /** 1-based group number, as the engine numbers them. */
  readonly number: number;
  /** The group's name when it has one. */
  readonly name?: string;
  /** The captured text, or null when the group took part in no match. */
  readonly value: string | null;
};

export type LabMatch = {
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly captures: readonly LabCapture[];
};

export type LabSegment = {
  readonly text: string;
  /** The 0-based index of the match this run belongs to, or null for the text between matches. */
  readonly matchIndex: number | null;
};

export type LabResult = {
  readonly matches: readonly LabMatch[];
  readonly segments: readonly LabSegment[];
  readonly summary: Bilingual;
  readonly error: Bilingual | null;
  /** True when the sample produced more matches than the lab is willing to list. */
  readonly truncated: boolean;
};

function emptyLab(sample: string, summary: Bilingual, error: Bilingual | null): LabResult {
  return {
    matches: [],
    segments: sample ? [{ text: sample, matchIndex: null }] : [],
    summary,
    error,
    truncated: false,
  };
}

/**
 * Runs the pattern over the sample and returns everything the lab draws: the matches, the
 * capture-table rows, and the highlight runs.
 *
 * The bounds are the existing safety bounds and all three are enforced here rather than in the
 * view: pattern length, sample length, and match count. A zero-width match advances the cursor
 * by one instead of looping forever, which is the rule the vendored kernel holds too.
 */
export function runLab(state: SearchState): LabResult {
  const sample = state.sample;
  if (!state.pattern) {
    return emptyLab(sample, { en: "Enter a pattern to test it.", yue: "輸入一個規則先可以試佢。" }, null);
  }
  if (sample.length > MAX_SAMPLE_LENGTH) {
    const reason: Bilingual = {
      en: `Sample exceeds ${MAX_SAMPLE_LENGTH} characters.`,
      yue: `樣本超過 ${MAX_SAMPLE_LENGTH} 個字元。`,
    };
    return emptyLab("", reason, reason);
  }
  const compiled = compileSearchPattern(state, "analyse");
  if ("error" in compiled) return emptyLab(sample, compiled.error, compiled.error);

  const expression = compiled.expression;
  const matches: LabMatch[] = [];
  let truncated = false;
  let found = expression.exec(sample);
  while (found !== null) {
    if (matches.length >= MAX_SAMPLE_MATCHES) {
      truncated = true;
      break;
    }
    const named = found.groups ?? {};
    const captures: LabCapture[] = found.slice(1).map((value, offset) => {
      const name = Object.keys(named).find((key) => named[key] === value && value !== undefined);
      return { number: offset + 1, name, value: value ?? null };
    });
    matches.push({ value: found[0], start: found.index, end: found.index + found[0].length, captures });
    if (found[0] === "") expression.lastIndex += 1;
    found = expression.exec(sample);
  }

  const segments: LabSegment[] = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    if (match.start > cursor) segments.push({ text: sample.slice(cursor, match.start), matchIndex: null });
    if (match.end > match.start) segments.push({ text: match.value, matchIndex: index });
    cursor = Math.max(cursor, match.end);
  });
  if (cursor < sample.length) segments.push({ text: sample.slice(cursor), matchIndex: null });

  const count = matches.length;
  return {
    matches,
    segments,
    truncated,
    error: null,
    summary: {
      en: `${count} match${count === 1 ? "" : "es"}${truncated ? ` (the first ${MAX_SAMPLE_MATCHES})` : ""}, found locally.`,
      yue: `喺本機搵到 ${count} 個配對${truncated ? `（頭 ${MAX_SAMPLE_MATCHES} 個）` : ""}。`,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * THE PLAIN-LANGUAGE EXPLANATION LINE.
 *
 * A deliberately shallow left-to-right reading of the pattern, not a parser. It says what each
 * piece does in the order a person reads it, with "then" between the pieces. It never claims
 * more than it knows: anything it does not recognise is described as the literal text it is.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

type Piece = { en: string; yue: string };

const CLASS_WORDS: Readonly<Record<string, Piece>> = {
  d: { en: "any digit", yue: "任何一個數字" },
  D: { en: "any character that is not a digit", yue: "任何一個唔係數字嘅字元" },
  w: { en: "any letter, digit or underscore", yue: "任何字母、數字或者底線" },
  W: { en: "any character that is not a letter, digit or underscore", yue: "任何唔係字母、數字或者底線嘅字元" },
  s: { en: "any space, tab or line break", yue: "任何空格、Tab 或者轉行" },
  S: { en: "any character that is not a space", yue: "任何唔係空白嘅字元" },
  b: { en: "the edge of a word", yue: "一個字詞嘅邊界" },
};

function quantifierWords(source: string): Piece | null {
  if (source === "?") return { en: "optionally", yue: "可有可無咁" };
  if (source === "*") return { en: "any number of times, including none", yue: "幾多次都得，包括零次" };
  if (source === "+") return { en: "one or more times", yue: "一次或以上" };
  const exact = /^\{(\d+)\}$/.exec(source);
  if (exact) return { en: `exactly ${exact[1]} times`, yue: `啱啱 ${exact[1]} 次` };
  const open = /^\{(\d+),\}$/.exec(source);
  if (open) return { en: `${open[1]} or more times`, yue: `${open[1]} 次或以上` };
  const range = /^\{(\d+),(\d+)\}$/.exec(source);
  if (range) return { en: `between ${range[1]} and ${range[2]} times`, yue: `${range[1]} 到 ${range[2]} 次` };
  return null;
}

/**
 * One sentence, in both languages, describing what the current pattern matches. Returns an
 * empty-pattern line rather than throwing on anything, including nonsense.
 */
export function explainPattern(pattern: string): Bilingual {
  if (!pattern) {
    return { en: "Nothing to match yet — the pattern is empty.", yue: "而家未有嘢配對——個規則係空嘅。" };
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      en: `The pattern is longer than ${MAX_PATTERN_LENGTH} characters, so it is not read.`,
      yue: `個規則長過 ${MAX_PATTERN_LENGTH} 個字元，所以唔會讀。`,
    };
  }

  const pieces: Piece[] = [];
  let literal = "";
  const flushLiteral = (): void => {
    if (!literal) return;
    pieces.push({ en: `the text "${literal}"`, yue: `「${literal}」呢段字` });
    literal = "";
  };

  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];

    if (char === "\\" && i + 1 < pattern.length) {
      const next = pattern[i + 1];
      const word = CLASS_WORDS[next];
      if (word) {
        flushLiteral();
        pieces.push(word);
      } else if (/\d/.test(next)) {
        flushLiteral();
        pieces.push({ en: `whatever group ${next} matched, again`, yue: `第 ${next} 個群組配對到嘅嘢，再嚟一次` });
      } else {
        literal += next;
      }
      i += 2;
      continue;
    }

    if (char === "^") {
      flushLiteral();
      pieces.push({ en: "the very start", yue: "最開頭" });
      i += 1;
      continue;
    }
    if (char === "$") {
      flushLiteral();
      pieces.push({ en: "the very end", yue: "最結尾" });
      i += 1;
      continue;
    }
    if (char === ".") {
      flushLiteral();
      pieces.push({ en: "any single character", yue: "任何單一字元" });
      i += 1;
      continue;
    }
    if (char === "|") {
      flushLiteral();
      pieces.push({ en: "or instead", yue: "或者" });
      i += 1;
      continue;
    }

    if (char === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close > i) {
        flushLiteral();
        const body = pattern.slice(i + 1, close);
        const negated = body.startsWith("^");
        const listed = negated ? body.slice(1) : body;
        pieces.push(
          negated
            ? { en: `any character that is not one of "${listed}"`, yue: `任何唔喺「${listed}」入面嘅字元` }
            : { en: `any one character from "${listed}"`, yue: `「${listed}」入面任何一個字元` },
        );
        i = close + 1;
        continue;
      }
    }

    if (char === "(") {
      flushLiteral();
      const rest = pattern.slice(i);
      const named = /^\(\?<([A-Za-z_$][A-Za-z0-9_$]*)>/.exec(rest);
      if (named) {
        pieces.push({ en: `a captured part named "${named[1]}"`, yue: `一個叫「${named[1]}」嘅擷取部分` });
        i += named[0].length;
        continue;
      }
      if (rest.startsWith("(?<=")) {
        pieces.push({ en: "only where the next part came just before", yue: "淨係喺前面啱啱係下一部分嗰陣" });
        i += 4;
        continue;
      }
      if (rest.startsWith("(?<!")) {
        pieces.push({ en: "only where the next part did NOT come just before", yue: "淨係喺前面啱啱唔係下一部分嗰陣" });
        i += 4;
        continue;
      }
      if (rest.startsWith("(?=")) {
        pieces.push({ en: "only where the next part follows", yue: "淨係喺後面跟住下一部分嗰陣" });
        i += 3;
        continue;
      }
      if (rest.startsWith("(?!")) {
        pieces.push({ en: "only where the next part does NOT follow", yue: "淨係喺後面唔係下一部分嗰陣" });
        i += 3;
        continue;
      }
      if (rest.startsWith("(?:")) {
        pieces.push({ en: "a group of", yue: "一組" });
        i += 3;
        continue;
      }
      pieces.push({ en: "a captured part", yue: "一個擷取部分" });
      i += 1;
      continue;
    }

    if (char === ")") {
      flushLiteral();
      i += 1;
      continue;
    }

    const quantifier = /^(\?|\*|\+|\{\d+(?:,\d*)?\})/.exec(pattern.slice(i));
    if (quantifier) {
      const words = quantifierWords(quantifier[1]);
      if (words) {
        flushLiteral();
        const lazy = pattern[i + quantifier[1].length] === "?";
        pieces.push(
          lazy ? { en: `${words.en}, stopping as early as it can`, yue: `${words.yue}，而且一有機會就收手` } : words,
        );
        i += quantifier[1].length + (lazy ? 1 : 0);
        continue;
      }
    }

    literal += char;
    i += 1;
  }
  flushLiteral();

  if (pieces.length === 0) {
    return { en: "This pattern matches an empty string.", yue: "呢個規則配對一段空嘅文字。" };
  }
  return {
    en: `Matches ${pieces.map((p) => p.en).join(", then ")}.`,
    yue: `配對${pieces.map((p) => p.yue).join("、跟住")}。`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * PATTERN HISTORY — the last ten patterns, newest first, held in this session's memory only.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Puts `pattern` at the front of the history. A blank pattern, an over-length pattern and a
 * repeat of the newest entry all leave the list untouched; a repeat of an OLDER entry moves to
 * the front rather than duplicating. The list is never longer than `PATTERN_HISTORY_LIMIT`, and
 * the oldest entry is the one that falls off the end.
 */
export function pushPatternHistory(history: readonly string[], pattern: string): readonly string[] {
  const trimmed = pattern.trim();
  if (!trimmed || trimmed.length > MAX_PATTERN_LENGTH) return history;
  if (history[0] === trimmed) return history;
  return [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(0, PATTERN_HISTORY_LIMIT);
}

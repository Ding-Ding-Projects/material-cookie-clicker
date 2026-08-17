import { describe, expect, it } from "vitest";

import { bnFromNumber } from "../../src/shared/game/big-number";
import {
  CONTROL_UNLOCKS,
  canBuyControlRung,
  controlRungLevel,
  controlRungPrice,
  getControlUnlock,
  hasControlRung,
  V8_GRANDFATHERED_RUNG_IDS,
  V9_GRANDFATHERED_RUNG_IDS,
} from "../../src/shared/game/control-unlocks";
import { applyGameAction } from "../../src/shared/game/reducer";
import { migrateToLatest } from "../../src/shared/game/migrations";
import type { GameState } from "../../src/shared/game/types";
import {
  BUILDER_TOKENS,
  MAX_PATTERN_LENGTH,
  MAX_SAMPLE_LENGTH,
  MAX_SAMPLE_MATCHES,
  PATTERN_HISTORY_LIMIT,
  appendFragment,
  buildAlternation,
  buildLookaround,
  buildNamedGroup,
  createSearchState,
  escapeLiteral,
  explainPattern,
  pushPatternHistory,
  runLab,
  tokensByCategory,
  tokensForLevel,
} from "../../src/renderer/game/local-regex-search";
import { fixedRng, freshState } from "./test-helpers";

const ctx = { now: () => Date.parse("2026-06-01T00:00:00.000Z"), rng: fixedRng() };

function withCookies(cookies: number): GameState {
  return freshState({ cookies: bnFromNumber(cookies) });
}

function buy(state: GameState, rungId: string): GameState {
  return applyGameAction(state, { type: "buyControlUnlock", rungId }, ctx);
}

function pattern(text: string, extra: Partial<ReturnType<typeof createSearchState>> = {}) {
  return createSearchState({ pattern: text, regex: true, ...extra });
}

/* ──────────────────────────────────────────────────────────────────────── the tiers */

describe("advanced regex builder: the shared ladder", () => {
  it("sells the advanced tiers ONCE for the whole application, not once per surface", () => {
    // The design decision this whole feature turns on. Four surfaces sell their own field, gear
    // and palette; the advanced capability is one control, so the registry gains two rungs
    // rather than eight.
    const advanced = getControlUnlock("regex");
    expect(advanced.rungs.map((rung) => rung.id)).toEqual(["regex.groups", "regex.lab"]);
    expect(CONTROL_UNLOCKS.filter((control) => control.group === "regex")).toHaveLength(1);

    // And no surface grew a fourth rung to duplicate it.
    for (const id of ["search.generators", "search.upgrades", "search.achievements", "search.tools"]) {
      expect(getControlUnlock(id).rungs).toHaveLength(3);
    }
  });

  it("prices the ladder strictly upward and above the per-surface palette it sits on", () => {
    const palette = controlRungPrice("search.tools.tokens");
    const groups = controlRungPrice("regex.groups");
    const lab = controlRungPrice("regex.lab");
    expect(groups.mantissa * 10 ** groups.exponent).toBeGreaterThan(palette.mantissa * 10 ** palette.exponent);
    expect(lab.mantissa * 10 ** lab.exponent).toBeGreaterThan(groups.mantissa * 10 ** groups.exponent);
  });

  it("gates the lab behind the groups tier, and both behind real cookies", () => {
    let state = withCookies(100_000);
    expect(canBuyControlRung(state, "regex.lab")).toBe(false);
    expect(canBuyControlRung(state, "regex.groups")).toBe(true);
    state = buy(state, "regex.groups");
    expect(controlRungLevel(state, "regex")).toBe(1);
    expect(canBuyControlRung(state, "regex.lab")).toBe(true);
    state = buy(state, "regex.lab");
    expect(controlRungLevel(state, "regex")).toBe(2);

    const poor = buy(withCookies(3_999), "regex.groups");
    expect(hasControlRung(poor, "regex.groups")).toBe(false);
  });

  it("is bought manually and never granted by play", () => {
    // A fresh save owns nothing, and earning cookies alone never adds a rung.
    const state = withCookies(1_000_000);
    expect(controlRungLevel(state, "regex")).toBe(0);
  });

  it("grandfathers the groups tier only, on the same one-thousand threshold", () => {
    expect(V8_GRANDFATHERED_RUNG_IDS).toEqual(["regex.groups"]);

    const played = migrateToLatest(
      { schemaVersion: 7, lifetimeCookies: { mantissa: 5, exponent: 3 }, controlUnlocks: { purchasedRungIds: [] } },
      7,
    );
    const grantedIds = (played.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds;
    // Walking to the latest schema also runs v8 -> v9, which hands a played save the whole look
    // ladder (control-unlocks.ts, V9_GRANDFATHERED_RUNG_IDS): every existing save has been
    // looking at the finished cabinet since the day it was written. What this test is about is
    // the regex grant, so it asserts that one exactly and lets the look grant follow it.
    expect(grantedIds).toEqual(["regex.groups", ...V9_GRANDFATHERED_RUNG_IDS]);
    // The twelve-thousand-cookie lab is a workbench no older build ever shipped. Nobody lost it,
    // so nobody is handed it.
    expect(grantedIds).not.toContain("regex.lab");

    const barely = migrateToLatest(
      { schemaVersion: 7, lifetimeCookies: { mantissa: 4, exponent: 2 }, controlUnlocks: { purchasedRungIds: [] } },
      7,
    );
    expect((barely.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds).toEqual([]);
  });

  it("never duplicates the grant for a save that already bought it", () => {
    const already = migrateToLatest(
      {
        schemaVersion: 7,
        lifetimeCookies: { mantissa: 9, exponent: 9 },
        controlUnlocks: { purchasedRungIds: ["regex.groups"] },
      },
      7,
    );
    const ids = (already.data.controlUnlocks as { purchasedRungIds: string[] }).purchasedRungIds;
    expect(ids).toEqual(["regex.groups", ...V9_GRANDFATHERED_RUNG_IDS]);
    expect(ids.filter((id) => id === "regex.groups")).toHaveLength(1);
  });
});

/* ────────────────────────────────────────────────────────────────── the token palette */

describe("advanced regex builder: the palette", () => {
  it("shows only the basic tokens until the groups tier is bought, and never removes any", () => {
    const basic = tokensForLevel(0);
    const advanced = tokensForLevel(1);
    expect(basic.length).toBeGreaterThan(0);
    expect(advanced.length).toBeGreaterThan(basic.length);
    for (const token of basic) {
      expect(advanced).toContain(token);
    }
    expect(basic.map((t) => t.id)).not.toContain("lookbehind");
    expect(advanced.map((t) => t.id)).toContain("lookbehind");
  });

  it("organises the palette by category, dropping empty shelves", () => {
    const shelves = tokensByCategory(1).map((shelf) => shelf.category);
    expect(shelves).toContain("lookaround");
    expect(tokensByCategory(0).map((shelf) => shelf.category)).not.toContain("lookaround");
    for (const shelf of tokensByCategory(1)) {
      expect(shelf.tokens.length).toBeGreaterThan(0);
    }
  });

  it("writes both languages, a category and a tier for every token", () => {
    for (const token of BUILDER_TOKENS) {
      expect(token.label.en.length).toBeGreaterThan(0);
      expect(token.label.yue.length).toBeGreaterThan(0);
      expect(token.detail.en.length).toBeGreaterThan(0);
      expect(token.detail.yue.length).toBeGreaterThan(0);
      expect([0, 1]).toContain(token.tier);
    }
    expect(new Set(BUILDER_TOKENS.map((t) => t.id)).size).toBe(BUILDER_TOKENS.length);
  });

  it("inserts a token that actually compiles once its holes are filled", () => {
    for (const token of tokensForLevel(1)) {
      // Every insert is either a complete fragment or a template with an obvious hole; none of
      // them may contain an unbalanced bracket that would corrupt a pattern silently.
      const opens = (token.insert.match(/\(/g) || []).length;
      const closes = (token.insert.match(/\)/g) || []).length;
      expect(opens).toBe(closes);
    }
  });
});

/* ───────────────────────────────────────────────────────── the group/lookaround builders */

describe("advanced regex builder: the composers", () => {
  it("builds a named capture group around the pattern so far", () => {
    const built = buildNamedGroup("year", "\\d{4}");
    expect(built).toEqual({ ok: true, fragment: "(?<year>\\d{4})" });
    expect(new RegExp("(?<year>\\d{4})").exec("in 1997")?.groups?.year).toBe("1997");
  });

  it("refuses a group name the engine would reject, in both languages", () => {
    for (const bad of ["2fast", "with space", "", "a-b"]) {
      const built = buildNamedGroup(bad, "x");
      expect(built.ok).toBe(false);
      if (built.ok) return;
      expect(built.reason.en.length).toBeGreaterThan(0);
      expect(built.reason.yue.length).toBeGreaterThan(0);
    }
  });

  it("builds an alternation from plain alternatives, escaping every one of them", () => {
    const built = buildAlternation(["cursor", " grandma ", "3.5"]);
    expect(built).toEqual({ ok: true, fragment: "(?:cursor|grandma|3\\.5)" });
    // The escaped dot means a dot: "345" must not match.
    if (!built.ok) return;
    expect(new RegExp(built.fragment).test("3.5")).toBe(true);
    expect(new RegExp(built.fragment).test("345")).toBe(false);
  });

  it("drops blank alternatives and refuses an entirely empty list", () => {
    expect(buildAlternation(["a", "", "   "])).toEqual({ ok: true, fragment: "(?:a)" });
    const empty = buildAlternation(["", "  "]);
    expect(empty.ok).toBe(false);
  });

  it("builds each of the four lookarounds with the right opener", () => {
    expect(buildLookaround("ahead", "Bakery")).toEqual({ ok: true, fragment: "(?=Bakery)" });
    expect(buildLookaround("notAhead", "Bakery")).toEqual({ ok: true, fragment: "(?!Bakery)" });
    expect(buildLookaround("behind", "Bakery")).toEqual({ ok: true, fragment: "(?<=Bakery)" });
    expect(buildLookaround("notBehind", "Bakery")).toEqual({ ok: true, fragment: "(?<!Bakery)" });
    expect(buildLookaround("ahead", "  ").ok).toBe(false);
  });

  it("produces lookarounds that behave the way the plain-language label claims", () => {
    const behind = buildLookaround("behind", "$");
    expect(behind.ok).toBe(true);
    if (!behind.ok) return;
    // "preceded by $" — the dollar is escaped, so it is a literal dollar sign, and it is not
    // part of the match.
    const found = new RegExp(`${behind.fragment}\\d+`).exec("costs $250");
    expect(found?.[0]).toBe("250");
  });

  it("escapes every character that would otherwise mean something", () => {
    const escaped = escapeLiteral(".*+?^${}()|[]\\/-");
    expect(new RegExp(escaped).test(".*+?^${}()|[]\\/-")).toBe(true);
  });

  it("keeps an appended fragment inside the pattern-length bound", () => {
    const long = pattern("a".repeat(MAX_PATTERN_LENGTH - 2));
    const next = appendFragment(long, "(?<name>xyz)");
    expect(next.pattern.length).toBe(MAX_PATTERN_LENGTH);
    expect(next.regex).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────────────────────── the lab */

describe("advanced regex builder: the live lab", () => {
  it("finds every match and reports where each one starts and ends", () => {
    const result = runLab(pattern("\\d+", { sample: "a1 bb22 c333", flags: "" }));
    expect(result.error).toBeNull();
    expect(result.matches.map((m) => m.value)).toEqual(["1", "22", "333"]);
    expect(result.matches.map((m) => m.start)).toEqual([1, 5, 9]);
    expect(result.matches[2].end).toBe(12);
    expect(result.summary.en).toContain("3 matches");
    expect(result.summary.yue.length).toBeGreaterThan(0);
  });

  it("builds the capture table, numbered and named", () => {
    const result = runLab(pattern("(?<word>[a-z]+)-(\\d+)", { sample: "cursor-12 farm-7", flags: "" }));
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].captures).toEqual([
      { number: 1, name: "word", value: "cursor" },
      { number: 2, name: undefined, value: "12" },
    ]);
    expect(result.matches[1].captures[0].value).toBe("farm");
  });

  it("reports a group that took part in no match as null rather than dropping the row", () => {
    const result = runLab(pattern("(a)|(b)", { sample: "b", flags: "" }));
    expect(result.matches[0].captures).toEqual([
      { number: 1, name: undefined, value: null },
      { number: 2, name: undefined, value: "b" },
    ]);
  });

  it("cuts the sample into highlight runs that reassemble into the original text", () => {
    const sample = "a1 bb22 c333";
    const result = runLab(pattern("\\d+", { sample, flags: "" }));
    expect(result.segments.map((segment) => segment.text).join("")).toBe(sample);
    expect(result.segments.filter((segment) => segment.matchIndex !== null)).toHaveLength(3);
  });

  it("terminates on a zero-width match instead of looping forever", () => {
    const result = runLab(pattern("x*", { sample: "abc", flags: "" }));
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every((match) => match.value === "")).toBe(true);
    expect(result.segments.map((segment) => segment.text).join("")).toBe("abc");
  });

  it("stops at the match bound and says so", () => {
    const result = runLab(pattern("a", { sample: "a".repeat(MAX_SAMPLE_MATCHES + 20), flags: "" }));
    expect(result.matches).toHaveLength(MAX_SAMPLE_MATCHES);
    expect(result.truncated).toBe(true);
    expect(result.summary.en).toContain(`first ${MAX_SAMPLE_MATCHES}`);
  });

  it("refuses an over-long sample bilingually rather than running it", () => {
    const result = runLab(pattern("a", { sample: "a".repeat(MAX_SAMPLE_LENGTH + 1), flags: "" }));
    expect(result.matches).toEqual([]);
    expect(result.error?.en).toContain(`${MAX_SAMPLE_LENGTH}`);
    expect(result.error?.yue.length).toBeGreaterThan(0);
  });

  it("hands back a bilingual error for an invalid pattern and never throws", () => {
    const result = runLab(pattern("(unclosed", { sample: "x" }));
    expect(result.matches).toEqual([]);
    expect(result.error).not.toBeNull();
    expect(result.error?.en.length).toBeGreaterThan(0);
    expect(result.error?.yue.length).toBeGreaterThan(0);
    // The sample is still shown, unhighlighted, rather than vanishing on a typo.
    expect(result.segments.map((s) => s.text).join("")).toBe("x");
  });

  it("says what to do when there is no pattern yet, and calls that no error", () => {
    const result = runLab(createSearchState({ sample: "abc" }));
    expect(result.error).toBeNull();
    expect(result.summary.en).toContain("Enter a pattern");
  });
});

/* ─────────────────────────────────────────────────────── the plain-language explanation */

describe("advanced regex builder: the explanation line", () => {
  it("reads an anchored pattern left to right in both languages", () => {
    const said = explainPattern("^cat\\d");
    expect(said.en).toBe('Matches the very start, then the text "cat", then any digit.');
    expect(said.yue.length).toBeGreaterThan(0);
  });

  it("names a capture group, a lookahead and a lookbehind in plain words", () => {
    expect(explainPattern("(?<year>\\d)").en).toContain('a captured part named "year"');
    expect(explainPattern("(?=x)").en).toContain("only where the next part follows");
    expect(explainPattern("(?<=x)").en).toContain("came just before");
    expect(explainPattern("(?<!x)").en).toContain("did NOT come just before");
    expect(explainPattern("(?!x)").en).toContain("does NOT follow");
  });

  it("counts quantifiers, including the lazy form", () => {
    expect(explainPattern("a+").en).toContain("one or more times");
    expect(explainPattern("a{2,4}").en).toContain("between 2 and 4 times");
    expect(explainPattern("a{3}").en).toContain("exactly 3 times");
    expect(explainPattern("a{3,}").en).toContain("3 or more times");
    expect(explainPattern("a+?").en).toContain("stopping as early as it can");
  });

  it("reads a character class, negated or not", () => {
    expect(explainPattern("[a-z]").en).toContain('any one character from "a-z"');
    expect(explainPattern("[^0-9]").en).toContain('not one of "0-9"');
  });

  it("never throws, whatever it is handed", () => {
    for (const junk of ["", "(", "[", "\\", "((((", "]]]", "a".repeat(MAX_PATTERN_LENGTH + 1)]) {
      const said = explainPattern(junk);
      expect(said.en.length).toBeGreaterThan(0);
      expect(said.yue.length).toBeGreaterThan(0);
    }
  });
});

/* ───────────────────────────────────────────────────────────────── the pattern history */

describe("advanced regex builder: pattern history", () => {
  it("keeps the newest first and never grows past the bound", () => {
    let history: readonly string[] = [];
    for (let i = 0; i < PATTERN_HISTORY_LIMIT + 5; i += 1) {
      history = pushPatternHistory(history, `p${i}`);
    }
    expect(history).toHaveLength(PATTERN_HISTORY_LIMIT);
    expect(history[0]).toBe(`p${PATTERN_HISTORY_LIMIT + 4}`);
    expect(history).not.toContain("p0");
  });

  it("moves a repeat to the front instead of duplicating it", () => {
    let history = pushPatternHistory(pushPatternHistory(pushPatternHistory([], "a"), "b"), "c");
    history = pushPatternHistory(history, "a");
    expect(history).toEqual(["a", "c", "b"]);
  });

  it("ignores a blank pattern, a whitespace-only one, and a repeat of the newest", () => {
    const history = pushPatternHistory([], "a");
    expect(pushPatternHistory(history, "")).toBe(history);
    expect(pushPatternHistory(history, "   ")).toBe(history);
    expect(pushPatternHistory(history, "a")).toBe(history);
  });

  it("refuses an over-length pattern, so the bound the field enforces is the bound here", () => {
    const history = pushPatternHistory([], "a");
    expect(pushPatternHistory(history, "x".repeat(MAX_PATTERN_LENGTH + 1))).toBe(history);
  });
});

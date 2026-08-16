/**
 * Personal vocabulary: a small, local, user-supplied wording map.
 *
 * The validation rules are the ones already shipped by the documentation site,
 * moved here unchanged so the desktop application cannot drift: version 1
 * only, no unknown root fields, bounded entry count, bounded key and value
 * lengths, and outright rejection of prototype-shaped keys. A rejected
 * document never replaces a previously accepted one.
 */

export const VOCABULARY_SCHEMA_VERSION = 1;
export const MAX_VOCABULARY_BYTES = 65536;
export const MAX_VOCABULARY_ENTRIES = 200;
export const MAX_KEY_LENGTH = 80;
export const MAX_VALUE_LENGTH = 200;

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ROOT_FIELDS = new Set(["version", "replacements"]);

export type VocabularyVerdict =
  | { ok: true; replacements: Record<string, string> }
  | { ok: false; reason: string };

export type CompiledVocabulary = {
  replacements: ReadonlyMap<string, string>;
  /** Alternation source for the accepted keys, longest first, or null. */
  keySource: string | null;
};

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Validates a vocabulary document supplied as raw JSON text. */
export function validateVocabularyDocument(raw: string): VocabularyVerdict {
  if (utf8ByteLength(raw) > MAX_VOCABULARY_BYTES) {
    return { ok: false, reason: `The file exceeds the ${MAX_VOCABULARY_BYTES / 1024} KB local limit.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: "The file is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "The root must be an object." };
  }
  const record = parsed as Record<string, unknown>;
  const rootKeys = Object.keys(record);
  if (
    rootKeys.some((key) => !ROOT_FIELDS.has(key)) ||
    record.version !== VOCABULARY_SCHEMA_VERSION ||
    !record.replacements ||
    typeof record.replacements !== "object" ||
    Array.isArray(record.replacements)
  ) {
    return { ok: false, reason: "Use version 1 with one replacements object and no other fields." };
  }
  const entries = Object.entries(record.replacements as Record<string, unknown>);
  if (entries.length > MAX_VOCABULARY_ENTRIES) {
    return { ok: false, reason: `At most ${MAX_VOCABULARY_ENTRIES} replacements are allowed.` };
  }
  const replacements: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, value] of entries) {
    if (
      UNSAFE_KEYS.has(key) ||
      key.length < 1 ||
      key.length > MAX_KEY_LENGTH ||
      typeof value !== "string" ||
      value.length > MAX_VALUE_LENGTH
    ) {
      return {
        ok: false,
        reason: `Every replacement must use a safe 1-${MAX_KEY_LENGTH} character key and a string value of at most ${MAX_VALUE_LENGTH} characters.`,
      };
    }
    replacements[key] = value;
  }
  return { ok: true, replacements };
}

/** Prepares an accepted map for substitution, longest key first. */
export function compileReplacements(map: Record<string, string>): CompiledVocabulary {
  const pairs = Object.entries(map).filter(
    ([key, value]) => !UNSAFE_KEYS.has(key) && key.length > 0 && typeof value === "string",
  );
  pairs.sort((left, right) => right[0].length - left[0].length || left[0].localeCompare(right[0]));
  const replacements = new Map<string, string>(pairs);
  const keySource = pairs.length > 0 ? pairs.map(([key]) => escapeRegExp(key)).join("|") : null;
  return { replacements, keySource };
}

/**
 * Substitutes whole tokens in one pass.
 *
 * `immutableSpans` are exact substrings that must survive untouched, such as
 * official form names or an identifier shown for reference. A span always wins
 * over a replacement because it is matched in the same alternation, ahead of
 * the vocabulary keys.
 */
export function applyVocabulary(
  text: string,
  compiled: CompiledVocabulary,
  options: { immutableSpans: string[] },
): string {
  if (!compiled.keySource || !text) return text;
  const spans = options.immutableSpans
    .filter((span) => span.length > 0)
    .sort((left, right) => right.length - left.length);
  const spanSource = spans.length > 0 ? `(${spans.map(escapeRegExp).join("|")})` : "(?!)()";
  const expression = new RegExp(
    `${spanSource}|(?<![\\p{L}\\p{N}_])(${compiled.keySource})(?![\\p{L}\\p{N}_])`,
    "gu",
  );
  return text.replace(expression, (match: string, span: string | undefined, key: string | undefined) => {
    if (span !== undefined && span !== "") return match;
    if (key === undefined) return match;
    return compiled.replacements.get(key) ?? match;
  });
}

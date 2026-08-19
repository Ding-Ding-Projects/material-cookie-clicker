export interface ConverterSearchState {
  readonly query: string;
  readonly regex: boolean;
  readonly pattern: string;
  readonly flags: string;
  readonly sample: string;
  readonly builderOpen: boolean;
}

export const MAX_CONVERTER_SEARCH_LENGTH = 256;
export const MAX_CONVERTER_SAMPLE_LENGTH = 4096;

export function createConverterSearchState(): ConverterSearchState {
  return { query: '', regex: false, pattern: '', flags: 'iu', sample: '', builderOpen: false };
}

export function validateConverterPattern(pattern: string, flags: string): string | null {
  if (pattern.length > MAX_CONVERTER_SEARCH_LENGTH) return `Pattern exceeds ${MAX_CONVERTER_SEARCH_LENGTH} characters.`;
  if (!/^[imu]*$/.test(flags) || new Set(flags).size !== flags.length) return 'Supported flags are i, m, and u, without duplicates.';
  if (/\\[1-9]/.test(pattern) || /\\k</.test(pattern)) return 'Backreferences are not accepted in bounded converter searches.';
  if (/\(\?[=!<]/.test(pattern)) return 'Lookarounds are not accepted in bounded converter searches.';
  if (/\([^)]*(?:[+*?]|\{)[^)]*\)(?:[+*?]|\{)/.test(pattern) || /\([^)]*\|[^)]*\)(?:[+*?]|\{)/.test(pattern) || /(?:\.\*|\.\+){2,}/.test(pattern)) return 'Nested or ambiguous quantified groups are not accepted.';
  for (const quantifier of pattern.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
    const minimum = Number(quantifier[1]);
    const maximum = quantifier[2] === undefined || quantifier[2] === '' ? minimum : Number(quantifier[2]);
    if (minimum > 1_000 || maximum > 1_000 || maximum < minimum) return 'Numeric quantifiers must be ordered and no larger than 1000.';
  }
  let quantifiers = 0;
  let unboundedQuantifiers = 0;
  let escaped = false;
  let inClass = false;
  for (const char of pattern) {
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '[') { inClass = true; continue; }
    if (char === ']') { inClass = false; continue; }
    if (!inClass && (char === '*' || char === '+' || char === '?')) {
      quantifiers += 1;
      if (char === '*' || char === '+') unboundedQuantifiers += 1;
    }
  }
  quantifiers += [...pattern.matchAll(/\{\d+(?:,\d*)?\}/g)].length;
  if (quantifiers > 8 || unboundedQuantifiers > 2) return 'Bounded converter searches allow at most 8 quantifiers, including at most 2 unbounded quantifiers.';
  try { new RegExp(pattern, flags); return null; }
  catch (error) { return error instanceof Error ? error.message : String(error); }
}

export function compileConverterPattern(state: ConverterSearchState, global = false): RegExp | null {
  if (!state.regex || state.pattern.length === 0) return null;
  const error = validateConverterPattern(state.pattern, state.flags);
  if (error) return null;
  return new RegExp(state.pattern, `${state.flags.replaceAll('g', '')}${global ? 'g' : ''}`);
}

export function converterSearchMatches(candidate: string, state: ConverterSearchState): boolean {
  const bounded = candidate.slice(0, 128);
  if (!state.regex) return bounded.toLocaleLowerCase().includes(state.query.slice(0, MAX_CONVERTER_SEARCH_LENGTH).toLocaleLowerCase());
  if (state.pattern.length === 0) return true;
  const regex = compileConverterPattern(state);
  return regex ? regex.test(bounded) : false;
}

export interface ConverterSearchMatch {
  readonly text: string;
  readonly index: number;
  readonly captures: readonly (string | null)[];
}

export function runConverterSearchLab(state: ConverterSearchState): readonly ConverterSearchMatch[] {
  const sample = state.sample.slice(0, MAX_CONVERTER_SAMPLE_LENGTH);
  const regex = compileConverterPattern(state, true);
  if (!regex) return [];
  const matches: ConverterSearchMatch[] = [];
  for (const match of sample.matchAll(regex)) {
    matches.push({ text: match[0], index: match.index, captures: match.slice(1).map((value) => value ?? null) });
    if (matches.length >= 100) break;
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return matches;
}

export type SecuritySearchState = { query: string; regex: boolean; pattern: string; flags: string };

export function createSecuritySearchState(): SecuritySearchState {
  return { query: "", regex: false, pattern: "", flags: "i" };
}

export function securitySearchMatches(value: string, state: SecuritySearchState): boolean {
  if (!state.regex) return value.toLocaleLowerCase().includes(state.query.toLocaleLowerCase());
  if (!state.pattern || state.pattern.length > 256) return false;
  const flags = new Set<string>();
  for (const flag of state.flags) {
    if (!"dgimsuvy".includes(flag) || flags.has(flag)) return false;
    flags.add(flag);
  }
  if (flags.has("u") && flags.has("v")) return false;
  try { return new RegExp(state.pattern, state.flags.replaceAll("g", "")).test(value); } catch { return false; }
}

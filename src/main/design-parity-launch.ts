/**
 * The renderer has a deterministic design-parity route, and until this existed the main process
 * could never serve it. `loadFile` was called with no `search`, so `location.search` was always
 * empty and `resolveDesignParityRequest` returned null; and the `will-navigate` guard below refuses
 * any navigation away from the loaded URL, so a capture harness could not reach the route over CDP
 * either. The parity capture pipeline therefore had a product side that was unreachable by
 * construction, which is what blocked a real promotion run.
 *
 * This turns ONE launch argument into the query string the renderer already parses.
 *
 * It takes the whole query rather than just a row id on purpose. The renderer requires the complete
 * tuple — state, theme, width, height, scale and locale must all match its own contract exactly, or
 * `resolveDesignParityRequest` returns a `tuple-mismatch` rejection. The per-row state table and the
 * common tuple live in the renderer, and duplicating them here would create a second copy that can
 * drift from the first. So the caller passes the query and BOTH sides validate it:
 *
 *   • Here: only these six keys may appear, each value must match a conservative pattern, and any
 *     unknown key, repeated key, or oversized input rejects the whole thing. Nothing is passed
 *     through unexamined.
 *   • In the renderer: the row id must exist in its hand-written row table and every tuple field
 *     must equal its own constant, or the route renders a rejection instead of a fixture.
 *
 * The navigation guard is untouched. This decides the URL the window is loaded WITH; it does not
 * let the window navigate anywhere afterwards.
 */
export function designParitySearchFromArgv(argv: readonly string[]): string | undefined {
  const flag = '--design-parity-query=';
  const supplied = argv.find((entry) => entry.startsWith(flag));
  if (supplied === undefined) return undefined;
  const raw = supplied.slice(flag.length);
  if (raw.length === 0 || raw.length > 256) return undefined;

  const allowed: Readonly<Record<string, RegExp>> = {
    designParity: /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*$/,
    // Carried by every product route in the inventory. The renderer does not read it, but the
    // allowlist must accept it or the whole query is refused.
    panel: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    theme: /^(?:light|dark)$/,
    width: /^[0-9]{3,4}$/,
    height: /^[0-9]{3,4}$/,
    scale: /^[0-9](?:\.[0-9])?$/,
    state: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    locale: /^[a-z]{2}(?:-[A-Z]{2})?$/,
  };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }

  const seen = new Set<string>();
  for (const [key, value] of params) {
    const pattern = allowed[key];
    if (pattern === undefined) return undefined;
    if (seen.has(key)) return undefined;
    seen.add(key);
    if (!pattern.test(value)) return undefined;
  }
  if (!seen.has('designParity')) return undefined;

  return `?${params.toString()}`;
}

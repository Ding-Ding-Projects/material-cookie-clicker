/**
 * The Material 3 custom-property names shared by both surfaces.
 *
 * The values live in `tokens.css`; this module exists so code can refer to a
 * token by a checked name instead of a loose string.
 */

export const MATERIAL_TOKENS = [
  "--surface",
  "--surface-low",
  "--surface-high",
  "--surface-highest",
  "--on-surface",
  "--on-surface-variant",
  "--outline",
  "--outline-variant",
  "--primary",
  "--on-primary",
  "--primary-container",
  "--on-primary-container",
  "--error",
  "--on-error",
  "--error-container",
  "--on-error-container",
  "--density-scale",
  "--motion-scale",
  "--font-scale",
] as const;

export type TokenName = (typeof MATERIAL_TOKENS)[number];

/** Reads a token name back as a CSS `var()` reference. */
export function tokenVar(name: TokenName, fallback?: string): string {
  return fallback === undefined ? `var(${name})` : `var(${name}, ${fallback})`;
}

/** Whether a string is one of the shared token names. */
export function isTokenName(value: string): value is TokenName {
  return (MATERIAL_TOKENS as readonly string[]).includes(value);
}

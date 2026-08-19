import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const css = readFileSync(resolve(root, "src/renderer/styles/index.css"), "utf8").replace(/\r\n?/g, "\n");
const randomEventStage = readFileSync(resolve(root, "src/renderer/screens/RandomEventStage.tsx"), "utf8").replace(
  /\r\n?/g,
  "\n",
);

/**
 * Return the first balanced CSS block after an exact selector or at-rule header.
 * Counting braces keeps assertions inside the construct they name; a lazy any-character regex
 * can wander into a later rule and report a safety property that the target never had.
 */
function balancedBlock(source: string, header: string): string {
  const start = source.indexOf(header);
  expect(start, `missing exact CSS header: ${header}`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", start + header.length);
  expect(open, `missing opening brace for: ${header}`).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`unterminated CSS block: ${header}`);
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("photographed HUD regressions", () => {
  it("keeps the full Half-HP supply label and gives crowded shelves a reachable layout", () => {
    const nameContract = css.indexOf("/* A supply NAME is not expendable metadata.");
    expect(nameContract).toBeGreaterThanOrEqual(0);
    const name = balancedBlock(css.slice(nameContract), ".raid-supplies__name");
    expect(name).toMatch(/^\s*overflow:\s*visible\s*;/m);
    expect(name).toMatch(/^\s*text-overflow:\s*clip\s*;/m);
    expect(name).toMatch(/^\s*white-space:\s*normal\s*;/m);
    expect(name).not.toMatch(/^\s*text-overflow:\s*ellipsis\s*;/m);

    const baseList = balancedBlock(css, ".raid-supplies__list");
    expect(baseList).toMatch(/^\s*display:\s*flex\s*;/m);

    const wrapContract = css.indexOf("/* The supplies shelf clips its third plate");
    expect(wrapContract).toBeGreaterThanOrEqual(0);
    const wrappingList = balancedBlock(css.slice(wrapContract), ".raid-supplies__list");
    expect(wrappingList).toMatch(/^\s*flex-wrap:\s*wrap\s*;/m);

    const narrow = balancedBlock(css, "@media (max-width: 1260px)");
    const narrowList = balancedBlock(narrow, ".raid-supplies__list");
    expect(narrowList).toMatch(/^\s*flex-wrap:\s*nowrap\s*;/m);
    expect(narrowList).toMatch(/^\s*overflow-x:\s*auto\s*;/m);
  });

  it("renders the raid countdown separator as its own non-colliding grid cell", () => {
    expect(randomEventStage).toMatch(
      /<span className="event-indicator__separator" aria-hidden="true">\s*·\s*<\/span>/,
    );
    expect(randomEventStage).toMatch(/^\s*<span className="event-indicator__mice-copy">\s*$/m);

    const mice = balancedBlock(css, ".event-indicator__mice");
    expect(mice).toMatch(/^\s*display:\s*inline-grid\s*;/m);
    expect(mice).toMatch(/^\s*grid-template-columns:\s*auto minmax\(0, 1fr\)\s*;/m);
    expect(mice).toMatch(/^\s*column-gap:\s*4px\s*;/m);
    expect(mice).toMatch(/^\s*white-space:\s*nowrap\s*;/m);

    const copy = balancedBlock(css, ".event-indicator__mice-copy");
    expect(copy).toMatch(/^\s*flex-direction:\s*column\s*;/m);
  });
});

describe("Oven Dial interaction contrast", () => {
  it("keeps the hover label AA-readable against every shipped spark fill", () => {
    const hover = balancedBlock(css, ".golden-dial-card__stop:hover");
    const ink = hover.match(/^\s*color:\s*(#[0-9a-f]{6})\s*;/im)?.[1];
    expect(ink).toBe("#241400");

    for (const spark of ["#ffc94d", "#ffd97a", "#dddddd"]) {
      expect(contrast(ink!, spark), `${ink} on ${spark}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("removes dial feedback animation without changing hover colours under reduced motion", () => {
    const dialMotionContract = css.indexOf("/* Reduced motion: the cookie is STILL.");
    expect(dialMotionContract).toBeGreaterThanOrEqual(0);
    const reducedHeader = css.lastIndexOf("@media (prefers-reduced-motion: reduce)", dialMotionContract);
    expect(reducedHeader).toBeGreaterThanOrEqual(0);
    const reduced = balancedBlock(css.slice(reducedHeader), "@media (prefers-reduced-motion: reduce)");
    expect(reduced).toContain(".golden-dial-card[data-feedback='miss']");
    expect(reduced).toContain(".golden-dial-card[data-feedback='hit']");
    expect(reduced).toMatch(/^\s*animation:\s*none\s*;/m);
    expect(reduced).not.toContain(".golden-dial-card__stop:hover");
  });
});

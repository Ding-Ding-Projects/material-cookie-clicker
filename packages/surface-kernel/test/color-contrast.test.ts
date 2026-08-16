import assert from "node:assert/strict";
import test from "node:test";

import {
  contrastRatio,
  convertColor,
  formatColor,
  isOutOfGamut,
  parseColor,
  wcagVerdict,
  type ParsedColor,
} from "../src/color.ts";

function parse(input: string): ParsedColor {
  const result = parseColor(input);
  if ("error" in result) throw new Error(`${input}: ${result.error}`);
  return result;
}

test("black against white is the maximum contrast ratio", () => {
  assert.equal(Math.round(contrastRatio(parse("#000000"), parse("#ffffff"))), 21);
});

test("a colour against itself has no contrast", () => {
  assert.equal(contrastRatio(parse("#4355b9"), parse("#4355b9")), 1);
});

test("contrast is symmetric", () => {
  const forward = contrastRatio(parse("#4355b9"), parse("#ffffff"));
  const backward = contrastRatio(parse("#ffffff"), parse("#4355b9"));
  assert.equal(forward, backward);
});

test("verdicts follow the published wcag 2 thresholds", () => {
  assert.equal(wcagVerdict(21, "normal"), "AAA");
  assert.equal(wcagVerdict(7, "normal"), "AAA");
  assert.equal(wcagVerdict(4.5, "normal"), "AA");
  assert.equal(wcagVerdict(3, "normal"), "AA Large");
  assert.equal(wcagVerdict(2.9, "normal"), "Fail");
  assert.equal(wcagVerdict(4.5, "large"), "AAA");
  assert.equal(wcagVerdict(3, "large"), "AA");
  assert.equal(wcagVerdict(2.9, "large"), "Fail");
});

test("sRGB red converts to its published lab and oklch values", () => {
  assert.equal(formatColor(parse("#ff0000"), "lab"), "lab(54.291 80.805 69.891)");
  assert.equal(formatColor(parse("#ff0000"), "oklch"), "oklch(0.628 0.2577 29.2339)");
});

test("white is lightness one hundred with no chroma in lab", () => {
  // The tolerance matches the precision of the published conversion matrices.
  const lab = convertColor(parse("#ffffff"), "lab");
  assert.ok(Math.abs(lab.coords[0] - 100) < 1e-4);
  assert.ok(Math.abs(lab.coords[1]) < 1e-4);
  assert.ok(Math.abs(lab.coords[2]) < 1e-4);
});

test("hsl and hwb round-trip back to the same hexadecimal value", () => {
  const source = "#4355b9";
  assert.equal(formatColor(parse(formatColor(parse(source), "hsl")), "hex"), source);
  assert.equal(formatColor(parse(formatColor(parse(source), "hwb")), "hex"), source);
});

test("a colour outside the sRGB gamut is reported rather than clamped", () => {
  const wide = parse("oklch(0.9 0.4 150)");
  assert.equal(isOutOfGamut(wide, "rgb"), true);
  assert.equal(isOutOfGamut(wide, "oklch"), false);
  assert.equal(isOutOfGamut(parse("#4355b9"), "rgb"), false);
});

test("an unrecognized value returns a reason instead of a colour", () => {
  const result = parseColor("not a colour");
  assert.ok("error" in result);
});

test("only the documented colour keywords are accepted", () => {
  assert.equal(formatColor(parse("teal"), "hex"), "#008080");
  assert.ok("error" in parseColor("rebeccapurple"));
});

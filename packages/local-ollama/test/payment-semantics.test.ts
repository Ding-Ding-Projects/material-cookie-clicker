/**
 * The batch cart schedules local downloads and nothing else. This regression
 * fails if any commerce concept ever enters the package, in an exported symbol
 * name or in a string a person could read on screen.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as suite from "../src/index.ts";

const COMMERCE = /price|purchase|checkout|subscription|entitlement/i;
const SOURCE_DIRECTORY = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

test("no source file in the package carries commerce vocabulary", () => {
  const offenders: string[] = [];
  for (const path of sourceFiles(SOURCE_DIRECTORY)) {
    for (const [index, line] of readFileSync(path, "utf8").split("\n").entries()) {
      if (COMMERCE.test(line)) offenders.push(`${path}:${index + 1}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], "the local model suite must contain no commerce concept");
});

test("no exported symbol name carries commerce vocabulary", () => {
  const offenders = Object.keys(suite).filter((name) => COMMERCE.test(name));
  assert.deepEqual(offenders, []);
});

test("the cart states plainly that it only schedules local downloads", () => {
  assert.ok(suite.CART_DISCLOSURE.includes("only schedules local model downloads"));
  assert.ok(!COMMERCE.test(suite.CART_DISCLOSURE));
});

/**
 * An incomplete official catalog refresh must never replace the last complete
 * cache. This is the regression for a truncated listing being written over
 * good data and silently presented as the full inventory.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { refreshOfficialCatalog } from "../src/catalog.ts";
import { LocalOllamaSuiteController } from "../src/controller.ts";
import { MemoryCatalogCache, makeControllerOptions, makePageFetcher, makeSnapshot, makeVariant } from "./fakes.ts";

const LIBRARY = "https://ollama.com/library";

/** A listing page that advertises a second page the refresh is not allowed to read. */
const truncatedPages: Record<string, string> = {
  [LIBRARY]: '<a href="/library/alpha">alpha</a><a href="/library/beta">beta</a><a href="?page=2">next</a>',
  [`${LIBRARY}/alpha/tags`]: '<a href="/library/alpha:1b">alpha:1b 1.0 GB Q4_K_M</a>',
  [`${LIBRARY}/beta/tags`]: '<a href="/library/beta:1b">beta:1b 1.0 GB Q4_K_M</a>',
};

test("a truncated model listing reports incomplete and leaves the cached snapshot in place", async () => {
  const cached = makeSnapshot([makeVariant({ reference: "cached-model:1b" })], { sourceIdentity: "cached-identity" });
  const cache = new MemoryCatalogCache(cached);

  const result = await refreshOfficialCatalog(cache, {
    fetch: makePageFetcher(truncatedPages),
    maxModelPages: 1,
  });

  assert.equal(result.state, "incomplete");
  assert.equal(cache.writes, 0, "an incomplete refresh must not write the cache");
  assert.equal(result.snapshot?.sourceIdentity, "cached-identity");
  assert.deepEqual(
    result.snapshot?.variants.map((variant) => variant.reference),
    ["cached-model:1b"],
  );
  assert.ok(result.reason && result.reason.length > 0, "an incomplete refresh must explain itself");
});

test("an incomplete refresh with no cache at all yields no snapshot", async () => {
  const cache = new MemoryCatalogCache(null);

  const result = await refreshOfficialCatalog(cache, {
    fetch: makePageFetcher(truncatedPages),
    maxModelPages: 1,
  });

  assert.equal(result.state, "incomplete");
  assert.equal(result.snapshot, null);
  assert.equal(cache.writes, 0);
});

test("the suite state reports the incomplete refresh without losing the cached variants", async () => {
  const cached = makeSnapshot([makeVariant({ reference: "cached-model:1b" })], { sourceIdentity: "cached-identity" });
  const harness = makeControllerOptions({ snapshot: cached });
  const controller = new LocalOllamaSuiteController({
    ...harness.options,
    catalogRefresh: { fetch: makePageFetcher(truncatedPages), maxModelPages: 1 },
  });
  try {
    await controller.initialize();
    await controller.refreshCatalog();
    const state = controller.snapshot();
    assert.equal(state.catalog.refreshState, "incomplete");
    assert.deepEqual(
      state.catalog.variants.map((variant) => variant.reference),
      ["cached-model:1b"],
    );
    assert.equal(harness.catalogCache.writes, 0);
  } finally {
    controller.dispose();
  }
});

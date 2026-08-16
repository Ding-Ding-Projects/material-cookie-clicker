/**
 * The batch cart tells a person the storage answer before the batch starts, not
 * after several downloads have already failed. A cart that does not fit must
 * name the exact shortfall and enqueue nothing at all.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { LocalOllamaSuiteController } from "../src/controller.ts";
import { PULL_STORAGE_HEADROOM, requiredFreeBytesFor } from "../src/pull-queue.ts";
import { makeControllerOptions, makeSnapshot, makeVariant } from "./fakes.ts";

const GIGABYTE = 1_000_000_000;

const CATALOG = makeSnapshot([
  makeVariant({ reference: "alpha:7b", sizeBytes: 4 * GIGABYTE }),
  makeVariant({ reference: "beta:7b", sizeBytes: 6 * GIGABYTE }),
  makeVariant({ reference: "gamma:7b", sizeBytes: null }),
]);

test("the cart applies the same storage headroom as a single queued download", () => {
  assert.equal(PULL_STORAGE_HEADROOM, 1.15);
  assert.equal(requiredFreeBytesFor(10 * GIGABYTE), Math.ceil(10 * GIGABYTE * 1.15));
  assert.equal(requiredFreeBytesFor(null), null);
});

test("a cart larger than the free space names the shortfall and enqueues nothing", async () => {
  const freeBytes = 5 * GIGABYTE;
  const harness = makeControllerOptions({ snapshot: CATALOG, freeBytes });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.initialize();
    await controller.addToCart("alpha:7b");
    await controller.addToCart("beta:7b");

    const state = controller.snapshot();
    const required = Math.ceil(10 * GIGABYTE * PULL_STORAGE_HEADROOM);
    assert.equal(state.cart.totalBytes, 10 * GIGABYTE);
    assert.equal(state.cart.requiredFreeBytes, required);
    assert.equal(state.cart.freeBytes, freeBytes);
    assert.equal(state.cart.blockers.length, 1);
    assert.match(state.cart.blockers[0]!, new RegExp(`short by ${required - freeBytes} bytes`));

    await controller.commitCart();

    assert.deepEqual(harness.pullStore.added, [], "a blocked cart must not enqueue anything");
    assert.deepEqual(controller.snapshot().cart.references, ["alpha:7b", "beta:7b"], "the reviewed cart is kept for correction");
    assert.deepEqual(harness.bridge.pullCalls, []);
  } finally {
    controller.dispose();
  }
});

test("a cart that fits enqueues every reviewed download in one pass", async () => {
  const harness = makeControllerOptions({ snapshot: CATALOG, freeBytes: 400 * GIGABYTE });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.initialize();
    await controller.addToCart("alpha:7b");
    await controller.addToCart("beta:7b");

    assert.deepEqual(controller.snapshot().cart.blockers, []);

    await controller.commitCart();

    assert.deepEqual(harness.pullStore.added.map((item) => item.reference), ["alpha:7b", "beta:7b"]);
    assert.deepEqual(
      harness.pullStore.added.map((item) => item.requiredFreeBytes),
      [Math.ceil(4 * GIGABYTE * PULL_STORAGE_HEADROOM), Math.ceil(6 * GIGABYTE * PULL_STORAGE_HEADROOM)],
    );
    assert.deepEqual(controller.snapshot().cart.references, []);
  } finally {
    controller.dispose();
  }
});

test("a variant with no reported size blocks the cart instead of being downloaded blind", async () => {
  const harness = makeControllerOptions({ snapshot: CATALOG, freeBytes: 400 * GIGABYTE });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.initialize();
    await controller.addToCart("gamma:7b");

    const state = controller.snapshot();
    assert.equal(state.cart.totalBytes, null);
    assert.equal(state.cart.requiredFreeBytes, null);
    assert.match(state.cart.blockers[0]!, /did not report a size for gamma:7b/);

    await controller.commitCart();
    assert.deepEqual(harness.pullStore.added, []);
  } finally {
    controller.dispose();
  }
});

test("a reference outside the verified catalog cannot enter the cart", async () => {
  const harness = makeControllerOptions({ snapshot: CATALOG, freeBytes: 400 * GIGABYTE });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.initialize();
    await assert.rejects(controller.addToCart("typed-in-model:7b"), /verified official catalog/);
    assert.deepEqual(controller.snapshot().cart.references, []);
  } finally {
    controller.dispose();
  }
});

test("removing and clearing the cart re-runs the preflight", async () => {
  const harness = makeControllerOptions({ snapshot: CATALOG, freeBytes: 5 * GIGABYTE });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.initialize();
    await controller.addToCart("alpha:7b");
    await controller.addToCart("beta:7b");
    assert.equal(controller.snapshot().cart.blockers.length, 1);

    await controller.removeFromCart("beta:7b");
    assert.deepEqual(controller.snapshot().cart.blockers, []);
    assert.equal(controller.snapshot().cart.totalBytes, 4 * GIGABYTE);

    await controller.clearCart();
    const cleared = controller.snapshot().cart;
    assert.deepEqual(cleared.references, []);
    assert.equal(cleared.totalBytes, null);
    assert.equal(cleared.freeBytes, null);
    assert.deepEqual(cleared.blockers, []);
  } finally {
    controller.dispose();
  }
});

test("the cart states its own scope where the batch decision is made", async () => {
  const harness = makeControllerOptions({ snapshot: CATALOG });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.initialize();
    const disclosure = controller.snapshot().cart.disclosure;
    assert.match(disclosure, /only schedules local model downloads/);
    assert.doesNotMatch(disclosure, /price|purchase|checkout|subscription|entitlement/i);
  } finally {
    controller.dispose();
  }
});

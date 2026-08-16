/**
 * Every choice in the suite is an enumeration built from data that was actually
 * collected, and every empty enumeration names the action that can fill it.
 * This regression fails if a freeform dead end, a dead facet control, or an
 * online-only troubleshooting instruction returns.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { LocalOllamaSuiteController } from "../src/controller.ts";
import { RUNTIME_HEALTH_VALUES } from "../src/view-model.ts";
import { makeControllerOptions, makeModel, makeSnapshot, makeVariant } from "./fakes.ts";

const EXECUTABLE = { id: "vscode", displayName: "Detected local editor", absolutePath: "/opt/example/bin/editor" };

const CATALOG = makeSnapshot([
  makeVariant({ reference: "alpha:7b", capabilities: ["vision"], quantization: "Q4_K_M" }),
  makeVariant({ reference: "alpha:13b", capabilities: ["tools"], quantization: "Q8_0" }),
  makeVariant({ reference: "beta:7b", capabilities: ["vision", "tools"], quantization: "Q4_K_M" }),
]);

test("harness executables are an enumeration, and an empty result is an explicit state with a next action", async () => {
  const harness = makeControllerOptions({ harnessRuntime: { executables: [] } });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    assert.equal(controller.snapshot().harness.executablesState, "unchecked");
    assert.equal(controller.snapshot().harness.executableRecovery?.actionId, "refresh-harness-executables");

    await controller.refreshHarnessExecutables();

    const state = controller.snapshot();
    assert.equal(state.harness.executablesState, "none-detected");
    assert.deepEqual(state.harness.executables, []);
    assert.equal(state.harness.selectedExecutableId, null);
    assert.match(state.harness.executableRecovery?.message ?? "", /No allowed executable was detected on this computer/);
    assert.ok((state.harness.executableRecovery?.actionLabel ?? "").length > 0, "the next action must be named");
  } finally {
    controller.dispose();
  }
});

test("a detected executable becomes a selectable value and a typed identifier is refused", async () => {
  const harness = makeControllerOptions({ harnessRuntime: { executables: [EXECUTABLE] } });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.refreshHarnessExecutables();
    const state = controller.snapshot();
    assert.equal(state.harness.executablesState, "detected");
    assert.deepEqual(state.harness.executables.map((item) => item.id), ["vscode"]);
    assert.equal(state.harness.selectedExecutableId, "vscode");
    assert.equal(state.harness.executableRecovery, null);

    assert.throws(() => controller.selectHarnessExecutable("typed-in-program"), /detected on this computer/);
    await assert.rejects(
      controller.previewHarness({
        profileId: state.harness.profiles[0]!.id,
        executableId: "typed-in-program",
        workingDirectory: "/projects/example",
        model: "alpha:7b",
      }),
      /detected on this computer/,
    );
  } finally {
    controller.dispose();
  }
});

test("chat and harness model choices are enumerated from the installed models", async () => {
  const harness = makeControllerOptions({
    bridge: { installed: [makeModel("alpha:7b", ["vision"]), makeModel("beta:7b")] },
  });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.refreshRuntime();
    const state = controller.snapshot();
    assert.deepEqual(state.chat.selectableModels.map((model) => model.reference), ["alpha:7b", "beta:7b"]);
    assert.deepEqual(state.harness.selectableModels.map((model) => model.reference), ["alpha:7b", "beta:7b"]);
    assert.equal(state.chat.modelRecovery, null);
    assert.throws(() => controller.selectChatModel("not-installed:7b"), /installed local models/);
    assert.throws(() => controller.selectHarnessModel("not-installed:7b"), /installed local models/);
  } finally {
    controller.dispose();
  }
});

test("an empty installed list names the recovery action instead of leaving a blank field", async () => {
  const harness = makeControllerOptions({ bridge: { installed: [] } });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.refreshRuntime();
    const state = controller.snapshot();
    assert.deepEqual(state.chat.selectableModels, []);
    assert.equal(state.chat.modelRecovery?.actionId, "open-model-store");
    assert.ok((state.chat.modelRecovery?.message ?? "").length > 0);
    assert.equal(state.harness.modelRecovery?.actionId, "open-model-store");
  } finally {
    controller.dispose();
  }
});

test("an unavailable runtime points the model recovery at a recheck rather than the store", async () => {
  const harness = makeControllerOptions({
    bridge: {
      probe: {
        health: "missing-or-stopped",
        version: null,
        message: "The local API is unreachable.",
        nextAction: "Install or start the local service, then recheck.",
        failingChecks: [],
      },
    },
  });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.refreshRuntime();
    assert.equal(controller.snapshot().chat.modelRecovery?.actionId, "refresh-runtime");
  } finally {
    controller.dispose();
  }
});

test("catalog facets are derived from the cached snapshot and actually narrow the visible variants", async () => {
  const harness = makeControllerOptions({ snapshot: CATALOG });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.initialize();

    let state = controller.snapshot();
    assert.deepEqual(state.catalog.facets.families, ["alpha", "beta"]);
    assert.deepEqual(state.catalog.facets.capabilities, ["tools", "vision"]);
    assert.deepEqual(state.catalog.facets.quantizations, ["Q4_K_M", "Q8_0"]);
    assert.equal(state.catalog.visibleVariants.length, 3);

    controller.setCatalogFacets({ families: ["alpha"] });
    state = controller.snapshot();
    assert.deepEqual(state.catalog.visibleVariants.map((variant) => variant.reference), ["alpha:7b", "alpha:13b"]);

    controller.setCatalogFacets({ families: [], capabilities: ["vision"], quantizations: ["Q4_K_M"] });
    state = controller.snapshot();
    assert.deepEqual(state.catalog.visibleVariants.map((variant) => variant.reference), ["alpha:7b", "beta:7b"]);

    controller.setCatalogFacets({ capabilities: ["not-a-real-capability"] });
    state = controller.snapshot();
    assert.deepEqual(state.catalog.selectedFacets.capabilities, [], "a facet outside the derived values is discarded");
  } finally {
    controller.dispose();
  }
});

test("each search scope filters its own collection through the shared engine", async () => {
  const harness = makeControllerOptions({
    snapshot: CATALOG,
    bridge: { installed: [makeModel("alpha:7b"), makeModel("beta:7b")] },
  });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.initialize();

    controller.setSearch("catalog", { regex: true, pattern: "^alpha:", flags: "i" });
    controller.setSearch("installed", { query: "beta" });

    const state = controller.snapshot();
    assert.deepEqual(state.catalog.visibleVariants.map((variant) => variant.reference), ["alpha:7b", "alpha:13b"]);
    assert.deepEqual(state.visibleInstalled.map((model) => model.reference), ["beta:7b"]);
    assert.equal(state.catalog.searchStatus.error, null);
    assert.equal(state.catalog.searchStatus.visibleCount, 2);
    assert.equal(state.catalog.searchStatus.totalCount, 3);

    controller.setSearch("catalog", { pattern: "alpha(" });
    const broken = controller.snapshot();
    assert.ok(broken.catalog.searchStatus.error, "an invalid pattern must be reported, not thrown");
    assert.deepEqual(broken.catalog.visibleVariants, []);
  } finally {
    controller.dispose();
  }
});

test("the troubleshooter has one offline branch per runtime condition and links to nothing online", () => {
  const harness = makeControllerOptions();
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    const branches = controller.snapshot().troubleshooter.branches;
    assert.deepEqual(branches.map((branch) => branch.health), [...RUNTIME_HEALTH_VALUES]);
    for (const branch of branches) {
      assert.ok(branch.title.length > 0);
      assert.ok(branch.summary.length > 0);
      assert.ok(branch.offlineNextStep.length > 0, `${branch.health} must carry an offline next step`);
      assert.ok(branch.recheckLabel.length > 0, `${branch.health} must offer a recheck`);
      assert.doesNotMatch(
        `${branch.title} ${branch.summary} ${branch.offlineNextStep}`,
        /https?:\/\//,
        `${branch.health} must not send a person to online documentation`,
      );
    }
    assert.equal(branches.filter((branch) => branch.active).length, 1);
  } finally {
    controller.dispose();
  }
});

test("the active troubleshooter branch carries the named failing checks", async () => {
  const harness = makeControllerOptions({
    bridge: {
      probe: {
        health: "unhealthy",
        version: "0.0.0-test",
        message: "version: connection refused",
        nextAction: "Correct the reported local API failure, then recheck.",
        failingChecks: ["version: connection refused", "runningModels: connection refused"],
      },
    },
  });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.refreshRuntime();
    const branches = controller.snapshot().troubleshooter.branches;
    const active = branches.find((branch) => branch.active);
    assert.equal(active?.health, "unhealthy");
    assert.deepEqual(active?.failingChecks, ["version: connection refused", "runningModels: connection refused"]);
    for (const branch of branches.filter((candidate) => !candidate.active)) {
      assert.deepEqual(branch.failingChecks, [], "an inactive branch must not claim failures it did not observe");
    }
  } finally {
    controller.dispose();
  }
});

test("harness snapshots are restored by identifier, never by a caller-supplied payload", async () => {
  const harness = makeControllerOptions({ harnessRuntime: { executables: [EXECUTABLE] } });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await harness.snapshotStore.create("local-openai-compatible-client");
    await controller.refreshHarnessSnapshots();

    const state = controller.snapshot();
    assert.deepEqual(state.harness.snapshots.map((entry) => entry.id), ["snapshot-1"]);
    assert.ok(!JSON.stringify(state.harness.snapshots).includes("opaque configuration payload"));

    await assert.rejects(controller.restoreHarnessSnapshot("not-a-listed-snapshot"), /listed harness snapshots/);
    assert.deepEqual(harness.snapshotStore.restored, []);

    await controller.restoreHarnessSnapshot("snapshot-1");
    assert.deepEqual(harness.snapshotStore.restored, ["snapshot-1"]);
    assert.match(controller.snapshot().harness.restoreStatus ?? "", /was restored/);
  } finally {
    controller.dispose();
  }
});

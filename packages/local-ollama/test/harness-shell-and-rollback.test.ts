/**
 * Harness launch is application-owned orchestration with a fixed argument
 * array. This regression covers the three ways that boundary could quietly
 * erode: a shell creeping back in, an unapproved environment key reaching the
 * process, and a failed readiness check leaving a half-started harness behind.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  AllowlistedHarnessManager,
  PREBUILT_HARNESS_PROFILES,
  type HarnessLaunchSelection,
} from "../src/harness.ts";
import { FakeHarnessRuntime, FakeSnapshotStore } from "./fakes.ts";

const PROFILE = PREBUILT_HARNESS_PROFILES[0]!;

const EXECUTABLE = {
  id: PROFILE.allowedExecutableIds[0]!,
  displayName: "Detected local editor",
  absolutePath: "/opt/example/bin/editor",
};

function selection(overrides: Partial<HarnessLaunchSelection> = {}): HarnessLaunchSelection {
  return {
    profileId: PROFILE.id,
    executableId: EXECUTABLE.id,
    model: "example:7b",
    workingDirectory: "/projects/example",
    environment: { OLLAMA_HOST: "http://127.0.0.1:11434", OLLAMA_MODEL: "example:7b" },
    ...overrides,
  };
}

test("launch always spawns without a shell and with the reviewed argument array", async () => {
  const runtime = new FakeHarnessRuntime({ executables: [EXECUTABLE] });
  const snapshots = new FakeSnapshotStore();
  const manager = new AllowlistedHarnessManager(runtime, snapshots);

  const result = await manager.launch(selection());

  assert.equal(result.processId, 4242);
  assert.equal(runtime.lastLaunch?.useShell, false);
  assert.deepEqual(runtime.lastLaunch?.arguments, ["/projects/example"]);
  assert.equal(runtime.lastLaunch?.executablePath, EXECUTABLE.absolutePath);
});

test("an environment key outside the profile allowlist blocks the launch and is stripped", async () => {
  const runtime = new FakeHarnessRuntime({ executables: [EXECUTABLE] });
  const snapshots = new FakeSnapshotStore();
  const manager = new AllowlistedHarnessManager(runtime, snapshots);
  const withForbiddenKey = selection({
    environment: { OLLAMA_HOST: "http://127.0.0.1:11434", UNAPPROVED_KEY: "value" },
  });

  const preview = await manager.preview(withForbiddenKey);
  assert.ok(
    preview.blockers.some((blocker) => blocker.includes("UNAPPROVED_KEY")),
    "the unapproved key must be named as a blocker",
  );
  assert.ok(!preview.environmentKeys.includes("OLLAMA_MODEL"));

  await assert.rejects(manager.launch(withForbiddenKey), /UNAPPROVED_KEY/);
  assert.ok(!runtime.calls.includes("launch"), "a blocked selection must never reach the process launcher");
});

test("only allowlisted environment keys reach the launched process, and never their values elsewhere", async () => {
  const runtime = new FakeHarnessRuntime({ executables: [EXECUTABLE] });
  const snapshots = new FakeSnapshotStore();
  const manager = new AllowlistedHarnessManager(runtime, snapshots);

  const preview = await manager.preview(selection());
  await manager.launch(selection());

  assert.deepEqual(Object.keys(runtime.lastLaunch?.environment ?? {}).sort(), ["OLLAMA_HOST", "OLLAMA_MODEL"]);
  assert.deepEqual(preview.environmentKeys, ["OLLAMA_HOST", "OLLAMA_MODEL"]);
  assert.ok(
    !JSON.stringify(preview).includes("127.0.0.1:11434"),
    "the preview exposes environment key names only, never their values",
  );
});

test("a failed readiness check stops the process, restores the snapshot, and rethrows", async () => {
  const runtime = new FakeHarnessRuntime({ executables: [EXECUTABLE], readyFails: true });
  const snapshots = new FakeSnapshotStore();
  const manager = new AllowlistedHarnessManager(runtime, snapshots);

  await assert.rejects(manager.launch(selection()), /pre-launch snapshot was restored/);

  assert.deepEqual(runtime.calls, ["listExecutables", "launch", "waitUntilReady", "stop"]);
  assert.deepEqual(snapshots.calls, ["create", "restore"]);
  assert.deepEqual(snapshots.restored, ["snapshot-1"]);
});

test("an executable outside the profile allowlist is refused before any process work", async () => {
  const runtime = new FakeHarnessRuntime({
    executables: [{ id: "unapproved-program", displayName: "Unapproved", absolutePath: "/opt/other/bin/program" }],
  });
  const snapshots = new FakeSnapshotStore();
  const manager = new AllowlistedHarnessManager(runtime, snapshots);

  await assert.rejects(manager.launch(selection({ executableId: "unapproved-program" })), /detected executable allowed/);
  assert.ok(!runtime.calls.includes("launch"));
  assert.deepEqual(snapshots.calls, []);
});

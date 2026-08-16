/**
 * The hardware-fit verdict is evidence, not a promise. When a required
 * measurement is missing the verdict must fall back to "Unknown" and must never
 * be reported as a confident "Runs well".
 */

import assert from "node:assert/strict";
import test from "node:test";

import { assessHardwareFit, type HardwareEvidence, type ModelFitEvidence } from "../src/hardware-fit.ts";

const COMPLETE_HARDWARE: HardwareEvidence = {
  collectedAt: "2026-01-01T00:00:00.000Z",
  architecture: "x64",
  systemRamBytes: 32 * 1024 ** 3,
  availableRamBytes: 24 * 1024 ** 3,
  gpuModel: "test accelerator",
  usableVramBytes: 16 * 1024 ** 3,
  driverBackend: "test backend",
  driverSupported: true,
  destinationFreeBytes: 400 * 1024 ** 3,
};

const COMPLETE_MODEL: ModelFitEvidence = {
  reference: "example:7b",
  blobSizeBytes: 4 * 1024 ** 3,
  parameterCount: 7e9,
  quantization: "Q4_K_M",
  contextLength: 4096,
  contextBytesPerToken: 128,
};

test("missing available RAM yields Unknown rather than a confident verdict", () => {
  const assessment = assessHardwareFit(
    { ...COMPLETE_HARDWARE, availableRamBytes: null },
    COMPLETE_MODEL,
    new Date("2026-01-01T00:00:00.000Z"),
  );

  assert.equal(assessment.verdict, "Unknown");
  assert.notEqual(assessment.verdict, "Runs well");
  assert.ok(
    assessment.reasons.some((reason) => reason.includes("Available system RAM was not measured.")),
    "the missing measurement must be named in the reasons",
  );
});

test("missing free destination storage also yields Unknown", () => {
  const assessment = assessHardwareFit(
    { ...COMPLETE_HARDWARE, destinationFreeBytes: null },
    COMPLETE_MODEL,
    new Date("2026-01-01T00:00:00.000Z"),
  );

  assert.equal(assessment.verdict, "Unknown");
  assert.ok(assessment.reasons.some((reason) => reason.includes("Free destination storage was not measured.")));
});

test("a missing model blob size yields Unknown even with complete hardware evidence", () => {
  const assessment = assessHardwareFit(
    COMPLETE_HARDWARE,
    { ...COMPLETE_MODEL, blobSizeBytes: null },
    new Date("2026-01-01T00:00:00.000Z"),
  );

  assert.equal(assessment.verdict, "Unknown");
  assert.equal(assessment.estimatedRamBytes, null);
  assert.equal(assessment.estimatedAdditionalDiskBytes, null);
});

test("complete evidence still produces a conservative verdict with stated assumptions", () => {
  const assessment = assessHardwareFit(COMPLETE_HARDWARE, COMPLETE_MODEL, new Date("2026-01-01T00:00:00.000Z"));

  assert.equal(assessment.verdict, "Runs well");
  assert.ok(assessment.assumptions.length >= 3, "the assumptions behind the estimate must be stated");
  assert.ok(
    assessment.assumptions.some((assumption) => assumption.includes("not a guarantee")),
    "the verdict must not be presented as a guarantee",
  );
});

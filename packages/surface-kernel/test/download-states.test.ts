import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_MANIFEST_PHASE,
  createDownloadState,
  downloadFraction,
  reduceDownloadState,
} from "../src/download-states.ts";

// Synthetic transfer only. No release asset exists in this repository, and no
// transfer is performed by this test.
const initial = createDownloadState({ assetName: "example-package", version: "0.0.0" });

test("a new transfer starts in the start phase with nothing measured", () => {
  assert.equal(initial.phase, "start");
  assert.equal(initial.byteCount, 0);
  assert.equal(initial.measuredHash, null);
  assert.equal(initial.unsigned, true);
});

test("the reducer refuses to complete without a measured byte count", () => {
  const downloading = reduceDownloadState(initial, { type: "begin", byteTotal: null });
  const finished = reduceDownloadState(downloading, { type: "finish", byteCount: 0, measuredHash: null });
  assert.equal(finished.phase, "failed");
  assert.match(finished.reason ?? "", /no measured bytes/);
});

test("a complete phase always carries the measured byte count", () => {
  const downloading = reduceDownloadState(initial, { type: "begin", byteTotal: 100 });
  const progressed = reduceDownloadState(downloading, { type: "progress", byteCount: 50 });
  const finished = reduceDownloadState(progressed, { type: "finish", byteCount: 100, measuredHash: null });
  assert.equal(finished.phase, "complete");
  assert.equal(finished.byteCount, 100);
});

test("a measured size that disagrees with the published size fails", () => {
  const downloading = reduceDownloadState(initial, { type: "begin", byteTotal: 100 });
  const finished = reduceDownloadState(downloading, { type: "finish", byteCount: 90, measuredHash: null });
  assert.equal(finished.phase, "failed");
});

test("a measured hash that disagrees with the published hash fails", () => {
  const state = createDownloadState({
    assetName: "example-package",
    version: "0.0.0",
    publishedHash: "0000000000000000000000000000000000000000000000000000000000000000",
  });
  const downloading = reduceDownloadState(state, { type: "begin", byteTotal: 10 });
  const finished = reduceDownloadState(downloading, {
    type: "finish",
    byteCount: 10,
    measuredHash: "1111111111111111111111111111111111111111111111111111111111111111",
  });
  assert.equal(finished.phase, "failed");
  assert.match(finished.reason ?? "", /hash/);
});

test("progress cannot move backwards or exceed the published size", () => {
  const downloading = reduceDownloadState(initial, { type: "begin", byteTotal: 100 });
  const progressed = reduceDownloadState(downloading, { type: "progress", byteCount: 60 });
  assert.equal(reduceDownloadState(progressed, { type: "progress", byteCount: 10 }).phase, "failed");
  assert.equal(reduceDownloadState(progressed, { type: "progress", byteCount: 120 }).phase, "failed");
});

test("a transfer cannot complete without having started", () => {
  const finished = reduceDownloadState(initial, { type: "finish", byteCount: 10, measuredHash: null });
  assert.equal(finished.phase, "start");
});

test("the unsigned flag stays literally true through every transition", () => {
  const downloading = reduceDownloadState(initial, { type: "begin", byteTotal: 10 });
  const finished = reduceDownloadState(downloading, { type: "finish", byteCount: 10, measuredHash: null });
  const failed = reduceDownloadState(downloading, { type: "fail", reason: "The connection closed." });
  assert.equal(downloading.unsigned, true);
  assert.equal(finished.unsigned, true);
  assert.equal(failed.unsigned, true);
});

test("progress is only a fraction when the total size is known", () => {
  const unknown = reduceDownloadState(initial, { type: "begin", byteTotal: null });
  assert.equal(downloadFraction(unknown), null);
  const known = reduceDownloadState(initial, { type: "begin", byteTotal: 200 });
  assert.equal(downloadFraction(reduceDownloadState(known, { type: "progress", byteCount: 50 })), 0.25);
});

test("an empty release manifest is a separate label, not a transfer phase", () => {
  assert.equal(EMPTY_MANIFEST_PHASE, "unavailable");
  assert.notEqual(initial.phase, EMPTY_MANIFEST_PHASE);
});

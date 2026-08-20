import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  canCheckForUpdates,
  INITIAL_UPDATE_STATUS,
  nextUpdateStatus,
  squirrelFeedUrl,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
  UPDATE_REPOSITORY,
  verificationSquirrelFeedUrl,
  type UpdateStatus,
} from "../../src/shared/game/updates";
import { UPDATE_IPC_CHANNELS } from "../../src/shared/game/ipc-contracts";
import { updateNoticeViewModel, dismissalKey, UNNAMED_VERSION_KEY } from "../../src/renderer/game/update-notice";

describe("squirrel feed url", () => {
  it("is the release asset directory for the project repository", () => {
    expect(squirrelFeedUrl()).toBe(
      "https://github.com/Ding-Ding-Projects/material-cookie-clicker/releases/latest/download/",
    );
  });

  it("ends in a slash, because Squirrel joins RELEASES and the package name onto it", () => {
    expect(squirrelFeedUrl().endsWith("/")).toBe(true);
  });

  it("is https and points at github.com, never a mirror", () => {
    const url = new URL(squirrelFeedUrl());
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("github.com");
  });

  it("is the same address package.json gives electron-builder to publish to", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(pkg.build.publish.url).toBe(squirrelFeedUrl());
  });

  it("refuses anything that is not an owner/name pair", () => {
    for (const bad of ["", "no-slash", "https://evil.example/x", "owner/name/extra", "/name", "owner/"]) {
      expect(() => squirrelFeedUrl(bad)).toThrow();
    }
  });

  it("names the project repository", () => {
    expect(UPDATE_REPOSITORY).toBe("Ding-Ding-Projects/material-cookie-clicker");
  });

  it("keeps the deterministic feed override behind one explicit verification boundary", () => {
    expect(verificationSquirrelFeedUrl(undefined, "https://updates.example.test/pair/")).toBeNull();
    expect(verificationSquirrelFeedUrl("0", "https://updates.example.test/pair/")).toBeNull();
    expect(verificationSquirrelFeedUrl("1", "https://updates.example.test/pair/")).toBe(
      "https://updates.example.test/pair/",
    );
  });

  it("refuses credentialed, unbounded, and mutable latest verification feeds", () => {
    for (const bad of [
      "http://updates.example.test/pair/",
      "https://user:secret@updates.example.test/pair/",
      "https://updates.example.test/pair/?candidate=1",
      "https://updates.example.test/pair/#candidate",
      "https://updates.example.test/pair",
      "https://github.com/Ding-Ding-Projects/material-cookie-clicker/releases/latest/download/",
    ]) {
      expect(() => verificationSquirrelFeedUrl("1", bad)).toThrow();
    }
  });
});

describe("update check schedule", () => {
  it("waits before the first check and then polls roughly every four hours", () => {
    expect(UPDATE_FIRST_CHECK_DELAY_MS).toBeGreaterThanOrEqual(30_000);
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(4 * 60 * 60 * 1_000);
  });
});

describe("update status machine", () => {
  it("starts idle", () => {
    expect(INITIAL_UPDATE_STATUS).toEqual({ kind: "idle" });
  });

  it("walks idle → checking → downloading → ready", () => {
    let status: UpdateStatus = INITIAL_UPDATE_STATUS;
    status = nextUpdateStatus(status, { kind: "check-started" });
    expect(status.kind).toBe("checking");
    status = nextUpdateStatus(status, { kind: "downloading" });
    expect(status.kind).toBe("downloading");
    status = nextUpdateStatus(status, { kind: "downloaded", version: "0.3.0" });
    expect(status).toEqual({ kind: "ready", version: "0.3.0" });
  });

  it("records a check that found nothing, with the time it happened", () => {
    const status = nextUpdateStatus({ kind: "checking" }, { kind: "no-update", checkedAt: "2026-08-17T00:00:00.000Z" });
    expect(status).toEqual({ kind: "up-to-date", checkedAt: "2026-08-17T00:00:00.000Z" });
  });

  it("keeps a ready package ready through later failures and quiet checks", () => {
    const ready: UpdateStatus = { kind: "ready", version: "0.3.0" };
    expect(nextUpdateStatus(ready, { kind: "failed", message: "offline" })).toBe(ready);
    expect(nextUpdateStatus(ready, { kind: "no-update", checkedAt: "2026-08-17T04:00:00.000Z" })).toBe(ready);
    expect(nextUpdateStatus(ready, { kind: "check-started" })).toBe(ready);
  });

  it("never moves out of unsupported — a process with no updater cannot grow one", () => {
    const unsupported: UpdateStatus = { kind: "unsupported", reason: "development checkout" };
    expect(nextUpdateStatus(unsupported, { kind: "check-started" })).toBe(unsupported);
    expect(nextUpdateStatus(unsupported, { kind: "downloaded", version: "0.3.0" })).toBe(unsupported);
  });

  it("carries the real failure message rather than a generic one", () => {
    const status = nextUpdateStatus({ kind: "checking" }, { kind: "failed", message: "getaddrinfo ENOTFOUND" });
    expect(status).toEqual({ kind: "error", message: "getaddrinfo ENOTFOUND" });
  });

  it("allows a new check only when one is not in flight and nothing is already waiting", () => {
    expect(canCheckForUpdates({ kind: "idle" })).toBe(true);
    expect(canCheckForUpdates({ kind: "up-to-date", checkedAt: "x" })).toBe(true);
    expect(canCheckForUpdates({ kind: "error", message: "x" })).toBe(true);
    expect(canCheckForUpdates({ kind: "checking" })).toBe(false);
    expect(canCheckForUpdates({ kind: "downloading" })).toBe(false);
    expect(canCheckForUpdates({ kind: "ready", version: null })).toBe(false);
    expect(canCheckForUpdates({ kind: "unsupported", reason: "x" })).toBe(false);
  });
});

describe("update ipc channels", () => {
  it("are namespaced like the rest of the channels", () => {
    expect(UPDATE_IPC_CHANNELS).toEqual({
      status: "update:status",
      requestStatus: "update:request-status",
      restart: "update:restart",
    });
  });
});

describe("update notice view model", () => {
  it("renders nothing at all until a package is downloaded", () => {
    const quiet: UpdateStatus[] = [
      { kind: "idle" },
      { kind: "checking" },
      { kind: "downloading" },
      { kind: "up-to-date", checkedAt: "2026-08-17T00:00:00.000Z" },
      { kind: "error", message: "offline" },
      { kind: "unsupported", reason: "development checkout" },
    ];
    for (const status of quiet) expect(updateNoticeViewModel(status)).toBeNull();
  });

  it("says restart to install, and always carries the unsigned warning", () => {
    const model = updateNoticeViewModel({ kind: "ready", version: null });
    expect(model).not.toBeNull();
    expect(model!.title.en).toBe("Update ready — restart to install");
    expect(model!.title.yue).toContain("重新啟動");
    expect(model!.warning.en).toContain("unsigned");
    expect(model!.warning.yue).toContain("冇簽署");
    expect(model!.version).toBeNull();
  });

  it("never claims more than was checked", () => {
    const model = updateNoticeViewModel({ kind: "ready", version: "0.3.0" })!;
    expect(model.warning.en).toContain("nothing proves who built it");
    expect(model.warning.en).not.toMatch(/\bverified\b/i);
    expect(model.title.en).not.toMatch(/\b(safe|verified|trusted)\b/i);
  });

  it("prints the version the feed reported, and only when it reported one", () => {
    expect(updateNoticeViewModel({ kind: "ready", version: "0.3.0" })!.title.en).toBe(
      "Update ready (0.3.0) — restart to install",
    );
    expect(updateNoticeViewModel({ kind: "ready", version: null })!.title.en).not.toContain("(");
  });

  it("hides after Later, for that package only", () => {
    const ready: UpdateStatus = { kind: "ready", version: "0.3.0" };
    expect(updateNoticeViewModel(ready, dismissalKey(ready))).toBeNull();
    expect(updateNoticeViewModel({ kind: "ready", version: "0.4.0" }, dismissalKey(ready))).not.toBeNull();
  });

  it("can dismiss a package the feed did not name", () => {
    const ready: UpdateStatus = { kind: "ready", version: null };
    expect(dismissalKey(ready)).toBe(UNNAMED_VERSION_KEY);
    expect(updateNoticeViewModel(ready, dismissalKey(ready))).toBeNull();
  });

  it("has no price, no cost and no purchase in it — updates are plumbing, not a control", () => {
    const model = updateNoticeViewModel({ kind: "ready", version: "0.3.0" })!;
    const text = [model.title, model.warning, model.restartLabel, model.laterLabel]
      .map((line) => `${line.en} ${line.yue}`)
      .join(" ");
    expect(text).not.toMatch(/cookie|price|cost|buy|曲奇|價/i);
  });

  it("gives no dismissal key for a status that shows nothing", () => {
    expect(dismissalKey({ kind: "checking" })).toBeNull();
  });
});

/**
 * THE UPDATE MECHANISM, described in one place both processes can read.
 *
 * The release pipeline (.github/workflows/release.yml) publishes an unsigned Squirrel.Windows
 * set on every GitHub release: `MaterialCookieClicker-Setup.exe`, the full `.nupkg`, and the
 * `RELEASES` index that names that package and carries its SHA1. `package.json` already points
 * electron-builder's generic publish provider at the release asset directory, and this module
 * builds the SAME address for the running application, so the installed game reads the feed the
 * pipeline writes rather than a second guess at where the files went.
 *
 * WHAT IS ACTUALLY VERIFIED. Squirrel.Windows — the updater embedded in the installed
 * application, driven here through Electron's `autoUpdater` — downloads `RELEASES`, picks the
 * newest entry, downloads that `.nupkg` and checks the package bytes against the SHA1 recorded
 * for it in `RELEASES`. A package that does not hash to its RELEASES entry is rejected and never
 * applied. That is a real integrity check and it is the one this application relies on; it is
 * deliberately NOT re-implemented here, because a second hash computed by the same process that
 * already trusted the download would prove nothing extra.
 *
 * WHAT IS NOT VERIFIED, ever. `RELEASES` itself is fetched over HTTPS and is unsigned. HTTPS
 * proves the bytes came from github.com unmodified in transit; it does not prove who put them
 * there, and there is no code-signing certificate anywhere in this project (ROADMAP.md: code
 * signing is permanently prohibited). So the chain is: trust github.com and this repository's
 * release process, then trust Squirrel's hash check against the index you just trusted. An
 * update is therefore "consistent with the feed", never "verified as authentic", and the notice
 * the player sees says exactly that rather than the comfortable version.
 */

/** The repository whose GitHub releases this application updates from. */
export const UPDATE_REPOSITORY = "Ding-Ding-Projects/material-cookie-clicker";

/**
 * The Squirrel.Windows feed address: the directory holding `RELEASES`, the full `.nupkg` and
 * `Setup.exe` for the newest published release.
 *
 * GitHub's `/releases/latest/download/<asset>` route resolves per asset name against whatever
 * the latest release is, which is what makes a fixed directory URL work as a rolling feed —
 * Squirrel appends `RELEASES` and then the package filename it read from there. The trailing
 * slash is part of the contract: Squirrel joins the file name onto this string.
 *
 * It is the same address `package.json` gives electron-builder's `publish.url`, on purpose. If
 * the two ever disagree, the installed application would be reading a feed nobody publishes to.
 */
export function squirrelFeedUrl(repository: string = UPDATE_REPOSITORY): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repository)) {
    throw new Error(`Not an owner/name GitHub repository: ${repository}`);
  }
  return `https://github.com/${repository}/releases/latest/download/`;
}

/**
 * How long after startup the first check waits.
 *
 * Long enough that a launch never competes with the game coming up, and the check itself runs in
 * the main process where it cannot touch a frame of gameplay either way.
 */
export const UPDATE_FIRST_CHECK_DELAY_MS = 45_000;

/** Roughly four hours between checks, per the owner's instruction. */
export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000;

/**
 * What the main process knows about updates right now. One value, pushed to the renderer
 * whenever it changes; the renderer never polls and never decides.
 *
 * `unsupported` is the honest answer for a development checkout or a copy that was never
 * installed by Squirrel: there is no update mechanism in that process at all, so it says so and
 * shows nothing, rather than inventing a checking/up-to-date state that never happened.
 */
export type UpdateStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "checking" }
  | { readonly kind: "up-to-date"; readonly checkedAt: string }
  | { readonly kind: "downloading" }
  | { readonly kind: "ready"; readonly version: string | null }
  | { readonly kind: "error"; readonly message: string };

export type UpdateEvent =
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "check-started" }
  | { readonly kind: "no-update"; readonly checkedAt: string }
  | { readonly kind: "downloading" }
  | { readonly kind: "downloaded"; readonly version: string | null }
  | { readonly kind: "failed"; readonly message: string };

export const INITIAL_UPDATE_STATUS: UpdateStatus = { kind: "idle" };

/**
 * The status state machine, pure and exported so it can be tested without an Electron process.
 *
 * Two rules carry all the interesting behaviour:
 *
 *   - `ready` is terminal until the application restarts. A downloaded package stays downloaded;
 *     a later failed check, or the next four-hourly poll finding nothing new, must not wipe the
 *     "restart to install" notice out from under a player who has not restarted yet.
 *   - `unsupported` is terminal too. A process with no Squirrel updater attached cannot start
 *     checking later, so nothing may move it back into a state that implies it did.
 */
export function nextUpdateStatus(current: UpdateStatus, event: UpdateEvent): UpdateStatus {
  if (current.kind === "ready") return current;
  if (current.kind === "unsupported") return current;
  switch (event.kind) {
    case "unsupported":
      return { kind: "unsupported", reason: event.reason };
    case "check-started":
      return { kind: "checking" };
    case "no-update":
      return { kind: "up-to-date", checkedAt: event.checkedAt };
    case "downloading":
      return { kind: "downloading" };
    case "downloaded":
      return { kind: "ready", version: event.version };
    case "failed":
      return { kind: "error", message: event.message };
  }
}

/** True when a new check may be started — i.e. one is not already in flight and the answer is
 *  not already "restart to install" or "this build has no updater". */
export function canCheckForUpdates(status: UpdateStatus): boolean {
  return status.kind === "idle" || status.kind === "up-to-date" || status.kind === "error";
}

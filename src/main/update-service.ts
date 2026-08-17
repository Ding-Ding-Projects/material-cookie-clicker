import { app, autoUpdater } from 'electron';

import {
  canCheckForUpdates,
  INITIAL_UPDATE_STATUS,
  nextUpdateStatus,
  squirrelFeedUrl,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
  type UpdateEvent,
  type UpdateStatus,
} from '../shared/game/updates.js';

/**
 * The main process's half of automatic updates.
 *
 * It owns exactly one thing: an `UpdateStatus`, moved by the pure state machine in
 * `src/shared/game/updates.ts` and published to whoever is listening. Everything Electron- and
 * Squirrel-shaped is here; everything decidable is there, where tests can reach it.
 *
 * NOTHING IN HERE BLOCKS THE GAME. The checks run in the main process on timers, the download is
 * Squirrel's own background download, and the only renderer-visible consequence is a status
 * push. A failed check is a logged line and an `error` status; it is never a dialog, never a
 * modal, and never a reason the window does not open.
 *
 * THE UNPACKAGED CASE IS ANSWERED HONESTLY. `electron .` from a checkout has no Squirrel updater
 * behind `autoUpdater` at all — `setFeedURL` there either throws or silently attaches to
 * nothing. So the service checks `app.isPackaged` (and the platform) first and, when there is no
 * updater, logs one line and publishes `unsupported`. It does not fake a check, and it does not
 * fake an up-to-date answer, because neither happened.
 */
export class UpdateService {
  private status: UpdateStatus = INITIAL_UPDATE_STATUS;
  private readonly listeners = new Set<(status: UpdateStatus) => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private started = false;

  constructor(private readonly feedUrl: string = squirrelFeedUrl()) {}

  /** The status as last published. The renderer asks for this on mount. */
  get current(): UpdateStatus {
    return this.status;
  }

  onStatus(listener: (status: UpdateStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Attaches to Squirrel and schedules the checks: one a while after startup, then roughly every
   * four hours. Safe to call once; a second call is ignored.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    const unsupported = this.describeUnsupported();
    if (unsupported) {
      console.log(`Material Cookie Clicker updates: no updater in this process — ${unsupported}`);
      this.apply({ kind: 'unsupported', reason: unsupported });
      return;
    }

    try {
      autoUpdater.setFeedURL({ url: this.feedUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Material Cookie Clicker updates: feed URL rejected — ${message}`);
      this.apply({ kind: 'unsupported', reason: `the Squirrel feed could not be attached (${message})` });
      return;
    }
    console.log(`Material Cookie Clicker updates: feed ${this.feedUrl}`);

    autoUpdater.on('checking-for-update', () => this.apply({ kind: 'check-started' }));
    autoUpdater.on('update-not-available', () =>
      this.apply({ kind: 'no-update', checkedAt: new Date().toISOString() }),
    );
    autoUpdater.on('update-available', () => this.apply({ kind: 'downloading' }));
    // Squirrel has already downloaded the package named in RELEASES and checked its bytes
    // against the SHA1 recorded there before this fires. `releaseName` is whatever the feed
    // called it, which may be nothing — it is displayed as-is or not at all, never guessed at.
    autoUpdater.on('update-downloaded', (_event, _notes, releaseName) => {
      const version = typeof releaseName === 'string' && releaseName.trim() !== '' ? releaseName.trim() : null;
      this.apply({ kind: 'downloaded', version });
    });
    autoUpdater.on('error', (error: Error) => {
      console.error(`Material Cookie Clicker updates: check failed — ${error.message}`);
      this.apply({ kind: 'failed', message: error.message });
    });

    this.timers.push(setTimeout(() => this.check(), UPDATE_FIRST_CHECK_DELAY_MS));
    this.timers.push(setInterval(() => this.check(), UPDATE_CHECK_INTERVAL_MS) as unknown as ReturnType<typeof setTimeout>);
  }

  /** Quits and installs the package Squirrel downloaded. A no-op unless one is actually ready. */
  restartAndInstall(): void {
    if (this.status.kind !== 'ready') return;
    autoUpdater.quitAndInstall();
  }

  /** Stops the timers. Called on quit so a shutting-down process is not still polling. */
  stop(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
      clearInterval(timer as unknown as ReturnType<typeof setInterval>);
    }
    this.timers = [];
  }

  private check(): void {
    if (!canCheckForUpdates(this.status)) return;
    try {
      autoUpdater.checkForUpdates();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Material Cookie Clicker updates: check could not start — ${message}`);
      this.apply({ kind: 'failed', message });
    }
  }

  /** Why this process has no updater, or null when it has one. */
  private describeUnsupported(): string | null {
    if (process.platform !== 'win32') {
      return `updates ship as a Squirrel.Windows package and this is ${process.platform}`;
    }
    if (!app.isPackaged) {
      return 'this is an unpackaged development checkout, not a Squirrel installation';
    }
    return null;
  }

  private apply(event: UpdateEvent): void {
    const next = nextUpdateStatus(this.status, event);
    if (next === this.status) return;
    this.status = next;
    for (const listener of this.listeners) listener(next);
  }
}

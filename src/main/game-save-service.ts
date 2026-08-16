import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { decodeSave, encodeSave } from "../shared/game/save-codec.js";
import type { GameState } from "../shared/game/types.js";

const SAVE_FILE_NAME = "material-cookie-clicker-save.json";

export type GameSaveLoadOutcome = "ok" | "not-found" | "quarantined";

export interface GameSaveLoadResult {
  readonly outcome: GameSaveLoadOutcome;
  readonly state: GameState | null;
  /** Absolute path to the preserved bad file, set only when outcome is "quarantined". */
  readonly quarantinedPath: string | null;
  readonly detail: string | null;
}

/**
 * Owns the on-disk save file for one save directory (normally
 * `app.getPath('userData')`, injected by the caller so this class stays unit-testable
 * without an Electron runtime).
 *
 * Contract:
 *   - `save()` writes atomically: the full payload lands in a temp file first, then a single
 *     `rename` swaps it into place. A crash or power loss between those two steps leaves either
 *     the previous good save or the new one, never a half-written file — `rename` is atomic on
 *     both POSIX (rename(2)) and Windows (Node's fs.rename uses MoveFileExW with
 *     MOVEFILE_REPLACE_EXISTING).
 *   - `load()` NEVER throws on bad data and NEVER silently discards it: a save that fails to
 *     parse as JSON, or that fails `decodeSave`'s schema/migration validation, is copied beside
 *     the good path as `<file>.corrupt-<iso>.json` before the caller is told to start fresh.
 */
export class GameSaveService {
  readonly #dir: string;
  readonly #filePath: string;

  constructor(saveDirectory: string) {
    this.#dir = saveDirectory;
    this.#filePath = path.join(saveDirectory, SAVE_FILE_NAME);
  }

  get filePath(): string {
    return this.#filePath;
  }

  async load(): Promise<GameSaveLoadResult> {
    let raw: string;
    try {
      raw = await readFile(this.#filePath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        return { outcome: "not-found", state: null, quarantinedPath: null, detail: null };
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const quarantinedPath = await this.#quarantine(raw);
      return {
        outcome: "quarantined",
        state: null,
        quarantinedPath,
        detail: `Save file was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const decoded = decodeSave(parsed);
    if (decoded.ok) {
      return { outcome: "ok", state: decoded.state, quarantinedPath: null, detail: null };
    }

    const quarantinedPath = await this.#quarantine(raw);
    const detail =
      decoded.reason === "future-version"
        ? `Save was written by a newer version of the app (schema ${decoded.foundVersion}; this build supports up to ${decoded.maxSupportedVersion}).`
        : decoded.detail;
    return { outcome: "quarantined", state: null, quarantinedPath, detail };
  }

  async save(state: GameState): Promise<void> {
    await mkdir(this.#dir, { recursive: true });
    const payload = `${JSON.stringify(encodeSave(state), null, 2)}\n`;
    const tempPath = path.join(this.#dir, `${SAVE_FILE_NAME}.tmp-${randomUUID()}`);
    await writeFile(tempPath, payload, "utf8");
    await rename(tempPath, this.#filePath);
  }

  async wipe(): Promise<void> {
    await rm(this.#filePath, { force: true });
  }

  async #quarantine(raw: string): Promise<string> {
    await mkdir(this.#dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const quarantinePath = path.join(this.#dir, `${SAVE_FILE_NAME}.corrupt-${stamp}.json`);
    await writeFile(quarantinePath, raw, "utf8");
    return quarantinePath;
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

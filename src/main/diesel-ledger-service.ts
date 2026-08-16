import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  appendVoucher,
  createEmptyLedger,
  DIESEL_LEDGER_DIR_SEGMENTS,
  DIESEL_LEDGER_FILE_NAME,
  parseLedger,
  serializeLedger,
  type DieselVoucher,
  type DieselVoucherLedger,
} from "../shared/game/diesel-exchange.js";

/**
 * The main process's half of the diesel exchange: the only code in this application allowed to
 * touch the shared ledger file. The renderer reaches it exclusively through the preload bridge
 * and the two `diesel:*` IPC channels (see main.ts), so no window script ever holds `fs`.
 *
 * The application-data directory is INJECTED rather than read from Electron here, for the same
 * reason GameSaveService takes its save directory: this class stays unit-testable without an
 * Electron runtime, and main.ts remains the single place that calls `app.getPath('appData')`.
 *
 * Two operations exist and no more: MINT (append one voucher) and READ (return the ledger).
 * There is deliberately no method that sets `consumedAt` — consuming a voucher is WinForge's
 * side of the contract, and a cookie-side "mark consumed" would let this application claim a
 * delivery it cannot possibly have made.
 */
export class DieselLedgerService {
  readonly #dir: string;
  readonly #filePath: string;
  readonly #now: () => number;

  constructor(appDataDirectory: string, now: () => number = () => Date.now()) {
    this.#dir = path.join(appDataDirectory, ...DIESEL_LEDGER_DIR_SEGMENTS);
    this.#filePath = path.join(this.#dir, DIESEL_LEDGER_FILE_NAME);
    this.#now = now;
  }

  get filePath(): string {
    return this.#filePath;
  }

  /**
   * Reads the ledger. A missing file is an empty ledger, not an error — the other application
   * may simply not have run yet. A file that exists but does not parse is NOT overwritten and
   * NOT silently replaced: the failure is returned so the caller can say so out loud.
   */
  async read(): Promise<{ ok: true; ledger: DieselVoucherLedger } | { ok: false; reason: string }> {
    let raw: string;
    try {
      raw = await readFile(this.#filePath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) return { ok: true, ledger: createEmptyLedger() };
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      return { ok: false, reason: `Ledger is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
    }

    const result = parseLedger(parsedJson);
    if (result.ok) return { ok: true, ledger: result.ledger };
    return {
      ok: false,
      reason:
        result.reason === "future-version"
          ? `Ledger was written to schema version ${result.foundVersion}, newer than this build understands.`
          : result.detail,
    };
  }

  /**
   * Appends one voucher and writes the whole file atomically (temp file, then a single rename —
   * the same guarantee GameSaveService gives the save file). The read-append-write is done
   * fresh each time rather than from a cached copy, so a `consumedAt` WinForge wrote a second
   * ago survives this mint instead of being clobbered by stale state.
   *
   * `mintedAt` comes from THIS process's clock, never from the renderer's — the contract says
   * the minting process stamps the voucher, and a timestamp handed in over IPC would be one
   * more thing a window could get wrong.
   */
  async mint(litres: number, cookiesSpent: string): Promise<{ ok: true; voucher: DieselVoucher } | { ok: false; reason: string }> {
    if (!Number.isInteger(litres) || litres <= 0) {
      return { ok: false, reason: "litres must be a positive whole number." };
    }
    if (typeof cookiesSpent !== "string" || cookiesSpent.length === 0) {
      return { ok: false, reason: "cookiesSpent must be a non-empty string." };
    }

    const existing = await this.read();
    if (!existing.ok) return { ok: false, reason: existing.reason };

    const voucher: DieselVoucher = {
      id: randomUUID(),
      mintedAt: new Date(this.#now()).toISOString(),
      litres,
      cookiesSpent,
      consumedAt: null,
    };

    const next = appendVoucher(existing.ledger, voucher);

    try {
      await mkdir(this.#dir, { recursive: true });
      const tempPath = path.join(this.#dir, `${DIESEL_LEDGER_FILE_NAME}.tmp-${randomUUID()}`);
      await writeFile(tempPath, serializeLedger(next), "utf8");
      await rename(tempPath, this.#filePath);
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }

    return { ok: true, voucher };
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

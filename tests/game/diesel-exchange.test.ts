import { mkdtemp, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { bnFromNumber, bnToNumber } from "../../src/shared/game/big-number";
import { computeDisclosure } from "../../src/shared/game/disclosure";
import {
  appendVoucher,
  cookiesSpentString,
  createEmptyLedger,
  DIESEL_LEDGER_DIR_SEGMENTS,
  DIESEL_LEDGER_FILE_NAME,
  parseLedger,
  serializeLedger,
  summarizeLedger,
  type DieselVoucher,
} from "../../src/shared/game/diesel-exchange";
import { DieselLedgerService } from "../../src/main/diesel-ledger-service";
import { applyGameAction, type ReducerCtx } from "../../src/shared/game/reducer";
import { decodeSave, encodeSave } from "../../src/shared/game/save-codec";
import { fixedRng, freshState } from "./test-helpers";

function ctxAt(epochMs = 0): ReducerCtx {
  return { now: () => epochMs, rng: fixedRng(0.5) };
}

/** A state with the Fuel Contract already bought, which is what reveals the depot and factory. */
function depotState(cookies: number) {
  return freshState({
    cookies: bnFromNumber(cookies),
    upgrades: [
      { id: "reveal_shop_sign", purchasedAtTickCount: 0 },
      { id: "reveal_fuel_contract", purchasedAtTickCount: 0 },
    ],
  });
}

/** The same, with diesel already in the tanks — the only thing that makes a shipment possible. */
function stockedState(cookies: number, litres: number, invested = 0) {
  const base = depotState(cookies);
  return {
    ...base,
    dieselFactory: {
      ...base.dieselFactory,
      litres,
      lifetimeLitres: litres,
      cookiesInvested: bnFromNumber(invested),
    },
  };
}

function voucher(overrides: Partial<DieselVoucher> = {}): DieselVoucher {
  return {
    id: "v1",
    mintedAt: "2026-01-01T00:00:00.000Z",
    litres: 1,
    cookiesSpent: "1000",
    consumedAt: null,
    ...overrides,
  };
}

describe("diesel depot: shipping through the one reducer seam", () => {
  it("draws the litres DOWN from the tanks and takes no cookies at all", () => {
    const before = stockedState(5000, 4, 12_000);
    const after = applyGameAction(before, { type: "mintDiesel", litres: 3 }, ctxAt());

    // The counter is a withdrawal, not a till: the cookie balance is untouched.
    expect(bnToNumber(after.cookies)).toBeCloseTo(5000, 6);
    expect(after.dieselFactory.litres).toBeCloseTo(1, 9);
    expect(after.dieselDepot.litresMinted).toBe(3);
    expect(after.dieselDepot.vouchersMinted).toBe(1);
  });

  it("writes the amortized share of what the plant cost, not a price paid at the counter", () => {
    // 12,000 cookies built a factory that has made four litres, so three of them carry 9,000.
    const after = applyGameAction(stockedState(5000, 4, 12_000), { type: "mintDiesel", litres: 3 }, ctxAt());
    expect(bnToNumber(after.dieselDepot.cookiesSpent)).toBeCloseTo(9_000, 3);
  });

  it("refuses a shipment the tanks cannot cover, however many cookies the player has", () => {
    const before = stockedState(1e12, 2);
    const after = applyGameAction(before, { type: "mintDiesel", litres: 3 }, ctxAt());
    expect(after).toBe(before);
  });

  it("refuses a shipment from an empty tank, changing nothing at all", () => {
    const before = depotState(1e12);
    const after = applyGameAction(before, { type: "mintDiesel", litres: 1 }, ctxAt());
    expect(after).toBe(before);
  });

  it("refuses a mint before the Fuel Contract reveal is bought", () => {
    const before = freshState({ cookies: bnFromNumber(1_000_000) });
    expect(computeDisclosure(before).dieselDepot).toBe(false);

    const after = applyGameAction(before, { type: "mintDiesel", litres: 1 }, ctxAt());
    expect(after).toBe(before);
    expect(after.dieselDepot.litresMinted).toBe(0);
  });

  it("reveals the depot the moment the Fuel Contract is bought, and not before", () => {
    const before = freshState({
      cookies: bnFromNumber(500),
      upgrades: [{ id: "reveal_shop_sign", purchasedAtTickCount: 0 }],
    });
    expect(computeDisclosure(before).dieselDepot).toBe(false);

    const after = applyGameAction(before, { type: "buyUpgrade", upgradeId: "reveal_fuel_contract" }, ctxAt());
    expect(computeDisclosure(after).dieselDepot).toBe(true);
    // A reveal buys a surface, never a number: the depot's own totals are untouched.
    expect(after.dieselDepot).toEqual(before.dieselDepot);
  });

  it("refuses zero, negative and fractional litres", () => {
    const before = stockedState(1_000_000, 50);
    for (const litres of [0, -3, 0.4]) {
      expect(applyGameAction(before, { type: "mintDiesel", litres }, ctxAt())).toBe(before);
    }
  });

  it("survives a save round trip with its totals intact", () => {
    const shipped = applyGameAction(stockedState(5000, 4, 12_000), { type: "mintDiesel", litres: 1 }, ctxAt());
    const decoded = decodeSave(encodeSave(shipped));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state.dieselDepot.litresMinted).toBe(1);
    expect(bnToNumber(decoded.state.dieselDepot.cookiesSpent)).toBeCloseTo(3_000, 3);
    expect(decoded.state.dieselFactory.litres).toBeCloseTo(3, 9);
  });
});

describe("diesel exchange: the ledger format", () => {
  it("appends without touching what is already there", () => {
    const first = appendVoucher(createEmptyLedger(), voucher({ id: "a" }));
    const second = appendVoucher(first, voucher({ id: "b", litres: 3 }));

    expect(second.vouchers.map((v) => v.id)).toEqual(["a", "b"]);
    expect(first.vouchers).toHaveLength(1);
  });

  it("keeps a consumedAt that WinForge already wrote", () => {
    const consumed = voucher({ id: "a", consumedAt: "2026-02-02T10:00:00.000Z" });
    const next = appendVoucher({ schemaVersion: 1, vouchers: [consumed] }, voucher({ id: "b" }));
    expect(next.vouchers[0]?.consumedAt).toBe("2026-02-02T10:00:00.000Z");
  });

  it("refuses a duplicate id rather than overwriting an entry", () => {
    const first = appendVoucher(createEmptyLedger(), voucher({ id: "a" }));
    expect(() => appendVoucher(first, voucher({ id: "a" }))).toThrow(RangeError);
  });

  it("round-trips through serialize and parse", () => {
    const ledger = appendVoucher(createEmptyLedger(), voucher({ id: "a", litres: 2, cookiesSpent: "2150" }));
    const parsed = parseLedger(JSON.parse(serializeLedger(ledger)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.ledger).toEqual(ledger);
  });

  it("serializes to indented JSON ending in a newline", () => {
    const text = serializeLedger(createEmptyLedger());
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('"schemaVersion": 1');
  });

  it("refuses malformed entries and a future schema version, without throwing", () => {
    expect(parseLedger(null)).toMatchObject({ ok: false, reason: "malformed" });
    expect(parseLedger({ schemaVersion: 1 })).toMatchObject({ ok: false, reason: "malformed" });
    expect(parseLedger({ schemaVersion: 99, vouchers: [] })).toMatchObject({ ok: false, reason: "future-version" });
    expect(parseLedger({ schemaVersion: 1, vouchers: [voucher({ litres: 0 })] })).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

  it("summarizes only what the file actually says about consumption", () => {
    const ledger = {
      schemaVersion: 1,
      vouchers: [voucher({ id: "a", litres: 2 }), voucher({ id: "b", litres: 5, consumedAt: "2026-03-03T00:00:00.000Z" })],
    };
    expect(summarizeLedger(ledger)).toEqual({ voucherCount: 2, totalLitres: 7, consumedCount: 1 });
  });

  it("writes cookie amounts as plain digits while they fit, and scientific notation beyond", () => {
    expect(cookiesSpentString(bnFromNumber(1000))).toBe("1000");
    expect(cookiesSpentString(bnFromNumber(1.15e20))).toMatch(/e20$/);
  });
});

describe("diesel exchange: the main-process ledger writer", () => {
  async function service() {
    const appData = await mkdtemp(path.join(tmpdir(), "diesel-appdata-"));
    return { appData, ledger: new DieselLedgerService(appData, () => Date.parse("2026-01-01T12:00:00.000Z")) };
  }

  it("puts the ledger at the agreed path below the application-data directory", async () => {
    const { appData, ledger } = await service();
    expect(ledger.filePath).toBe(path.join(appData, ...DIESEL_LEDGER_DIR_SEGMENTS, DIESEL_LEDGER_FILE_NAME));
  });

  it("reads a missing file as an empty ledger rather than an error", async () => {
    const { ledger } = await service();
    const result = await ledger.read();
    expect(result).toEqual({ ok: true, ledger: createEmptyLedger() });
  });

  it("mints a voucher stamped from the main process clock, and leaves no temp file behind", async () => {
    const { ledger } = await service();
    const minted = await ledger.mint(2, "2150");
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;

    expect(minted.voucher.mintedAt).toBe("2026-01-01T12:00:00.000Z");
    expect(minted.voucher.litres).toBe(2);
    expect(minted.voucher.consumedAt).toBeNull();

    // The atomic write is temp-then-rename; once it has landed, the directory holds the ledger
    // and nothing else. A stray .tmp- file would mean a write that never completed its rename.
    const entries = await readdir(path.dirname(ledger.filePath));
    expect(entries).toEqual([DIESEL_LEDGER_FILE_NAME]);

    const onDisk = JSON.parse(await readFile(ledger.filePath, "utf8"));
    expect(onDisk.vouchers).toHaveLength(1);
  });

  it("appends to a ledger another application wrote, preserving its consumedAt", async () => {
    const { ledger } = await service();
    await mkdir(path.dirname(ledger.filePath), { recursive: true });
    await writeFile(
      ledger.filePath,
      serializeLedger({ schemaVersion: 1, vouchers: [voucher({ id: "winforge", consumedAt: "2026-01-01T09:00:00.000Z" })] }),
      "utf8",
    );

    const minted = await ledger.mint(1, "1000");
    expect(minted.ok).toBe(true);

    const read = await ledger.read();
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.ledger.vouchers).toHaveLength(2);
    expect(read.ledger.vouchers[0]?.consumedAt).toBe("2026-01-01T09:00:00.000Z");
    expect(read.ledger.vouchers[1]?.consumedAt).toBeNull();
  });

  it("refuses to write over a ledger it cannot understand", async () => {
    const { ledger } = await service();
    await mkdir(path.dirname(ledger.filePath), { recursive: true });
    await writeFile(ledger.filePath, "{ this is not json", "utf8");

    const minted = await ledger.mint(1, "1000");
    expect(minted.ok).toBe(false);
    expect(await readFile(ledger.filePath, "utf8")).toBe("{ this is not json");
  });

  it("refuses nonsense quantities", async () => {
    const { ledger } = await service();
    expect(await ledger.mint(0, "1000")).toMatchObject({ ok: false });
    expect(await ledger.mint(1.5, "1000")).toMatchObject({ ok: false });
    expect(await ledger.mint(1, "")).toMatchObject({ ok: false });
  });
});

import { bnCompare, bnFromNumber, bnToNumber, type BigNum } from "./big-number.js";
import type { GameState } from "./types.js";

/**
 * THE CONTROL ECONOMY.
 *
 * Every generator, upgrade, tool and factory part in this game is bought. This module extends
 * that same rule to the CONTROLS — the settings entries, the window chrome, the search fields,
 * the buy-quantity stepper, the bulk toolbar and the two feature toggles. The owner's decree, in
 * their own words, was "every setting must be bought to unlock too", "and every button must be
 * bought", "even dragging the window or minimize and maximize each have to be bought",
 * "resizing the app needs to be purchased", and "every feature with 'upgrades'".
 *
 * So a control is a shelf item like anything else: it has an id, a printed cookie price, and —
 * where a second rung is a real convenience rather than an invented one — an upgrade LADDER
 * above it. Nothing here unlocks itself. Nothing here is granted by play. There is no condition
 * to meet: the player presses the control, sees the price, and pays it.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY *NOT* IN THIS REGISTRY (the floors)
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * Three things are never sold, and `tests/game/control-unlocks.test.ts` asserts each one by
 * looking for it in this table and failing if it appears:
 *
 *   1. CLOSE. The window's close button always works. A player must never have to earn the
 *      right to quit an application, and a build that could trap someone inside itself is not a
 *      joke, it is a defect.
 *   2. THE SETTINGS SURFACE. The Settings emblem and its dialog are free and always present.
 *      The settings INSIDE it are bought — that is the joke — but the room they live in is the
 *      one place a player can read the price list, so locking the door would make the whole
 *      economy undiscoverable.
 *   3. THE CONTROLS CATALOGUE AND ITS OWN SEARCH FIELD. The catalogue inside Settings lists
 *      every entry below with its price, and its search box filters that list. Charging for the
 *      ability to find out what things cost would be a circular lock.
 *
 * And one behavioural floor that is not a table entry at all: an unbought control does NOT
 * disappear. It renders in place as a coin-slot plate with its literal price on it and buys
 * itself when pressed. Discoverability is the entire point — a locked control that vanished
 * would just look like a missing feature. Every control that IS unlocked keeps exactly the
 * keyboard access and screen-reader semantics it always had; buying something never makes it
 * worse than it was.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * THE PRICE TABLE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * Prices are in cookies, flat (no cost curve — a control is bought once, so there is no second
 * unit for a curve to price). They are shaped in three bands:
 *
 *   • 10 – 75      window chrome. The cheapest things in the game, because the first minute of
 *                  a fresh save is spent clicking a cookie in a window that cannot be moved,
 *                  and that minute has to end quickly.
 *   • 35 – 200     settings entries and the first rung of each search field. Reachable inside
 *                  the first few dozen clicks.
 *   • 240 – 6,000  conveniences: the regex builder, the token palette, the ×100 and Max
 *                  steppers, the bulk toolbar, auto-ship. These are worth real cookies because
 *                  each one is a genuine multiplier on how fast the rest of the game goes.
 *
 * Within one ladder the prices are strictly increasing, which the registry-integrity test
 * enforces, so a later rung is never cheaper than the rung it depends on.
 *
 *   GROUP     CONTROL                    RUNG                          PRICE
 *   chrome    Drag the window            unlock (marquee plate drags)      10
 *                                        upgrade: the whole bar drags     240
 *   chrome    Minimize                   unlock                            30
 *   chrome    Maximize / restore         unlock                            45
 *                                        upgrade: double-click the bar    320
 *   chrome    Resize the window          unlock                            75
 *   settings  Language mode              unlock                            60
 *   settings  English funny slider       unlock                            35
 *   settings  Cantonese funny slider     unlock                            35
 *   search    Generator search           unlock (plain text)               50
 *                                        upgrade: regex builder gear      400
 *                                        upgrade: flags + token palette 1,500
 *   search    Upgrade search             the same three rungs, same prices
 *   search    Achievement search         the same three rungs, same prices
 *   search    Tool search                the same three rungs, same prices
 *   stepper   Buy-quantity stepper       ×1 is FREE and always was
 *                                        unlock: ×10                      120
 *                                        upgrade: ×100                    900
 *                                        upgrade: Max                   6,000
 *   bulk      Bulk selection             unlock (row checkboxes)          200
 *                                        upgrade: the bulk-buy toolbar  1,200
 *   toggle    Tool progression switch    unlock                           300
 *   toggle    Factory auto-ship switch   unlock                         2,500
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * THE MIGRATION POLICY, STATED PLAINLY BECAUSE IT IS A REAL COMPROMISE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * Read `MIGRATION_GRANT_LIFETIME_THRESHOLD` below and the note attached to it. The short
 * version: a save from before this feature existed, with more than one thousand lifetime
 * cookies, is handed every rung in this table for free. A fresh save, and any save that never
 * got past a thousand lifetime cookies, buys all of it.
 */

/** The coarse grouping the Settings catalogue renders as sections. */
export type ControlGroup = "chrome" | "settings" | "search" | "stepper" | "bulk" | "toggle";

/** One rung of one control's ladder. Rung index 0 is the unlock; anything above it is an upgrade. */
export interface ControlRungDefinition {
  /** Globally unique across the whole registry — this is what a save stores and a button buys. */
  readonly id: string;
  readonly nameEn: string;
  readonly nameYue: string;
  /** What buying this rung actually does, in one line, in both languages. */
  readonly detailEn: string;
  readonly detailYue: string;
  /** Flat cookie price. Strictly greater than the rung below it. */
  readonly price: number;
}

export interface ControlUnlockDefinition {
  readonly id: string;
  readonly group: ControlGroup;
  readonly nameEn: string;
  readonly nameYue: string;
  /** Where in the application this control lives, so the catalogue can say where to find it. */
  readonly whereEn: string;
  readonly whereYue: string;
  /** At least one. Ordered cheapest first; index 0 is the unlock. */
  readonly rungs: readonly ControlRungDefinition[];
}

/** The save subtree. One flat list of bought rung ids — order is irrelevant, membership is all. */
export interface ControlUnlocksState {
  readonly purchasedRungIds: readonly string[];
}

export function createInitialControlUnlocksState(): ControlUnlocksState {
  return { purchasedRungIds: [] };
}

/** The three search-field rungs, which are identical in shape and price on every surface. */
function searchRungs(surfaceId: string, surfaceEn: string, surfaceYue: string): ControlRungDefinition[] {
  return [
    {
      id: `search.${surfaceId}`,
      nameEn: "Plain-text search",
      nameYue: "純文字搜尋",
      detailEn: `Puts the search field on the ${surfaceEn} list and filters it as you type.`,
      detailYue: `喺${surfaceYue}加返個搜尋欄，一路打一路篩。`,
      price: 50,
    },
    {
      id: `search.${surfaceId}.builder`,
      nameEn: "Regex builder gear",
      nameYue: "規則運算式齒輪",
      detailEn: "Adds the gear beside the field and the popover behind it, with regex mode.",
      detailYue: "喺搜尋欄邊加返個齒輪同彈出面板，仲有規則運算式模式。",
      price: 400,
    },
    {
      id: `search.${surfaceId}.tokens`,
      nameEn: "Flags and token palette",
      nameYue: "旗標同符號盤",
      detailEn: "Unlocks the i/m/u flag toggles and the one-press token buttons in the popover.",
      detailYue: "解鎖 i/m/u 旗標開關同彈出面板入面嘅一按插入符號掣。",
      price: 1_500,
    },
  ];
}

/**
 * THE REGISTRY. Every purchasable control in the application, in catalogue order.
 *
 * Adding an entry here is the whole job of selling a new control: the catalogue, the coin-slot
 * plates, the reducer's purchase arithmetic and the integrity tests all read this table and
 * nothing else.
 *
 * WHAT THIS TABLE DELIBERATELY DOES NOT SELL, since new panels keep arriving and the question
 * comes up every time: a shelf's own Buy button, and the tab strip that picks which shelf you
 * are looking at. Those are not controls in the sense this economy means — they ARE the
 * purchase, and charging cookies for the button that spends cookies is a circular lock of the
 * same shape as charging for the catalogue's search box. The shop rail's Buy button, the
 * factory's equipment buttons and the home's blueprint, build and furniture buttons are all
 * free for that one reason, and it applies to all of them equally rather than exempting any.
 *
 * The kinds this table DOES sell are window chrome, Settings entries, search fields, the
 * buy-quantity stepper, bulk selection and feature switches. A new panel joins the registry the
 * moment it grows one of those — a search field over the furniture shelves would be
 * `search.home` at the same three prices every other surface pays. The home panel has none of
 * them today, which is why it adds no rung here.
 */
export const CONTROL_UNLOCKS: readonly ControlUnlockDefinition[] = [
  {
    id: "chrome.drag",
    group: "chrome",
    nameEn: "Drag the window",
    nameYue: "拖窗",
    whereEn: "The title bar",
    whereYue: "標題列",
    rungs: [
      {
        id: "chrome.drag",
        nameEn: "Drag handle",
        nameYue: "拖曳手柄",
        detailEn: "The marquee plate in the middle of the title bar becomes a drag handle.",
        detailYue: "標題列中間嗰塊招牌變成拖曳手柄。",
        price: 10,
      },
      {
        id: "chrome.drag.full",
        nameEn: "Drag anywhere on the bar",
        nameYue: "成條標題列都可以拖",
        detailEn: "The whole title bar drags, not just the plate — no aiming required.",
        detailYue: "成條標題列都拖得，唔使再瞄住塊招牌。",
        price: 240,
      },
    ],
  },
  {
    id: "chrome.minimize",
    group: "chrome",
    nameEn: "Minimize",
    nameYue: "縮到最細",
    whereEn: "The title bar",
    whereYue: "標題列",
    rungs: [
      {
        id: "chrome.minimize",
        nameEn: "Minimize button",
        nameYue: "縮細掣",
        detailEn: "The minimize cap actually minimizes the window.",
        detailYue: "縮細掣真係會縮細個窗。",
        price: 30,
      },
    ],
  },
  {
    id: "chrome.maximize",
    group: "chrome",
    nameEn: "Maximize and restore",
    nameYue: "放到最大同還原",
    whereEn: "The title bar",
    whereYue: "標題列",
    rungs: [
      {
        id: "chrome.maximize",
        nameEn: "Maximize button",
        nameYue: "放大掣",
        detailEn: "The maximize cap toggles the window between maximized and restored.",
        detailYue: "放大掣可以喺最大同還原之間切換。",
        price: 45,
      },
      {
        id: "chrome.maximize.doubleClick",
        nameEn: "Double-click the bar",
        nameYue: "㩒兩下標題列",
        detailEn: "Double-clicking the title bar toggles maximize, the way every other app does.",
        detailYue: "喺標題列㩒兩下就切換最大化，同其他程式一樣。",
        price: 320,
      },
    ],
  },
  {
    id: "chrome.resize",
    group: "chrome",
    nameEn: "Resize the window",
    nameYue: "調整窗嘅大細",
    whereEn: "The window edges",
    whereYue: "窗嘅邊",
    rungs: [
      {
        id: "chrome.resize",
        nameEn: "Resizable edges",
        nameYue: "可以拉嘅邊",
        detailEn:
          "Asks the main process to make the window resizable. Until it is bought the edges are dead.",
        detailYue: "叫主程序容許改窗嘅大細。未買之前，啲邊拉極都唔郁。",
        price: 75,
      },
    ],
  },
  {
    id: "settings.language",
    group: "settings",
    nameEn: "Language mode switch",
    nameYue: "語言模式切換",
    whereEn: "Settings → Language",
    whereYue: "設定 → 語言",
    rungs: [
      {
        id: "settings.language",
        nameEn: "Language mode switch",
        nameYue: "語言模式切換",
        detailEn: "The English / Cantonese / both segmented switch starts changing the app.",
        detailYue: "英文／粵語／兩者嘅切換掣開始真係改到成個程式。",
        price: 60,
      },
    ],
  },
  {
    id: "settings.funny.en",
    group: "settings",
    nameEn: "English funny slider",
    nameYue: "英文幽默滑桿",
    whereEn: "Settings → Humour",
    whereYue: "設定 → 幽默",
    rungs: [
      {
        id: "settings.funny.en",
        nameEn: "English funny slider",
        nameYue: "英文幽默滑桿",
        detailEn: "The 1–5 English humour slider becomes movable and its level is stored.",
        detailYue: "1 至 5 嘅英文幽默滑桿郁得，個級數會存低。",
        price: 35,
      },
    ],
  },
  {
    id: "settings.funny.yue",
    group: "settings",
    nameEn: "Cantonese funny slider",
    nameYue: "粵語幽默滑桿",
    whereEn: "Settings → Humour",
    whereYue: "設定 → 幽默",
    rungs: [
      {
        id: "settings.funny.yue",
        nameEn: "Cantonese funny slider",
        nameYue: "粵語幽默滑桿",
        detailEn: "The 1–5 Cantonese humour slider becomes movable and its level is stored.",
        detailYue: "1 至 5 嘅粵語幽默滑桿郁得，個級數會存低。",
        price: 35,
      },
    ],
  },
  {
    id: "search.generators",
    group: "search",
    nameEn: "Generator search",
    nameYue: "生產器搜尋",
    whereEn: "The shop rail",
    whereYue: "商店側欄",
    rungs: searchRungs("generators", "generator", "生產器"),
  },
  {
    id: "search.upgrades",
    group: "search",
    nameEn: "Upgrade search",
    nameYue: "升級搜尋",
    whereEn: "The upgrade shelf",
    whereYue: "升級架",
    rungs: searchRungs("upgrades", "upgrade", "升級"),
  },
  {
    id: "search.achievements",
    group: "search",
    nameEn: "Achievement search",
    nameYue: "成就搜尋",
    whereEn: "The Achievements panel",
    whereYue: "成就面板",
    rungs: searchRungs("achievements", "achievement", "成就"),
  },
  {
    id: "search.tools",
    group: "search",
    nameEn: "Tool search",
    nameYue: "工具搜尋",
    whereEn: "The Tools panel",
    whereYue: "工具面板",
    rungs: searchRungs("tools", "tool", "工具"),
  },
  {
    id: "stepper",
    group: "stepper",
    nameEn: "Buy-quantity stepper",
    nameYue: "購買數量調較器",
    whereEn: "Every shop row",
    whereYue: "每一行商店",
    rungs: [
      {
        id: "stepper.x10",
        nameEn: "×10",
        nameYue: "×10",
        detailEn: "Adds the ×10 rung to every stepper. ×1 is free and always was.",
        detailYue: "喺每個調較器加返 ×10。×1 一直免費。",
        price: 120,
      },
      {
        id: "stepper.x100",
        nameEn: "×100",
        nameYue: "×100",
        detailEn: "Adds the ×100 rung.",
        detailYue: "加返 ×100。",
        price: 900,
      },
      {
        id: "stepper.max",
        nameEn: "Max",
        nameYue: "最多",
        detailEn: "Adds Max: buy as many as the balance allows, in one press.",
        detailYue: "加返「最多」：一㩒就買到餘額買得起嘅數量。",
        price: 6_000,
      },
    ],
  },
  {
    id: "bulk",
    group: "bulk",
    nameEn: "Bulk select and bulk buy",
    nameYue: "批量選取同批量購買",
    whereEn: "The shop rail",
    whereYue: "商店側欄",
    rungs: [
      {
        id: "bulk.select",
        nameEn: "Row checkboxes",
        nameYue: "每行嘅剔格",
        detailEn: "Puts a selection checkbox on every shop row.",
        detailYue: "喺每行商店加返個選取剔格。",
        price: 200,
      },
      {
        id: "bulk.toolbar",
        nameEn: "Bulk toolbar",
        nameYue: "批量工具列",
        detailEn: "The toolbar with buy-selected, select-all-matching and clear.",
        detailYue: "有「買咗揀嘅」、「揀晒符合嘅」同「清除」嘅工具列。",
        price: 1_200,
      },
    ],
  },
  {
    id: "toggle.toolProgression",
    group: "toggle",
    nameEn: "Tool progression switch",
    nameYue: "工具進度開關",
    whereEn: "The Tools panel",
    whereYue: "工具面板",
    rungs: [
      {
        id: "toggle.toolProgression",
        nameEn: "Tool progression switch",
        nameYue: "工具進度開關",
        detailEn: "The on/off switch for the tech tree's progression gate starts working.",
        detailYue: "科技樹進度閘嘅開關掣開始用得。",
        price: 300,
      },
    ],
  },
  {
    id: "toggle.autoShip",
    group: "toggle",
    nameEn: "Auto-ship switch",
    nameYue: "自動出貨開關",
    whereEn: "The Diesel Factory panel",
    whereYue: "柴油廠面板",
    rungs: [
      {
        id: "toggle.autoShip",
        nameEn: "Auto-ship switch",
        nameYue: "自動出貨開關",
        detailEn:
          "The auto-ship checkbox becomes tickable. It still does nothing until the factory's own automation upgrade is bought.",
        detailYue: "自動出貨剔格剔得。買咗廠嘅自動化升級之前，佢一樣唔會做嘢。",
        price: 2_500,
      },
    ],
  },
];

/** Every rung id in the registry, in catalogue order. */
export const ALL_CONTROL_RUNG_IDS: readonly string[] = CONTROL_UNLOCKS.flatMap((control) =>
  control.rungs.map((rung) => rung.id),
);

const RUNG_INDEX: ReadonlyMap<string, { control: ControlUnlockDefinition; rung: ControlRungDefinition; index: number }> =
  new Map(
    CONTROL_UNLOCKS.flatMap((control) =>
      control.rungs.map((rung, index) => [rung.id, { control, rung, index }] as const),
    ),
  );

export function getControlUnlock(id: string): ControlUnlockDefinition {
  const found = CONTROL_UNLOCKS.find((control) => control.id === id);
  if (!found) throw new RangeError(`Unknown control unlock id: ${id}`);
  return found;
}

/** The rung, its control and its position in that control's ladder — or null for an unknown id. */
export function findControlRung(
  rungId: string,
): { readonly control: ControlUnlockDefinition; readonly rung: ControlRungDefinition; readonly index: number } | null {
  return RUNG_INDEX.get(rungId) ?? null;
}

export function controlRungPrice(rungId: string): BigNum {
  const found = RUNG_INDEX.get(rungId);
  if (!found) throw new RangeError(`Unknown control rung id: ${rungId}`);
  return bnFromNumber(found.rung.price);
}

function purchased(state: GameState): readonly string[] {
  return state.controlUnlocks?.purchasedRungIds ?? [];
}

/** Whether this exact rung has been bought. */
export function hasControlRung(state: GameState, rungId: string): boolean {
  return purchased(state).includes(rungId);
}

/** Whether the control's FIRST rung has been bought — i.e. whether the control exists at all. */
export function isControlUnlocked(state: GameState, controlId: string): boolean {
  const control = getControlUnlock(controlId);
  return hasControlRung(state, control.rungs[0].id);
}

/**
 * How many rungs of this control are bought, counting from the bottom and stopping at the first
 * gap. A gap cannot normally exist — the reducer refuses a rung whose predecessor is unowned —
 * but a hand-edited save could contain one, and counting to the gap is the reading that never
 * hands out a rung nobody paid for.
 */
export function controlRungLevel(state: GameState, controlId: string): number {
  const control = getControlUnlock(controlId);
  let level = 0;
  for (const rung of control.rungs) {
    if (!hasControlRung(state, rung.id)) break;
    level += 1;
  }
  return level;
}

/** The next rung the player could buy for this control, or null when the ladder is topped out. */
export function nextControlRung(state: GameState, controlId: string): ControlRungDefinition | null {
  const control = getControlUnlock(controlId);
  return control.rungs[controlRungLevel(state, controlId)] ?? null;
}

/**
 * Whether `rungId` may be bought right now: it exists, it is not already owned, the rung below
 * it in its own ladder IS owned, and the cookies are actually there. Every one of those four is
 * re-checked by the reducer — this is the view-model's copy of the same question, so a button
 * can say "not yet" without dispatching to find out.
 */
export function canBuyControlRung(state: GameState, rungId: string): boolean {
  const found = RUNG_INDEX.get(rungId);
  if (!found) return false;
  if (hasControlRung(state, rungId)) return false;
  if (found.index > 0 && !hasControlRung(state, found.control.rungs[found.index - 1].id)) return false;
  return bnCompare(state.cookies, bnFromNumber(found.rung.price)) >= 0;
}

/**
 * How large a purchase has to be, as a fraction of the current balance, before the coin-slot
 * plate asks for confirmation instead of just taking the cookies. One percent: small enough
 * that an idle late-game player buying a 10-cookie drag handle is never interrupted, large
 * enough that a fresh save cannot spend its entire jar on a single mis-press.
 */
export const CONTROL_CONFIRM_BALANCE_FRACTION = 0.01;

/** Whether pressing this rung's plate should ask first. Also true when it is unaffordable. */
export function needsPurchaseConfirmation(state: GameState, rungId: string): boolean {
  const found = RUNG_INDEX.get(rungId);
  if (!found) return false;
  const balance = bnToNumber(state.cookies);
  if (!Number.isFinite(balance) || balance <= 0) return true;
  return found.rung.price > balance * CONTROL_CONFIRM_BALANCE_FRACTION;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * THE MIGRATION POLICY
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Lifetime cookies above which a pre-existing save is handed every control for free.
 *
 * THIS IS A DELIBERATE DEPARTURE FROM THE OWNER'S DECREE AND IT IS FLAGGED HERE FOR REVIEW.
 *
 * The decree is that everything is bought. Applied literally to migration, that means a save
 * with a fully-built diesel factory would wake up one morning unable to move its own window,
 * unable to reach the ×100 stepper it had been buying eight tiers of generators with, and
 * unable to search a list of a hundred and seventy-nine upgrades. It would not read as a joke.
 * It would read as the update having broken the game, and the player would be right.
 *
 * The compromise, chosen with eyes open: a save that has demonstrably been PLAYED — more than
 * one thousand lifetime cookies, which is roughly the first few minutes and is comfortably past
 * the point where the chrome prices in this table would have been trivial anyway — keeps every
 * control it was already using, granted outright by `migrations.ts#migrateV5ToV6`. Everything
 * else (a fresh save, an abandoned save that never got going) starts with the empty list and
 * buys the lot.
 *
 * What this costs: the grandfathered player never sees the coin-slot plates and never
 * experiences the feature at all until they start a new save or prestige into one. What it buys:
 * nobody's existing game is bricked. If the owner would rather have the joke than the
 * compatibility, change `MIGRATION_GRANT_LIFETIME_THRESHOLD` to `Infinity` and every save in
 * existence starts paying — the migration step, the grant set and the tests all key off this one
 * constant, and nothing else has to change.
 */
export const MIGRATION_GRANT_LIFETIME_THRESHOLD = 1_000;

/**
 * The rungs a grandfathered save is granted: ALL of them.
 *
 * Every control in this registry existed and worked in the build before this one, so "every
 * control they could already use" and "the whole table" are the same set today. They will stop
 * being the same set the moment a NEW control is added to the registry — a control invented
 * after this migration was written was never usable by an older save, so it must not be in this
 * function's output. The rule is therefore written down rather than left to the reader: this
 * function returns the rungs that existed AT SCHEMA VERSION 6, which is the frozen list below,
 * not `ALL_CONTROL_RUNG_IDS` computed live from a table that will keep growing.
 */
export const V6_GRANDFATHERED_RUNG_IDS: readonly string[] = [
  "chrome.drag",
  "chrome.drag.full",
  "chrome.minimize",
  "chrome.maximize",
  "chrome.maximize.doubleClick",
  "chrome.resize",
  "settings.language",
  "settings.funny.en",
  "settings.funny.yue",
  "search.generators",
  "search.generators.builder",
  "search.generators.tokens",
  "search.upgrades",
  "search.upgrades.builder",
  "search.upgrades.tokens",
  "search.achievements",
  "search.achievements.builder",
  "search.achievements.tokens",
  "search.tools",
  "search.tools.builder",
  "search.tools.tokens",
  "stepper.x10",
  "stepper.x100",
  "stepper.max",
  "bulk.select",
  "bulk.toolbar",
  "toggle.toolProgression",
  "toggle.autoShip",
];

/**
 * What a save carrying `lifetimeCookies` should be given when it crosses into schema version 6.
 * Pure and exported so `tests/game/control-unlocks.test.ts` can assert the policy directly
 * rather than through a decoded save file.
 */
export function grantedRungIdsForMigration(lifetimeCookies: number): readonly string[] {
  if (!Number.isFinite(lifetimeCookies)) return [];
  return lifetimeCookies > MIGRATION_GRANT_LIFETIME_THRESHOLD ? V6_GRANDFATHERED_RUNG_IDS : [];
}

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
 * The floors below are asserted by `tests/game/control-unlocks.test.ts`:
 *
 *   1. THE EXIT costs exactly ONE cookie (owner decree, 2026-08-17): the close button and
 *      Alt+F4 both wait on the `chrome.close` rung, priced at exactly 1 so a single click on
 *      the cookie always affords it. The hard floor underneath: the app never fights the
 *      operating system — OS shutdown, session end, and Task Manager are never intercepted,
 *      the close event is only softly refused BEFORE the rung is bought, nothing can re-lock
 *      it, and the rung is grandfathered so no migrating save ever meets a locked exit.
 *   2. THE CONTROLS CATALOGUE AND ITS OWN SEARCH FIELD. The catalogue lists every entry below
 *      with its price, and its search box filters that list. Charging for the ability to find
 *      out what things cost would be a circular lock.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * THE FLOOR THAT USED TO BE HERE AND IS NOT ANY MORE: THE SETTINGS SURFACE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * Until this build there was a third floor: the Settings emblem and its dialog were free,
 * because the price list lived inside them and locking the door would have made the economy
 * undiscoverable. The owner looked at the console, said of the Settings emblem "settings still
 * appearing" and "needs to be purchased", and that boundary is theirs to move. It is moved: the
 * emblem is `settings.open` below, priced at 25 cookies, and until it is bought the console
 * shows a coin-slot plate carrying that figure exactly where the emblem was.
 *
 * The reason the old floor existed is NOT waved away, it is re-housed. The catalogue is no
 * longer a section that only exists inside Settings: it is its own console plate — a free one,
 * appended to the console unconditionally beside the Settings slot (renderer/game/console-
 * panels.ts#CATALOGUE_PANEL_ID) — and it is still ALSO rendered at the bottom of the Settings
 * panel for anyone who has bought their way in. So "you can always see what things cost" stays
 * literally true on a brand-new save with zero cookies: the price list is one press away, free,
 * and the 25-cookie Settings price is printed inside it like every other price.
 *
 * And the distinction that keeps the spirit: `settings.open` is PRICED, never PROGRESS-GATED.
 * There is no condition, no milestone and no tech-tree rung in front of it. A save one second
 * old can buy it as soon as it has clicked 25 cookies out of the cookie, which is under a
 * minute. The joke is a till, not a grind. *
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
 *   • 25 – 200     settings entries and the first rung of each search field. Reachable inside
 *                  the first few dozen clicks. The cheapest of them is the Settings emblem
 *                  itself at 25 — deliberately the second-cheapest thing in the whole table,
 *                  under every entry it stands in front of, so paying the door charge is never
 *                  the expensive part of reaching a setting.
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
 *   settings  Open Settings              unlock (the console emblem)       25
 *   settings  Language mode              unlock (the switch itself)        60
 *   settings  Cantonese mode             unlock (English is free)          40
 *   settings  Bilingual mode             unlock (bought separately)        90
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
 *   look      The look of the thing      unlock: colour                    50
 *                                        upgrade: the cabinet             250
 *                                        upgrade: display typography      750
 *                                        upgrade: the oven glow         1,800
 *                                        upgrade: illustrated art       4,000
 *                                        upgrade: motion                8,000
 *                                        upgrade: the dark theme       15,000
 *
 * The `look` ladder is a FOURTH band of its own and breaks the three above on purpose: it runs
 * from the cheapest end of the table to the most expensive thing in it, because it is not one
 * control but the whole appearance of the application sold a layer at a time. A fresh save is
 * deliberately a plain white form with a grey button on it, by the owner's decree, and the
 * arcade cabinet assembles over roughly the first hour. See the entry itself for the argument.
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
export type ControlGroup =
  | "chrome"
  | "settings"
  | "search"
  | "regex"
  | "stepper"
  | "bulk"
  | "toggle"
  | "look";

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
    id: "chrome.close",
    group: "chrome",
    nameEn: "Close the window",
    nameYue: "閂窗",
    whereEn: "The title bar",
    whereYue: "標題列",
    rungs: [
      {
        // Exactly 1 by decree, and it must stay 1: a single click on the cookie affords it, which
        // is the whole difference between a joke and a trap. OS shutdown and Task Manager are
        // never intercepted regardless of this rung (main.ts).
        id: "chrome.close",
        nameEn: "The exit",
        nameYue: "出口",
        detailEn: "The close button and Alt+F4 start working. Costs one cookie. One.",
        detailYue: "閂窗掣同 Alt+F4 開始有效。收一粒曲奇。一粒。",
        price: 1,
      },
    ],
  },
  {
    id: "tools.openItNow",
    group: "toggle",
    nameEn: "The 'Open it now' button",
    nameYue: "「而家就開」個掣",
    whereEn: "Every tool card in the tech tree",
    whereYue: "科技樹每張工具卡",
    rungs: [
      {
        // The owner priced even this ("must be bought"). The FEATURE stays priced-never-
        // progress-gated: the button's price is flat, visible, and buyable from the first
        // minute — what is sold is the shortcut button, never the feature behind it, which
        // remains reachable through Settings once that is bought.
        id: "tools.openItNow",
        nameEn: "Open it now",
        nameYue: "而家就開",
        detailEn: "The shortcut button on every tool card that opens the real application feature.",
        detailYue: "每張工具卡上面嗰個直接開真功能嘅捷徑掣。",
        price: 75,
      },
    ],
  },
  {
    id: "chrome.drag",
    group: "chrome",
    nameEn: "Drag the window",
    nameYue: "拖窗",
    whereEn: "The title bar",
    whereYue: "標題列",
    rungs: [
      {
        // One rung, whole bar. This was briefly two rungs (plate first, whole bar at ×24) and a
        // real player read the plate-only state as "I bought dragging and it doesn't drag" — a
        // purchase that still needs aiming is indistinguishable from a broken one. The old
        // `chrome.drag.full` rung id may still appear in saves that bought or were granted it;
        // it is accepted and inert.
        id: "chrome.drag",
        nameEn: "Drag the window",
        nameYue: "拖窗",
        detailEn: "The whole title bar drags the window, except its buttons.",
        detailYue: "成條標題列都可以拖窗，除咗啲掣。",
        price: 10,
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
    // THE DOOR CHARGE. Bought from the console plate that stands where the emblem stands, or
    // from the free catalogue like anything else. Priced under every entry behind it on purpose:
    // 25 is the cheapest a fresh save can get to, and nothing about it is progress-gated.
    id: "settings.open",
    group: "settings",
    nameEn: "Open Settings",
    nameYue: "打開設定",
    whereEn: "The cabinet console",
    whereYue: "機櫃控制台",
    rungs: [
      {
        id: "settings.open",
        nameEn: "Settings emblem",
        nameYue: "設定標誌",
        detailEn:
          "Turns the coin-slot plate on the console back into the Settings emblem, which opens the panel. The prices catalogue beside it is free either way.",
        detailYue: "將控制台上面塊投幣板變返做設定標誌，㩒到就開到個面板。隔籬個價目表點都免費。",
        price: 25,
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
    // TWO SEPARATE CONTROLS, NOT TWO RUNGS OF THE SWITCH'S LADDER. A ladder is bought bottom-up,
    // and making Bilingual wait behind Cantonese would invent an order the feature does not have:
    // these are two independent destinations, exactly like the two funny sliders. What they DO
    // compose with is `settings.language`: that unlock is what puts the segmented switch on the
    // panel at all, and these decide which of its three buttons actually change the app.
    //
    // ENGLISH IS NOT HERE, and never will be. It is the default mode and it is free — a player
    // must always be able to read the application in at least one language without paying, and
    // selling the only mode a fresh save has would be the same circular lock as selling the
    // price list.
    id: "settings.language.yue",
    group: "settings",
    nameEn: "Cantonese mode",
    nameYue: "粵語模式",
    whereEn: "Settings → Language",
    whereYue: "設定 → 語言",
    rungs: [
      {
        id: "settings.language.yue",
        nameEn: "Cantonese mode",
        nameYue: "粵語模式",
        detailEn: "Unlocks the Cantonese-only mode on the language switch. English stays free.",
        detailYue: "解鎖語言掣上面淨係粵語嗰個模式。英文一直免費。",
        price: 40,
      },
    ],
  },
  {
    id: "settings.language.both",
    group: "settings",
    nameEn: "Bilingual mode",
    nameYue: "雙語模式",
    whereEn: "Settings → Language",
    whereYue: "設定 → 語言",
    rungs: [
      {
        id: "settings.language.both",
        nameEn: "Bilingual mode",
        nameYue: "雙語模式",
        detailEn: "Unlocks the both-at-once mode on the language switch. Bought separately from Cantonese.",
        detailYue: "解鎖語言掣上面兩種語言一齊出嗰個模式。同粵語模式分開買。",
        price: 90,
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
    // ────────────────────────────────────────────────────────────────────────────────────────
    // THE ADVANCED REGEX BUILDER IS ONE SHARED LADDER, NOT FOUR.
    //
    // Every other search capability is sold per surface, because a search field on the shop
    // rail and a search field on the Tools panel are two separate pieces of furniture in two
    // separate rooms: buying one plainly should not furnish the other. That reasoning stops
    // holding at the top of the ladder. "Capture groups", "lookarounds" and "a test-string
    // lab" are not furniture in a room — they are the BUILDER'S OWN capability, and the
    // builder is one component rendered four times.
    //
    // Selling them per surface would have meant eight near-identical rungs, 32,000 cookies to
    // own a feature once, and a catalogue in which the same two lines appear four times each.
    // Worse, it would have meant a player who bought the lab on the shop rail opening the
    // Tools search and finding the lab gone, with no story for why the same popover forgot how
    // to do something. So the advanced tiers are ONE control with ONE price, read by every
    // surface's popover, and the per-surface ladder keeps its own three rungs unchanged.
    //
    // The two ladders compose rather than replace: a surface still buys its own field (50),
    // its own gear (400) and its own palette (1,500) before its popover can show anything —
    // and what the shared rungs then add is shown inside THAT popover, on that surface. An
    // advanced rung bought while no surface has a palette buys a capability with nowhere to
    // appear yet, which is the same shape as buying `stepper.x100` before opening a shop.
    // ────────────────────────────────────────────────────────────────────────────────────────
    id: "regex",
    group: "regex",
    nameEn: "The advanced regex builder",
    nameYue: "進階規則運算式產生器",
    whereEn: "Inside every search popover, on every surface at once",
    whereYue: "每個搜尋彈出面板入面，一次過喺所有介面",
    rungs: [
      {
        id: "regex.groups",
        nameEn: "Groups and lookarounds",
        nameYue: "群組同前後顧",
        detailEn:
          "Adds the named-capture builder, the alternation builder and the lookahead/lookbehind tokens, each with a plain-language line saying what it does. Bought once, appears in every search popover.",
        detailYue:
          "加返具名擷取產生器、二選一產生器同前後顧符號，每個都有一句白話解釋佢做乜。買一次，每個搜尋彈出面板都有。",
        price: 4_000,
      },
      {
        id: "regex.lab",
        nameEn: "The live lab",
        nameYue: "即時試驗場",
        detailEn:
          "Adds a test-string lab inside the popover: type sample text and watch the matches highlight as you type, with a per-group capture table and one plain-language sentence explaining the pattern. All of it local and bounded.",
        detailYue:
          "喺彈出面板入面加返個試驗場：打樣本文字，一路打一路睇住啲配對着色，仲有逐個群組嘅擷取表同一句白話解釋。全部喺本機做，有上限。",
        price: 12_000,
      },
    ],
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
  {
    // ────────────────────────────────────────────────────────────────────────────────────────
    // THE LOOK. One ladder, seven rungs, and the reason it is a ladder rather than seven
    // separate controls.
    //
    // The owner's decree, in their own words: "the app should start with a purely super plain
    // cheaply made app with just a cookie". Everything this build looks like — the warm bakery
    // palette, the wooden cabinet frame, the display typography on the marquee, the oven glow
    // and its embers, the illustrated icon set, the press travel under every button, the dark
    // theme — is now EARNED. A save that has never bought a look rung renders as a plain
    // white page with system-font text and #ddd buttons, and that plainness is the deliberate
    // starting state rather than a fallback for a failure.
    //
    // WHY A LADDER. A look assembles in an order. Painting the cabinet frame before there is a
    // palette to paint it in produces brown wood on a grey page; putting display type on a
    // marquee that has no bezel produces a heavy word floating in nothing. Each rung below is
    // the ground the next one stands on, so the ladder's bottom-up rule is the feature's own
    // rule rather than an invented one. It also means the catalogue prints the whole
    // transformation as one readable sequence with one running price.
    //
    // WHAT EACH RUNG'S ABSENCE LOOKS LIKE is not "broken" — it is a specific, coherent, cheap
    // alternative, listed in styles/index.css under THE PLAIN LAYER. The floors that hold at
    // every rung including none of them: AA text contrast, a visible focus ring, 44px targets,
    // reduced-motion respected, and every price legible on its coin-slot plate. The economy has
    // to be playable from the plain state, because the plain state is where it starts.
    //
    // WHAT IS DELIBERATELY NOT SOLD HERE: legibility. There is no rung that buys readable text,
    // a focus ring, or a big enough button. Those are floors, and a floor is never a price.
    // ────────────────────────────────────────────────────────────────────────────────────────
    id: "look",
    group: "look",
    nameEn: "The look of the thing",
    nameYue: "個樣",
    whereEn: "The whole application, all at once",
    whereYue: "成個程式，一次過",
    rungs: [
      {
        id: "look.palette",
        nameEn: "Colour",
        nameYue: "顏色",
        detailEn:
          "Buys the warm bakery palette. Until it is bought the application is white, grey and black, like a form.",
        detailYue: "買返暖笠笠嘅餅店色系。未買之前，成個程式白白灰灰黑黑，好似張表格咁。",
        price: 50,
      },
      {
        id: "look.cabinet",
        nameEn: "The cabinet",
        nameYue: "機櫃",
        detailEn:
          "Buys the wooden frame, the bevels, the chunky borders and the rounded corners. Before it, every edge is a 1px grey hairline and every corner is square.",
        detailYue: "買返木框、斜邊、粗邊同圓角。未買之前，每條邊都係一像素灰線，每隻角都係直角。",
        price: 250,
      },
      {
        id: "look.marquee",
        nameEn: "Display typography",
        nameYue: "招牌字體",
        detailEn:
          "Buys the heavy letter-spaced display face on the marquee, the panel titles and the HUD. Before it, everything is the system font at normal weight.",
        detailYue: "買返招牌、面板標題同儀表板嗰隻粗身、拉開字距嘅字體。未買之前，全部都係系統字體、正常粗幼。",
        price: 750,
      },
      {
        id: "look.glow",
        nameEn: "The oven glow",
        nameYue: "焗爐嘅光",
        detailEn:
          "Buys the radial oven glow behind the cabinet, the drifting embers and the crumbs on the counter. Before it, the background is one flat colour.",
        detailYue: "買返機櫃背後嘅焗爐光暈、飄嘅火屑同枱面嘅餅碎。未買之前，個背景淨係一隻淨色。",
        price: 1_800,
      },
      {
        id: "look.art",
        nameEn: "The illustrated art",
        nameYue: "插畫",
        detailEn:
          "Buys the drawn icon set and the drawn hero cookie. Before it, the cookie is a circle with the word COOKIE on it and every icon is a plain glyph. The names screen readers announce are identical either way.",
        detailYue:
          "買返成套手繪圖示同手繪主角曲奇。未買之前，粒曲奇係個圓圈上面寫住 COOKIE，每個圖示都係普通符號。讀屏軟件讀到嘅名，買唔買都一樣。",
        price: 4_000,
      },
      {
        id: "look.motion",
        nameEn: "Motion",
        nameYue: "動態",
        detailEn:
          "Buys the press travel under every button and the animations across the application. Reduced-motion is still honoured after buying it — that is a floor, not a rung.",
        detailYue: "買返每個掣㩒落去嗰段行程同成個程式嘅動畫。買咗之後一樣尊重「減少動態」設定 — 嗰樣係底線，唔係可以買嘅嘢。",
        price: 8_000,
      },
      {
        id: "look.dark",
        nameEn: "The dark theme",
        nameYue: "深色主題",
        detailEn:
          "Buys the ability to follow the system's dark theme at all. Before it, the application stays light whatever the operating system says.",
        detailYue: "買返跟系統轉深色主題嘅能力。未買之前，作業系統話咩都好，程式一樣淺色。",
        price: 15_000,
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

/**
 * Whether pressing this rung's plate should ask first. Also true when it is unaffordable.
 *
 * The balance is read through `bnToNumber`, which OVERFLOWS TO INFINITY once an idle save gets
 * past 1e308 — a magnitude BigNum exists precisely to represent. Infinity is not a malformed
 * balance, it is a very large one, and one per cent of it is larger than every price in this
 * table, so it takes the same branch a rich finite balance does: no confirmation. Only a
 * balance that is genuinely unreadable (NaN) or actually empty asks first.
 */
export function needsPurchaseConfirmation(state: GameState, rungId: string): boolean {
  const found = RUNG_INDEX.get(rungId);
  if (!found) return false;
  const balance = bnToNumber(state.cookies);
  if (Number.isNaN(balance) || balance <= 0) return true;
  if (balance === Number.POSITIVE_INFINITY) return false;
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
  "chrome.close",
  "tools.openItNow",
  "chrome.drag",
  // "chrome.drag.full" was retired when one purchase became the whole bar; saves that carry the
  // old id keep it harmlessly, and granting it to new migrations would grant nothing.
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
 * The rungs a grandfathered save is granted when it crosses into schema version 7: the three
 * things that were free in version 6 and are sold in version 7, and nothing else.
 *
 * Version 7 exists for two owner decrees, both of which take something that used to be free and
 * put a price on it: the Settings emblem (`settings.open`) and the two non-English language
 * modes (`settings.language.yue`, `settings.language.both`). A save that had been opening
 * Settings, or reading the whole app in Cantonese, never chose to give either up — taking them
 * away on update is the same "the patch broke my save" reading the version-6 grant exists to
 * avoid. So the same threshold decides it, and the list is frozen at exactly these three ids.
 *
 * ENGLISH IS NOT IN THE LIST because English is not for sale: it is the default mode and it is
 * free for everybody, granted and ungranted saves alike. A save under the threshold pays the
 * 25 + 40 + 90 like a fresh save does, and reads English until it does.
 */
export const V7_GRANDFATHERED_RUNG_IDS: readonly string[] = [
  "settings.open",
  "settings.language.yue",
  "settings.language.both",
];

/**
 * The rungs a grandfathered save is granted when it crosses into schema version 8: exactly one.
 *
 * Version 8 exists for the owner's decree that the regex builder be "more advanced and
 * purchased, upgradable" — the shared `regex` ladder above. Both of its rungs are NEW
 * capabilities that no older build ever shipped, and the rule this file already states is that
 * a control invented after a migration was written must not be granted, because nobody lost it.
 *
 * `regex.groups` is the one honest exception, and it is an exception on a specific argument
 * rather than on generosity. A save that had bought `search.<surface>.tokens` for 1,500 owned
 * what was, at the time, THE WHOLE BUILDER — the top of that ladder was "you have the complete
 * token palette". This release moves the top of that ladder without refunding anything: the
 * same 1,500 now buys a palette that is explicitly the basic half of a larger one. Handing the
 * first advanced rung to a save that is demonstrably past the same 1,000-cookie threshold keeps
 * the promise that purchase made, and it is the same instrument, the same threshold and the
 * same frozen-list shape as versions 6 and 7.
 *
 * `regex.lab` is NOT in the list, deliberately. The live lab is not the top of a ladder anybody
 * already bought — it is a workbench that never existed in any build, at a price of its own.
 * Granting it would be granting a brand-new twelve-thousand-cookie feature to every played save,
 * which is not grandfathering, it is a giveaway. Every save buys the lab.
 */
export const V8_GRANDFATHERED_RUNG_IDS: readonly string[] = ["regex.groups"];

/**
 * The rungs a grandfathered save is granted when it crosses into schema version 9: the WHOLE
 * look ladder, all seven rungs of it.
 *
 * This is the largest grant any migration in this file has made since version 6, and it is the
 * easiest one to argue. Versions 6, 7 and 8 each put a price on a control that used to be free,
 * and the question was whether a player who had been USING that control should lose it. Version
 * 9 puts a price on what the application LOOKS LIKE — and every save in existence has been
 * looking at the full v2 arcade-bakery cabinet since the day it was written. They did not merely
 * use it; it is the only thing they have ever seen.
 *
 * Waking a built-out save up as a white page with #ddd buttons would not read as a joke landing.
 * It would read, correctly, as the update having thrown the artwork away. So a save past the same
 * 1,000-lifetime-cookie threshold every other grant uses keeps the look it earned, entire, and a
 * fresh save assembles it a rung at a time from plain.
 *
 * The list is frozen at exactly these seven ids for the same reason the others are frozen: a look
 * tier invented after this migration was written was never seen by an older save, so granting it
 * would be a giveaway rather than grandfathering.
 */
export const V9_GRANDFATHERED_RUNG_IDS: readonly string[] = [
  "look.palette",
  "look.cabinet",
  "look.marquee",
  "look.glow",
  "look.art",
  "look.motion",
  "look.dark",
];

/**
 * What a version-8 save carrying `lifetimeCookies` is given as it crosses into version 9.
 * Same threshold, same defensive reading of the value, frozen grant list — see above.
 */
export function grantedRungIdsForV9Migration(lifetimeCookies: number | BigNum): readonly string[] {
  return grantedRungIdsForMigration(lifetimeCookies).length > 0 ? V9_GRANDFATHERED_RUNG_IDS : [];
}

/**
 * What a version-7 save carrying `lifetimeCookies` is given as it crosses into version 8.
 * Same threshold, same defensive reading of the value, one-id grant list — see above.
 */
export function grantedRungIdsForV8Migration(lifetimeCookies: number | BigNum): readonly string[] {
  return grantedRungIdsForMigration(lifetimeCookies).length > 0 ? V8_GRANDFATHERED_RUNG_IDS : [];
}

/**
 * What a version-6 save carrying `lifetimeCookies` is given as it crosses into version 7.
 * Same threshold, same defensive reading of the value, one-id grant list — see above.
 */
export function grantedRungIdsForV7Migration(lifetimeCookies: number | BigNum): readonly string[] {
  return grantedRungIdsForMigration(lifetimeCookies).length > 0 ? V7_GRANDFATHERED_RUNG_IDS : [];
}

/**
 * What a save carrying `lifetimeCookies` should be given when it crosses into schema version 6.
 * Pure and exported so `tests/game/control-unlocks.test.ts` can assert the policy directly
 * rather than through a decoded save file.
 *
 * IT TAKES A BigNum OR A PLAIN NUMBER, and the BigNum form is the one the migration uses. A
 * lifetime total is an economy value, and an economy value past 1e308 does not survive
 * `bnToNumber` — it overflows to Infinity. That overflow used to be read as "malformed, grant
 * nothing", which denied the grandfather clause to exactly the deepest, longest-played saves it
 * exists to protect: a maxed-out save woke up unable to drag its own window. Infinity is
 * provably ABOVE the threshold, never below it, so a comparison is the right instrument and
 * `bnCompare` does it without ever converting. NaN is the one genuinely unreadable value, and
 * it still grants nothing, which is the safe direction to fail in.
 */
export function grantedRungIdsForMigration(lifetimeCookies: number | BigNum): readonly string[] {
  const threshold = bnFromNumber(MIGRATION_GRANT_LIFETIME_THRESHOLD);
  if (typeof lifetimeCookies === "number") {
    if (Number.isNaN(lifetimeCookies)) return [];
    if (lifetimeCookies === Number.POSITIVE_INFINITY) return V6_GRANDFATHERED_RUNG_IDS;
    return lifetimeCookies > MIGRATION_GRANT_LIFETIME_THRESHOLD ? V6_GRANDFATHERED_RUNG_IDS : [];
  }
  if (!Number.isFinite(lifetimeCookies.mantissa) || !Number.isFinite(lifetimeCookies.exponent)) return [];
  return bnCompare(lifetimeCookies, threshold) > 0 ? V6_GRANDFATHERED_RUNG_IDS : [];
}

/**
 * Bilingual chrome copy for the game screens.
 *
 * Item names (generators, upgrades, achievements, tools) already carry their own bilingual
 * `nameEn`/`nameYue` fields on their domain definitions — see generators.ts, upgrades.ts,
 * achievements.ts and tools.ts — and are read directly from there rather than duplicated here.
 * This module only covers the surrounding UI chrome: tab labels, button labels, empty states,
 * and the fixed contract copy (destructive gates, the tools "open it now" note).
 *
 * Every string is an `{ en, yue }` pair. Numbers/costs/rates are interpolated as plain values
 * and never themselves translated or altered — only the surrounding prose differs by language.
 *
 * WHICH LANGUAGES RENDER is now a real setting (Settings panel → language mode, stored in
 * app-settings.ts). `formatBilingual` is the ONE place that decides, and `bilingualText` — which
 * every screen already funnels its labels through — delegates to it against the currently
 * active mode. That is why a screen does not have to know the setting exists to obey it.
 */
import type { LanguageMode } from "./app-settings.js";

export interface Bilingual {
  readonly en: string;
  readonly yue: string;
}

/** The separator between the two languages when both are shown. */
export const BILINGUAL_SEPARATOR = " · ";

/**
 * THE formatting function for bilingual copy.
 *
 * Pure, and exported for tests: given a pair and a mode it returns exactly what should appear on
 * screen. 'en' and 'yue' each render one language; 'both' renders the paired "English · 中文"
 * presentation the design mockups use and the only behaviour this app had before settings existed.
 */
export function formatBilingual(text: Bilingual, mode: LanguageMode): string {
  if (mode === "en") return text.en;
  if (mode === "yue") return text.yue;
  return `${text.en}${BILINGUAL_SEPARATOR}${text.yue}`;
}

/**
 * The mode every un-parameterised call renders against.
 *
 * A module-level value rather than a React context because roughly a hundred existing call
 * sites format a label as a plain string (aria-labels, titles, placeholders) where a hook cannot
 * reach. The shell sets it from the settings state during render, ABOVE every consumer, and any
 * change to the setting re-renders the whole tree from `App`, so no consumer can read a stale
 * mode. Nothing else in the app is allowed to write it.
 */
let activeLanguageMode: LanguageMode = "both";

export function setActiveLanguageMode(mode: LanguageMode): void {
  activeLanguageMode = mode;
}

export function getActiveLanguageMode(): LanguageMode {
  return activeLanguageMode;
}

/** True when English text should be rendered at all, for the paired-span layouts that keep the
 *  two languages in separate elements instead of one formatted string. */
export function showsEnglish(mode: LanguageMode = activeLanguageMode): boolean {
  return mode !== "yue";
}

/** True when Cantonese text should be rendered at all. */
export function showsCantonese(mode: LanguageMode = activeLanguageMode): boolean {
  return mode !== "en";
}

export function bilingualText(text: Bilingual): string {
  return formatBilingual(text, activeLanguageMode);
}

export const TAB_COPY = {
  cookie: { en: "Cookie", yue: "曲奇" },
  generators: { en: "Generators", yue: "生產建築" },
  upgrades: { en: "Upgrades", yue: "升級" },
  achievements: { en: "Achievements", yue: "成就" },
  tools: { en: "Tools", yue: "工具" },
  statistics: { en: "Statistics", yue: "統計" },
  prestige: { en: "Prestige", yue: "轉生" },
  factory: { en: "Diesel Factory", yue: "柴油廠" },
  home: { en: "The Home", yue: "住家" },
} as const satisfies Record<string, Bilingual>;

/**
 * The single game surface. Every string the cabinet chrome needs that is NOT a secondary
 * destination: the pinned HUD readouts, the two panel headings, and the name of the game
 * surface itself in the secondary dock.
 */
/**
 * The OS-style window chrome across the top of the shell. These are the only three controls that
 * are present on every single frame of the app, so their accessible names follow the same
 * `en · yue` contract as every other control rather than being English-only.
 */
export const TITLE_BAR_COPY = {
  controlsLabel: { en: "Window controls", yue: "視窗控制" },
  minimize: { en: "Minimize window", yue: "縮細視窗" },
  maximizeRestore: { en: "Maximize or restore window", yue: "放大或還原視窗" },
  close: { en: "Close window", yue: "閂咗視窗" },
} as const satisfies Record<string, Bilingual>;

export const GAME_SURFACE_COPY = {
  surfaceLabel: { en: "Game", yue: "遊戲" },
  surfaceTitle: { en: "The bakery", yue: "餅店" },
  hudCookies: { en: "Cookies", yue: "曲奇" },
  hudPerSecond: { en: "Per second", yue: "每秒" },
  hudPerClick: { en: "Per click", yue: "每擊" },
  hudLabel: { en: "Live counters", yue: "即時數字" },
  shopTitle: { en: "Shop", yue: "商店" },
  upgradesTitle: { en: "Upgrades", yue: "升級" },
  shopDrawerLabel: { en: "Generator shop", yue: "生產器商店" },
  upgradeStripLabel: { en: "Upgrade tickets", yue: "升級票" },
  secondaryLabel: { en: "Secondary surfaces", yue: "次要畫面" },
} as const satisfies Record<string, Bilingual>;

/**
 * Chrome for the random-event system (src/shared/game/random-events.ts). Event NAMES and blurbs
 * are not here — they live on the domain definitions beside the numbers they describe, exactly
 * as generator and upgrade names do — so this covers only the wrapper: the indicator's label,
 * the accessible names on the clickable targets, and the toast's dismiss.
 */
export const RANDOM_EVENT_COPY = {
  indicatorLabel: { en: "Event in progress", yue: "事件進行中" },
  timeRemaining: { en: "Time left", yue: "剩餘時間" },
  stageLabel: { en: "Event targets", yue: "事件目標" },
  catchDrop: { en: "Catch a falling cookie", yue: "接住跌緊嘅曲奇" },
  fixOven: { en: "Thump the oven to fix it", yue: "拍一拍焗爐整返好" },
  setbackNote: { en: "Production is down until this ends.", yue: "呢段時間產量會低咗。" },
  dismissToast: { en: "Dismiss", yue: "收起" },
  toastLabel: { en: "Latest event", yue: "最新事件" },
} as const satisfies Record<string, Bilingual>;

/**
 * Strings for the events this lane added.
 *
 * Kept in their own object rather than swelling RANDOM_EVENT_COPY, because several of them are
 * FUNCTIONS of a real quantity — which parcel is next, how many sprinkles are left — and the
 * shape of that object is a flat record of plain bilingual pairs.
 *
 * The rule every line here follows is the one the raid's copy already set: say the actual thing.
 * The Clot's note says production is halved and that there is no button; the Flour Shortage's
 * says the rebound is coming and is worth more than the dip, because a player who does not know
 * that is being asked to sit through a punishment; and the Taste Test's two buttons say what
 * each one pays rather than "yes" and "no".
 */
export const EVENT_EXTRA_COPY = {
  catchSprinkle: (index: number, total: number): Bilingual => ({
    en: `Catch a sprinkle (${index} of ${total} left)`,
    yue: `接住粒糖針（仲有 ${index} / ${total}）`,
  }),
  sendParcel: (position: number, total: number): Bilingual => ({
    en: `Send order ${position} of ${total}`,
    yue: `出第 ${position} 張單（共 ${total} 張）`,
  }),
  parcelWaiting: (position: number): Bilingual => ({
    en: `Order ${position} — not this one yet`,
    yue: `第 ${position} 張單——仲未到佢`,
  }),
  chooseLabel: { en: "Taste test — pick one", yue: "試味——揀一樣" },
  chooseServe: (amount: string): Bilingual => ({
    en: `Serve it now — ${amount} cookies straight away`,
    yue: `即刻賣咗佢——即時攞 ${amount} 粒曲奇`,
  }),
  chooseSendBack: { en: "Send it back — production ×6 for a minute", yue: "退返轉頭——一分鐘產量 ×6" },
  chooseNote: {
    en: "Worth about the same either way. Let the clock run out and you get neither.",
    yue: "兩邊價值差唔多。等到時間過晒就兩樣都冇。",
  },
  buffRunning: { en: "The better tray is out — production ×6.", yue: "好嗰盤出爐喇——產量 ×6。" },
  comboNote: { en: "Every click keeps the window open longer.", yue: "每撳一下，個窗口就開耐啲。" },
  clotNote: {
    en: "Production is halved until it clears. There is no button for this one — wait it out.",
    yue: "通咗之前產量減半。今次冇掣可以撳——等佢過。",
  },
  reboundNote: {
    en: "Half rate while it lasts — then the late delivery lands in one lump, worth more than the dip cost.",
    yue: "呢段時間產量得一半——之後遲到嗰批一次過到，補返嘅仲多過蝕嘅。",
  },
  nightShiftNote: {
    en: "Great if you put the mouse down; clicks are worth a quarter until morning.",
    yue: "唔撳嘅話好抵；不過天光之前，撳一下淨係值四分一。",
  },
  frenzyNote: { en: "This is the good weather. Spend it.", yue: "難得順風。好好用佢。" },
} as const;

/**
 * The Mouse Raid's own strings.
 *
 * Every one of them says what actually happened with a real figure in it. "Some cookies were
 * stolen" would be the easy line to write and the one the player cannot check; the aftermath
 * toast prints the literal grouped amount that left the jar, and says outright that the
 * lifetime total was not touched, because that is the part a player would otherwise have to
 * discover by staring at two counters.
 */
export const MOUSE_RAID_COPY = {
  stageLabel: { en: "Mice on the counter", yue: "枱上面嘅老鼠" },
  whack: { en: "Whack the mouse", yue: "拍走隻老鼠" },
  miceLeft: (remaining: number, total: number): Bilingual => ({
    en: `${remaining} of ${total} mice left`,
    yue: `仲有 ${remaining} / ${total} 隻老鼠`,
  }),
  warning: {
    en: "Every mouse that gets away takes cookies with it.",
    yue: "走甩一隻，就俾佢哋帶走一啲曲奇。",
  },
  ceiling: {
    en: "A raid can take up to 80% of your cookies.",
    yue: "一次打劫最多可以攞走你 80% 曲奇。",
  },
  defended: (reward: string): Bilingual => ({
    en: `Raid defended — every mouse chased off. Nothing stolen, and ${reward} cookies for the trouble.`,
    yue: `打劫擋咗——隻隻老鼠都拍走咗。冇損失，仲有 ${reward} 粒曲奇做辛苦費。`,
  }),
  stolen: (amount: string, escaped: number, total: number): Bilingual => ({
    en: `${escaped} of ${total} mice got away with ${amount} cookies.`,
    yue: `${total} 隻之中走甩咗 ${escaped} 隻，帶走咗 ${amount} 粒曲奇。`,
  }),
  historyNote: {
    en: "Your lifetime total is untouched — they took cookies, not history.",
    yue: "累計總數冇變——佢哋攞走嘅係曲奇，唔係紀錄。",
  },
  aftermathLabel: { en: "Raid aftermath", yue: "打劫之後" },
  dismiss: { en: "Dismiss", yue: "收起" },
  /* The fat mouse and the three consumables. Every line here names a real quantity — hits left,
     stock out of a cap, a literal price — because "a big one" and "some left" are exactly the
     things a player cannot act on. */
  whackFat: (hitsLeft: number): Bilingual => ({
    en: `Whack the fat mouse — ${hitsLeft} more ${hitsLeft === 1 ? "hit" : "hits"}`,
    yue: `拍走隻肥老鼠——仲要 ${hitsLeft} 下`,
  }),
  suppliesLabel: { en: "Raid supplies", yue: "防鼠裝備" },
  suppliesBuy: (price: string): Bilingual => ({ en: `Buy for ${price} cookies`, yue: `用 ${price} 粒曲奇買` }),
  suppliesStock: (stock: number, cap: number): Bilingual => ({
    en: `${stock} of ${cap} in stock`,
    yue: `庫存 ${stock} / ${cap}`,
  }),
  suppliesFull: { en: "Stock full", yue: "庫存滿咗" },
  passSpent: (mice: number): Bilingual => ({
    en: `A Whack Pass was spent — ${mice} ${mice === 1 ? "mouse" : "mice"} got away with nothing.`,
    yue: `用咗一張打鼠券——走甩咗嘅 ${mice} 隻乜都攞唔到。`,
  }),
  armedNote: (names: string): Bilingual => ({
    en: `Spent on this raid: ${names}.`,
    yue: `呢次打劫用咗：${names}。`,
  }),
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

/**
 * The console cluster bolted to the cabinet frame and the anchored panels it opens. These are
 * NOT navigation: the game surface never goes away, so every string here talks about opening
 * and closing a panel rather than going to a page.
 */
export const CONSOLE_COPY = {
  consoleLabel: { en: "Cabinet console", yue: "機櫃控制台" },
  close: { en: "Close panel", yue: "閂咗塊板" },
  open: (en: string, yue: string): Bilingual => ({
    en: `Open ${en} panel`,
    yue: `打開${yue}板`,
  }),
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

export const SHELL_COPY = {
  tabsLabel: { en: "Game sections", yue: "遊戲分頁" },
  dismiss: { en: "Dismiss", yue: "收起" },
  /* "Open it now" on a tool card used to answer here, with a line saying no surface existed to
     open. There is one now — the Settings panel — so the shell announces SETTINGS_COPY.
     featureOpened instead and that honest placeholder has been deleted rather than left behind. */
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

/**
 * The automatic-update notice (src/renderer/components/UpdateNotice.tsx).
 *
 * The warning line is not decoration and is not shortened for layout: this application's
 * installers and update packages are unsigned permanently (ROADMAP.md), Squirrel checks the
 * package against the SHA1 in an unsigned `RELEASES` file fetched over HTTPS, and the notice
 * says that rather than the word "verified". Nothing here is a game control, so nothing here
 * carries a price — the commodification decrees cover the game's own UI, not the plumbing that
 * keeps the application current.
 */
export const UPDATE_COPY = {
  readyTitle: {
    en: "Update ready — restart to install",
    yue: "更新已備妥——重新啟動就會安裝",
  },
  readyTitleVersioned: (version: string): Bilingual => ({
    en: `Update ready (${version}) — restart to install`,
    yue: `更新已備妥（${version}）——重新啟動就會安裝`,
  }),
  unsignedWarning: {
    en: "This update is unsigned. It came over HTTPS from this project's GitHub releases and its package matches the hash listed there — nothing proves who built it.",
    yue: "呢個更新冇簽署。佢經 HTTPS 由本專案嘅 GitHub 發佈頁下載，套件同嗰度列出嘅雜湊值脗合——但冇任何嘢可以證明係邊個整。",
  },
  restart: { en: "Restart", yue: "重新啟動" },
  later: { en: "Later", yue: "遲啲先" },
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

export const COOKIE_SCREEN_COPY = {
  clickTarget: { en: "Click the cookie", yue: "撳曲奇" },
  cookiesLabel: { en: "Cookies", yue: "曲奇" },
  cpsLabel: { en: "Cookies per second", yue: "每秒曲奇產量" },
  goldenAvailable: { en: "Golden cookie available", yue: "金曲奇出現" },
  holdHint: { en: "Hold to click repeatedly", yue: "撳住可以連續撳擊" },
} as const satisfies Record<string, Bilingual>;

/**
 * Progressive disclosure (see src/shared/game/disclosure.ts): the discovery ticket that carries
 * the next reveal upgrade before the shop and the upgrade strip exist, and the unnamed rung at
 * the bottom of the generator ladder.
 */
export const DISCLOSURE_COPY = {
  discoveryLabel: { en: "A discovery", yue: "有發現" },
  discoveryMystery: { en: "Something is missing here…", yue: "呢度好似爭咗啲嘢…" },
  discoveryHint: {
    en: "Keep clicking — you can almost afford it.",
    yue: "繼續撳——就嚟夠錢買得起。",
  },
  discoveryBuy: { en: "Buy", yue: "買" },
  revealShop: {
    en: "Hangs a sign over the counter, and the generator shop with it.",
    yue: "喺櫃枱上面掛塊招牌，順手帶埋成間生產器商店出嚟。",
  },
  revealUpgradeStrip: {
    en: "A catalogue of every upgrade there is, pinned under the cookie.",
    yue: "一本齊晒所有升級嘅目錄，釘喺曲奇下面。",
  },
  revealHoldToClick: {
    en: "Steady enough to hold the cookie down and keep clicking.",
    yue: "手夠穩，可以撳住曲奇連續撳落去。",
  },
  revealDieselDepot: {
    en: "A signed contract to supply WinForge with diesel — and a refinery to actually make it.",
    yue: "同 WinForge 簽咗供柴油嘅合約——同埋一間真係煉到油嘅廠。",
  },
  revealHomeConstruction: {
    en: "The deed to the building over the shop. An empty house, and the right to start building it out.",
    yue: "舖頭樓上嗰間屋嘅物業契。得個空殼，同埋開始起嘅權利。",
  },
  ladderMysteryName: { en: "???", yue: "???" },
  ladderMysteryHint: {
    en: "Buy the tier above to find out what this is.",
    yue: "買咗上面嗰層，就知呢個係咩。",
  },
} as const satisfies Record<string, Bilingual>;

export const LIST_COPY = {
  searchPlaceholderGenerators: { en: "Search generators…", yue: "搜尋生產建築…" },
  searchPlaceholderUpgrades: { en: "Search upgrades…", yue: "搜尋升級…" },
  searchPlaceholderAchievements: { en: "Search achievements…", yue: "搜尋成就…" },
  searchPlaceholderTools: { en: "Search tools…", yue: "搜尋工具…" },
  regexBuilderOpen: { en: "Open regex builder", yue: "開啟規則運算式產生器" },
  owned: { en: "Owned", yue: "擁有" },
  locked: { en: "Locked", yue: "未解鎖" },
  buy: { en: "Buy", yue: "買" },
  buyMax: { en: "Max", yue: "全部" },
  alreadyOwned: { en: "Already owned", yue: "已經擁有" },
  noResults: { en: "Nothing matches this search.", yue: "搵唔到符合嘅結果。" },
} as const satisfies Record<string, Bilingual>;

export const BULK_COPY = {
  selectedCount: (count: number): Bilingual => ({
    en: `${count} selected`,
    yue: `已選 ${count} 項`,
  }),
  buySelected: (count: number): Bilingual => ({ en: `Buy ${count} selected`, yue: `買咗已選 ${count} 項` }),
  exportSelected: (count: number): Bilingual => ({ en: `Export ${count} selected`, yue: `匯出 ${count} 項已選` }),
  clearSelection: { en: "Clear selection", yue: "清除選擇" },
  /**
   * The honest partial result of a bulk buy. The status marks beside the two numbers are drawn
   * in CSS (`.bulk-status`), never stock colour emoji, and each one carries its own glyph as
   * well as its own colour so the two outcomes are never told apart by colour alone.
   */
  bulkBought: { en: "Bought", yue: "買咗" },
  bulkSkipped: { en: "Skipped", yue: "跳過" },
  selectAllMatching: { en: "Select all matching", yue: "選取全部符合項" },
  inFlight: { en: "Working…", yue: "處理緊…" },
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

export const TOOLS_SCREEN_COPY = {
  principle: {
    en: "Unlocking a tool here only turns on its game bonus and its tech-tree display. The real application feature has always been available.",
    yue: "喺呢度解鎖工具淨係開返個遊戲加成同科技樹顯示，真正嘅應用程式功能一直都用得到。",
  },
  /** The one-line marquee form of `principle`. The full sentence stays in the disclosure. */
  principleHeadline: {
    en: "Every real app feature is already open.",
    yue: "所有真正應用程式功能一直都開住。",
  },
  principleMore: { en: "What unlocking actually does", yue: "解鎖實際做咗啲咩" },
  openItNow: { en: "Open it now", yue: "而家開啟" },
  openItNowNote: {
    en: "This app feature is already available — this button opens it directly, whether or not the tool below is unlocked.",
    yue: "呢個應用程式功能一直都用得到——呢粒掣可以直接開啟,唔理下面隻工具有冇解鎖。",
  },
  /**
   * The one extra line the callout grows while the Settings panel is unbought, and the reason it
   * is one line rather than a rewrite: the tech-tree contract is unchanged and still true. The
   * feature is not gated by this tool or by any progress. It has a till in front of it, and
   * saying so is the difference between an honest button and a button that quietly does nothing.
   */
  openItNowPriced: (price: string): Bilingual => ({
    en: `Settings itself now costs ${price} cookies to open — a price, not a lock: nothing has to be earned first. This button takes you to its coin slot on the console instead of opening the panel.`,
    yue: `而家打開設定要 ${price} 塊曲奇——係價錢，唔係鎖：唔使玩到邊度先得。呢粒掣會帶你去控制台嗰塊投幣板，唔會直接開個面板。`,
  }),
  undiscoveredName: { en: "??? Tool", yue: "未發現嘅工具" },
  undiscoveredBody: {
    en: "Not discovered yet — keep playing and its name will reveal itself.",
    yue: "仲未被發現，繼續玩落去就會顯示出嚟。",
  },
  title: { en: "Tools tech tree", yue: "工具科技樹" },
  alwaysAvailable: { en: "Always available", yue: "一直用得" },
  unlockNow: { en: "Unlock now", yue: "立即解鎖" },
  lockedChip: { en: "Locked", yue: "未解鎖" },
  readyChip: { en: "Ready to unlock", yue: "可以解鎖" },
  /** Found, named and priced — and doing nothing until it is bought. */
  discoveredChip: { en: "Discovered · not bought", yue: "已發現 · 未買" },
  unlockedChip: { en: "Unlocked", yue: "已解鎖" },
  undiscoveredChip: { en: "Undiscovered", yue: "未發現" },
  tier1: { en: "Bronze · early game", yue: "青銅 · 遊戲初期" },
  tier2: { en: "Emerald · mid game", yue: "翡翠 · 遊戲中期" },
  tier3: { en: "Amethyst · late game", yue: "紫水晶 · 遊戲後期" },
  tier1Prereq: { en: "No prerequisites — the first rung of the ladder.", yue: "冇前置條件——科技樹嘅第一級。" },
  tier2Prereq: {
    en: "Follows on from the Bronze tier: these tools ask for deeper buildings, more clicks, or a bigger lifetime total.",
    yue: "接住青銅層：呢啲工具要更深嘅建築、更多撳擊，或者更大嘅一生累積。",
  },
  tier3Prereq: {
    en: "Follows on from the Emerald tier: these tools ask for a prestige run or a very large lifetime total.",
    yue: "接住翡翠層：呢啲工具要轉生過一次，或者一生累積要非常大。",
  },
  progressionNote: {
    en: "This toggle only changes the game's tech-tree display and its gameplay bonuses. It never changes what real application features are available — every one of them is reachable from Settings and the command palette either way.",
    yue: "呢個掣淨係改變遊戲科技樹嘅顯示同遊戲加成，唔會改變真正應用程式功能嘅可用性——嗰啲功能一直都可以喺設定同指令面板用到。",
  },
  /** The caption form of `progressionNote`; the full note stays in the disclosure beside it. */
  progressionCaption: { en: "Display + bonuses only", yue: "淨係影響顯示同加成" },
  progressionMore: { en: "What this toggle changes", yue: "呢個掣改變咩" },
  toolsUnlockedLabel: { en: "Tools unlocked", yue: "已解鎖工具" },
  cannotAfford: { en: "Not enough cookies yet", yue: "曲奇仲未夠" },
  progressionToggleOn: { en: "Tool progression: on", yue: "工具進度：開" },
  progressionToggleOff: {
    en: "Tool progression: off (previewing every tool as unlocked)",
    yue: "工具進度：熄咗（預覽晒全部工具當已解鎖）",
  },
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

export const STATS_SCREEN_COPY = {
  totalCookiesBaked: { en: "Total Cookies Baked", yue: "總共烤咗嘅曲奇" },
  cookiesPerSecond: { en: "Cookies Per Second", yue: "每秒曲奇產量" },
  clickPower: { en: "Click Power", yue: "每擊力量" },
  prestigeRuns: { en: "Prestige Runs", yue: "轉生次數" },
  totalClicks: { en: "Total Clicks", yue: "總撳擊次數" },
  ascensionPoints: { en: "Ascension Points", yue: "飛升點" },
  achievementsUnlocked: { en: "Achievements Unlocked", yue: "已解鎖成就" },
  toolsUnlocked: { en: "Tools Unlocked", yue: "已解鎖工具" },
  clockAnomalies: { en: "Clock Anomalies Caught", yue: "捕捉到嘅時鐘異常" },
  lifetimeCookies: { en: "Lifetime Cookies", yue: "一生累積曲奇" },
  lifetimeCookiesThisRun: { en: "Lifetime Cookies (this run)", yue: "今次一生累積曲奇" },
  productionMultiplier: { en: "Production Multiplier", yue: "產量加成" },
} as const satisfies Record<string, Bilingual>;

/**
 * The achievements panel and the cabinet-wide unlock celebration. This lives here rather than
 * beside the screen so the badge label, the toast title and the milestone narration all read
 * from one place; the unlock sentence itself comes from `describeMilestone` in narration.ts, so
 * there is exactly one phrasing of "Achievement unlocked: …" in the app.
 */
export const ACHIEVEMENTS_COPY = {
  lockedName: { en: "???", yue: "未解鎖" },
  lockedHint: {
    en: "Not unlocked yet — its name and icon stay hidden until you earn it.",
    yue: "仲未解鎖——攞到之前個名同圖示都會收埋。",
  },
  unlockedToastTitle: { en: "Achievement unlocked", yue: "成就解鎖" },
} as const satisfies Record<string, Bilingual>;

export const PRESTIGE_SCREEN_COPY = {
  projectionTitle: { en: "Ascension projection", yue: "飛升預測" },
  projectionBody: (points: number): Bilingual => ({
    en: `Prestiging right now would earn ${points} ascension point${points === 1 ? "" : "s"}.`,
    yue: `而家轉生可以攞到 ${points} 粒飛升點。`,
  }),
  notYetEligible: {
    en: "Not eligible yet — reach 1 trillion lifetime cookies to unlock prestige.",
    yue: "仲未夠資格——一生累積曲奇要到達 1 兆先可以轉生。",
  },
  permanentShopTitle: { en: "Permanent upgrades", yue: "永久升級" },
  permanentShopEmpty: {
    en: "No upgrades are pinned as permanent yet. Pin one in the Reborn tree below, once its Memory branch has bought you a slot — and note that the Memory branch also carries a share of your unpinned upgrades across a reset even with nothing pinned at all.",
    yue: "而家未有升級被釘做永久。喺下面轉生樹嘅「記憶」枝買到位之後就可以釘——就算一個都未釘，「記憶」枝本身都已經幫你帶一部分未釘嘅升級過去。",
  },
  gatePrestigeTitle: { en: "Prestige now?", yue: "而家轉生？" },
  gatePrestigeResets: {
    en: "This will reset: all buildings, upgrades, and your current cookie count back to zero.",
    yue: "呢個會清空：所有建築物、升級同埋而家嘅曲奇數量會歸零。",
  },
  gatePrestigeKeeps: (points: number): Bilingual => ({
    en: `This carries forward: ${points} ascension point${points === 1 ? "" : "s"} (a permanent production bonus), every node you have bought in the Reborn tree, all unlocked achievements and the milk they pour, every pinned permanent upgrade, and whatever share of the rest the Reborn tree's Memory branch has bought you.`,
    yue: `呢個會保留：${points} 粒飛升點（永久產量加成）、轉生樹入面買咗嘅所有節點、全部已解鎖成就同佢哋倒出嚟嘅奶、所有釘咗做永久嘅升級，同埋轉生樹「記憶」枝幫你帶得走嗰部分。`,
  }),
  gateWipeTitle: { en: "Delete all save data?", yue: "刪除全部存檔？" },
  gateWipeBody: {
    en: "This will permanently delete every building, upgrade, achievement, ascension point, and prestige run. There is no undo and no recovery route once this completes.",
    yue: "呢個會永久刪除每一個建築物、升級、成就、飛升點同轉生紀錄。完成之後無得反悔，無得復原。",
  },
  key1Label: { en: "Confirm intent", yue: "確認意向" },
  key2PrestigeLabel: { en: "Confirm you read the impact", yue: "確認睇咗影響" },
  key2WipeLabel: { en: "Confirm you understand this is permanent", yue: "確認明白呢個係永久性" },
  sliderHintDisabled: { en: "Both keys required before this slider unlocks", yue: "要開晒兩條鎖匙先可以郁滑桿" },
  sliderHintEnabled: { en: "Drag fully right to confirm", yue: "拉到盡右邊確認" },
  emergencyExit: { en: "Emergency exit", yue: "緊急退出" },
  prestigeCompleted: (points: number): Bilingual => ({
    en: `Prestiged! Ascension points awarded: +${points}`,
    yue: `轉生完成！獲得飛升點 +${points}`,
  }),
  wipeCompleted: { en: "All save data deleted.", yue: "全部存檔已刪除。" },
  prestigeButton: { en: "Prestige…", yue: "轉生…" },
  wipeButton: { en: "Delete all save data…", yue: "刪除全部存檔…" },
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

/**
 * The Diesel Depot (src/shared/game/diesel-exchange.ts). Every line here is written to be true
 * whether or not WinForge has ever run: the game says what it minted, says where it put it, and
 * says — without hedging — that consuming a voucher happens in the other application and has
 * not happened yet as far as this one can see.
 */
export const DIESEL_COPY = {
  title: { en: "Diesel Depot", yue: "柴油補給站" },
  subtitle: {
    en: "Diesel manufactured in your own refinery, shipped to WinForge's emergency generators.",
    yue: "喺自己間廠煉出嚟嘅柴油，運去 WinForge 嘅應急發電機。",
  },
  litresLabel: { en: "Litres shipped", yue: "已出貨公升" },
  vouchersLabel: { en: "Vouchers minted", yue: "已開出憑證" },
  consumedLabel: { en: "Consumed by WinForge", yue: "WinForge 已用" },
  /** The honest answer while the WinForge reader does not exist. Not a zero dressed as a fact. */
  consumedNone: {
    en: "none yet — WinForge has not read the ledger",
    yue: "重未有——WinForge 重未讀過本帳",
  },
  mintButton: (litres: number, price: string): Bilingual => ({
    en: `Mint ${litres} L — 🍪 ${price}`,
    yue: `開 ${litres} 公升憑證 — 🍪 ${price}`,
  }),
  cannotAfford: { en: "Not enough cookies for a litre yet.", yue: "重未夠曲奇買一公升。" },
  ledgerAt: (path: string): Bilingual => ({
    en: `Ledger: ${path}`,
    yue: `帳簿：${path}`,
  }),
  /** Shown where there is no main process to write through — a browser tab, a test harness. */
  noBridge: {
    en: "No desktop bridge in this build, so nothing was written to the shared ledger.",
    yue: "呢個版本冇桌面橋接，所以冇寫任何嘢入去共用帳簿。",
  },
  mintFailed: (reason: string): Bilingual => ({
    en: `The voucher could not be written (${reason}). The cookies were still spent.`,
    yue: `寫唔到憑證（${reason}）。啲曲奇已經扣咗。`,
  }),
  ledgerUnreadable: (reason: string): Bilingual => ({
    en: `The shared ledger could not be read (${reason}). Nothing was changed.`,
    yue: `讀唔到共用帳簿（${reason}）。冇改動過任何嘢。`,
  }),
  /** The card's standing note. WinForge reads this file; this game only ever writes to it. */
  handoffNote: {
    en: "Vouchers are minted here and consumed in WinForge, which reads the same file. This game never marks one used.",
    yue: "憑證喺呢度開出，喺 WinForge 度使用，兩邊讀同一個檔。呢隻遊戲永遠唔會自己話用咗。",
  },
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

/**
 * THE DIESEL FACTORY (src/shared/game/diesel-factory.ts) — the nested subgame's own surface.
 *
 * Every line here is written against a factory that can stall, because it can. The readouts say
 * what the line is doing right now rather than what it is rated for, the stall messages name
 * which stage stopped and why, and nothing on this panel ever says a litre exists before the
 * refinery has actually made it.
 */
export const FACTORY_COPY = {
  title: { en: "Diesel Factory", yue: "柴油廠" },
  subtitle: {
    en: "Cookies buy the plant. The plant makes the diesel. Nothing here comes out of thin air.",
    yue: "曲奇買廠房，廠房煉柴油。呢度冇一滴油係憑空變出嚟。",
  },
  floorTitle: { en: "Production floor", yue: "生產現場" },
  shopTitle: { en: "Equipment", yue: "設備" },
  upgradesTitle: { en: "Factory upgrades", yue: "工廠升級" },
  stationTitle: { en: "WinForge shipping station", yue: "WinForge 出貨站" },

  stageIntake: { en: "Crude intake", yue: "原油進料" },
  stageRefining: { en: "Refining", yue: "煉製" },
  stageStorage: { en: "Storage", yue: "儲存" },
  stageDepot: { en: "Depot", yue: "油庫" },

  crudeLabel: { en: "Crude in the yard", yue: "油場原油" },
  litresLabel: { en: "Diesel in the tanks", yue: "缸入面嘅柴油" },
  crudeRate: { en: "Crude per second", yue: "每秒原油" },
  refiningRate: { en: "Litres per second", yue: "每秒公升" },
  efficiencyLabel: { en: "Crude per litre", yue: "每公升耗原油" },
  capacityLabel: { en: "Tank capacity", yue: "油缸容量" },
  lifetimeLitres: { en: "Litres manufactured", yue: "已煉製公升" },
  shippedLabel: { en: "Litres shipped", yue: "已出貨公升" },
  /** What is in the tank right now and could go on the next lorry. Not what has gone. */
  readyLabel: { en: "Ready to ship", yue: "可以出貨" },

  barrels: (value: string): Bilingual => ({ en: `${value} bbl`, yue: `${value} 桶` }),
  litres: (value: string): Bilingual => ({ en: `${value} L`, yue: `${value} 公升` }),

  /** The three honest states of the line. Only one is ever shown at a time. */
  stateRunning: { en: "Running", yue: "運作中" },
  stateIdleNoPlant: {
    en: "Nothing built yet — buy a well and a still to start the line.",
    yue: "重未起過嘢——買一口井同一支煉油塔就開得工。",
  },
  stateStarvedOfCrude: {
    en: "Refining is waiting on crude. The columns are rated higher than the wells can feed.",
    yue: "煉油塔等緊原油。塔嘅產能高過啲井供得到嘅量。",
  },
  stateTanksFull: {
    en: "Tanks are full, so refining has stopped. Ship some diesel or buy another tank.",
    yue: "油缸滿咗，煉油已經停低。出啲貨，或者再買個缸。",
  },
  stateNoRefining: {
    en: "Crude is coming in with nothing to refine it. Buy a refining unit.",
    yue: "原油入緊嚟但冇嘢煉。買部煉油設備啦。",
  },
  yardFullNote: {
    en: "The yard is full too, so intake has stopped as well.",
    yue: "油場都滿埋，所以連進料都停咗。",
  },

  tankGaugeLabel: (percent: string): Bilingual => ({
    en: `Tank level, ${percent}% full`,
    yue: `油缸液位，滿咗 ${percent}%`,
  }),
  yardGaugeLabel: (percent: string): Bilingual => ({
    en: `Crude yard level, ${percent}% full`,
    yue: `油場原油量，滿咗 ${percent}%`,
  }),

  buy: { en: "Buy", yue: "買" },
  owned: { en: "Owned", yue: "擁有" },
  cannotAfford: { en: "Not enough cookies yet", yue: "曲奇仲未夠" },
  equipmentQuantity: { en: "How many to buy", yue: "買幾多部" },
  emptyUpgrades: {
    en: "No factory upgrade is offered yet. Each one asks for a piece of plant to already be running.",
    yue: "暫時未有工廠升級。每個都要有相應設備行緊先會出。",
  },
  branchThroughput: { en: "Throughput", yue: "產能" },
  branchEfficiency: { en: "Efficiency", yue: "效率" },
  branchCapacity: { en: "Capacity", yue: "容量" },
  branchAutomation: { en: "Automation", yue: "自動化" },

  shipButton: (litres: number): Bilingual => ({
    en: `Ship ${litres} L to WinForge`,
    yue: `出 ${litres} 公升去 WinForge`,
  }),
  shipNothing: {
    en: "Nothing to ship — the tanks do not hold a whole litre yet.",
    yue: "冇嘢出得——啲缸重未夠一整公升。",
  },
  shipNote: {
    en: "Shipping draws the tanks down. A voucher is written for litres this factory really made; no cookies change hands at this counter.",
    yue: "出貨會由油缸度扣走。憑證寫住呢間廠真係煉到嘅公升數；喺呢個櫃枱唔會有曲奇易手。",
  },
  autoShipLabel: { en: "Ship automatically", yue: "自動出貨" },
  autoShipAt: (percent: string): Bilingual => ({
    en: `Sends a lorry once the tanks reach ${percent}% full.`,
    yue: `油缸滿到 ${percent}% 就會開車出貨。`,
  }),
  autoShipLocked: {
    en: "Buy an automation upgrade to hand this press over to a level gauge.",
    yue: "買咗自動化升級，先可以將呢粒掣交畀液位錶。",
  },
  investedLabel: { en: "Cookies invested in the plant", yue: "投喺廠房嘅曲奇" },
  amortizedNote: {
    en: "A voucher's cookie figure is now the shipment's share of what the plant cost to build, not a price paid at the counter.",
    yue: "憑證上面嗰個曲奇數字，而家係呢批貨攤分建廠成本嘅份額，唔係喺櫃枱畀嘅價錢。",
  },
  openFactory: { en: "Open the Diesel Factory", yue: "打開柴油廠" },
  depotCardHint: {
    en: "The whole depot moved into the Diesel Factory panel. This card is the status light.",
    yue: "成個油庫搬咗入柴油廠面板。呢張卡淨係盞狀態燈。",
  },
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

export const NARRATOR_COPY = {
  regionLabel: { en: "Game milestones", yue: "遊戲重要進度" },
} as const satisfies Record<string, Bilingual>;

export const OFFLINE_COPY = {
  welcomeBack: (cookies: string, hours: string): Bilingual => ({
    en: `Welcome back — you earned ${cookies} cookies while away (${hours}).`,
    yue: `歡迎返嚟——你唔喺度嘅時候賺咗 ${cookies} 舊曲奇（${hours}）。`,
  }),
  clockAnomaly: {
    en: "Your device clock moved backwards, so no offline cookies were awarded this time.",
    yue: "你部機嘅時鐘郁咗去返轉頭，所以今次冇離線曲奇獎勵。",
  },
  /**
   * The reason is itself a `Bilingual` (see persistence.ts) rather than a raw English string, so
   * the Cantonese sentence never ends up carrying an untranslated English clause in brackets.
   */
  saveCorrupt: (detail: Bilingual): Bilingual => ({
    en: `Your previous save could not be read (${detail.en}). It was kept, unread, next to a fresh save so nothing is lost.`,
    yue: `舊存檔讀唔到（${detail.yue}）。原檔保留咗喺新存檔隔籬，冇整走過任何嘢。`,
  }),
  saveCorruptUnknown: { en: "unknown error", yue: "不明錯誤" },
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

/**
 * The Settings panel (design/settings-funny-sliders.html).
 *
 * Settings is an APPLICATION surface, not a game unlock, so none of this copy is gated by
 * progress and none of it talks about earning anything.
 */
export const SETTINGS_COPY = {
  title: { en: "Settings", yue: "設定" },
  languageLabel: { en: "Language mode", yue: "語言模式" },
  languageCaption: {
    en: "Persists across restarts. Applies to every surface in the app, including this settings panel itself.",
    yue: "重開都會記住。應用喺 app 入面每一個畫面，包括呢個設定面板本身。",
  },
  modeEn: { en: "English", yue: "英文" },
  modeYue: { en: "Cantonese", yue: "粵語" },
  modeBoth: { en: "Bilingual", yue: "雙語" },
  funnyHeading: { en: "Funny level", yue: "搞笑程度" },
  independenceNote: {
    en: "Two separate controls, not one shared slider split in half. Moving the English slider never touches the Cantonese one, and the other way round.",
    yue: "呢兩條係獨立嘅掣，唔係一條掣拆開兩半。郁英文嗰條唔會影響廣東話嗰條，反之亦然。",
  },
  funnyEnTitle: { en: "English funny level", yue: "英文搞笑程度" },
  funnyYueTitle: { en: "Cantonese funny level", yue: "廣東話搞笑程度" },
  funnyEnScale: { en: "1 = fully serious, 5 = maximum playfulness", yue: "1 = 完全正經，5 = 最搞笑" },
  funnyYueScale: { en: "1 = fully serious, 5 = maximum playfulness", yue: "1 = 完全正經，5 = 最搞笑" },
  funnyLevelValue: (level: number): Bilingual => ({
    en: `Current level: ${level} of 5`,
    yue: `而家程度：${level} / 5`,
  }),
  funnyEnSliderLabel: (level: number): Bilingual => ({
    en: `English funny level, currently ${level} of 5`,
    yue: `英文搞笑程度，而家 ${level} / 5`,
  }),
  funnyYueSliderLabel: (level: number): Bilingual => ({
    en: `Cantonese funny level, currently ${level} of 5`,
    yue: `廣東話搞笑程度，而家 ${level} / 5`,
  }),
  /**
   * The honest caption. Every string in this build is written once per language, so a level is
   * stored and honoured wherever a variant exists — which is nowhere yet. Saying so is the whole
   * point: the alternative is a slider that pretends.
   */
  funnyScopeNote: {
    en: "Your levels are saved and stay saved. The written copy in this build has one voice per language so far, so nothing on screen reads differently yet — higher levels arrive as the copy grows, and this note goes with them.",
    yue: "你揀嘅程度會儲起，唔會唔見。呢個版本嘅文字每種語言暫時淨係得一把聲，所以畫面暫時未會唔同——寫多啲版本之後啲程度先至有分別，到時呢句就會刪走。",
  },
  factsNote: {
    en: "Facts stay exact at every level — what was bought, the exact numbers. Only the voice would change.",
    yue: "無論邊個程度，數字同事實都一樣準——買咗咩、幾多，全部照舊。淨係語氣會變。",
  },
  openSettings: { en: "Open Settings panel", yue: "打開設定面板" },
  /**
   * Said on the language row itself, because a switch with two price plates in it needs to
   * explain them where they are rather than in a catalogue somewhere else.
   */
  languagePricedNote: {
    en: "English is the default and is free forever — the whole app is readable without paying for anything. Cantonese and bilingual are separate purchases, bought at the prices shown here. Buying a mode does not switch to it; pressing it after that does.",
    yue: "英文係預設，永遠免費——唔使畀一蚊都睇得晒成個程式。粵語同雙語係分開買嘅，價錢寫喺呢度。買咗個模式唔會即刻轉過去，買完再㩒佢先會轉。",
  },
  featureOpened: (featureEn: string, featureYue: string): Bilingual => ({
    en: `${featureEn} is not gated — the Settings panel is open, with the closest matching row highlighted.`,
    yue: `${featureYue} 冇被鎖住——設定面板已經打開咗，最相關嗰行標示咗。`,
  }),
  /**
   * What "Open it now" says when the Settings panel has not been bought yet. It states the
   * price, states that nothing has to be earned first, and says where focus has just gone — the
   * press is not silently doing nothing, it has moved the player to the till.
   */
  featureNeedsPurchase: (price: string): Bilingual => ({
    en: `Opening Settings costs ${price} cookies and nothing else — no progress needed. The coin slot on the console is now focused; press it to buy, or open the free prices catalogue beside it first.`,
    yue: `打開設定要 ${price} 塊曲奇，冇其他條件——唔使玩到邊度。而家焦點喺控制台嗰塊投幣板度，㩒佢就買到，或者可以先開隔籬免費嘅價目表。`,
  }),
  /**
   * Shown at the top of Settings when it was opened by a tool card's "Open it now".
   *
   * Honest about what actually happened: Settings is the application surface this build has, so
   * every tool's "Open it now" lands here on the row it touches most closely, rather than on a
   * dedicated screen that does not exist. The tech tree never gated any of it.
   */
  openedFromTool: (featureEn: string, featureYue: string): Bilingual => ({
    en: `Opened from the Tools tech tree: ${featureEn}. Settings is the application surface this build ships, so you land on the row closest to it — highlighted below. The tree never gated any of this; it only decides whether the card is on screen.`,
    yue: `由工具科技樹打開：${featureYue}。呢個版本嘅應用程式介面就係設定面板，所以會帶你去最相關嗰行（下面標示咗）。科技樹從來冇鎖過任何功能，佢淨係決定張卡出唔出現。`,
  }),
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

/**
 * THE UPGRADE SHELF (screens/UpgradeStrip.tsx). Three headings, because the shelf says three
 * different kinds of thing: what you can buy, what you nearly can, and what you already did.
 */
export const SHELF_COPY = {
  buyableHeading: { en: "Ready to buy", yue: "可以買" },
  lockedHeading: { en: "Nearly there", yue: "就快到" },
  ownedHeading: { en: "Already bought", yue: "已經買咗" },
} as const satisfies Record<string, Bilingual>;

/**
 * MILK (src/shared/game/milk.ts). The tide's own label. The percentage is printed as a real
 * figure rather than a mood, and the flavour name is the band the milk has actually reached —
 * never one it is close to.
 */
export const MILK_COPY = {
  label: { en: "Milk", yue: "牛奶" },
  tideLabel: (nameEn: string, nameYue: string, percent: number): Bilingual => ({
    en: `${nameEn} — ${percent}% milk, poured by your achievements`,
    yue: `${nameYue}——${percent}% 奶，係你啲成就倒出嚟嘅`,
  }),
  noKittens: {
    en: "Milk multiplies nothing on its own. Buy a kitten upgrade and it starts paying.",
    yue: "淨係得奶係唔會加產量嘅。買隻貓仔升級佢就開始有用。",
  },
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

/**
 * REBORN — 轉生 (src/shared/game/reborn.ts). The permanent tree bought with ascension points,
 * surfaced inside the Prestige panel. Every line here is careful to say that a node is bought
 * by hand and never refunded, because both of those are true and both matter before spending.
 */
export const REBORN_COPY = {
  title: { en: "Reborn", yue: "轉生樹" },
  intro: {
    en: "Ascension points buy permanent nodes here. Nothing in this tree is ever reset, and nothing is ever refunded — a node is bought by hand, once, and kept.",
    yue: "飛升點喺呢度買永久節點。呢棵樹入面冇嘢會被重設，亦都冇得退錢——一個節點係你親手買一次，然後永遠留住。",
  },
  pointsAvailable: (points: number): Bilingual => ({
    en: `${points} ascension point${points === 1 ? "" : "s"} unspent`,
    yue: `仲有 ${points} 粒飛升點未使`,
  }),
  pointsSpent: (points: number): Bilingual => ({
    en: `${points} spent in this tree`,
    yue: `已經喺呢棵樹使咗 ${points} 粒`,
  }),
  branchInheritance: { en: "Inheritance", yue: "遺產" },
  branchPower: { en: "Power", yue: "力量" },
  branchMemory: { en: "Memory", yue: "記憶" },
  cost: (points: number): Bilingual => ({
    en: `${points} point${points === 1 ? "" : "s"}`,
    yue: `${points} 粒飛升點`,
  }),
  requires: (nameEn: string, nameYue: string): Bilingual => ({
    en: `Requires ${nameEn}.`,
    yue: `需要先買${nameYue}。`,
  }),
  bought: { en: "Bought", yue: "已買" },
  buy: { en: "Buy node", yue: "買節點" },
  effectStartWith: (amount: string): Bilingual => ({
    en: `Every new run starts with ${amount} cookies.`,
    yue: `每次新開局都有 ${amount} 舊曲奇喺手。`,
  }),
  effectRetain: (percent: number): Bilingual => ({
    en: `Carry ${percent}% more of your bought upgrades across a reset, newest first.`,
    yue: `轉生時多帶 ${percent}% 已買升級過去，由最新嗰批開始。`,
  }),
  effectGlobal: (multiplier: number): Bilingual => ({
    en: `All production ×${multiplier}, permanently.`,
    yue: `全局產量永久 ×${multiplier}。`,
  }),
  effectClick: (multiplier: number): Bilingual => ({
    en: `Click power ×${multiplier}, permanently.`,
    yue: `每擊力量永久 ×${multiplier}。`,
  }),
  effectSlots: (slots: number): Bilingual => ({
    en: `Pin ${slots} more upgrade${slots === 1 ? "" : "s"} as permanent, immune to every reset.`,
    yue: `可以再釘 ${slots} 個升級做永久，任何重設都拎唔走。`,
  }),
  pinTitle: { en: "Pinned permanents", yue: "釘住嘅永久升級" },
  pinUsage: (used: number, total: number): Bilingual => ({
    en: `${used} of ${total} slot${total === 1 ? "" : "s"} used`,
    yue: `用咗 ${used} / ${total} 個位`,
  }),
  pinNoSlots: {
    en: "No permanent slots yet. Buy one in the Memory branch above and any upgrade you own can be pinned here.",
    yue: "而家未有永久位。喺上面「記憶」枝買一個，之後你擁有嘅升級就可以釘喺呢度。",
  },
  pin: { en: "Pin", yue: "釘住" },
  unpin: { en: "Unpin", yue: "解開" },
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

/**
 * THE CONTROL ECONOMY (src/shared/game/control-unlocks.ts).
 *
 * Names and prices of individual controls come from the registry itself, which carries its own
 * bilingual `nameEn`/`nameYue` and `detailEn`/`detailYue` on every entry — exactly as generators
 * and upgrades do. This block is only the chrome around them: what a coin-slot plate says, what
 * the confirmation asks, and the headings of the catalogue inside Settings.
 */
export const CONTROL_COPY = {
  lockedPrefix: { en: "Locked", yue: "未買" },
  /** The accessible name of a coin-slot plate: what it is, and what it costs, in one string. */
  slotLabel: (nameEn: string, nameYue: string, price: string): Bilingual => ({
    en: `${nameEn} — locked. Press to buy it for ${price} cookies.`,
    yue: `${nameYue}——未買。㩒一下用 ${price} 塊曲奇買。`,
  }),
  price: (price: string): Bilingual => ({ en: `🍪 ${price}`, yue: `🍪 ${price}` }),
  confirmTitle: { en: "Buy this control?", yue: "買唔買呢個掣？" },
  confirmBody: (nameEn: string, nameYue: string, price: string, balance: string): Bilingual => ({
    en: `${nameEn} costs ${price} cookies. You have ${balance}.`,
    yue: `${nameYue}要 ${price} 塊曲奇。你而家有 ${balance} 塊。`,
  }),
  confirmBuy: { en: "Buy it", yue: "買" },
  confirmCancel: { en: "Not now", yue: "唔買住" },
  cannotAfford: (short: string): Bilingual => ({
    en: `Not enough cookies — ${short} short.`,
    yue: `曲奇唔夠——爭 ${short} 塊。`,
  }),
  bought: (nameEn: string, nameYue: string): Bilingual => ({
    en: `${nameEn} bought. It works from now on.`,
    yue: `買咗${nameYue}。由而家開始用得。`,
  }),
  catalogueTitle: { en: "Controls catalogue", yue: "控制項目錄" },
  /** The console button's own label. Short because a console cap is 96px wide and its label does
   *  not wrap: "Controls catalogue" is clipped there, and a clipped word is not a label. */
  catalogueConsole: { en: "Prices", yue: "價目表" },
  catalogueIntro: {
    en: "Every control in this application is bought, one press at a time — the Settings panel and everything on it, the window's own buttons, the search fields, the stepper multiples, the bulk toolbar. Prices are flat and printed, and nothing here is gated behind progress: a save one minute old can buy anything it can afford. Nothing unlocks itself either.",
    yue: "呢個程式入面每一個掣都要買，一次㩒一個——設定面板本身同入面所有嘢、個窗自己嘅掣、搜尋欄、購買數量、批量工具列。價錢係固定嘅，寫晒出嚟，亦冇一樣要玩到某個進度先買得：啱啱開嘅存檔，夠錢就買得。冇一樣會自動解鎖。",
  },
  /**
   * The floors, as they stand after the owner's decree that Settings itself must be bought.
   * This catalogue is why that decree is survivable: it is its own free console button now, not
   * a section inside the panel it prices, so the list can still be read for nothing.
   */
  catalogueFloors: {
    en: "Two things are never for sale: the close button, and this catalogue with its own search field. You can always quit, and you can always read the price list — this page is its own free button on the console, so nothing on it has to be bought to be read. Everything else has a price, including the Settings panel itself.",
    yue: "有兩樣嘢永遠唔賣：關閉掣，同埋呢個目錄連佢自己嘅搜尋欄。你永遠走得，亦永遠睇得到個價目表——呢版喺控制台有自己一粒免費掣，睇乜都唔使畀錢。其他全部有價，連設定面板本身都係。",
  },
  catalogueSearch: { en: "Search the catalogue…", yue: "搜尋目錄…" },
  catalogueSearchFree: { en: "This search field is free.", yue: "呢個搜尋欄免費。" },
  catalogueOwned: (owned: number, total: number): Bilingual => ({
    en: `${owned} of ${total} bought`,
    yue: `買咗 ${owned} / ${total}`,
  }),
  catalogueNoResults: { en: "No control matches that.", yue: "冇控制項符合。" },
  rungOwned: { en: "Bought", yue: "買咗" },
  rungNext: { en: "Next rung", yue: "下一級" },
  rungWaiting: { en: "Buy the rung below first", yue: "要先買下面嗰級" },
  groupChrome: { en: "The window itself", yue: "個窗本身" },
  groupSettings: { en: "Settings entries", yue: "設定項目" },
  groupSearch: { en: "Search fields", yue: "搜尋欄" },
  groupStepper: { en: "Buy quantity", yue: "購買數量" },
  groupBulk: { en: "Bulk actions", yue: "批量操作" },
  groupToggle: { en: "Feature switches", yue: "功能開關" },
  /** The plate that replaces the drag region on the title bar until dragging is bought. */
  dragPlate: (price: string): Bilingual => ({
    en: `Dragging this window costs ${price} cookies`,
    yue: `拖呢個窗要 ${price} 塊曲奇`,
  }),
  stepperLockedHint: {
    en: "×1 is free. The rest are bought from the prices catalogue on the console, or by pressing them here.",
    yue: "×1 免費。其他喺控制台嘅價目表買，或者喺呢度㩒一下就買。",
  },
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

/**
 * THE BAKERY-HOME (home-construction.ts). Chrome only: room and furniture names carry their own
 * bilingual fields on the domain definitions and are read straight from there, exactly as the
 * factory's equipment names are.
 */
export const HOME_COPY = {
  title: { en: "The Home", yue: "住家" },
  subtitle: {
    en: "You live over the shop. One room at a time, in whatever order you like — and each one takes as long as it takes.",
    yue: "你就住喺舖頭樓上。一次起一間房，順序你話事——起幾耐就係幾耐，急唔嚟。",
  },

  cutawayTitle: { en: "The house", yue: "間屋" },
  furnitureTitle: { en: "Furniture", yue: "傢俬" },
  cozinessTitle: { en: "Coziness", yue: "溫馨度" },
  queueTitle: { en: "Building site", yue: "地盤" },

  /** The one-at-a-time rule, said in words rather than implied by a disabled button. */
  queueRule: {
    en: "One site, one crew: only one room is ever under construction. Start another when this one is finished.",
    yue: "一個地盤，一隊師傅：同一時間淨係起得一間房。等呢間起好咗先開下一間。",
  },
  queueIdle: {
    en: "Nothing is being built. Buy a blueprint, then start construction on it.",
    yue: "而家冇嘢起緊。買張圖則，然後開工。",
  },
  building: (nameEn: string, nameYue: string): Bilingual => ({
    en: `Building the ${nameEn}`,
    yue: `起緊${nameYue}`,
  }),
  timeRemaining: { en: "Time remaining", yue: "仲要幾耐" },
  buildProgress: (percent: string): Bilingual => ({
    en: `Construction progress, ${percent}% complete`,
    yue: `工程進度，完成咗 ${percent}%`,
  }),
  /* The progress bar's NAME never moves; the figure moves, and it moves in aria-valuetext. A
     name that changed five times a second would be a control renaming itself under the reader's
     cursor. Same split on the coziness gauge below. */
  buildProgressName: { en: "Construction progress", yue: "工程進度" },
  buildProgressValue: (percent: string): Bilingual => ({
    en: `${percent}% complete`,
    yue: `完成咗 ${percent}%`,
  }),

  /** Duration, spelled out rather than rendered as a bare clock — a build is minutes, not a time. */
  duration: (minutes: number, seconds: number): Bilingual => ({
    en: minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`,
    yue: minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`,
  }),

  buyBlueprint: { en: "Buy blueprint", yue: "買圖則" },
  startBuild: { en: "Start construction", yue: "開工" },
  buyFurniture: { en: "Buy", yue: "買" },

  /* THE THREE BUY BUTTONS' ACCESSIBLE NAMES. Each takes both room/furniture names and gives each
     language its own, exactly as CONTROL_COPY.slotLabel does, so a mode of 'en' or 'yue' does not
     leave the other language stranded inside the label. The price is literal grouped digits and
     is therefore the same string in both halves. */
  blueprintButtonLabel: (nameEn: string, nameYue: string, price: string): Bilingual => ({
    en: `Buy blueprint: ${nameEn} — ${price} cookies`,
    yue: `買圖則：${nameYue}——${price} 粒曲奇`,
  }),
  startBuildButtonLabel: (nameEn: string, nameYue: string, price: string): Bilingual => ({
    en: `Start construction: ${nameEn} — ${price} cookies`,
    yue: `開工起${nameYue}——${price} 粒曲奇`,
  }),
  furnitureButtonLabel: (nameEn: string, nameYue: string, price: string): Bilingual => ({
    en: `Buy ${nameEn} — ${price} cookies`,
    yue: `買${nameYue}——${price} 粒曲奇`,
  }),
  /* Why a still-pressable button cannot succeed right now, said in its own description rather
     than in a tooltip a keyboard never reaches. */
  blockedShortfall: (short: string): Bilingual => ({
    en: `Not enough cookies — ${short} short.`,
    yue: `曲奇唔夠——爭 ${short} 粒。`,
  }),
  blockedBusy: {
    en: "Another room is under construction. Only one site runs at a time.",
    yue: "仲有第二間房起緊。同一時間淨係起得一間。",
  },
  roomTabsLabel: { en: "Room", yue: "房間" },
  blueprintForSale: { en: "For sale", yue: "有得買" },
  blueprintOwned: { en: "Blueprint owned", yue: "已有圖則" },
  roomBuilt: { en: "Built", yue: "起好" },
  /* Short on purpose. This is a corner chip on a narrow card, and the BUILDING SITE panel above
     already says which room is going up and how long is left; a chip that wraps onto three lines
     to say so a second time pushes the room's own name out of the way. */
  underConstruction: { en: "Building", yue: "施工中" },
  buildTimeLabel: { en: "Build time", yue: "工期" },
  buildCostLabel: { en: "Builders", yue: "工程費" },

  emptyRooms: {
    en: "Nothing built yet. The Kitchen comes first — this is a bakery.",
    yue: "重未起過嘢。要由廚房開始——呢度係餅舖嚟㗎。",
  },
  emptyFurniture: {
    en: "Fully furnished. There is nothing left to buy for this room.",
    yue: "傢俬齊晒。呢間房冇嘢好買。",
  },

  cozinessMeterLabel: (value: string, max: string): Bilingual => ({
    en: `Coziness ${value} out of a possible ${max}`,
    yue: `溫馨度 ${value}，滿分 ${max}`,
  }),
  /* Says what the figure actually IS. It is the coziness curve AND the furniture's own small
     production bonuses multiplied together, which is what the ovens really get — printing the
     curve alone under a gauge labelled "coziness" would be a true number answering the wrong
     question. */
  cozinessEffect: (percent: string): Bilingual => ({
    en: `The house pays +${percent}% on everything the ovens make — the coziness curve and the furniture together.`,
    yue: `間屋令所有產量 +${percent}%——溫馨度曲線同傢俬加成一齊計。`,
  }),
  cozinessNone: {
    en: "An empty building is worth nothing yet. Build a room, then put something in it.",
    yue: "得個空殼仲未計得分。起間房，然後擺啲嘢入去。",
  },
  cozinessOf: { en: "Coziness", yue: "溫馨度" },
  roomsBuiltLabel: { en: "Rooms built", yue: "已起房間" },
  furnitureOwnedLabel: { en: "Furniture placed", yue: "已擺傢俬" },
  investedLabel: { en: "Spent on the house", yue: "屋企總開支" },
  buildSpeedLabel: { en: "Builders' pace", yue: "施工速度" },

  bonusCps: (percent: string): Bilingual => ({ en: `+${percent}% production`, yue: `產量 +${percent}%` }),
  bonusClick: (percent: string): Bilingual => ({ en: `+${percent}% per click`, yue: `每次撳 +${percent}%` }),
  bonusBuild: (percent: string): Bilingual => ({ en: `Builds ${percent}% faster`, yue: `施工快 ${percent}%` }),
  bonusNone: { en: "Nothing but nice", yue: "淨係靚，冇加成" },
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

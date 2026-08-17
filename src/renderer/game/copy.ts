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
    en: "A fuel counter at the back of the shop, selling diesel to WinForge.",
    yue: "商店後面開個油站，賣柴油畀 WinForge。",
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
  buySelected: (count: number): Bilingual => ({ en: `Buy ${count} selected`, yue: `買落${count} 項已選` }),
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
} as const satisfies Record<string, Bilingual>;

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
    en: "No upgrades are marked permanent yet, so a prestige currently resets every upgrade. Permanent unlocks survive prestige once earned.",
    yue: "而家未有升級被標記做永久，所以轉生會重設晒所有升級。永久解鎖之後就唔會被轉生洗走。",
  },
  gatePrestigeTitle: { en: "Prestige now?", yue: "而家轉生？" },
  gatePrestigeResets: {
    en: "This will reset: all buildings, upgrades, and your current cookie count back to zero.",
    yue: "呢個會清空：所有建築物、升級同埋而家嘅曲奇數量會歸零。",
  },
  gatePrestigeKeeps: (points: number): Bilingual => ({
    en: `This carries forward: ${points} ascension point${points === 1 ? "" : "s"} (a permanent production bonus), all unlocked achievements, and every permanent upgrade.`,
    yue: `呢個會保留：${points} 粒飛升點（永久產量加成）、全部已解鎖成就，同埋所有永久升級。`,
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
    en: "Cookies into diesel for WinForge's emergency generators.",
    yue: "用曲奇換 WinForge 應急發電機嘅柴油。",
  },
  litresLabel: { en: "Litres minted", yue: "已開出公升" },
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
  featureOpened: (featureEn: string, featureYue: string): Bilingual => ({
    en: `${featureEn} is not gated — the Settings panel is open, with the closest matching row highlighted.`,
    yue: `${featureYue} 冇被鎖住——設定面板已經打開咗，最相關嗰行標示咗。`,
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

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
 * A funny-level slider / language-mode toggle would normally select which of these renders
 * (see the shared instructions' language-mode contract); no such settings surface exists yet in
 * this lane's scope, so every screen renders both languages together (bilingual-by-default),
 * matching the design mockups' own "English · 中文" presentation.
 */
export interface Bilingual {
  readonly en: string;
  readonly yue: string;
}

export function bilingualText({ en, yue }: Bilingual): string {
  return `${en} · ${yue}`;
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

export const SHELL_COPY = {
  tabsLabel: { en: "Game sections", yue: "遊戲分頁" },
  dismiss: { en: "Dismiss", yue: "收起" },
  /**
   * Shown when the player taps "Open it now" on a tool card. The preload bridge exposes window
   * chrome only, so there is no channel for opening an application feature yet; this states
   * that plainly instead of pretending the click did nothing. It is NOT a gate — the tech tree
   * never decides whether a real feature may be opened.
   */
  featureSurfaceMissing: (featureEn: string, featureYue: string): Bilingual => ({
    en: `${featureEn} is not gated — but this build has no window to open it in yet, so nothing opened.`,
    yue: `${featureYue} 冇被鎖住——不過呢個版本重未有可以開嘅視窗，所以冇嘢開到。`,
  }),
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

export const COOKIE_SCREEN_COPY = {
  clickTarget: { en: "Click the cookie", yue: "撳曲奇" },
  cookiesLabel: { en: "Cookies", yue: "曲奇" },
  cpsLabel: { en: "Cookies per second", yue: "每秒曲奇產量" },
  goldenAvailable: { en: "Golden cookie available", yue: "金曲奇出現" },
  holdHint: { en: "Hold to click repeatedly", yue: "撳住可以連續撳擊" },
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
  reviewPreview: { en: "Review before buying", yue: "購買前先review下" },
} as const satisfies Record<string, Bilingual>;

export const BULK_COPY = {
  selectedCount: (count: number): Bilingual => ({
    en: `${count} selected`,
    yue: `已選 ${count} 項`,
  }),
  buySelected: (count: number): Bilingual => ({ en: `Buy ${count} selected`, yue: `買落${count} 項已選` }),
  exportSelected: (count: number): Bilingual => ({ en: `Export ${count} selected`, yue: `匯出 ${count} 項已選` }),
  clearSelection: { en: "Clear selection", yue: "清除選擇" },
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
  saveCorrupt: (detail: string): Bilingual => ({
    en: `Your previous save could not be read (${detail}). It was kept, unread, next to a fresh save so nothing is lost.`,
    yue: `舊存檔讀唔到（${detail}）。原檔保留咗喺新存檔隔籬，冇整走過任何嘢。`,
  }),
} as const satisfies Record<string, Bilingual | ((...args: any[]) => Bilingual)>;

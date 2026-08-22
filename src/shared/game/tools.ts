import { bnCompare, bnFromNumber, type BigNum } from "./big-number.js";
import type { GameState } from "./types.js";

/**
 * The Tools tech tree turns the application's OWN canonical features (Command Palette,
 * Regex Builder, Local History, and so on) into in-game unlockables the player discovers by
 * playing. As of the owner's decision on 2026-08-16 a tool is no longer just flavour plus a
 * bonus: it also gates the real application feature behind it — see the
 * `gatesApplicationFeature` contract below and `isFeatureAvailable`, the single authority
 * screens consult before opening or enabling a feature.
 */

export type ToolUnlockCondition =
  | { readonly kind: "always" }
  | { readonly kind: "lifetimeCookies"; readonly atLeast: BigNum }
  | { readonly kind: "totalClicks"; readonly atLeast: number }
  | { readonly kind: "generatorOwned"; readonly generatorId: string; readonly atLeast: number }
  | { readonly kind: "prestigeCount"; readonly atLeast: number }
  | { readonly kind: "achievementUnlocked"; readonly achievementId: string };

export type ToolEffect =
  | { readonly kind: "clickMultiplier"; readonly multiplier: number }
  | { readonly kind: "globalCpsMultiplier"; readonly multiplier: number }
  | { readonly kind: "generatorMultiplier"; readonly generatorId: string; readonly multiplier: number }
  /** Reduces the price of a bulk/buy-max generator purchase by this fraction (0..1). */
  | { readonly kind: "buyMaxDiscountPercent"; readonly percent: number }
  /** Adds this many milliseconds to the offline-progress cap. */
  | { readonly kind: "offlineCapExtensionMs"; readonly extensionMs: number }
  /** Adds this fraction (additive) to the offline CPS factor, e.g. 0.1 => +10 percentage points. */
  | { readonly kind: "offlineCpsFactorBonus"; readonly bonus: number };

export interface ToolDefinition {
  readonly id: string;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly flavourEn: string;
  readonly flavourYue: string;
  readonly unlockCondition: ToolUnlockCondition;
  readonly effect: ToolEffect;
  /**
   * ALWAYS `true`, structurally. A tool gate governs the REAL application feature behind it:
   * the canonical feature a tool is named for (Command Palette, Regex Builder, Local History,
   * ...) is not reachable until that tool's bonus is active — either bought early through the
   * Tools shop (tool-shop.ts) or naturally unlocked by meeting its condition. Feature
   * availability is exactly `isFeatureAvailable` below, which is exactly `isToolBonusActive`;
   * there is no second, looser notion of "available" anywhere.
   *
   * This REVERSES the earlier contract, under which this field was structurally `false` and
   * every feature was unconditionally available regardless of play. That reversal is an
   * explicit owner decision made on 2026-08-16, not an accident or a drifted comment.
   */
  readonly gatesApplicationFeature: true;
}

function tool(
  id: string,
  nameEn: string,
  nameYue: string,
  flavourEn: string,
  flavourYue: string,
  unlockCondition: ToolUnlockCondition,
  effect: ToolEffect,
): ToolDefinition {
  return { id, nameEn, nameYue, flavourEn, flavourYue, unlockCondition, effect, gatesApplicationFeature: true };
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  tool(
    "commandPalette",
    "Command Palette",
    "指令面板",
    "Ctrl+Shift+F and you're anywhere. Turns out that's also true of your clicking finger.",
    "Ctrl+Shift+F 一撳去晒任何地方，原來隻手指都跟埋去。",
    { kind: "totalClicks", atLeast: 50 },
    { kind: "clickMultiplier", multiplier: 1.05 },
  ),
  tool(
    "regexBuilder",
    "Regex Builder",
    "正則表達式產生器",
    "Pattern-match your cursors into working harder, not smarter.",
    "用正則表達式匹配手指，叫佢哋做多啲嘢。",
    { kind: "generatorOwned", generatorId: "cursor", atLeast: 10 },
    { kind: "generatorMultiplier", generatorId: "cursor", multiplier: 1.1 },
  ),
  tool(
    "tabGroups",
    "Tab Groups",
    "分頁羣組",
    "Organise your grandmas into a tidy, terrifyingly efficient group.",
    "將啲婆婆分晒組，效率高到得人驚。",
    { kind: "generatorOwned", generatorId: "grandma", atLeast: 10 },
    { kind: "generatorMultiplier", generatorId: "grandma", multiplier: 1.1 },
  ),
  tool(
    "appearanceEditor",
    "Appearance Editor",
    "外觀編輯器",
    "A fresh coat of paint on the whole operation, cookies included.",
    "成盤生意重新油漆，連曲奇都靚咗。",
    { kind: "lifetimeCookies", atLeast: bnFromNumber(1000) },
    { kind: "globalCpsMultiplier", multiplier: 1.03 },
  ),
  tool(
    "colourTranslator",
    "Colour Translator",
    "顏色轉換器",
    "Converts every shade of doubt into HEX, RGB, and one more cookie.",
    "將所有疑惑轉做 HEX、RGB，同多一舊曲奇。",
    { kind: "achievementUnlocked", achievementId: "first_bite" },
    { kind: "clickMultiplier", multiplier: 1.02 },
  ),
  tool(
    "notificationCentre",
    "Notification Centre",
    "通知中心",
    "Every non-blocking toast is a tiny reminder to bake more.",
    "每個唔阻手嘅通知，都係提你焗多啲。",
    { kind: "lifetimeCookies", atLeast: bnFromNumber(10000) },
    { kind: "globalCpsMultiplier", multiplier: 1.03 },
  ),
  tool(
    "localHistory",
    "Local History",
    "本地版本記錄",
    "Every batch you ever baked, still on the shelf. The oven never really turned off.",
    "焗過嘅每一爐都留低咗，焗爐其實從未熄過。",
    { kind: "lifetimeCookies", atLeast: bnFromNumber(100000) },
    { kind: "offlineCapExtensionMs", extensionMs: 6 * 60 * 60 * 1000 },
  ),
  tool(
    "authenticator",
    "Authenticator",
    "身份驗證器",
    "Six digits, thirty seconds, and a bakery that never asks twice.",
    "六個數字、三十秒，餅店從此唔使問多次。",
    { kind: "prestigeCount", atLeast: 1 },
    { kind: "globalCpsMultiplier", multiplier: 1.05 },
  ),
  tool(
    "toyLocks",
    "Toy Locks",
    "玩具鎖",
    "It's just for fun, but the vault sure does fill up faster.",
    "純粹得意，但個金庫真係大得快啲。",
    { kind: "generatorOwned", generatorId: "bank", atLeast: 5 },
    { kind: "generatorMultiplier", generatorId: "bank", multiplier: 1.1 },
  ),
  tool(
    "supportTickets",
    "Support Tickets",
    "支援工單",
    "Nobody is reading these, but writing them keeps your finger limber.",
    "冇人睇呢啲工單，但寫吓都可以鬆一鬆手指。",
    { kind: "totalClicks", atLeast: 5000 },
    { kind: "clickMultiplier", multiplier: 1.05 },
  ),
  tool(
    "scheduledSettings",
    "Scheduled Settings",
    "定時設定",
    "Cookies now bake themselves a little extra, right on schedule, even off the clock.",
    "曲奇準時自動加班焗多啲，落班都繼續開工。",
    { kind: "lifetimeCookies", atLeast: bnFromNumber(1000000) },
    { kind: "offlineCpsFactorBonus", bonus: 0.1 },
  ),
  tool(
    "fileConverter",
    "File Converter",
    "檔案轉換器",
    "Converts raw dough into finished cookies with suspicious efficiency.",
    "將生麵糰轉做曲奇，效率高到有啲得意。",
    { kind: "generatorOwned", generatorId: "factory", atLeast: 10 },
    { kind: "generatorMultiplier", generatorId: "factory", multiplier: 1.1 },
  ),
  tool(
    "localModelManager",
    "Local Model Manager",
    "本地模型管理器",
    "An offline brain quietly optimising the entire bakery while you sleep.",
    "一個離線大腦静静幫成間餅店優化緊，你瞓覺佢都做緊嘢。",
    { kind: "lifetimeCookies", atLeast: bnFromNumber(1000000000) },
    { kind: "globalCpsMultiplier", multiplier: 1.1 },
  ),
  tool(
    "narrator",
    "Narrator",
    "旁述員",
    "A gentle voice cheering on every single click, whether you asked for it or not.",
    "把溫柔嘅聲一路幫你嘅每一下撳打氣，你冇問佢都照講。",
    { kind: "totalClicks", atLeast: 1000 },
    { kind: "clickMultiplier", multiplier: 1.1 },
  ),
  tool(
    "personalVocabulary",
    "Personal Vocabulary",
    "個人詞彙",
    "Your own private in-jokes, now baked directly into the temple's incense schedule.",
    "你自己嘅私人爛 gag，而家直接焗晒入廟嘅香期表度。",
    { kind: "generatorOwned", generatorId: "temple", atLeast: 10 },
    { kind: "generatorMultiplier", generatorId: "temple", multiplier: 1.1 },
  ),
  tool(
    "appLogoCustomization",
    "App Logo Customization",
    "應用程式標誌自訂",
    "A rebrand every ascension. Same cookies, sharper icon.",
    "每次飛升都換個新標誌，曲奇冇變，個 icon 靚咗。",
    { kind: "prestigeCount", atLeast: 1 },
    { kind: "clickMultiplier", multiplier: 1.05 },
  ),
  tool(
    "offlineDocs",
    "Offline Docs",
    "離線文件",
    "Reading the manual, entirely offline, somehow still earns you cookies.",
    "離線睇說明書，都唔知點解仲賺埋曲奇。",
    { kind: "lifetimeCookies", atLeast: bnFromNumber(10000) },
    { kind: "offlineCapExtensionMs", extensionMs: 3 * 60 * 60 * 1000 },
  ),
  tool(
    "externalEditor",
    "External Editor",
    "外部編輯器",
    "Hands the portal's blueprints to someone who actually knows what they're doing.",
    "將傳送門嘅圖則交俾識做嘅人搞掂。",
    { kind: "generatorOwned", generatorId: "portal", atLeast: 5 },
    { kind: "generatorMultiplier", generatorId: "portal", multiplier: 1.1 },
  ),
  tool(
    "exports",
    "Exports",
    "匯出",
    "Exporting the whole ledger in every format someone might one day want, at a bulk discount.",
    "成本數以你想要嘅任何格式匯出，仲有批發價。",
    { kind: "lifetimeCookies", atLeast: bnFromNumber(10000000) },
    { kind: "buyMaxDiscountPercent", percent: 0.05 },
  ),
  tool(
    "bulkActions",
    "Bulk Actions",
    "批量操作",
    "Why buy one when the whole shelf is one honest click away.",
    "點解淨係買一個，成個貨架一撳就到手。",
    { kind: "totalClicks", atLeast: 200 },
    { kind: "buyMaxDiscountPercent", percent: 0.1 },
  ),
];

export function getToolDefinition(id: string): ToolDefinition {
  const def = TOOL_DEFINITIONS.find((t) => t.id === id);
  if (!def) throw new RangeError(`Unknown tool id: ${id}`);
  return def;
}

function isUnlockConditionMet(condition: ToolUnlockCondition, state: GameState): boolean {
  switch (condition.kind) {
    case "always":
      return true;
    case "lifetimeCookies":
      return bnCompare(state.lifetimeCookies, condition.atLeast) >= 0;
    case "totalClicks":
      return state.stats.totalClicks >= condition.atLeast;
    case "generatorOwned": {
      const owned = state.generators.find((g) => g.id === condition.generatorId);
      return (owned?.count ?? 0) >= condition.atLeast;
    }
    case "prestigeCount":
      return state.prestige.totalPrestigeCount >= condition.atLeast;
    case "achievementUnlocked":
      return state.achievements.some((a) => a.id === condition.achievementId);
  }
}

/**
 * Whether a tool's GAMEPLAY BONUS is currently active. This is the single authority for that
 * question, and — since the 2026-08-16 owner decision recorded on `gatesApplicationFeature`
 * above — for whether the real application feature behind the tool is reachable too. See
 * `isFeatureAvailable` below, which is defined as exactly this predicate so the two answers
 * can never drift apart.
 *
 * When `state.toolProgressionEnabled` is false, every bonus is treated as active regardless
 * of its unlock condition — the player has opted out of the grind and sees everything
 * unlocked, which under the new contract also makes every feature available.
 *
 * A tool bought early through the Tools shop (see tool-shop.ts, `state.purchasedToolIds`) is
 * also active regardless of its unlock condition — buying it is exactly like meeting the
 * condition early. `state.purchasedToolIds` defaults to `[]` on a fresh game and is optional
 * chained here so a state object built before this field existed still reads safely.
 */
export function isToolBonusActive(state: GameState, toolId: string): boolean {
  if (!state.toolProgressionEnabled) return true;
  if ((state.purchasedToolIds ?? []).includes(toolId)) return true;
  const def = getToolDefinition(toolId);
  return isUnlockConditionMet(def.unlockCondition, state);
}

/**
 * Whether the REAL application feature behind `toolId` is available right now. This is the one
 * authority screens use to decide whether to open or enable a feature — no screen may reach a
 * feature by any other test, and there is no looser fallback.
 *
 * By the owner's 2026-08-16 decision, feature availability is defined as exactly
 * `isToolBonusActive`: a feature is reachable once its tool's bonus is active, whether that
 * came from buying the tool early in the Tools shop or from meeting its unlock condition
 * naturally. It follows that `state.toolProgressionEnabled === false` — the player setting
 * that treats every tool bonus as active — makes every feature available as well. That is
 * intended, and needs no special-casing here because `isToolBonusActive` already folds it in.
 */
export function isFeatureAvailable(state: GameState, toolId: string): boolean {
  return isToolBonusActive(state, toolId);
}

/** Ids of tools whose unlock condition is newly satisfied but not previously recorded. */
export function evaluateNewlyUnlockedTools(
  state: GameState,
  previouslyUnlockedIds: ReadonlySet<string>,
): readonly string[] {
  const newlyUnlocked: string[] = [];
  for (const def of TOOL_DEFINITIONS) {
    if (previouslyUnlockedIds.has(def.id)) continue;
    if (isUnlockConditionMet(def.unlockCondition, state)) {
      newlyUnlocked.push(def.id);
    }
  }
  return newlyUnlocked;
}

/** Combined buy-max discount fraction (0..0.9) from every currently-active discount tool. */
export function totalBuyMaxDiscount(state: GameState): number {
  let remainingFraction = 1;
  for (const def of TOOL_DEFINITIONS) {
    if (def.effect.kind !== "buyMaxDiscountPercent") continue;
    if (!isToolBonusActive(state, def.id)) continue;
    remainingFraction *= 1 - def.effect.percent;
  }
  return Math.min(0.9, 1 - remainingFraction);
}

export interface OfflineBonusTotals {
  readonly extensionMs: number;
  readonly cpsFactorBonus: number;
}

/** Combined offline-progress bonuses from every currently-active offline-related tool. */
export function totalOfflineBonuses(state: GameState): OfflineBonusTotals {
  let extensionMs = 0;
  let cpsFactorBonus = 0;
  for (const def of TOOL_DEFINITIONS) {
    if (!isToolBonusActive(state, def.id)) continue;
    if (def.effect.kind === "offlineCapExtensionMs") extensionMs += def.effect.extensionMs;
    if (def.effect.kind === "offlineCpsFactorBonus") cpsFactorBonus += def.effect.bonus;
  }
  return { extensionMs, cpsFactorBonus };
}

import { bnCompare, bnToNumber, type BigNum } from "../../shared/game/big-number.js";
import { getGeneratorDefinition } from "../../shared/game/generators.js";
import { isToolBonusActive, TOOL_DEFINITIONS, type ToolDefinition, type ToolEffect, type ToolUnlockCondition } from "../../shared/game/tools.js";
import type { GameState } from "../../shared/game/types.js";
import type { Bilingual } from "./copy.js";

/**
 * Every tool row's view state, derived purely from `GameState` — no separate "discovery" flag
 * exists in the domain (see tools.ts: the only predicate it exposes is
 * `isToolBonusActive`, which folds in the unlock condition AND the progression toggle). This
 * module adds one presentational classification on top, using each condition's own current/
 * target numbers: a tool with genuinely ZERO progress toward its condition renders as
 * "undiscovered" (name/flavour hidden, matching design/tool-card.html's mystery-card state);
 * once any progress exists it renders as "locked" with a progress readout; once the bonus is
 * active it renders as "unlocked". This is a display classification only — `isToolBonusActive`
 * remains the one and only authority for whether the gameplay bonus applies, and its alias
 * `isFeatureAvailable` is the one and only authority for whether the real application feature
 * is switched on. The tech tree is real: a tool that is not bought or unlocked leaves BOTH its
 * gameplay bonus and its application feature off, so ToolsScreen.tsx's "open feature" action is
 * enabled only on an unlocked card and disabled everywhere else.
 */
export type ToolRowState = "undiscovered" | "locked" | "unlocked";

export interface ToolRowViewModel {
  readonly id: string;
  readonly def: ToolDefinition;
  readonly state: ToolRowState;
  readonly progressRatio: number;
  readonly progress: Bilingual;
  readonly bonus: Bilingual;
}

function conditionProgress(condition: ToolUnlockCondition, state: GameState): { current: number; target: number; label: Bilingual } {
  switch (condition.kind) {
    case "always":
      return { current: 1, target: 1, label: { en: "Available from the start", yue: "一開始就有" } };
    case "lifetimeCookies": {
      const target = bnToNumber(condition.atLeast);
      const current = Math.min(target, bnToNumber(state.lifetimeCookies));
      return {
        current,
        target,
        label: { en: `${Math.floor(current).toLocaleString("en-US")} / ${target.toLocaleString("en-US")} lifetime cookies`, yue: `一生累積曲奇 ${Math.floor(current).toLocaleString("en-US")} / ${target.toLocaleString("en-US")}` },
      };
    }
    case "totalClicks": {
      const current = Math.min(condition.atLeast, state.stats.totalClicks);
      return {
        current,
        target: condition.atLeast,
        label: { en: `${current} / ${condition.atLeast} clicks`, yue: `撳咗 ${current} / ${condition.atLeast} 下` },
      };
    }
    case "generatorOwned": {
      const def = getGeneratorDefinition(condition.generatorId);
      const owned = state.generators.find((g) => g.id === condition.generatorId)?.count ?? 0;
      const current = Math.min(condition.atLeast, owned);
      return {
        current,
        target: condition.atLeast,
        label: { en: `${current} / ${condition.atLeast} ${def.nameEn}`, yue: `${current} / ${condition.atLeast} 個${def.nameYue}` },
      };
    }
    case "prestigeCount": {
      const current = Math.min(condition.atLeast, state.prestige.totalPrestigeCount);
      return {
        current,
        target: condition.atLeast,
        label: { en: `${current} / ${condition.atLeast} prestige runs`, yue: `轉生 ${current} / ${condition.atLeast} 次` },
      };
    }
    case "achievementUnlocked": {
      const has = state.achievements.some((a) => a.id === condition.achievementId);
      return {
        current: has ? 1 : 0,
        target: 1,
        label: has
          ? { en: "Requirement achievement unlocked", yue: "所需成就已解鎖" }
          : { en: "Requires a specific achievement", yue: "需要特定成就" },
      };
    }
  }
}

function describeEffect(effect: ToolEffect): Bilingual {
  switch (effect.kind) {
    case "clickMultiplier":
      return { en: `Gameplay bonus: click power ×${effect.multiplier}`, yue: `遊戲加成：每擊力量 ×${effect.multiplier}` };
    case "globalCpsMultiplier":
      return { en: `Gameplay bonus: global CPS ×${effect.multiplier}`, yue: `遊戲加成：全局產量 ×${effect.multiplier}` };
    case "generatorMultiplier": {
      const def = getGeneratorDefinition(effect.generatorId);
      return {
        en: `Gameplay bonus: ${def.nameEn} output ×${effect.multiplier}`,
        yue: `遊戲加成：${def.nameYue}產量 ×${effect.multiplier}`,
      };
    }
    case "buyMaxDiscountPercent":
      return {
        en: `Gameplay bonus: bulk-buy price −${Math.round(effect.percent * 100)}%`,
        yue: `遊戲加成：批量購買價錢 −${Math.round(effect.percent * 100)}%`,
      };
    case "offlineCapExtensionMs": {
      const hours = effect.extensionMs / (60 * 60 * 1000);
      return {
        en: `Gameplay bonus: offline cap +${hours}h`,
        yue: `遊戲加成：離線上限 +${hours} 小時`,
      };
    }
    case "offlineCpsFactorBonus":
      return {
        en: `Gameplay bonus: offline rate +${Math.round(effect.bonus * 100)}%`,
        yue: `遊戲加成：離線產量 +${Math.round(effect.bonus * 100)}%`,
      };
  }
}

export function buildToolRowViewModel(def: ToolDefinition, state: GameState): ToolRowViewModel {
  const active = isToolBonusActive(state, def.id);
  const { current, target, label } = conditionProgress(def.unlockCondition, state);
  const ratio = target > 0 ? Math.min(1, current / target) : 1;

  let rowState: ToolRowState;
  if (active) rowState = "unlocked";
  else if (current <= 0) rowState = "undiscovered";
  else rowState = "locked";

  return { id: def.id, def, state: rowState, progressRatio: ratio, progress: label, bonus: describeEffect(def.effect) };
}

export function buildAllToolRowViewModels(state: GameState): ToolRowViewModel[] {
  return TOOL_DEFINITIONS.map((def) => buildToolRowViewModel(def, state));
}

/** Whether `current` meets `atLeast` — small helper kept for tests. */
export function bnAtLeastMet(current: BigNum, atLeast: BigNum): boolean {
  return bnCompare(current, atLeast) >= 0;
}

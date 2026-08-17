import { getAchievementDefinition } from "../../shared/game/achievements.js";
import { getGeneratorDefinition } from "../../shared/game/generators.js";
import type { GameAction } from "../../shared/game/reducer.js";
import { isToolDiscovered, TOOL_DEFINITIONS } from "../../shared/game/tools.js";
import { formatExact } from "../../shared/game/format-number.js";
import { getRandomEventDefinition, type MouseRaidOutcome, type RandomEventId } from "../../shared/game/random-events.js";
import { getUpgradeDefinition } from "../../shared/game/upgrades.js";
import type { GameState } from "../../shared/game/types.js";
import type { Bilingual } from "./copy.js";

/**
 * Milestone detection for the narrator/status region.
 *
 * A cookie-clicker's most frequent event by far is a plain click, and the accessibility
 * contract for this app is explicit: the live cookie counter is `aria-live="off"` and a
 * SEPARATE, throttled `role="status"` region announces only milestones. `detectMilestones`
 * is the one place that decides what counts as a milestone; a plain click that crosses no
 * threshold produces an empty array, so nothing is ever announced for it. An achievement that
 * a click happens to unlock IS a milestone and DOES produce an event — the rule is "not every
 * click", not "never on a click".
 */
export type MilestoneEvent =
  | { readonly kind: "achievement"; readonly id: string }
  | { readonly kind: "purchase-generator"; readonly id: string; readonly quantity: number }
  | { readonly kind: "purchase-upgrade"; readonly id: string }
  /** A tool's unlock condition just became true. That makes it FINDABLE and BUYABLE, not
   *  active — the toast says "discovered" because that is all that happened. */
  | { readonly kind: "tool-discovered"; readonly id: string }
  | { readonly kind: "tool-bought"; readonly id: string }
  | { readonly kind: "golden-cookie-spawned" }
  | { readonly kind: "golden-cookie-collected" }
  /**
   * A random event (random-events.ts) starting and finishing. Both are milestones by the rule
   * this module already applies: they are rare, they change what the numbers are doing, and a
   * player who cannot see the stage has no other way to learn that production just halved or
   * that there are cookies falling they could be catching.
   */
  | { readonly kind: "random-event-spawned"; readonly id: RandomEventId }
  | {
      readonly kind: "random-event-resolved";
      readonly id: RandomEventId;
      readonly claimedCount: number;
      readonly endedEarly: boolean;
    }
  /**
   * A Mouse Raid finishing. It gets its own kind rather than reusing `random-event-resolved`
   * because the only thing worth announcing about a raid is the OUTCOME — what was taken or
   * what was saved — and that is a number, not an event name. A player who cannot see the stage
   * learns from this line alone that their balance just moved and by exactly how much.
   */
  | { readonly kind: "mouse-raid-resolved"; readonly outcome: MouseRaidOutcome }
  | { readonly kind: "prestige-available" }
  | { readonly kind: "prestige"; readonly pointsEarned: number };

export function detectMilestones(previous: GameState, next: GameState, action: GameAction): MilestoneEvent[] {
  const events: MilestoneEvent[] = [];

  if (next.achievements.length > previous.achievements.length) {
    const previousIds = new Set(previous.achievements.map((a) => a.id));
    for (const unlocked of next.achievements) {
      if (!previousIds.has(unlocked.id)) events.push({ kind: "achievement", id: unlocked.id });
    }
  }

  if (action.type === "buyGenerator" || action.type === "buyGeneratorBulk") {
    const before = previous.generators.find((g) => g.id === action.generatorId)?.count ?? 0;
    const after = next.generators.find((g) => g.id === action.generatorId)?.count ?? 0;
    if (after > before) events.push({ kind: "purchase-generator", id: action.generatorId, quantity: after - before });
  }

  if (action.type === "buyUpgrade" && next.upgrades.length > previous.upgrades.length) {
    events.push({ kind: "purchase-upgrade", id: action.upgradeId });
  }

  if (!previous.goldenCookie.isSpawned && next.goldenCookie.isSpawned) {
    events.push({ kind: "golden-cookie-spawned" });
  }
  if (action.type === "collectGoldenCookie" && previous.goldenCookie.isSpawned) {
    events.push({ kind: "golden-cookie-collected" });
  }

  if (next.randomEvents.spawnCount > previous.randomEvents.spawnCount) {
    // An instant event never occupies the active slot, so read the id from whichever place it
    // landed: the active event for a timed/clickable one, the just-resolved record otherwise.
    const id = next.randomEvents.active?.id ?? next.randomEvents.lastResolved?.id;
    if (id) events.push({ kind: "random-event-spawned", id });
  }

  if (next.randomEvents.lastRaid !== previous.randomEvents.lastRaid && next.randomEvents.lastRaid) {
    events.push({ kind: "mouse-raid-resolved", outcome: next.randomEvents.lastRaid });
  }

  if (
    previous.randomEvents.active !== null &&
    next.randomEvents.active === null &&
    next.randomEvents.lastResolved &&
    // A raid announces its outcome above and only there: two lines for one event would push the
    // one that carries the figure out of the throttled status region.
    next.randomEvents.lastResolved.id !== "mouse_raid"
  ) {
    const resolved = next.randomEvents.lastResolved;
    events.push({
      kind: "random-event-resolved",
      id: resolved.id,
      claimedCount: resolved.claimedCount,
      endedEarly: resolved.endedEarly,
    });
  }

  if (action.type === "prestige") {
    if (next.prestige.totalPrestigeCount > previous.prestige.totalPrestigeCount) {
      events.push({ kind: "prestige", pointsEarned: next.prestige.ascensionPoints - previous.prestige.ascensionPoints });
    }
  }

  if (action.type === "buyTool" && next.purchasedToolIds.length > previous.purchasedToolIds.length) {
    events.push({ kind: "tool-bought", id: action.toolId });
  }

  for (const def of TOOL_DEFINITIONS) {
    const was = isToolDiscovered(previous, def.id);
    const now = isToolDiscovered(next, def.id);
    if (!was && now) events.push({ kind: "tool-discovered", id: def.id });
  }

  return events;
}

export function describeMilestone(event: MilestoneEvent): Bilingual {
  switch (event.kind) {
    case "achievement": {
      const def = getAchievementDefinition(event.id);
      return { en: `Achievement unlocked: ${def.nameEn}`, yue: `成就解鎖：${def.nameYue}` };
    }
    case "purchase-generator": {
      const def = getGeneratorDefinition(event.id);
      return {
        en: `Bought ${event.quantity} × ${def.nameEn}`,
        yue: `買咗 ${event.quantity} 個${def.nameYue}`,
      };
    }
    case "purchase-upgrade": {
      const def = getUpgradeDefinition(event.id);
      return { en: `Upgrade bought: ${def.nameEn}`, yue: `升級買咗：${def.nameYue}` };
    }
    case "tool-discovered": {
      const def = TOOL_DEFINITIONS.find((t) => t.id === event.id);
      const nameEn = def?.nameEn ?? event.id;
      const nameYue = def?.nameYue ?? event.id;
      // "Discovered", not "unlocked": nothing was granted. The tool is now on the shelf with a
      // price on it, and the bonus starts the moment the player buys it and not before.
      return { en: `Tool discovered: ${nameEn}`, yue: `發現工具：${nameYue}` };
    }
    case "tool-bought": {
      const def = TOOL_DEFINITIONS.find((t) => t.id === event.id);
      const nameEn = def?.nameEn ?? event.id;
      const nameYue = def?.nameYue ?? event.id;
      return { en: `Tool unlocked: ${nameEn}`, yue: `工具解鎖：${nameYue}` };
    }
    case "golden-cookie-spawned":
      return { en: "A golden cookie appeared!", yue: "金曲奇出現喇！" };
    case "golden-cookie-collected":
      return { en: "Golden cookie collected.", yue: "金曲奇收到手。" };
    case "random-event-spawned": {
      const def = getRandomEventDefinition(event.id);
      return {
        en: `${def.nameEn}: ${def.blurbEn}`,
        yue: `${def.nameYue}：${def.blurbYue}`,
      };
    }
    case "random-event-resolved": {
      const def = getRandomEventDefinition(event.id);
      if (event.claimedCount > 0) {
        return {
          en: `${def.nameEn} over — ${event.claimedCount} caught.`,
          yue: `${def.nameYue}完咗——接到 ${event.claimedCount} 個。`,
        };
      }
      return {
        en: `${def.nameEn} over.`,
        yue: `${def.nameYue}完咗。`,
      };
    }
    case "mouse-raid-resolved": {
      const { outcome } = event;
      if (outcome.defended) {
        return {
          en: `Mouse Raid defended — all ${outcome.miceTotal} mice chased off, nothing stolen.`,
          yue: `老鼠打劫擋住咗——${outcome.miceTotal} 隻全部拍走，冇損失。`,
        };
      }
      // A pass is not a defence and the announcement says so. The player did not whack them;
      // they paid for the mice to leave empty-handed, which is a different sentence.
      if (outcome.passSpent) {
        return {
          en: `Mouse Raid over — a Whack Pass was spent, so the ${outcome.miceEscaped} mice that got away took nothing.`,
          yue: `老鼠打劫完咗——用咗一張打鼠券，走甩嘅 ${outcome.miceEscaped} 隻乜都攞唔到。`,
        };
      }
      const stolenEn = formatExact(outcome.stolen, "en");
      const stolenYue = formatExact(outcome.stolen, "yue");
      return {
        en: `Mouse Raid over — ${outcome.miceEscaped} of ${outcome.miceTotal} mice got away with ${stolenEn} cookies.`,
        yue: `老鼠打劫完咗——${outcome.miceTotal} 隻走甩咗 ${outcome.miceEscaped} 隻，帶走 ${stolenYue} 粒曲奇。`,
      };
    }
    case "prestige-available":
      return { en: "Prestige is ready.", yue: "可以轉生喇。" };
    case "prestige":
      return { en: `Prestiged — +${event.pointsEarned} ascension points.`, yue: `轉生完成——飛升點 +${event.pointsEarned}。` };
  }
}

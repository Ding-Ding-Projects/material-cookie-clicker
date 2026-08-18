import { getAchievementDefinition } from "../../shared/game/achievements.js";
import { getGeneratorDefinition } from "../../shared/game/generators.js";
import type { GameAction } from "../../shared/game/reducer.js";
import { isToolDiscovered, TOOL_DEFINITIONS } from "../../shared/game/tools.js";
import { formatExact } from "../../shared/game/format-number.js";
import {
  getRandomEventDefinition,
  getRaidConsumableDefinition,
  whackStorageCap,
  type MouseRaidOutcome,
  type RaidConsumableId,
  type RandomEventId,
} from "../../shared/game/random-events.js";
import {
  getFurnitureDefinition,
  getRoomDefinition,
  isRoomBuilt,
  ownsBlueprint,
  ownsFurniture,
} from "../../shared/game/home-construction.js";
import { getUpgradeDefinition } from "../../shared/game/upgrades.js";
import type { GameState } from "../../shared/game/types.js";
import { STACK_HEADLINE } from "./copy.js";
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
  | {
      readonly kind: "random-event-spawned";
      /** The first event drawn. Always present, and equal to `stackIds[0]`. */
      readonly id: RandomEventId;
      /**
       * EVERY event this one spawn put up: one id normally, two on a double, three on a triple.
       *
       * `id` is kept alongside it so nothing that only ever cared about "which event started"
       * had to change, and so the two can never be read as describing different spawns.
       */
      readonly stackIds: readonly RandomEventId[];
    }
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
  | { readonly kind: "prestige"; readonly pointsEarned: number }
  /**
   * THE HOME AND THE RAID SHELF. These are purchases exactly like a generator's, and they are
   * announced exactly like one: the buy buttons on those two surfaces carry no live region of
   * their own, so this is the only path by which a screen-reader user learns that a press did
   * anything. A room FINISHING is here for a different reason — it is a delayed change nobody
   * pressed a button for, and the player was almost certainly looking somewhere else when it
   * happened.
   */
  | { readonly kind: "home-blueprint-bought"; readonly roomId: string }
  | { readonly kind: "home-construction-started"; readonly roomId: string }
  | { readonly kind: "home-furniture-bought"; readonly furnitureId: string }
  | { readonly kind: "home-room-completed"; readonly roomId: string }
  | { readonly kind: "raid-consumable-bought"; readonly consumableId: RaidConsumableId }
  | { readonly kind: "whack-storage-bought"; readonly cap: number }
  /**
   * A press the domain refused. CoinSlot already prints its own refusal into its own status
   * span (CoinSlot.tsx), and the rule it set is the one followed here: a purchase button that
   * stays pressable when it cannot succeed owes the player a spoken reason, or the press is
   * indistinguishable from a broken control.
   */
  | {
      readonly kind: "purchase-refused";
      readonly nameEn: string;
      readonly nameYue: string;
      readonly reason: "afford" | "busy" | "cap";
    };

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
  // Redemption is now the THIRD hit on the Oven Dial, not a click — so the announcement is keyed
  // on the cookie actually leaving the stage with a new effect on it, rather than on the action
  // kind. A cookie that fled (Escape, or the window running out) despawns with no new effect and
  // is deliberately silent: nothing was won, and a screen reader does not need telling twice.
  if (
    action.type === "goldenDialPress" &&
    previous.goldenCookie.isSpawned &&
    !next.goldenCookie.isSpawned
  ) {
    events.push({ kind: "golden-cookie-collected" });
  }

  if (next.randomEvents.spawnCount > previous.randomEvents.spawnCount) {
    // A spawn now brings ONE, TWO OR THREE events at once, and they arrive as a whole list in a
    // single dispatch, so the running list IS the stack that just landed. One milestone is pushed
    // for the whole stack rather than one per member: three announcements in the throttled status
    // region would push the first two out before anyone read them, and "DOUBLE EVENT" is one
    // thing that happened, not two.
    //
    // An instant event never joins the list at all, so it is read off the just-resolved record,
    // exactly as before.
    const ids = next.randomEvents.actives.map((active) => active.id);
    const stackIds = ids.length > 0 ? ids : next.randomEvents.lastResolved ? [next.randomEvents.lastResolved.id] : [];
    if (stackIds.length > 0) {
      events.push({ kind: "random-event-spawned", id: stackIds[0], stackIds });
    }
  }

  if (next.randomEvents.lastRaid !== previous.randomEvents.lastRaid && next.randomEvents.lastRaid) {
    events.push({ kind: "mouse-raid-resolved", outcome: next.randomEvents.lastRaid });
  }

  if (
    // The stage going from busy to CLEAR. A member of a stack expiring while its companions run
    // on is deliberately silent: the player can see two plates become one, and announcing every
    // departure of a triple would spend the status region on bookkeeping.
    previous.randomEvents.actives.length > 0 &&
    next.randomEvents.actives.length === 0 &&
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

  // ---- the home and the raid shelf -------------------------------------------------------
  // Each of these compares the state the reducer actually produced rather than trusting the
  // action, so a refused press falls through to the refusal branch instead of announcing a
  // purchase that never happened.
  if (action.type === "buyHomeBlueprint") {
    const def = getRoomDefinition(action.roomId);
    if (!ownsBlueprint(previous.homeConstruction, action.roomId) && ownsBlueprint(next.homeConstruction, action.roomId)) {
      events.push({ kind: "home-blueprint-bought", roomId: action.roomId });
    } else if (!ownsBlueprint(previous.homeConstruction, action.roomId)) {
      events.push({ kind: "purchase-refused", nameEn: def.nameEn, nameYue: def.nameYue, reason: "afford" });
    }
  }

  if (action.type === "startHomeConstruction") {
    const def = getRoomDefinition(action.roomId);
    if (previous.homeConstruction.build?.roomId !== action.roomId && next.homeConstruction.build?.roomId === action.roomId) {
      events.push({ kind: "home-construction-started", roomId: action.roomId });
    } else if (next.homeConstruction.build?.roomId !== action.roomId) {
      // Blocked by the one-site rule is a different sentence from blocked by the balance, and
      // the button's own accessible name says the same thing this line does.
      const busy = previous.homeConstruction.build !== null;
      events.push({
        kind: "purchase-refused",
        nameEn: def.nameEn,
        nameYue: def.nameYue,
        reason: busy ? "busy" : "afford",
      });
    }
  }

  if (action.type === "buyHomeFurniture") {
    const def = getFurnitureDefinition(action.furnitureId);
    if (!ownsFurniture(previous.homeConstruction, action.furnitureId) && ownsFurniture(next.homeConstruction, action.furnitureId)) {
      events.push({ kind: "home-furniture-bought", furnitureId: action.furnitureId });
    } else if (!ownsFurniture(previous.homeConstruction, action.furnitureId)) {
      events.push({ kind: "purchase-refused", nameEn: def.nameEn, nameYue: def.nameYue, reason: "afford" });
    }
  }

  if (action.type === "buyRaidConsumable") {
    const def = getRaidConsumableDefinition(action.consumableId);
    const before = previous.randomEvents.consumables[action.consumableId].stock;
    const after = next.randomEvents.consumables[action.consumableId].stock;
    if (after > before) {
      events.push({ kind: "raid-consumable-bought", consumableId: action.consumableId });
    } else {
      events.push({
        kind: "purchase-refused",
        nameEn: def.nameEn,
        nameYue: def.nameYue,
        reason: before >= whackStorageCap(previous.randomEvents.whackStorageLevel) ? "cap" : "afford",
      });
    }
  }

  if (action.type === "buyWhackStorage") {
    const before = previous.randomEvents.whackStorageLevel;
    const after = next.randomEvents.whackStorageLevel;
    if (after > before) {
      events.push({ kind: "whack-storage-bought", cap: whackStorageCap(after) });
    } else {
      events.push({
        kind: "purchase-refused",
        nameEn: "Whack Storage",
        nameYue: "裝備倉",
        reason: "afford",
      });
    }
  }

  // A room finishing is not tied to any action — it lands on whichever tick crosses the build
  // time — so it is detected by diffing the built rooms rather than by inspecting the action.
  if (next.homeConstruction.rooms.length > previous.homeConstruction.rooms.length) {
    for (const room of next.homeConstruction.rooms) {
      if (!isRoomBuilt(previous.homeConstruction, room.roomId)) {
        events.push({ kind: "home-room-completed", roomId: room.roomId });
      }
    }
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
      const defs = event.stackIds.map(getRandomEventDefinition);
      // A stack is announced by its HEADLINE and its NAMES, and not by its blurbs. Two or three
      // blurbs run together make a paragraph nobody reads and a status announcement nobody can
      // follow; the names are what the player needs to match against the plates in the HUD, and
      // each event's own indicator carries the rest. A single event keeps its blurb exactly as
      // before, because there is nothing there to disambiguate.
      if (defs.length > 1) {
        const headline = defs.length >= 3 ? STACK_HEADLINE.triple : STACK_HEADLINE.double;
        return {
          en: `${headline.en} ${defs.map((def) => def.nameEn).join(" + ")}`,
          yue: `${headline.yue} ${defs.map((def) => def.nameYue).join(" + ")}`,
        };
      }
      const def = defs[0] ?? getRandomEventDefinition(event.id);
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
    case "home-blueprint-bought": {
      const def = getRoomDefinition(event.roomId);
      return { en: `Blueprint bought: ${def.nameEn}.`, yue: `買咗圖則：${def.nameYue}。` };
    }
    case "home-construction-started": {
      const def = getRoomDefinition(event.roomId);
      return { en: `Construction started on the ${def.nameEn}.`, yue: `開工起${def.nameYue}。` };
    }
    case "home-furniture-bought": {
      const def = getFurnitureDefinition(event.furnitureId);
      return { en: `Bought ${def.nameEn} for the home.`, yue: `買咗${def.nameYue}擺屋企。` };
    }
    case "home-room-completed": {
      const def = getRoomDefinition(event.roomId);
      return { en: `The ${def.nameEn} is finished.`, yue: `${def.nameYue}起好喇。` };
    }
    case "raid-consumable-bought": {
      const def = getRaidConsumableDefinition(event.consumableId);
      return { en: `Bought ${def.nameEn}.`, yue: `買咗${def.nameYue}。` };
    }
    case "whack-storage-bought": {
      return {
        en: `Whack Storage upgraded — you can hold ${event.cap} of each raid supply now.`,
        yue: `裝備倉升咗級——每樣防鼠裝備而家可以擺 ${event.cap} 件。`,
      };
    }
    case "purchase-refused": {
      if (event.reason === "cap") {
        return {
          en: `${event.nameEn} not bought — stock is already full.`,
          yue: `買唔到${event.nameYue}——庫存已經滿咗。`,
        };
      }
      if (event.reason === "busy") {
        return {
          en: `${event.nameEn} not started — another room is already under construction.`,
          yue: `開唔到工起${event.nameYue}——仲有第二間房起緊。`,
        };
      }
      // Neutral about WHAT was refused, because this line covers a blueprint, a build and a pass
      // alike; the name in front of it already says which.
      return {
        en: `${event.nameEn} — not enough cookies.`,
        yue: `${event.nameYue}——曲奇唔夠。`,
      };
    }
    case "prestige-available":
      return { en: "Prestige is ready.", yue: "可以轉生喇。" };
    case "prestige":
      return { en: `Prestiged — +${event.pointsEarned} ascension points.`, yue: `轉生完成——飛升點 +${event.pointsEarned}。` };
  }
}

import { bnFromNumber, type BigNum } from "./big-number.js";

/**
 * REBORN — 轉生.
 *
 * Ascension already existed and was one number: every ascension point is a permanent +1% and
 * there was nothing to decide. Reborn is the layer that gives those points somewhere to go.
 *
 * A Reborn node is bought with ascension points, is never refunded, and is never reset — it
 * sits outside the run entirely, which is exactly why the run's own reset can be made
 * survivable by it. The four things a node can do are the four things a player actually wants
 * after throwing a run away:
 *
 *   - START WITH X: cookies already in the jar the moment a new run begins.
 *   - RETAIN Y%: keep a slice of the upgrade catalogue you had bought, dearest first.
 *   - MULTIPLY: a flat permanent multiplier on click and/or total production.
 *   - PERMANENT SLOTS: pin specific upgrades so a reset can never take them, at all.
 *
 * Nothing here unlocks itself. A node is bought, by hand, in the Prestige panel's Reborn tree,
 * and only when its prerequisite is already bought and the points are actually there — the
 * same manual-purchase contract every other shelf in this game obeys.
 */

export type RebornEffect =
  /** Cookies handed to a brand-new run the instant a prestige completes. */
  | { readonly kind: "startWithCookies"; readonly cookies: number }
  /** Fraction (0..1) of the owned upgrade catalogue carried across a reset. */
  | { readonly kind: "retainUpgrades"; readonly fraction: number }
  /** Permanent multiplier on total production. */
  | { readonly kind: "globalCpsMultiplier"; readonly multiplier: number }
  /** Permanent multiplier on click value. */
  | { readonly kind: "clickMultiplier"; readonly multiplier: number }
  /** Additional upgrades the player may pin as permanent, immune to every reset. */
  | { readonly kind: "permanentSlots"; readonly slots: number };

export interface RebornNodeDefinition {
  readonly id: string;
  readonly nameEn: string;
  readonly nameYue: string;
  /** Cost in ascension points. */
  readonly cost: number;
  readonly effect: RebornEffect;
  /** Node that must already be owned, or null for a root of the tree. */
  readonly requires: string | null;
  /** Which of the three branches this node hangs from, for the tree's layout. */
  readonly branch: RebornBranch;
}

export type RebornBranch = "inheritance" | "power" | "memory";

/**
 * The tree. Three branches, each a straight chain, so the shape is legible at a glance and a
 * player is never asked to plan around a graph: inheritance is what a new run starts with,
 * power is what every run is multiplied by, memory is what a run refuses to forget.
 */
export const REBORN_NODE_DEFINITIONS: readonly RebornNodeDefinition[] = [
  /* --- inheritance: cookies already in the jar --- */
  {
    id: "reborn_lucky_pocket",
    nameEn: "Lucky Pocket",
    nameYue: "利是袋",
    cost: 1,
    effect: { kind: "startWithCookies", cookies: 10000 },
    requires: null,
    branch: "inheritance",
  },
  {
    id: "reborn_red_packet",
    nameEn: "Red Packet",
    nameYue: "大封利是",
    cost: 5,
    effect: { kind: "startWithCookies", cookies: 1000000 },
    requires: "reborn_lucky_pocket",
    branch: "inheritance",
  },
  {
    id: "reborn_family_vault",
    nameEn: "Family Vault",
    nameYue: "祖傳夾萬",
    cost: 25,
    effect: { kind: "startWithCookies", cookies: 1000000000 },
    requires: "reborn_red_packet",
    branch: "inheritance",
  },
  {
    id: "reborn_ancestral_estate",
    nameEn: "Ancestral Estate",
    nameYue: "祖屋",
    cost: 120,
    effect: { kind: "startWithCookies", cookies: 1e13 },
    requires: "reborn_family_vault",
    branch: "inheritance",
  },
  /* --- power: the permanent multipliers --- */
  {
    id: "reborn_second_wind",
    nameEn: "Second Wind",
    nameYue: "翻生",
    cost: 3,
    effect: { kind: "globalCpsMultiplier", multiplier: 1.25 },
    requires: null,
    branch: "power",
  },
  {
    id: "reborn_heavenly_dough",
    nameEn: "Heavenly Dough",
    nameYue: "天庭麵種",
    cost: 15,
    effect: { kind: "globalCpsMultiplier", multiplier: 1.5 },
    requires: "reborn_second_wind",
    branch: "power",
  },
  {
    id: "reborn_borrowed_hands",
    nameEn: "Borrowed Hands",
    nameYue: "借來嘅手",
    cost: 8,
    effect: { kind: "clickMultiplier", multiplier: 2 },
    requires: "reborn_second_wind",
    branch: "power",
  },
  {
    id: "reborn_thousand_lives",
    nameEn: "A Thousand Lives",
    nameYue: "千世輪迴",
    cost: 60,
    effect: { kind: "globalCpsMultiplier", multiplier: 2 },
    requires: "reborn_heavenly_dough",
    branch: "power",
  },
  {
    id: "reborn_hand_of_every_past_self",
    nameEn: "Hand of Every Past Self",
    nameYue: "前世嘅手",
    cost: 90,
    effect: { kind: "clickMultiplier", multiplier: 3 },
    requires: "reborn_borrowed_hands",
    branch: "power",
  },
  /* --- memory: what a reset cannot take --- */
  {
    id: "reborn_dog_eared_catalogue",
    nameEn: "Dog-Eared Catalogue",
    nameYue: "摺角目錄",
    cost: 4,
    effect: { kind: "retainUpgrades", fraction: 0.1 },
    requires: null,
    branch: "memory",
  },
  {
    id: "reborn_annotated_catalogue",
    nameEn: "Annotated Catalogue",
    nameYue: "手寫註解目錄",
    cost: 20,
    effect: { kind: "retainUpgrades", fraction: 0.15 },
    requires: "reborn_dog_eared_catalogue",
    branch: "memory",
  },
  {
    id: "reborn_memorised_catalogue",
    nameEn: "Memorised Catalogue",
    nameYue: "背晒嘅目錄",
    cost: 80,
    effect: { kind: "retainUpgrades", fraction: 0.25 },
    requires: "reborn_annotated_catalogue",
    branch: "memory",
  },
  {
    id: "reborn_pinned_recipe",
    nameEn: "Pinned Recipe",
    nameYue: "釘住嘅食譜",
    cost: 10,
    effect: { kind: "permanentSlots", slots: 1 },
    requires: "reborn_dog_eared_catalogue",
    branch: "memory",
  },
  {
    id: "reborn_pinned_shelf",
    nameEn: "Pinned Shelf",
    nameYue: "釘住嘅架",
    cost: 45,
    effect: { kind: "permanentSlots", slots: 2 },
    requires: "reborn_pinned_recipe",
    branch: "memory",
  },
  {
    id: "reborn_pinned_kitchen",
    nameEn: "Pinned Kitchen",
    nameYue: "釘住成間廚房",
    cost: 200,
    effect: { kind: "permanentSlots", slots: 3 },
    requires: "reborn_pinned_shelf",
    branch: "memory",
  },
];

export function getRebornNodeDefinition(id: string): RebornNodeDefinition {
  const def = REBORN_NODE_DEFINITIONS.find((n) => n.id === id);
  if (!def) throw new RangeError(`Unknown reborn node id: ${id}`);
  return def;
}

export interface RebornMultipliers {
  readonly clickMultiplier: number;
  readonly globalCpsMultiplier: number;
}

/** The permanent multipliers a set of owned nodes contributes. Composed multiplicatively. */
export function rebornMultipliers(ownedNodeIds: readonly string[]): RebornMultipliers {
  let clickMultiplier = 1;
  let globalCpsMultiplier = 1;
  for (const id of ownedNodeIds) {
    const def = REBORN_NODE_DEFINITIONS.find((n) => n.id === id);
    if (!def) continue;
    if (def.effect.kind === "clickMultiplier") clickMultiplier *= def.effect.multiplier;
    if (def.effect.kind === "globalCpsMultiplier") globalCpsMultiplier *= def.effect.multiplier;
  }
  return { clickMultiplier, globalCpsMultiplier };
}

/** Cookies a new run starts with. The single deepest inheritance node wins — they do not add,
 *  because each one is the same jar, filled higher. */
export function rebornStartingCookies(ownedNodeIds: readonly string[]): BigNum {
  let best = 0;
  for (const id of ownedNodeIds) {
    const def = REBORN_NODE_DEFINITIONS.find((n) => n.id === id);
    if (def?.effect.kind === "startWithCookies") best = Math.max(best, def.effect.cookies);
  }
  return bnFromNumber(best);
}

/** Fraction of the owned upgrade catalogue carried across a reset. Retention nodes ADD, and the
 *  total is clamped to 1 — a full run can be carried, never more than a full run. */
export function rebornRetainFraction(ownedNodeIds: readonly string[]): number {
  let total = 0;
  for (const id of ownedNodeIds) {
    const def = REBORN_NODE_DEFINITIONS.find((n) => n.id === id);
    if (def?.effect.kind === "retainUpgrades") total += def.effect.fraction;
  }
  return Math.min(1, total);
}

/** How many upgrades the player may pin as permanent. Slot nodes ADD. */
export function rebornPermanentSlots(ownedNodeIds: readonly string[]): number {
  let total = 0;
  for (const id of ownedNodeIds) {
    const def = REBORN_NODE_DEFINITIONS.find((n) => n.id === id);
    if (def?.effect.kind === "permanentSlots") total += def.effect.slots;
  }
  return total;
}

export type RebornNodeState = "owned" | "affordable" | "unaffordable" | "locked";

/** What the tree should draw for one node, given points in hand and nodes already bought. */
export function rebornNodeState(
  def: RebornNodeDefinition,
  ownedNodeIds: readonly string[],
  ascensionPoints: number,
): RebornNodeState {
  if (ownedNodeIds.includes(def.id)) return "owned";
  if (def.requires !== null && !ownedNodeIds.includes(def.requires)) return "locked";
  return ascensionPoints >= def.cost ? "affordable" : "unaffordable";
}

/** True only when the node is unowned, its prerequisite is bought, and the points are there. */
export function canBuyRebornNode(
  nodeId: string,
  ownedNodeIds: readonly string[],
  ascensionPoints: number,
): boolean {
  const def = REBORN_NODE_DEFINITIONS.find((n) => n.id === nodeId);
  if (!def) return false;
  return rebornNodeState(def, ownedNodeIds, ascensionPoints) === "affordable";
}

/** Total ascension points already sunk into the tree. Shown in the Prestige panel. */
export function rebornPointsSpent(ownedNodeIds: readonly string[]): number {
  return ownedNodeIds.reduce((sum, id) => {
    const def = REBORN_NODE_DEFINITIONS.find((n) => n.id === id);
    return sum + (def?.cost ?? 0);
  }, 0);
}

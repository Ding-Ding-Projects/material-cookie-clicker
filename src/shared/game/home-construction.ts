import { bnFromNumber, bnMul, bnPow, type BigNum } from "./big-number.js";
import type { GameState } from "./types.js";

/**
 * HOME CONSTRUCTION — the second game inside the game.
 *
 * The diesel factory (diesel-factory.ts) is a production line: things flow through it and stall
 * against each other. This is not that. This is a HOUSE, and a house is built the way a house is
 * really built — one room at a time, in an order you choose, and each room takes REAL TIME to
 * put up:
 *
 *     buy a BLUEPRINT (cookies)
 *         -> start CONSTRUCTION on it (cookies, and then wall-clock seconds that must elapse)
 *             -> the room is BUILT, and can be FURNISHED
 *                 -> each piece of furniture carries a small bonus and a COZINESS score
 *                     -> total coziness is a gentle multiplier on the whole cookie economy
 *
 * THE THREE RULES THIS MODULE WILL NOT BEND:
 *
 *   1. NOTHING UNLOCKS ITSELF. Every blueprint is bought by a press. A room that is affordable
 *      and reachable is still not yours until you buy the drawing and pay the builders.
 *   2. ONE BUILD AT A TIME. There is one site and one crew. Starting a second room while the
 *      first is up is refused — not queued behind it, not silently dropped in its place.
 *      "Queue" here means a queue of ONE, and the panel says so in words.
 *   3. TIME IS REAL AND HONEST. Construction advances only on the elapsed milliseconds the
 *      reducer hands it during a live tick, exactly as `tickFactory` does. No start timestamp is
 *      stored and no clock is consulted, so the countdown cannot be shortened by moving the
 *      system clock — and, for the same reason, a build does NOT advance while the application
 *      is closed: `offline-progress.ts` credits cookies and touches neither this subgame nor the
 *      factory. That is a deliberate match to the factory's behaviour rather than an oversight;
 *      the builders keep the same hours the refinery does. The panel prints the time genuinely
 *      remaining from the elapsed milliseconds actually served, never an estimate.
 *
 * COOKIES TOUCH THIS IN EXACTLY THREE PLACES: buying a blueprint, starting a construction, and
 * buying a piece of furniture. Nothing here ever pays cookies back out.
 *
 * Everything in this file is pure. No clock, no randomness, no file system.
 */

// ------------------------------------------------------------------ the state subtree ----

/** A room that has been finished. Furniture ids are in purchase order. */
export interface BuiltRoom {
  readonly roomId: string;
  readonly furnitureIds: readonly string[];
}

/**
 * The one construction currently under way, or null when the site is quiet.
 *
 * `requiredMs` is FROZEN at the moment the build starts, after every build-speed bonus the home
 * owned at that moment has been applied. Buying a Joiner's Bench halfway through a build does
 * not retroactively shorten the build it is not helping with — and, just as importantly, the
 * "time remaining" the panel prints never jumps backwards while the player is watching it.
 */
export interface ActiveBuild {
  readonly roomId: string;
  /** Milliseconds of construction that have actually elapsed. Never exceeds `requiredMs`. */
  readonly elapsedMs: number;
  /** Milliseconds this build needs in total, fixed when it started. */
  readonly requiredMs: number;
}

export interface HomeConstructionState {
  /** Room ids whose blueprint has been bought. Purchase order. Buying is the ONLY way in. */
  readonly blueprintIds: readonly string[];
  /** Rooms that are finished, with whatever has been put in them. Completion order. */
  readonly rooms: readonly BuiltRoom[];
  /** The single build under way, or null. There is never a second one. */
  readonly build: ActiveBuild | null;
  /** Lifetime cookies spent on blueprints, construction and furniture. */
  readonly cookiesInvested: BigNum;
  /** Repeatable floors added after the six authored rooms. Unbounded by design. */
  readonly extensionLevel: number;
}

export function createInitialHomeState(): HomeConstructionState {
  return { blueprintIds: [], rooms: [], build: null, cookiesInvested: bnFromNumber(0), extensionLevel: 0 };
}

/** Synthetic build target used by the one-site construction clock for every repeatable floor. */
export const HOME_EXTENSION_ID = "home_extension";
export const HOME_EXTENSION_BASE_COST = 100_000_000;
export const HOME_EXTENSION_COST_RATIO = 2;
export const HOME_EXTENSION_BASE_MS = 1_800_000;
export const HOME_EXTENSION_MAX_MS = 3_600_000;
export const HOME_EXTENSION_COZINESS = 12;
export const HOME_EXTENSION_CPS_FRACTION = 0.02;

// ------------------------------------------------------------------------- the rooms ----

export interface RoomDefinition {
  readonly id: string;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly blurbEn: string;
  readonly blurbYue: string;
  /** Cookies to buy the drawing. Buys the RIGHT to build, and nothing else. */
  readonly blueprintCost: number;
  /** Cookies paid to the builders when construction actually starts. */
  readonly buildCost: number;
  /** Milliseconds of real elapsed time the room takes to put up, before any build-speed bonus. */
  readonly buildMs: number;
  /**
   * Coziness the empty shell is worth. A room with nothing in it is still a room you are
   * standing in — but it is worth a fraction of what the same room furnished is worth.
   */
  readonly baseCoziness: number;
  /**
   * The room that must be BUILT before this one's blueprint goes on sale, or null for the one
   * room that starts the house. Only the Kitchen has null: this is a bakery, and a bakery with
   * no kitchen is a shop with nothing to sell.
   */
  readonly requiresRoomId: string | null;
}

/**
 * THE SIX ROOMS.
 *
 * The Kitchen is first and is the only one that is first. Everything else hangs off the Kitchen
 * being finished and is then bought in WHATEVER ORDER THE PLAYER LIKES — a player who wants a
 * Garden before a Bedroom is not wrong, only slower to sleep. That is the whole shape of this
 * subgame: a strict first step, and then five free choices.
 *
 * Costs and times climb together, roughly an order of magnitude of cookies per room against a
 * doubling of minutes, so the last room is a genuine project rather than a long till receipt.
 */
export const ROOM_DEFINITIONS: readonly RoomDefinition[] = [
  {
    id: "kitchen",
    nameEn: "Kitchen",
    nameYue: "廚房",
    blurbEn: "Where the whole business starts. Flour on every surface, and an oven that never goes cold.",
    blurbYue: "成盤生意由呢度開始。周圍都係麵粉，個焗爐冇凍過。",
    blueprintCost: 5_000,
    buildCost: 10_000,
    buildMs: 60_000,
    baseCoziness: 6,
    requiresRoomId: null,
  },
  {
    id: "pantry",
    nameEn: "Pantry",
    nameYue: "貯物房",
    blurbEn: "A cool dark room off the kitchen. Everything you own, in a jar, with a label on it.",
    blurbYue: "廚房隔籬一間陰涼嘅細房。你所有嘢都入咗樽，仲貼咗標籤。",
    blueprintCost: 20_000,
    buildCost: 40_000,
    buildMs: 120_000,
    baseCoziness: 4,
    requiresRoomId: "kitchen",
  },
  {
    id: "parlour",
    nameEn: "Parlour",
    nameYue: "客廳",
    blurbEn: "The room you sit down in. The first room in the house that is not about work.",
    blurbYue: "坐低嘅嗰間房。全屋第一間唔係為做嘢而設嘅房。",
    blueprintCost: 100_000,
    buildCost: 200_000,
    buildMs: 300_000,
    baseCoziness: 8,
    requiresRoomId: "kitchen",
  },
  {
    id: "bedroom",
    nameEn: "Bedroom",
    nameYue: "睡房",
    blurbEn: "Upstairs, at the back, away from the ovens. Somewhere to stop.",
    blurbYue: "樓上後便，離開晒啲焗爐。一個可以停低嘅地方。",
    blueprintCost: 500_000,
    buildCost: 1_000_000,
    buildMs: 600_000,
    baseCoziness: 8,
    requiresRoomId: "kitchen",
  },
  {
    id: "workshop",
    nameEn: "Workshop",
    nameYue: "工作間",
    blurbEn: "Where the house repairs itself. Sawdust, a vice, and every tool hung where it belongs.",
    blurbYue: "間屋自己整自己嘅地方。木糠、老虎鉗，每件工具都掛返原位。",
    blueprintCost: 2_500_000,
    buildCost: 5_000_000,
    buildMs: 1_200_000,
    baseCoziness: 4,
    requiresRoomId: "kitchen",
  },
  {
    id: "garden",
    nameEn: "Garden",
    nameYue: "花園",
    blurbEn: "Out the back door. The only room with no ceiling, and the one the herbs come from.",
    blurbYue: "後門出去嗰度。全屋唯一冇天花嘅「房」，啲香草就係喺度嚟。",
    blueprintCost: 12_000_000,
    buildCost: 25_000_000,
    buildMs: 1_800_000,
    baseCoziness: 6,
    requiresRoomId: "kitchen",
  },
];

export function getRoomDefinition(id: string): RoomDefinition {
  const def = ROOM_DEFINITIONS.find((r) => r.id === id);
  if (!def) throw new RangeError(`Unknown home room id: ${id}`);
  return def;
}

// ---------------------------------------------------------------------- the furniture ----

/**
 * What a piece of furniture does, on top of its coziness.
 *
 * Every one of these is SMALL and PERMANENT. Nothing here expires, nothing here is a percentage
 * of a percentage, and nothing here comes close to what the cookie side's own upgrades pay — a
 * furnished house is a pleasant tailwind, never the reason a run works.
 */
export type FurnitureBonus =
  /** Multiplies total cookies per second. */
  | { readonly kind: "globalCps"; readonly multiplier: number }
  /** Multiplies the value of one click. */
  | { readonly kind: "click"; readonly multiplier: number }
  /**
   * Shortens future construction by this fraction, added across every piece owned and applied
   * once, at the moment a build STARTS. Capped — see BUILD_SPEED_CAP.
   */
  | { readonly kind: "buildSpeed"; readonly fraction: number }
  /** Nothing but coziness. Some furniture is only there to be nice, and says so. */
  | { readonly kind: "none" };

export interface FurnitureDefinition {
  readonly id: string;
  readonly roomId: string;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly blurbEn: string;
  readonly blurbYue: string;
  readonly cost: number;
  readonly coziness: number;
  readonly bonus: FurnitureBonus;
}

function furniture(
  id: string,
  roomId: string,
  nameEn: string,
  nameYue: string,
  blurbEn: string,
  blurbYue: string,
  cost: number,
  coziness: number,
  bonus: FurnitureBonus,
): FurnitureDefinition {
  return { id, roomId, nameEn, nameYue, blurbEn, blurbYue, cost, coziness, bonus };
}

/**
 * TWENTY-SIX PIECES OF FURNITURE, four to five per room.
 *
 * A piece can only be bought into a room that is BUILT, and can only be bought once. Prices rise
 * across the house rather than within a room, so a freshly finished Garden is a shopping trip
 * rather than a shopping list with the first item greyed out.
 */
export const FURNITURE_DEFINITIONS: readonly FurnitureDefinition[] = [
  // ---- kitchen
  furniture(
    "kt_stone_oven", "kitchen", "Stone Hearth Oven", "石爐",
    "A brick throat that holds its heat all night. Everything out of it browns evenly.",
    "一個磚砌爐膛，成晚都夠熱。入面焗出嚟嘅嘢，色水均勻。",
    25_000, 8, { kind: "globalCps", multiplier: 1.02 },
  ),
  furniture(
    "kt_marble_bench", "kitchen", "Marble Work Bench", "雲石工作枱",
    "Cold stone that pastry does not stick to. Your hands get faster because the bench does not fight them.",
    "凍冰冰嘅石面，酥皮唔黐。手快咗，因為個枱唔同你鬥。",
    40_000, 6, { kind: "click", multiplier: 1.03 },
  ),
  furniture(
    "kt_copper_pots", "kitchen", "Copper Pot Rack", "銅鑊架",
    "Everything hanging where a hand can reach it, in the order a recipe asks for it.",
    "全部掛喺伸手就掂到嘅位，順住食譜嘅次序排。",
    60_000, 7, { kind: "globalCps", multiplier: 1.015 },
  ),
  furniture(
    "kt_spice_shelf", "kitchen", "Spice Shelf", "香料架",
    "Star anise, white pepper, and a tin nobody has opened since the shop took over the house.",
    "八角、白胡椒，仲有個罐由間舖霸咗成間屋開始就冇人開過。",
    90_000, 5, { kind: "globalCps", multiplier: 1.02 },
  ),
  furniture(
    "kt_kettle", "kitchen", "Whistling Kettle", "鳴笛水煲",
    "It tells you the water is ready from two rooms away. You stop standing over it.",
    "隔兩間房都聽到水滾。你唔使再企喺度等。",
    120_000, 4, { kind: "click", multiplier: 1.04 },
  ),
  // ---- pantry
  furniture(
    "pt_flour_bins", "pantry", "Flour Bins", "麵粉桶",
    "Four galvanised bins on castors. Nobody carries a sack up a step again.",
    "四個有轆嘅鍍鋅粉桶。冇人再需要揹住袋粉上梯級。",
    150_000, 5, { kind: "globalCps", multiplier: 1.02 },
  ),
  furniture(
    "pt_cold_safe", "pantry", "Cold Safe", "凍櫃",
    "A meat-safe with a marble floor. Butter behaves in July.",
    "石面雪櫃仔。七月都搞得掂啲牛油。",
    220_000, 6, { kind: "globalCps", multiplier: 1.025 },
  ),
  furniture(
    "pt_jar_wall", "pantry", "Wall of Jars", "玻璃樽牆",
    "Not one of them is labelled wrongly. It is the proudest wall in the house and it does nothing.",
    "冇一個貼錯標籤。全屋最威嘅一幅牆，但係乜都做唔到。",
    300_000, 9, { kind: "none" },
  ),
  furniture(
    "pt_step_ladder", "pantry", "Step Ladder", "摺梯",
    "Suddenly the top shelf is storage instead of decoration. The builders borrow it constantly.",
    "頂層突然由裝飾變咗貯物位。啲師傅日日都借嚟用。",
    400_000, 3, { kind: "buildSpeed", fraction: 0.05 },
  ),
  // ---- parlour
  furniture(
    "pl_armchair", "parlour", "Wingback Armchair", "高背扶手椅",
    "The chair. There is one in every house and this one is yours.",
    "就係嗰張櫈。每間屋都有一張，呢張係你嘅。",
    600_000, 12, { kind: "none" },
  ),
  furniture(
    "pl_hearth", "parlour", "Tiled Hearth", "瓷磚壁爐",
    "Green tiles and a real flue. The room stops being cold in a way that money can measure.",
    "綠色瓷磚，真煙囪。成間房唔再凍，凍到連錢都計得出。",
    900_000, 14, { kind: "globalCps", multiplier: 1.03 },
  ),
  furniture(
    "pl_wool_rug", "parlour", "Wool Rug", "羊毛地氈",
    "It covers the two boards that creak. That is most of what a rug is for.",
    "啱啱冚住嗰兩塊會嘎嘎響嘅地板。地氈嘅用途，大概就係咁。",
    1_200_000, 10, { kind: "none" },
  ),
  furniture(
    "pl_mantel_clock", "parlour", "Mantel Clock", "座枱鐘",
    "Now the builders know when the day started, which turns out to matter enormously.",
    "而家啲師傅知幾點開工，原來呢樣好緊要。",
    1_600_000, 7, { kind: "buildSpeed", fraction: 0.08 },
  ),
  // ---- bedroom
  furniture(
    "bd_four_poster", "bedroom", "Four-Poster Bed", "四柱床",
    "Far too grand for a baker. You bought it anyway and you have never once regretted it.",
    "對一個焗餅佬嚟講太隆重。你照買，一次都冇後悔過。",
    2_500_000, 16, { kind: "none" },
  ),
  furniture(
    "bd_quilt", "bedroom", "Patchwork Quilt", "拼布被",
    "Made of every apron the shop has worn out. You can date the business by the squares.",
    "用舖頭著爛咗嘅圍裙車埋一齊。睇住啲布格就數到盤生意做咗幾耐。",
    3_200_000, 12, { kind: "none" },
  ),
  furniture(
    "bd_reading_lamp", "bedroom", "Reading Lamp", "床頭燈",
    "A pool of light the size of a recipe. Ideas arrive in it at unhelpful hours.",
    "一圈啱啱夠照住張食譜嘅光。啲諗頭專揀唔啱時候先喺度出現。",
    4_000_000, 8, { kind: "click", multiplier: 1.05 },
  ),
  furniture(
    "bd_cedar_wardrobe", "bedroom", "Cedar Wardrobe", "香柏衣櫃",
    "Nothing in it smells of the bakery any more, which took a wardrobe made of a tree to achieve.",
    "入面啲衫終於冇曬餅香，要成棵樹做個櫃先做得到。",
    5_000_000, 9, { kind: "globalCps", multiplier: 1.03 },
  ),
  // ---- workshop
  furniture(
    "ws_joiners_bench", "workshop", "Joiner's Bench", "木工枱",
    "A vice, a stop, and a flat surface longer than any door in the house.",
    "一個老虎鉗、一個擋頭，同一塊比全屋任何一道門都長嘅平面。",
    8_000_000, 5, { kind: "buildSpeed", fraction: 0.12 },
  ),
  furniture(
    "ws_tool_wall", "workshop", "Tool Wall", "工具牆",
    "Every outline painted on the board, so a missing tool is visible from the doorway.",
    "每件工具喺板上面都畫咗輪廓，邊件唔見咗，企喺門口就睇得出。",
    11_000_000, 6, { kind: "globalCps", multiplier: 1.035 },
  ),
  furniture(
    "ws_treadle_lathe", "workshop", "Treadle Lathe", "腳踏車床",
    "Foot-powered and older than the building. It turns a new chair leg in an afternoon.",
    "用腳踩，仲舊過棟樓。一個下晝就車到一條新櫈腳。",
    15_000_000, 4, { kind: "buildSpeed", fraction: 0.15 },
  ),
  furniture(
    "ws_pot_belly_stove", "workshop", "Pot-Belly Stove", "圓肚火爐",
    "Burns the offcuts. The workshop is the warmest room in the house and it was not planned that way.",
    "燒晒啲木碎。工作間變咗全屋最暖嘅房，本來唔係咁諗嘅。",
    20_000_000, 11, { kind: "globalCps", multiplier: 1.03 },
  ),
  // ---- garden
  furniture(
    "gd_herb_beds", "garden", "Herb Beds", "香草花圃",
    "Four raised beds. The kitchen stops buying rosemary entirely.",
    "四個高身花槽。廚房自此完全唔使買迷迭香。",
    30_000_000, 10, { kind: "globalCps", multiplier: 1.04 },
  ),
  furniture(
    "gd_stone_bench", "garden", "Stone Bench", "石凳",
    "Cold in the morning, warm by four. Nobody has ever sat on it during opening hours.",
    "朝早凍，四點就暖。開舖時間從來冇人坐過。",
    40_000_000, 9, { kind: "none" },
  ),
  furniture(
    "gd_lemon_tree", "garden", "Lemon Tree", "檸檬樹",
    "It fruits badly and smells wonderful. The tarts got better the season it arrived.",
    "結果一般，但係好香。佢嚟嗰造，啲撻真係好食咗。",
    55_000_000, 13, { kind: "globalCps", multiplier: 1.04 },
  ),
  furniture(
    "gd_washing_line", "garden", "Washing Line", "晾衫繩",
    "Aprons, in a row, moving. The most domestic thing the property owns.",
    "一排圍裙喺度飄。呢間屋最有家常味嘅嘢。",
    70_000_000, 6, { kind: "none" },
  ),
  furniture(
    "gd_paper_lantern", "garden", "Paper Lantern", "紙燈籠",
    "The garden becomes usable after dark, which doubles the garden.",
    "天黑咗個花園都仲用得，等於個花園大咗一倍。",
    90_000_000, 8, { kind: "click", multiplier: 1.06 },
  ),
];

export function getFurnitureDefinition(id: string): FurnitureDefinition {
  const def = FURNITURE_DEFINITIONS.find((f) => f.id === id);
  if (!def) throw new RangeError(`Unknown furniture id: ${id}`);
  return def;
}

export function furnitureForRoom(roomId: string): readonly FurnitureDefinition[] {
  return FURNITURE_DEFINITIONS.filter((f) => f.roomId === roomId);
}

// ------------------------------------------------------------------------- the queries ----

export function ownsBlueprint(home: HomeConstructionState, roomId: string): boolean {
  return home.blueprintIds.includes(roomId);
}

export function builtRoom(home: HomeConstructionState, roomId: string): BuiltRoom | undefined {
  return home.rooms.find((r) => r.roomId === roomId);
}

export function isRoomBuilt(home: HomeConstructionState, roomId: string): boolean {
  return builtRoom(home, roomId) !== undefined;
}

export function ownsFurniture(home: HomeConstructionState, furnitureId: string): boolean {
  return home.rooms.some((r) => r.furnitureIds.includes(furnitureId));
}

/**
 * Whether a room's blueprint is currently ON SALE. Being offered is not being owned and is
 * certainly not being granted: this only answers whether the card appears in the plan chest.
 */
export function isBlueprintOffered(home: HomeConstructionState, roomId: string): boolean {
  const def = getRoomDefinition(roomId);
  if (ownsBlueprint(home, roomId)) return false;
  if (isRoomBuilt(home, roomId)) return false;
  return def.requiresRoomId === null || isRoomBuilt(home, def.requiresRoomId);
}

/** Whether construction on `roomId` could be started RIGHT NOW, cookies aside. */
export function canStartConstruction(home: HomeConstructionState, roomId: string): boolean {
  if (home.build !== null) return false; // rule 2: one site, one crew
  if (!ownsBlueprint(home, roomId)) return false;
  if (isRoomBuilt(home, roomId)) return false;
  const def = getRoomDefinition(roomId);
  return def.requiresRoomId === null || isRoomBuilt(home, def.requiresRoomId);
}

/** The endless house begins only after every authored room has actually been built. */
export function areAuthoredRoomsComplete(home: HomeConstructionState): boolean {
  return ROOM_DEFINITIONS.every((room) => isRoomBuilt(home, room.id));
}

export function canStartHomeExtension(home: HomeConstructionState): boolean {
  return home.build === null && areAuthoredRoomsComplete(home);
}

/** Cost of the next repeatable floor. BigNum keeps the sequence meaningful beyond Number limits. */
export function homeExtensionCost(home: HomeConstructionState): BigNum {
  return bnMul(
    bnFromNumber(HOME_EXTENSION_BASE_COST),
    bnPow(bnFromNumber(HOME_EXTENSION_COST_RATIO), home.extensionLevel),
  );
}

/** Construction time grows gently and then plateaus; the number of completed floors never caps. */
export function homeExtensionBuildMs(home: HomeConstructionState): number {
  const printed = Math.min(HOME_EXTENSION_MAX_MS, HOME_EXTENSION_BASE_MS + home.extensionLevel * 300_000);
  return Math.round(printed * (1 - buildSpeedFraction(home)));
}

// --------------------------------------------------------------------- the build speed ----

/**
 * The floor a build-speed bonus can never go below: a build always takes at least this fraction
 * of its printed time. Four pieces of furniture add up to 0.40 today, so the cap is not reachable
 * in this build — it is there so that adding a fifth later cannot produce an instant house.
 */
export const BUILD_SPEED_CAP = 0.6;

/** Total build-speed fraction the furnished house is worth, clamped at the cap. */
export function buildSpeedFraction(home: HomeConstructionState): number {
  let total = 0;
  for (const room of home.rooms) {
    for (const id of room.furnitureIds) {
      const bonus = getFurnitureDefinition(id).bonus;
      if (bonus.kind === "buildSpeed") total += bonus.fraction;
    }
  }
  return Math.min(BUILD_SPEED_CAP, total);
}

/** Milliseconds a build of `roomId` would take if it were started right now. Always a whole ms. */
export function requiredBuildMs(home: HomeConstructionState, roomId: string): number {
  if (roomId === HOME_EXTENSION_ID) return homeExtensionBuildMs(home);
  const def = getRoomDefinition(roomId);
  return Math.round(def.buildMs * (1 - buildSpeedFraction(home)));
}

// ------------------------------------------------------------------------- the coziness ----

/**
 * TOTAL COZINESS — the one number this whole subgame is about.
 *
 * Every built room contributes its shell's `baseCoziness`; every piece of furniture in it
 * contributes its own. Nothing else contributes anything: coziness is not a function of cookies,
 * of time, or of how long you have been playing. You get it by building and furnishing, full stop.
 */
export function totalCoziness(home: HomeConstructionState): number {
  let total = home.extensionLevel * HOME_EXTENSION_COZINESS;
  for (const room of home.rooms) {
    total += getRoomDefinition(room.roomId).baseCoziness;
    for (const id of room.furnitureIds) total += getFurnitureDefinition(id).coziness;
  }
  return total;
}

/** Coziness of one built room on its own — shell plus what is in it. Zero if it is not built. */
export function roomCoziness(home: HomeConstructionState, roomId: string): number {
  const room = builtRoom(home, roomId);
  if (!room) return 0;
  return (
    getRoomDefinition(roomId).baseCoziness +
    room.furnitureIds.reduce((sum, id) => sum + getFurnitureDefinition(id).coziness, 0)
  );
}

/** Coziness the house would have if every room were built and every piece of furniture bought. */
export const MAX_COZINESS: number =
  ROOM_DEFINITIONS.reduce((sum, r) => sum + r.baseCoziness, 0) +
  FURNITURE_DEFINITIONS.reduce((sum, f) => sum + f.coziness, 0);

/**
 * THE COZINESS CURVE, stated once here so the documentation and the tests can both check it:
 *
 *     multiplier = 1 + COZINESS_COEFFICIENT * ln(1 + coziness / COZINESS_SCALE)
 *
 * LOGARITHMIC, deliberately. A linear curve would make the last few pieces of furniture — the
 * ones that cost tens of millions — worth exactly as much as the first ones, which is both wrong
 * as an economy and wrong as a feeling: the difference between a bare room and a chair is
 * enormous, and the difference between nine nice things and ten is small.
 *
 * MODEST, deliberately:
 *
 *     coziness    0  ->  x1.000   (a fresh save. Exactly one, not nearly one.)
 *     coziness   36  ->  x1.0385  (all six rooms built, not one stick of furniture in them)
 *     coziness  100  ->  x1.0752
 *     coziness  249  ->  x1.1187  (MAX_COZINESS — the entire house, fully furnished)
 *
 * WHAT THE CURVE IS NOT. It is not the whole of what a furnished house pays. Eleven of the
 * twenty-six pieces of furniture carry their own small production bonus (1.5% to 4% each), and
 * `computeHomeBonuses` multiplies those into the same figure the panel prints — so the honest
 * ceiling for a COMPLETELY finished house is:
 *
 *     coziness curve  x1.1187   *   furniture production bonuses  x1.3505   =   x1.5108
 *
 * Half again on production (and x1.1922 on a click, from the four pieces that pay one), for six
 * rooms, thirty-eight purchases (six blueprints, six constructions and twenty-six pieces of furniture), 405,780,000 cookies and sixty-eight minutes of construction served
 * in real time. That is deliberately of the same order as ONE of the cookie side's own global
 * upgrades (Sturdier Ovens is x1.1, MTR Freight After Midnight is x1.5, and there are a dozen of
 * them), which is the whole point: finishing the house is worth about as much as one good
 * upgrade, spread over the entire mid-game. The main economy stays primary and stays primary by
 * an enormous margin.
 */
export const COZINESS_COEFFICIENT = 0.06;
export const COZINESS_SCALE = 40;

export function cozinessCpsMultiplier(coziness: number): number {
  if (!(coziness > 0)) return 1;
  return 1 + COZINESS_COEFFICIENT * Math.log1p(coziness / COZINESS_SCALE);
}

/** Everything the furnished house is currently worth to the cookie economy. */
export interface HomeBonuses {
  readonly coziness: number;
  /** The coziness curve above, applied to total cookies per second. */
  readonly globalCpsMultiplier: number;
  /** The product of every furniture click bonus owned. */
  readonly clickMultiplier: number;
  /** The fraction future builds are shortened by, already capped. */
  readonly buildSpeedFraction: number;
}

/**
 * The one derivation the rest of the game reads. Furniture's own `globalCps` bonuses are folded
 * into the same multiplier the coziness curve produces, so there is exactly ONE number the CPS
 * pipeline has to multiply by and no chance of the house being counted twice.
 */
export function computeHomeBonuses(home: HomeConstructionState): HomeBonuses {
  const coziness = totalCoziness(home);
  let globalCpsMultiplier = cozinessCpsMultiplier(coziness);
  let clickMultiplier = 1;

  for (const room of home.rooms) {
    for (const id of room.furnitureIds) {
      const bonus = getFurnitureDefinition(id).bonus;
      if (bonus.kind === "globalCps") globalCpsMultiplier *= bonus.multiplier;
      else if (bonus.kind === "click") clickMultiplier *= bonus.multiplier;
    }
  }

  // Each finished floor is a small permanent production gain. Linear growth makes the house
  // genuinely endless without allowing one late floor to dwarf the main generator economy.
  globalCpsMultiplier *= 1 + home.extensionLevel * HOME_EXTENSION_CPS_FRACTION;

  return {
    coziness,
    globalCpsMultiplier,
    clickMultiplier,
    buildSpeedFraction: buildSpeedFraction(home),
  };
}

// ------------------------------------------------------------------------------ the tick ----

/** What one slice of wall-clock did to the building site. */
export interface HomeTickResult {
  readonly state: HomeConstructionState;
  /** The room id that finished during this slice, or null. At most one — there is one crew. */
  readonly completedRoomId: string | null;
}

/**
 * ONE SLICE OF CONSTRUCTION.
 *
 * Advances the single active build by the elapsed seconds the reducer hands it, exactly as
 * `tickFactory` does, and finishes the room the instant the required time has been served. A
 * quiet site returns the SAME state object, so a save with nothing being built never re-renders
 * the home panel — the same referential-stability contract the factory tick keeps.
 *
 * A slice longer than the whole remaining build finishes it and DISCARDS the surplus rather than
 * carrying it into the next room. There is no next room until the player chooses one, and
 * banking time against a decision that has not been made yet would be inventing progress.
 */
export function tickHome(state: HomeConstructionState, seconds: number): HomeTickResult {
  const idle: HomeTickResult = { state, completedRoomId: null };
  if (state.build === null) return idle;
  if (!Number.isFinite(seconds) || seconds <= 0) return idle;

  const elapsedMs = Math.min(state.build.requiredMs, state.build.elapsedMs + seconds * 1000);
  if (elapsedMs < state.build.requiredMs) {
    return { state: { ...state, build: { ...state.build, elapsedMs } }, completedRoomId: null };
  }

  const roomId = state.build.roomId;
  if (roomId === HOME_EXTENSION_ID) {
    return {
      state: {
        ...state,
        build: null,
        extensionLevel: state.extensionLevel + 1,
      },
      completedRoomId: HOME_EXTENSION_ID,
    };
  }
  return {
    state: {
      ...state,
      build: null,
      rooms: [...state.rooms, { roomId, furnitureIds: [] }],
    },
    completedRoomId: roomId,
  };
}

/** Milliseconds genuinely left on the active build, or null when nothing is being built. */
export function remainingBuildMs(home: HomeConstructionState): number | null {
  if (home.build === null) return null;
  return Math.max(0, home.build.requiredMs - home.build.elapsedMs);
}

/** How far through the active build we are, 0..1, or null when nothing is being built. */
export function buildProgressFraction(home: HomeConstructionState): number | null {
  if (home.build === null) return null;
  if (home.build.requiredMs <= 0) return 1;
  return Math.min(1, Math.max(0, home.build.elapsedMs / home.build.requiredMs));
}

/** Convenience for the UI and for tests: the home subtree of a whole game state. */
export function homeOf(state: GameState): HomeConstructionState {
  return state.homeConstruction;
}

/* ------------------------------------------------------------------------------------------
 * Random events: a scheduler and a pool of sixteen events that interrupt an ordinary session at
 * random-but-bounded intervals, plus the Mouse Raid on its own hourly clock.
 *
 * This module is the SECOND random-event system in the game and it deliberately does not
 * replace the first. golden-cookie.ts owns the golden cookie — one overlay, three effects, its
 * own five-to-fifteen-minute window — and it keeps owning it. What lives here is the general
 * case the owner asked for: "random events happening in random times", a pool of distinct
 * events with real durations, real arithmetic, and one of them a genuine risk rather than a
 * present.
 *
 * Everything about it is borrowed from golden-cookie.ts on purpose, because that module already
 * settled the two questions that matter:
 *
 *   - RANDOMNESS IS A PORT. `Math.random()` is never called here. Every roll — when the next
 *     event is eligible, which event it is — comes from an injected `RngPort`, and the port's
 *     stream position is persisted, so a save/load cycle resumes the same schedule instead of
 *     re-rolling the player's luck. Seed it and the whole timeline replays exactly, which is
 *     what makes a scheduler unit-testable at all.
 *   - TIME IS AN ARGUMENT. No `Date.now()` anywhere in this file. Epoch milliseconds arrive as
 *     `nowEpochMs` from the reducer's clock port, the same one the tick loop already drives.
 *
 * The reducer is still the only mutation seam. Nothing here writes state; every function takes
 * a `RandomEventsState` and returns a new one, and the reducer decides what to do with it.
 *
 * THE MOUSE RAID sits alongside that pool rather than inside it. It is the owner's "rare event,
 * every hour": mice scurry across the stage, each one the player fails to whack carries off a
 * share of up to eighty per cent of the balance, and whacking all of them pays a small bonus
 * instead. It has its own once-an-hour clock and its own fairness rails (not in a fresh save's
 * first ten minutes, not below a thousand cookies, not against a window nobody is looking at),
 * but it takes the SAME active slot as everything else here, so "never two events at once" and
 * "never over a golden cookie" cost it nothing to obey.
 *
 * WHAT A RAID TAKES, AND WHAT IT DOES NOT. The theft comes off `cookies` — the balance — and
 * never off `lifetimeCookies` or `stats.totalCookiesBaked`. Those two are HISTORY: they record
 * what this save has ever baked, they gate achievements and the prestige projection, and a
 * mouse eating a biscuit does not un-bake it. Letting a raid rewind them would also make the
 * raid quietly retroactive — revoking achievements and ascension points hours after the fact —
 * which is a far worse punishment than the one the player agreed to. So the raid is expensive
 * and it is survivable, and nothing it does can move a number that only ever goes up.
 * ---------------------------------------------------------------------------------------- */
import { z } from "zod";

import { bnAdd, bnCompare, bnFromNumber, bnMulScalar, type BigNum } from "./big-number.js";
import { areMouseRaidsUnlocked } from "./control-unlocks.js";
import { totalCps } from "./cps.js";
import { isEffectActive } from "./golden-cookie.js";
import { computeMultipliers } from "./upgrades.js";
import type { GameState, RngPort } from "./types.js";

/* ------------------------------------------------------------------- the event pool */

export type RandomEventId =
  | "cookie_rain"
  | "grandmas_batch"
  | "oven_hiccup"
  | "sugar_rush"
  | "lucky_crumb"
  | "market_day"
  /* ------------------------------------------------------------------ the frenzy class */
  /**
   * THE FRENZIES, and why a second frenzy exists when golden-cookie.ts already has one.
   *
   * A golden cookie's frenzy is a REWARD FOR LOOKING: it only ever happens because the player
   * saw a cookie and clicked it. These four are a reward for BEING THERE — they land on the
   * pool's own clock whether anyone is watching or not, and what they change is how the next
   * minute of an ordinary session feels. The two systems stack, on purpose, and the ceiling
   * that stops that stack running away is stated once and tested (`stackEventMultipliers`).
   *
   * The class is deliberately not all upside. `clot` is in it, halving production for over a
   * minute, because a game where the only weather is good weather has no weather at all: the
   * frenzies are worth waiting for exactly to the extent that the pool can also cost you
   * something.
   */
  | "production_frenzy"
  | "click_frenzy"
  | "burnt_batch_frenzy"
  | "clot"
  | "combo_window"
  /* ------------------------------------------------------- events designed for this pool */
  | "delivery_rush"
  | "taste_test"
  | "flour_shortage"
  | "night_shift"
  | "sprinkle_storm"
  /* ------------------------------------------------------ the second wave of pool events */
  /**
   * THE WAVE-TWO EVENTS. Six more faces, designed against the same rule as the first wave: an
   * event earns its place by being worth a DIFFERENT amount to a different player, or by asking
   * for a different gesture. A sixth "here is a lump of cookies" would only make the pool longer.
   *
   * Two of them are the pool's first hooks into things outside it — a generator family by id
   * string (`grandma_convention`) and a subgame's clock by id string (`overtime_crew`). Neither
   * imports the module it touches: this file names them as strings and the composition layers
   * (effective-cps.ts, the reducer's tick) do the reaching. A pool that imported the home would
   * be a pool that could not be tested without one.
   */
  | "cookie_eclipse"
  | "crumb_comet"
  | "bakers_dozen"
  | "static_cling"
  | "grandma_convention"
  | "overtime_crew"
  /**
   * THE MOUSE RAID — the one event that is not in the common pool.
   *
   * Everything else in this file is drawn from one weighted bag every three to ten minutes.
   * The raid is not: it is rare by the clock rather than rare by the dice, on its own
   * fifty-to-seventy-five-minute schedule ("roughly hourly", which is what the owner asked
   * for), and it can take up to eighty per cent of the balance. An eighty-per-cent loss that
   * shares a bag with Lucky Crumb would either be so light it is not a raid or so frequent it
   * is a punishment, so it gets its own clock and the pool keeps its weights.
   *
   * It still shares the ACTIVE SLOT with the pool, which is the property that matters: two
   * events are never on screen at once, and a golden cookie still blocks it, because those
   * rules live on the slot rather than on the schedule.
   */
  | "mouse_raid";

/**
 * How an event behaves in time.
 *
 *   - `instant`  — pays out the moment it spawns and is over. It still gets announced and
 *                  still shows in the toast; it simply never becomes the "active" event, so it
 *                  cannot block the next roll for its whole duration (it has none).
 *   - `timed`    — occupies the active slot until `endsAtEpochMs`, applying a multiplier the
 *                  whole time. Expiry is what resolves it; the player does nothing.
 *   - `clickable`— occupies the active slot AND puts real buttons on the stage. Cookie Rain's
 *                  drops are worth cookies; Oven Hiccup's single button is worth ending the
 *                  penalty early. Both still resolve on expiry if the player ignores them.
 */
export type RandomEventShape = "instant" | "timed" | "clickable" | "choice";

/**
 * What KIND of weather an event is, for styling and for reading the pool at a glance.
 *
 *   - `boon`     — pure upside. The pool's bread and butter.
 *   - `frenzy`   — a big multiplier for a short window. Warm accent.
 *   - `clot`     — pure downside for a while. Cold accent. There is exactly one, on purpose.
 *   - `chain`    — a sequence of targets that has to be worked through in order.
 *   - `choice`   — two buttons, one decision, a real tradeoff between them.
 *   - `tradeoff` — a timed effect that gives with one hand and takes with the other.
 *
 * `isSetback` stays a separate boolean because it answers a different question: "does this cost
 * the player something?" A `tradeoff` costs them something and is not a setback overall, and the
 * warning copy keys off the boolean rather than off the class.
 */
export type RandomEventClass = "boon" | "frenzy" | "clot" | "chain" | "choice" | "tradeoff";

export interface RandomEventDefinition {
  readonly id: RandomEventId;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly blurbEn: string;
  readonly blurbYue: string;
  readonly shape: RandomEventShape;
  /** Zero for `instant` events. */
  readonly durationMs: number;
  /**
   * Relative likelihood in the weighted draw. The two pure-windfall events are common and the
   * risk event is rare, because an interruption that TAKES something should be the one the
   * player remembers, not the one they resent.
   */
  readonly weight: number;
  /** How many clickable targets the event puts on the stage. Zero for everything else. */
  readonly targetCount: number;
  /** Multiplier applied to production for as long as the event is active. */
  readonly cpsMultiplier: number;
  /** Multiplier applied to click value for as long as the event is active. */
  readonly clickMultiplier: number;
  /** Fraction of a purchase handed back while the event is active (Market Day). */
  readonly rebateFraction: number;
  /** True when the event costs the player something. Drives the warning styling and copy. */
  readonly isSetback: boolean;
  /** Which family this belongs to. Drives the accent, and nothing else. */
  readonly eventClass: RandomEventClass;
  /**
   * Generator ids whose output this event surges, and by how much. ID STRINGS ONLY.
   *
   * This is the pool's one hook into generators.ts and it is deliberately a hook rather than an
   * import: this module never learns what a "grandma" is, it only names one. `effective-cps.ts`
   * — the leaf that already depends on the generators, the golden cookie and this file — is
   * where the name is resolved into arithmetic. An id that no longer exists surges nothing,
   * which is the honest reading of "the thing this event was about is gone".
   */
  readonly surgeGeneratorIds?: readonly string[];
  readonly surgeMultiplier?: number;
  /**
   * A subgame whose clock this event speeds up, named by id string, and the factor.
   *
   * Same deal as `surgeGeneratorIds`: `"home"` is a string here and the reducer's tick is what
   * knows it means home-construction.ts. A subgame id nothing recognises speeds up nothing.
   */
  readonly subgameSpeedId?: string;
  readonly subgameSpeedMultiplier?: number;
}

/**
 * THE WEIGHTS, AND THE PACING THEY BUY.
 *
 * Every weight in the pool below is out of a total of exactly one hundred (`POOL_WEIGHT_TOTAL`,
 * pinned by a test), so a weight reads as a percentage of draws without any arithmetic. That is
 * the only reason the numbers are what they are — nothing in the draw needs them to sum to
 * anything in particular.
 *
 * WHAT THE PACING WAS, AND WHAT IT IS NOW. The gap between two pool SPAWNS is
 * `cooldownMs + uniform(minDelayMs, maxDelayMs)`, so the mean gap is the cooldown plus the
 * midpoint of the band:
 *
 *   wave one, before — 60s + mean(180s, 600s) = 450s  →  8.00 spawns an hour, from 6 kinds
 *   wave one, after  — 60s + mean(240s, 720s) = 540s  →  6.67 spawns an hour, from 16 kinds
 *   wave two (now)   — 60s + mean(270s, 810s) = 600s  →  6.00 spawns an hour, from 22 kinds
 *
 * A SPAWN IS NO LONGER THE SAME THING AS AN EVENT, which is the one genuinely new fact in this
 * paragraph. A spawn now draws a STACK of one, two or three compatible events (see
 * `rollEventStackSize`), so the interruption count and the event count have come apart:
 *
 *   mean events per spawn = 1×0.952 + 2×0.040 + 3×0.008 = 1.056
 *   events an hour        = 6.00 × 1.056 = 6.34
 *
 * So the session gets FEWER interruptions than wave one (6.00 against 6.67) and very nearly the
 * same number of events (6.34 against 6.67), out of a bag half again as big. That is the trade
 * this lane is making on purpose: the pool is quieter and each interruption is more interesting.
 *
 * How rare "rare" actually is, at 6.00 spawns an hour:
 *
 *   Burnt Batch Frenzy    1%  →  about one every 16.7 hours of play
 *   Crumb Comet           2%  →  about one every 8.3 hours
 *   Production Frenzy     4%  →  about one every 4.2 hours
 *   Click Frenzy          3%  →  about one every 5.6 hours
 *   a DOUBLE EVENT      4.0% of spawns →  0.240 an hour, about one every 4.2 hours
 *   a TRIPLE EVENT      0.8% of spawns →  0.048 an hour, about one every 20.8 hours
 *   anything that costs you something (Oven Hiccup, Clot, Flour Shortage, Static Cling)
 *                        15%  →  0.90 an hour
 *
 * The Mouse Raid's own hourly clock is untouched by all of this, and the raid never joins a
 * stack — see `canStackWith`.
 */
export const POOL_WEIGHT_TOTAL = 100;

export const RANDOM_EVENT_DEFINITIONS: readonly RandomEventDefinition[] = [
  {
    id: "cookie_rain",
    nameEn: "Cookie Rain",
    nameYue: "曲奇雨",
    blurbEn: "Cookies are falling. Catch them before they hit the counter.",
    blurbYue: "有曲奇跌緊落嚟，落到枱面之前接住佢。",
    shape: "clickable",
    durationMs: 20_000,
    weight: 8,
    targetCount: 12,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "boon",
  },
  {
    id: "grandmas_batch",
    nameEn: "Grandma's Surprise Batch",
    nameYue: "嫲嫲嘅驚喜一爐",
    blurbEn: "A whole tray arrives unannounced.",
    blurbYue: "無啦啦送咗成盤過嚟。",
    shape: "instant",
    durationMs: 0,
    weight: 8,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "boon",
  },
  {
    id: "oven_hiccup",
    nameEn: "Oven Hiccup",
    nameYue: "焗爐打思噎",
    blurbEn: "The oven is sulking and output is down. Thump it to fix it.",
    blurbYue: "焗爐鬧脾氣，產量跌咗。拍佢一下就得。",
    shape: "clickable",
    durationMs: 30_000,
    weight: 5,
    targetCount: 1,
    cpsMultiplier: 0.4,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: true,
    eventClass: "clot",
  },
  {
    id: "sugar_rush",
    nameEn: "Sugar Rush",
    nameYue: "糖分上頭",
    blurbEn: "Every click lands seven times as hard.",
    blurbYue: "每一下撳都重七倍。",
    shape: "timed",
    durationMs: 15_000,
    weight: 6,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 7,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "frenzy",
  },
  {
    id: "lucky_crumb",
    nameEn: "Lucky Crumb",
    nameYue: "好彩餅碎",
    blurbEn: "Something small was found under the counter.",
    blurbYue: "喺枱底執到少少嘢。",
    shape: "instant",
    durationMs: 0,
    weight: 9,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "boon",
  },
  {
    id: "market_day",
    nameEn: "Market Day",
    nameYue: "趁墟日",
    blurbEn: "The supplier is in a good mood. Purchases come back part-refunded.",
    blurbYue: "供應商今日心情好，買嘢有錢回。",
    shape: "timed",
    durationMs: 60_000,
    weight: 6,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0.15,
    isSetback: false,
    eventClass: "boon",
  },

  /* ============================================================ THE FRENZY CLASS ========= */

  /**
   * PRODUCTION FRENZY — the classic, ×7 for seventy-seven seconds.
   *
   * Intent: the pool's headline. Seventy-seven seconds is long enough that a player changes what
   * they are doing — they stop buying and let it run, or they buy the thing they were two
   * seconds short of — which is what separates a frenzy from a bigger Lucky Crumb.
   *
   * The numbers are deliberately the SAME numbers as the golden cookie's frenzy, because they
   * are the same idea arriving by a different door, and giving the pool's version its own
   * slightly-different multiplier would only invite the question of which one this is.
   */
  {
    id: "production_frenzy",
    nameEn: "Production Frenzy",
    nameYue: "生產狂熱",
    blurbEn: "Every oven in the place is going flat out. Production ×7.",
    blurbYue: "成間舖啲焗爐開到盡。產量 ×7。",
    shape: "timed",
    durationMs: 77_000,
    weight: 4,
    targetCount: 0,
    cpsMultiplier: 7,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "frenzy",
  },
  /**
   * CLICK FRENZY — ×777 on the click, for thirteen seconds.
   *
   * Intent: the one event that pays for putting your hand on the mouse. A number this size only
   * works because the window is tiny and the draw is rare (3%, about one every five hours): what
   * it is worth is bounded by how fast a human can click, not by how big the multiplier looks.
   * It is the counterweight to Production Frenzy, which pays for doing nothing at all.
   */
  {
    id: "click_frenzy",
    nameEn: "Click Frenzy",
    nameYue: "狂撳",
    blurbEn: "Thirteen seconds where every click is worth seven hundred and seventy-seven.",
    blurbYue: "十三秒之內，每一下撳都值七百七十七下。",
    shape: "timed",
    durationMs: 13_000,
    weight: 3,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 777,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "frenzy",
  },
  /**
   * BURNT BATCH FRENZY — ×666 for six seconds. The rarest thing in the pool by a factor of four.
   *
   * Intent: the event you tell someone about. A whole tray has caught, the kitchen panics, and
   * for six seconds the place produces at a rate it has no business producing at. Six seconds of
   * ×666 is about sixty-six minutes of ordinary production, which is a lot — and it lands roughly
   * once every fifteen hours, which is what makes that acceptable rather than a balance hole.
   *
   * It is drawn as a frenzy rather than a setback because nothing is taken: the batch is ruined
   * in the fiction and the arithmetic only ever goes up. Calling it a setback would be styling
   * the player's best moment in the alarm colour.
   */
  {
    id: "burnt_batch_frenzy",
    nameEn: "Burnt Batch Frenzy",
    nameYue: "燶批狂熱",
    blurbEn: "A tray has caught and the whole kitchen is panicking. Six seconds at ×666.",
    blurbYue: "有盤嘢燶咗，成個廚房亂晒。六秒 ×666。",
    shape: "timed",
    durationMs: 6_000,
    weight: 1,
    targetCount: 0,
    cpsMultiplier: 666,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "frenzy",
  },
  /**
   * CLOT — production halved for sixty-six seconds, and nothing you can do about it.
   *
   * Intent: this is what makes a frenzy worth anything. A pool whose every face is a present is
   * not weather, it is a drip feed, and the player stops reading the marquee. The Clot is the
   * mirror of Production Frenzy — same shape, same order of duration, opposite sign — so the two
   * teach each other: after you have sat through sixty-six seconds at half rate, seventy-seven
   * seconds at seven times is a thing you notice.
   *
   * There is no button to end it early, unlike the Oven Hiccup. That is the difference between
   * the two setbacks: the hiccup is a chore you can clear, the clot is weather you wait out. It
   * halves production and touches NOTHING else — not the balance, not clicks, not the shop.
   */
  {
    id: "clot",
    nameEn: "Clot",
    nameYue: "撞板",
    blurbEn: "The dough has seized in the mixers. Production at half rate until it clears.",
    blurbYue: "啲麵糰喺攪拌機度結咗塊。通咗之前產量得一半。",
    shape: "timed",
    durationMs: 66_000,
    weight: 3,
    targetCount: 0,
    cpsMultiplier: 0.5,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: true,
    eventClass: "clot",
  },
  /**
   * COMBO WINDOW — eight seconds at ×5 on the click, and every click buys more window.
   *
   * Intent: the only event in the pool whose VALUE depends on the player rather than on the
   * dice. Each click during it pushes the end time out by `COMBO_EXTEND_MS`, capped at
   * `COMBO_MAX_DURATION_MS` from the moment it started, so a player who keeps the rhythm turns
   * eight seconds into thirty and a player who wanders off gets eight seconds.
   *
   * The cap is what stops it being a lever rather than an event: no amount of clicking makes it
   * permanent, and the extension is per click rather than per second so there is no way to hold
   * it open without actually playing. The multiplier is small (×5, against Sugar Rush's ×7)
   * precisely because the duration is the reward here.
   */
  {
    id: "combo_window",
    nameEn: "Combo Window",
    nameYue: "連撳窗口",
    blurbEn: "Clicks are worth ×5, and every click you land keeps the window open longer.",
    blurbYue: "撳一下值 ×5，而且每撳一下個窗口就開耐啲。",
    shape: "timed",
    durationMs: 8_000,
    weight: 3,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 5,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "frenzy",
  },

  /* ================================================= EVENTS DESIGNED FOR THIS POOL ======= */

  /**
   * DELIVERY RUSH — three parcels, in order, against the clock.
   *
   * Intent: a chain event, which the pool had none of. Cookie Rain scatters twelve identical
   * targets and rewards spraying clicks at the stage; the Delivery Rush puts THREE down and
   * only the next one in the sequence counts, so the gesture is "find the one that is live and
   * hit it" rather than "hit everything". Each parcel pays, and getting all three inside the
   * window pays a completion bonus on top that is worth more than the three parcels together —
   * a chain the player abandons half way should be worth what they actually did, and finishing
   * it should be worth having tried.
   *
   * Clicking out of order is refused rather than punished. A wrong click costing something would
   * make a twelve-second timer into a stress test, and the refusal already carries the lesson.
   */
  {
    id: "delivery_rush",
    nameEn: "Delivery Rush",
    nameYue: "趕單",
    blurbEn: "Three orders are out the door in sequence. Send them in order before the van goes.",
    blurbYue: "三張單要順住次序出。喺架車走之前逐張搞掂。",
    shape: "clickable",
    durationMs: 14_000,
    weight: 5,
    targetCount: 3,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "chain",
  },
  /**
   * TASTE TEST — two buttons, one decision, and no right answer.
   *
   * Intent: the pool's only event that asks the player something. A tray comes out of the oven
   * and is either good enough to sell or not, and the player decides which:
   *
   *   - SERVE IT NOW  — a lump sum, right now, `tasteTestServeCpsSeconds` of production.
   *   - SEND IT BACK  — nothing now, and `TASTE_TEST_BUFF_MS` at ×`TASTE_TEST_BUFF_MULTIPLIER`.
   *
   * The two are tuned to be worth the same in a vacuum — five minutes of production either way —
   * so the choice is genuinely about circumstance rather than about which button is secretly
   * correct: the lump is better if you are about to buy something, the buff is better if you are
   * about to sit and watch, and it is strictly better if a frenzy is already running, because it
   * multiplies into that stack and a lump sum does not.
   *
   * THE PARITY IS INCREMENTAL, which is why the multiplier is ×6 and not ×5. A minute at ×N is
   * worth (N − 1) minutes of EXTRA production, because the baseline minute would have been
   * produced anyway. At ×5 the buff was +240 seconds against the lump's 300, so "serve" was the
   * arithmetically correct answer in a vacuum and the question had a hidden right button after
   * all. Sixty seconds at ×6 is +300, which is the lump exactly.
   *
   * Letting the window run out chooses neither and pays nothing. That is stated in the copy and
   * on the site rather than being a trap: an event that made indecision the best option would
   * teach players to ignore it.
   */
  {
    id: "taste_test",
    nameEn: "Taste Test",
    nameYue: "試味",
    blurbEn: "A tray is out and it is borderline. Serve it now, or send it back for a better one?",
    blurbYue: "有盤嘢出爐，好唔好食就好爭議。即刻賣咗佢，定係退返轉頭焗過？",
    shape: "choice",
    durationMs: 15_000,
    weight: 4,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "choice",
  },
  /**
   * FLOUR SHORTAGE — a dip, then the delayed lorry arrives all at once.
   *
   * Intent: a setback that is honest about being temporary, and the only event in the pool with
   * a payout ON EXPIRY. Production runs at half rate for thirty seconds while the bins are
   * empty; when it ends, `flourShortageReboundCpsSeconds` of production lands in one lump —
   * more than the dip cost, so a player who sat through it is slightly ahead.
   *
   * It is still drawn as a setback, and the marquee still warns, because for thirty seconds the
   * counter really is climbing more slowly and pretending otherwise would be the sort of
   * flattering copy this game does not write. The rebound is stated on the site, in the toast
   * and in the aftermath, so nobody has to discover it by waiting.
   *
   * (The owner's sketch was "discounts nothing but doubles the next purchase's effect". That
   * was tried and rejected: a purchase whose effect is doubled means a generator whose count is
   * not what the shop said it would be, which breaks the one promise every price in this game
   * makes. The rebound keeps the shape of the idea — you lose now, you gain later — without
   * making any printed number a lie.)
   */
  {
    id: "flour_shortage",
    nameEn: "Flour Shortage",
    nameYue: "冇麵粉",
    blurbEn: "The bins are empty and the lorry is late. Half rate until it arrives — then it all lands at once.",
    blurbYue: "麵粉用晒，架貨車又遲到。到貨之前產量得一半——到咗之後一次過補返。",
    shape: "timed",
    durationMs: 30_000,
    weight: 3,
    targetCount: 0,
    cpsMultiplier: 0.5,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: true,
    eventClass: "tradeoff",
  },
  /**
   * NIGHT SHIFT — production ×3, clicks ×0.25, for forty-five seconds.
   *
   * Intent: an event that is worth a different amount to different players, which nothing else
   * in the pool is. The ovens run all night and there is nobody at the counter: an idle save
   * gains a great deal and an active clicker gains almost nothing, so it is the one draw where
   * the correct play is to put the mouse down.
   *
   * The click penalty is real (a quarter, not a token 0.9) because a tradeoff nobody can feel is
   * just a boon with extra words. It is NOT flagged as a setback: the production gain dominates
   * for every playstyle the game actually has, and painting it in the alarm colour would send a
   * player scrambling to end something that is helping them.
   */
  {
    id: "night_shift",
    nameEn: "Night Shift",
    nameYue: "通宵更",
    blurbEn: "The ovens run all night with nobody at the counter. Production ×3, clicks ×0.25.",
    blurbYue: "啲焗爐通宵開，但係冇人睇住個櫃檯。產量 ×3，撳嘅價值 ×0.25。",
    shape: "timed",
    durationMs: 45_000,
    weight: 5,
    targetCount: 0,
    cpsMultiplier: 3,
    clickMultiplier: 0.25,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "tradeoff",
  },
  /**
   * SPRINKLE STORM — ten targets whose value climbs as you clear them.
   *
   * Intent: Cookie Rain rewards catching ANY drop; the Sprinkle Storm rewards catching them ALL.
   * Each sprinkle is worth the base amount times one plus `sprinkleEscalation` per sprinkle
   * already caught, so the tenth is worth nearly four times the first and the last few are where
   * the event actually lives. A player who catches three has had a small Cookie Rain; a player
   * who clears the stage has had something worth chasing.
   *
   * The escalation is stated in the copy and on the site, because an escalating reward the
   * player cannot see is indistinguishable from a flat one they misremembered.
   */
  {
    id: "sprinkle_storm",
    nameEn: "Sprinkle Storm",
    nameYue: "糖針暴",
    blurbEn: "Sprinkles everywhere. Each one you catch makes the next one worth more.",
    blurbYue: "周圍都係糖針。接得一粒，下一粒就值多啲。",
    shape: "clickable",
    durationMs: 18_000,
    weight: 6,
    targetCount: 10,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "boon",
  },

  /* ================================================= THE SECOND WAVE OF POOL EVENTS ====== */

  /**
   * COOKIE ECLIPSE — the lights go down and five crumbs are the only thing glowing.
   *
   * Intent: the answer to a real complaint about Cookie Rain. The rain puts TWELVE identical
   * targets up and the correct play is to spray clicks at the stage, which is not a skill, it is
   * a wrist. The Eclipse puts up FIVE, worth about three times a rain drop each, on a dimmed
   * stage where finding them is the whole gesture. Same family, opposite density: rain rewards
   * volume, the eclipse rewards looking.
   *
   * The dimming is CSS on the stage, never a change to contrast anywhere a player reads a
   * number — the HUD, the counter and the shop keep their ordinary colours throughout, because
   * an event that made the price of a farm hard to read would be an accessibility bug wearing a
   * costume. The crumbs themselves are the brightest thing on the stage while it runs.
   */
  {
    id: "cookie_eclipse",
    nameEn: "Cookie Eclipse",
    nameYue: "曲奇日蝕",
    blurbEn: "The lights have gone. Five crumbs are still glowing — find them.",
    blurbYue: "成間舖暗晒。得返五粒餅碎仲喺度發光——搵出佢哋。",
    shape: "clickable",
    durationMs: 16_000,
    weight: 5,
    targetCount: 5,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "boon",
  },
  /**
   * CRUMB COMET — one target, one pass, nine seconds. Miss it and it is gone.
   *
   * Intent: the pool's only pure SKILL prize, and it exists because Cookie Rain was slowed to a
   * catchable pace in the previous lane. A catchable rain is a friendlier rain and it also took
   * the last bit of pressure out of the clickable family, so this puts a single hard catch back
   * — a big fast object crossing the stage exactly once, worth roughly nine rain drops if you get
   * it and nothing at all if you do not.
   *
   * IT PAYS NOTHING ON EXPIRY, deliberately, and it is the only clickable event in the pool with
   * that property. Everything else in the family is a bag of value the player takes some of; the
   * comet is a single yes-or-no. That is only fair because it is rare (2%, about one every eight
   * hours) and because the miss costs nothing that was already yours — a comet that fined you
   * for being slow would be a different and much worse event.
   */
  {
    id: "crumb_comet",
    nameEn: "Crumb Comet",
    nameYue: "餅碎彗星",
    blurbEn: "Something big is crossing the counter, once. Catch it before it goes.",
    blurbYue: "有嚿好大嘅嘢橫過個櫃檯，得一次機會。趁佢未走接住佢。",
    shape: "clickable",
    durationMs: 9_000,
    weight: 2,
    targetCount: 1,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "boon",
  },
  /**
   * BAKER'S DOZEN — for ninety seconds, every thirteenth cookie you spend is on the house.
   *
   * Intent: the owner's sketch was "a window where the thirteenth purchase is free". That was
   * tried and rejected for the same reason the Flour Shortage's original sketch was: counting to
   * thirteen means the shop's printed prices stop being what you pay, and worse, it means the
   * player has to track a counter the game would then have to display, argue about and save.
   *
   * The rebate keeps the FICTION exactly — one cookie in thirteen comes back — and pays it
   * continuously instead of in a lump: `1 / 13` = 7.69% of every purchase, handed back through
   * the same seam Market Day already uses (see `randomEventRebateFraction`). A player who spends
   * thirteen farms' worth during the window has had precisely one farm free, which is the thing
   * the name promises, and no price anywhere ever printed a lie.
   *
   * It is deliberately WEAKER and LONGER than Market Day (7.69% for 90s against 15% for 60s):
   * two rebate events that were the same size would be one event with two names.
   */
  {
    id: "bakers_dozen",
    nameEn: "Baker's Dozen",
    nameYue: "十三件一打",
    blurbEn: "Ninety seconds where every thirteenth cookie you spend comes straight back.",
    blurbYue: "九十秒之內，你每花十三粒曲奇就有一粒即刻返返嚟。",
    shape: "timed",
    durationMs: 90_000,
    weight: 5,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    // One in thirteen, written as the division rather than as 0.0769 so the number and the name
    // can never drift apart. `BAKERS_DOZEN_REBATE` states it once; this is that constant.
    rebateFraction: 1 / 13,
    isSetback: false,
    eventClass: "boon",
  },
  /**
   * STATIC CLING — everything sticks to everything, and clicks are worth ×0.35 for forty seconds.
   *
   * Intent: the pool's FIRST click-side setback, and that is the whole reason it exists. Every
   * penalty this game had before it — Oven Hiccup, Clot, Flour Shortage — reduces PRODUCTION,
   * which means a player who clicks for a living has never once been inconvenienced by bad
   * weather. Static Cling is the mirror: an idle save barely notices it and an active clicker
   * feels it immediately, so between it and Night Shift the two playstyles now each have one
   * event that is aimed at them.
   *
   * ×0.35 rather than a token 0.9, for the reason Night Shift's note already gives: a penalty
   * nobody can feel is not a penalty. Forty seconds rather than the Clot's sixty-six, because
   * this one is felt continuously by the player who is doing something rather than sat through by
   * one who is not. There is no button to clear it — like the Clot, it is weather.
   *
   * It touches production, the balance and the shop not at all. Reading the definition is enough
   * to know that, which is the point of every field being on the definition.
   */
  {
    id: "static_cling",
    nameEn: "Static Cling",
    nameYue: "痴晒靜電",
    blurbEn: "Dough is sticking to everything, your hands included. Clicks are worth ×0.35.",
    blurbYue: "啲麵糰痴晒周圍，連你隻手都痴埋。撳一下淨係值 ×0.35。",
    shape: "timed",
    durationMs: 40_000,
    weight: 4,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 0.35,
    rebateFraction: 0,
    isSetback: true,
    eventClass: "clot",
  },
  /**
   * GRANDMA CONVENTION — the grandmas have brought friends, and for fifty seconds they bake ×4.
   *
   * Intent: an event whose value is a fact about YOUR save rather than a fact about the pool. A
   * Production Frenzy is worth ×7 of everything to everybody; the Convention is worth ×4 of your
   * grandmas and your farms and nothing else, so it is enormous on a save that leaned into the
   * early generators and close to nothing on one that skipped straight to portals. Nothing else
   * in the pool has that property, and it is the only kind of event that can make a player look
   * at what they own and think about it.
   *
   * THE FAMILY IS TWO IDS, `grandma` and `farm`, and it is two rather than one because a single
   * generator is too small a target to be worth an event at any point after the first hour. The
   * farm is in because the fiction already puts grandmas in it — the tray of cookies comes from
   * somewhere — and because the pair together is a coherent "the old guard is having a moment"
   * rather than an arbitrary list.
   *
   * IT IS STATED AS A SURGE ON NAMED IDS, not as a global multiplier with a footnote, so the
   * event's honesty is structural: `surgeGeneratorIds` is on the definition, the site prints it,
   * and effective-cps.ts applies exactly those and nothing else.
   */
  {
    id: "grandma_convention",
    nameEn: "Grandma Convention",
    nameYue: "婆婆大會",
    blurbEn: "Every grandma in the district has turned up. Grandmas and farms bake ×4.",
    blurbYue: "成區嘅婆婆都嚟晒。婆婆同農場產量 ×4。",
    shape: "timed",
    durationMs: 50_000,
    weight: 3,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "boon",
    surgeGeneratorIds: ["grandma", "farm"],
    surgeMultiplier: 4,
  },
  /**
   * OVERTIME CREW — the builders stay late, and the house goes up at triple speed for a minute.
   *
   * Intent: the only event in the pool that touches a SUBGAME, and the only one that can be worth
   * literally nothing. If a room is under construction the crew serves three minutes of building
   * in one; if the site is quiet the event happens, is announced, and does nothing at all.
   *
   * THAT IS NOT A BUG AND THE COPY SAYS SO. An event that silently became a production boon when
   * it had nothing to speed up would be two events sharing one name, and a player would never
   * work out which one they had. So it is drawn rarely (2%), it names its condition in the blurb,
   * and the marquee note says outright that it does nothing when nothing is being built. The
   * honest version of "sometimes useless" is telling people when.
   *
   * The reach is a STRING. `subgameSpeedId: "home"` is resolved by the reducer's tick, which is
   * the only place that knows home-construction.ts exists. Nothing about this file needs to.
   */
  {
    id: "overtime_crew",
    nameEn: "Overtime Crew",
    nameYue: "通宵開工隊",
    blurbEn: "The builders are staying late. Any room under construction goes up ×3 as fast.",
    blurbYue: "啲師傅肯開夜。起緊嘅房間快三倍完成。",
    shape: "timed",
    durationMs: 60_000,
    weight: 2,
    targetCount: 0,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "boon",
    subgameSpeedId: "home",
    subgameSpeedMultiplier: 3,
  },
];

/* ------------------------------------------------------- tuning owned by the new events */

/** How much one click during a Combo Window pushes its end time out. */
export const COMBO_EXTEND_MS = 400;
/** The most a Combo Window can ever last, measured from the instant it spawned. */
export const COMBO_MAX_DURATION_MS = 30_000;

/**
 * How long the Taste Test's "send it back" buff runs, and what it multiplies production by.
 *
 * ×6 for sixty seconds is +300 seconds of production over the baseline that would have accrued
 * anyway, which is `tasteTestServeCpsSeconds` exactly — the parity the event's design note
 * promises, measured the way a player actually experiences it.
 */
export const TASTE_TEST_BUFF_MS = 60_000;
export const TASTE_TEST_BUFF_MULTIPLIER = 6;

/** The Taste Test's two answers. Anything else is refused by the domain. */
export type RandomEventChoiceId = "serve" | "send_back";
export const RANDOM_EVENT_CHOICE_IDS: readonly RandomEventChoiceId[] = ["serve", "send_back"];

/** The Delivery Rush's parcels, in the order they must be sent. */
export const DELIVERY_RUSH_PARCELS = 3;

/**
 * One cookie in thirteen, which is what a baker's dozen IS. Stated as the division so the
 * arithmetic and the name are the same fact; the definition above uses this value.
 */
export const BAKERS_DOZEN_REBATE = 1 / 13;

/**
 * The ceiling on a COMBINED rebate, for the one case where two rebate events run together.
 *
 * Market Day (15%) and a Baker's Dozen (7.69%) are compatible under the stacking matrix, and
 * when they coincide the player gets 22.69% of every purchase back. That is a good moment and it
 * is allowed to be one. The cap exists so that no future third rebate can ever push the figure to
 * or past 100%, which would turn the shop into a free shop and every price into a decoration.
 * Half is far above anything two events can reach, so it never quietly eats a real rebate.
 */
export const EVENT_REBATE_CAP = 0.5;

/**
 * The Mouse Raid's definition, deliberately NOT a member of `RANDOM_EVENT_DEFINITIONS`.
 *
 * That array is the weighted bag `pickRandomEventId` draws from, and the raid must never be
 * drawn from it — it arrives on its own hourly clock instead (see `tickRandomEvents`). Keeping
 * it out of the array rather than giving it weight zero means the bag cannot accidentally
 * produce it if someone later changes how the walk works. Its `weight` is therefore zero and
 * means "not in the draw", not "very unlikely".
 *
 * `targetCount` is the CEILING, not the count: a raid spawns three to five mice, rolled when it
 * fires (`MOUSE_RAID_MIN_MICE`..`MOUSE_RAID_MAX_MICE`). Five is what the field records so that
 * anything reading the pool for "how many buttons can this event put on screen" gets the truth.
 */
export const MOUSE_RAID_DEFINITION: RandomEventDefinition = {
  id: "mouse_raid",
  nameEn: "Mouse Raid",
  nameYue: "老鼠打劫",
  blurbEn: "Mice are on the counter. Whack every one before they carry the jar off.",
  blurbYue: "有老鼠爬上枱。趁佢哋未搬走個曲奇罌，逐隻拍走佢。",
  shape: "clickable",
  durationMs: 20_000,
  weight: 0,
  targetCount: 5,
  cpsMultiplier: 1,
  clickMultiplier: 1,
  rebateFraction: 0,
  isSetback: true,
  eventClass: "clot",
};

/** Fewest and most mice one raid can bring. */
export const MOUSE_RAID_MIN_MICE = 3;
export const MOUSE_RAID_MAX_MICE = 5;

/** Every event this module knows about, pool plus raid. Lookups use this; the draw does not. */
export const ALL_RANDOM_EVENT_DEFINITIONS: readonly RandomEventDefinition[] = [
  ...RANDOM_EVENT_DEFINITIONS,
  MOUSE_RAID_DEFINITION,
];

const DEFINITIONS_BY_ID = new Map(ALL_RANDOM_EVENT_DEFINITIONS.map((d) => [d.id, d]));

export function getRandomEventDefinition(id: RandomEventId): RandomEventDefinition {
  const def = DEFINITIONS_BY_ID.get(id);
  if (!def) throw new Error(`Unknown random event id: ${id}`);
  return def;
}

/* ------------------------------------------------------------- DOUBLE AND TRIPLE EVENTS */

/**
 * THE COMPATIBILITY MATRIX, stated once, in one predicate, and tested exhaustively.
 *
 * The owner asked for "double events" and "triple events" — rare spawns where two or three pool
 * events run at the same time. The scheduler that used to guarantee "never two at once" now
 * guarantees "never two INCOMPATIBLE at once", and the whole difference between those two
 * sentences lives in this function and in `isStackable` below it.
 *
 * The rules, and why each one is a rule rather than a preference:
 *
 *   1. NO TWO SETBACKS. Weather is supposed to be survivable. An Oven Hiccup (×0.4) inside a Clot
 *      (×0.5) is ×0.2 production for over a minute, which is not weather, it is a punishment for
 *      a coincidence the player had no part in. One thing can be going wrong at a time.
 *
 *   2. NO TWO EVENTS THAT WANT THE SAME STAGE. Every clickable event scatters real buttons over
 *      the same stage the cookie is on. Two of them at once means rain drops overlapping
 *      sprinkles overlapping parcels: targets that cover each other, a chain whose "next parcel"
 *      is behind a comet, and clicks that land on whichever button React drew last. There is one
 *      stage, so there is at most one event using it.
 *
 *   3. CHOICE EVENTS NEVER STACK, in either direction. A choice event puts a question and two
 *      buttons in the middle of the stage and then WAITS for an answer. Asking someone to weigh a
 *      tradeoff while a comet crosses the screen is not a decision, it is noise — and worse, the
 *      card would be sitting on top of the other event's targets. So a choice event is always
 *      alone, and this is the one rule that is about attention rather than about arithmetic.
 *
 *   4. THE RAID IS NEVER IN A STACK. It is not drawn from the pool at all (it has its own hourly
 *      clock), it can take eighty per cent of the balance, and it owns the stage completely. It
 *      stays exactly as alone as it has always been, and rule 2 would catch it anyway.
 *
 *   5. NO EVENT STACKS WITH ITSELF. Two Sugar Rushes would be a ×49 the pool never designed, and
 *      the HUD would draw the same plate twice with two different clocks on it.
 *
 *   6. INSTANT EVENTS NEVER STACK. An instant pays out and is over inside the tick it spawned in;
 *      there is nothing to be simultaneous WITH. Announcing "DOUBLE EVENT" for a Lucky Crumb plus
 *      a Sugar Rush would be announcing something that never happened.
 *
 * The predicate is symmetric by construction, which matters: `canStackWith(a, b)` and
 * `canStackWith(b, a)` are the same expression, so there is no draw order in which a forbidden
 * pair slips through. A test asserts that over every ordered pair, and a seeded long-run test
 * asserts no forbidden pair is ever actually rolled.
 */
export function isStackable(def: RandomEventDefinition): boolean {
  if (def.id === "mouse_raid") return false;
  if (def.shape === "instant") return false;
  if (def.shape === "choice") return false;
  return true;
}

export function canStackWith(a: RandomEventDefinition, b: RandomEventDefinition): boolean {
  if (!isStackable(a) || !isStackable(b)) return false;
  if (a.id === b.id) return false;
  if (a.isSetback && b.isSetback) return false;
  if (a.targetCount > 0 && b.targetCount > 0) return false;
  return true;
}

/** True when `id` can join a stack that already contains exactly `existing`. */
export function canJoinStack(existing: readonly RandomEventId[], id: RandomEventId): boolean {
  const def = getRandomEventDefinition(id);
  if (!isStackable(def)) return false;
  return existing.every((other) => canStackWith(getRandomEventDefinition(other), def));
}

/** The subset of the pool a stack can be drawn from. Its own array so the draw is a plain walk. */
export const STACKABLE_EVENT_DEFINITIONS: readonly RandomEventDefinition[] =
  RANDOM_EVENT_DEFINITIONS.filter(isStackable);

/**
 * The most events one spawn can put on screen at once. Three, because the owner asked for double
 * and triple and there is no fourth word in that sentence — and because the HUD's indicator
 * plates are laid out to compress to three and no further.
 */
export const MAX_STACKED_EVENTS = 3;

/**
 * HOW OFTEN A STACK HAPPENS, and why these two numbers and not bigger ones.
 *
 * 4% of spawns are doubles and 0.8% are triples, so at the shipped 6.00 spawns an hour a player
 * meets a double about every four hours and a triple about every twenty-one. Those are the
 * numbers that make a stack an event in itself rather than a variation: something that happened
 * twice a session would just be "the pool", and the marquee shouting DOUBLE EVENT at it would
 * wear out within an evening.
 *
 * The five-to-one ratio between them is deliberate. A triple has to be visibly rarer than a
 * double or the two announcements mean the same thing.
 */
export const DOUBLE_EVENT_CHANCE = 0.04;
export const TRIPLE_EVENT_CHANCE = 0.008;

/**
 * How many events THIS spawn wants to put up: 1, 2 or 3.
 *
 * One draw off the injected port, read against the two thresholds in the order rarest-first, so
 * the two chances do not overlap and the arithmetic in the pacing note is the arithmetic here.
 * "Wants" rather than "will": the draw below can find nothing compatible to fill the slots with,
 * and a stack that cannot be filled shrinks rather than being re-rolled.
 */
export function rollEventStackSize(rng: RngPort): number {
  const roll = rng.next();
  if (roll < TRIPLE_EVENT_CHANCE) return 3;
  if (roll < TRIPLE_EVENT_CHANCE + DOUBLE_EVENT_CHANCE) return 2;
  return 1;
}

/** Weighted draw over the STACKABLE subset only. Same exact walk as `pickRandomEventId`. */
export function pickStackableEventId(rng: RngPort): RandomEventId {
  const totalWeight = STACKABLE_EVENT_DEFINITIONS.reduce((sum, d) => sum + d.weight, 0);
  let roll = rng.next() * totalWeight;
  for (const def of STACKABLE_EVENT_DEFINITIONS) {
    roll -= def.weight;
    if (roll < 0) return def.id;
  }
  return STACKABLE_EVENT_DEFINITIONS[STACKABLE_EVENT_DEFINITIONS.length - 1].id;
}

/**
 * The number of draws a stack is allowed to spend looking for a compatible member before it gives
 * up and ships one short.
 *
 * REJECTION SAMPLING, WITH A BUDGET, and the budget is the honest part. Drawing the whole
 * stackable bag and filtering it to "compatible" would bias the result towards whatever is left
 * after the clickables are excluded; drawing and rejecting keeps every member at its real weight.
 * But rejection sampling with no bound is a loop whose worst case is unbounded, and a scheduler
 * that can hang is not a scheduler. Eight attempts is far more than enough — the stackable bag is
 * 79% of the pool and only 31% of it is clickable — and if all eight miss, the spawn is simply a
 * smaller stack. A double that came out single is a spawn the player cannot tell from an ordinary
 * one, which is the right way for this to fail.
 */
const STACK_DRAW_ATTEMPTS = 8;

/**
 * ONE SPAWN'S WORTH OF EVENTS, in the order they will be drawn on screen.
 *
 * The order of the two draws matters and is deliberate: the SIZE is rolled first, and only then
 * is the first member drawn — from the stackable bag when a stack was rolled, and from the whole
 * pool when it was not. That is what makes DOUBLE_EVENT_CHANCE an exact statement about spawns
 * rather than an upper bound: if the first member were drawn from the whole pool, then every
 * spawn that happened to draw a Lucky Crumb or a Taste Test would collapse to a single and the
 * real double rate would be some smaller number nobody had written down.
 *
 * A forced id (the developer capture flag) replaces the FIRST member only, and forces the stack
 * to that member alone unless the forced event is itself stackable — so a capture run photographs
 * the event it asked for rather than that event plus whatever the dice added.
 */
export function drawRandomEventStack(rng: RngPort, config: RandomEventConfig): readonly RandomEventId[] {
  // The roll happens whether or not a size is forced, so the stream advances identically and a
  // forced run is not a differently-shaped run — the same rule the forced id already follows.
  const rolled = rollEventStackSize(rng);
  const wanted = Math.min(MAX_STACKED_EVENTS, Math.max(1, config.forcedStackSize ?? rolled));

  // The first member. Drawn from the stackable subset when a stack is wanted, from the whole pool
  // otherwise, and either way the stream advances by exactly one draw.
  const first = wanted > 1 ? pickStackableEventId(rng) : pickRandomEventId(rng);
  const forced = config.forcedPoolEventId;
  const head = forced ?? first;
  const stack: RandomEventId[] = [head];
  if (wanted <= 1) return stack;
  // A forced event that cannot stack is photographed alone, which is what a capture asked for.
  if (!isStackable(getRandomEventDefinition(head))) return stack;

  for (let slot = 1; slot < wanted; slot += 1) {
    let filled = false;
    for (let attempt = 0; attempt < STACK_DRAW_ATTEMPTS && !filled; attempt += 1) {
      const candidate = pickStackableEventId(rng);
      if (!canJoinStack(stack, candidate)) continue;
      stack.push(candidate);
      filled = true;
    }
    // Nothing compatible turned up in the budget. Ship what we have rather than looping.
    if (!filled) break;
  }
  return stack;
}

/* -------------------------------------------------------------------- payout tuning */

export interface RandomEventPayoutConfig {
  /** Seconds of current production each caught rain drop is worth. */
  readonly rainDropCpsSeconds: number;
  /** Clicks' worth of value each caught rain drop is ALSO worth, so rain pays on a fresh save. */
  readonly rainDropClicks: number;
  /**
   * Seconds of current production Grandma's batch pays instantly.
   *
   * SIZED AGAINST ITS OWN DRAW RATE, like every other number in this file. At weight 10 it is
   * the common filler boon, and a common boon has to pay less per draw than a rare one or the
   * pool's reward curve runs backwards. The comparison that decides it is the Production Frenzy,
   * the event this file calls the pool's headline: weight 4, ×7 for 77s, worth +462 seconds of
   * standing production, so 18.5 seconds per draw. Grandma at 150 is 15 seconds per draw — above
   * a Lucky Crumb's 10.8 (weight 12, 90s) and below the headline, which is the order a player
   * would guess from how often they see each one.
   *
   * It was 600 when this pool shipped, which was 60 seconds per draw: three times the headline
   * frenzy's expectation, and about the same as the once-every-fifteen-hours Burnt Batch Frenzy.
   * That was not a tuning choice with a reason behind it — it was the one payout in this config
   * with no note explaining its size, and it made the rarest events in the game feel like nothing
   * much when they finally arrived.
   */
  readonly grandmasBatchCpsSeconds: number;
  /** Seconds of current production a Lucky Crumb pays instantly. */
  readonly luckyCrumbCpsSeconds: number;
  /** Flat cookies a Lucky Crumb pays on top, so it is never worth exactly nothing. */
  readonly luckyCrumbFlatCookies: number;
  /**
   * Seconds of current production paid for chasing off EVERY mouse in a raid.
   *
   * A defended raid pays, and it is deliberately modest: the real reward for whacking all five
   * mice is the eighty per cent of the balance that did not leave. This is the tip on top, so
   * that a perfect defence is visibly better than a raid that never happened rather than merely
   * identical to it.
   */
  readonly raidDefendedCpsSeconds: number;
  /** Flat cookies a fully-defended raid pays on top, so early saves get something real. */
  readonly raidDefendedFlatCookies: number;

  /* ------------------------------------------------------ the events added by this lane */
  /** Seconds of production one Delivery Rush parcel pays when it is sent in turn. */
  readonly deliveryParcelCpsSeconds: number;
  /** Seconds of production paid ON TOP for getting all three parcels out inside the window. */
  readonly deliveryCompletionCpsSeconds: number;
  /** Seconds of production the Taste Test's "serve it now" answer pays at once. */
  readonly tasteTestServeCpsSeconds: number;
  /**
   * Seconds of production the Flour Shortage pays when it ENDS.
   *
   * Sized deliberately larger than the dip costs. Thirty seconds at half rate loses fifteen
   * seconds' worth of production; the rebound pays forty-five, so sitting through the shortage
   * is worth thirty seconds of production rather than being a wash. A setback whose compensation
   * exactly cancelled it would be a thirty-second animation with no consequence either way.
   *
   * BOTH HALVES ARE MEASURED AT THE SAME RATE, which is what makes that arithmetic true rather
   * than true-on-a-quiet-save. The dip multiplies LIVE production, so during a golden frenzy it
   * costs fifteen frenzy-scaled seconds; the rebound is therefore paid at the highest live
   * multiplier the shortage ran under (`ActiveRandomEvent.peakLiveCpsMultiplier`), not at the
   * standing rate. Without that the shortage was a net loss of sixty standing seconds under a
   * ×7 frenzy — the one moment its own copy is loudest about being worth sitting through.
   */
  readonly flourShortageReboundCpsSeconds: number;
  /** Seconds of production the FIRST sprinkle of a storm is worth. */
  readonly sprinkleBaseCpsSeconds: number;
  /** Clicks' worth the first sprinkle is ALSO worth, so a storm pays on a save with no ovens. */
  readonly sprinkleBaseClicks: number;
  /** How much each sprinkle already caught adds to the value of the next, as a fraction. */
  readonly sprinkleEscalation: number;

  /* ------------------------------------------------- the events added by the second wave */
  /**
   * What one Cookie Eclipse crumb is worth, in seconds of production and in clicks.
   *
   * SIZED AGAINST COOKIE RAIN, which is the event it is a deliberate inversion of. A rain drop is
   * 20 CPS-seconds + 15 clicks and there are twelve of them, so a fully-caught rain is 240 + 180.
   * A crumb is 55 + 40 and there are five, so a fully-caught eclipse is 275 + 200 — about fifteen
   * per cent more for a third of the presses. The eclipse pays better per click and worse per
   * event than a rain the player actually cleared, which is exactly the trade its design note
   * claims: fewer, better targets, and finding them is the work.
   */
  readonly eclipseCrumbCpsSeconds: number;
  readonly eclipseCrumbClicks: number;
  /**
   * What catching the Crumb Comet is worth. One target, one chance, nothing on a miss.
   *
   * 400 CPS-seconds + 250 clicks is roughly nine rain drops or one and a half fully-cleared
   * eclipses, and it is a single press. That ratio is the event: it is worth a lot BECAUSE it is
   * all-or-nothing and rare, and the expected value per draw (2% weight) still lands below the
   * Production Frenzy's, so the skill prize does not quietly become the best thing in the bag.
   */
  readonly cometCpsSeconds: number;
  readonly cometClicks: number;
}

export const DEFAULT_RANDOM_EVENT_PAYOUTS: RandomEventPayoutConfig = {
  rainDropCpsSeconds: 20,
  rainDropClicks: 15,
  grandmasBatchCpsSeconds: 150,
  luckyCrumbCpsSeconds: 90,
  luckyCrumbFlatCookies: 25,
  raidDefendedCpsSeconds: 120,
  raidDefendedFlatCookies: 250,
  deliveryParcelCpsSeconds: 45,
  deliveryCompletionCpsSeconds: 180,
  tasteTestServeCpsSeconds: 300,
  flourShortageReboundCpsSeconds: 45,
  sprinkleBaseCpsSeconds: 12,
  sprinkleBaseClicks: 8,
  sprinkleEscalation: 0.3,
  eclipseCrumbCpsSeconds: 55,
  eclipseCrumbClicks: 40,
  cometCpsSeconds: 400,
  cometClicks: 250,
};

/* ---------------------------------------------------------------- scheduler config */

export interface RandomEventConfig {
  /** Lower bound of the gap between one event resolving and the next becoming eligible. */
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
  /**
   * A flat quiet period added on top of the rolled delay. The rolled delay alone already has a
   * lower bound, but the cooldown is a separate, explicit promise: whatever the dice say, there
   * is always at least this much ordinary play between two events.
   */
  readonly cooldownMs: number;
  /* ---------------------------------------------------------------- the raid's own clock */
  /**
   * The Mouse Raid's window, measured from the last raid (or from the first tick of a save) to
   * the next: THIRTY TO SIXTY MINUTES, drawn uniformly across the whole band.
   *
   * The band is what makes the raid unpredictable, and it is doing real work. A raid drawn
   * uniformly over a thirty-minute span means that at any moment during that span the player
   * has no better guess than "some time in the next half hour"; there is no interval a mental
   * clock can count down, and knowing exactly when the last raid ended tells you nothing
   * useful about the next one beyond the band itself. Nothing narrower is ever exposed.
   */
  readonly raidMinDelayMs: number;
  readonly raidMaxDelayMs: number;
  /**
   * A small second draw applied on top of the band draw and clamped back inside the band.
   *
   * Being honest about what this is and is not: it does NOT widen the distribution and it is
   * not where the unpredictability comes from — the band and the per-session entropy seed are.
   * What it does is stop a delay from being one single PRNG value, so a schedule can never be
   * pinned down from one observed gap plus a known seed, and it breaks any alignment between
   * the rolled delay and the fixed quantities around it (the raid's own duration, the pool's
   * cooldown, the tick period).
   */
  readonly raidJitterMs: number;
  /**
   * A floor under the FIRST raid of a save. A fresh save's opening minutes are the tutorial by
   * another name, and a raid there teaches the wrong lesson. The rolled window is already far
   * longer than this under the shipped config; the floor is what makes the promise true under
   * any config, including the developer-only fast one.
   */
  readonly raidFreshGraceMs: number;
  /**
   * The pool's own fresh-save grace, the counterpart to `raidFreshGraceMs`.
   *
   * `nextEligibleAtEpochMs` starts at zero, which every other clock in this file reads as "never
   * scheduled". The pool had no seeding step for it, so the first tick of a brand-new save was
   * already past due and an event landed within seconds of the first click — measured at 2
   * seconds over a simulated hour. Nobody had seen it because the scheduler was unreachable
   * until the handleTick blocked-flag defect was fixed; the cadence after that first one was
   * correct all along, at seven events an hour spaced six to fourteen minutes apart.
   */
  readonly poolFreshGraceMs: number;
  /**
   * Below this balance a raid does not fire at all. Eighty per cent of four hundred cookies is
   * not a robbery, it is noise — and it is noise aimed at exactly the player least able to read
   * a new mechanic. The raid waits (it does not re-roll) until the counter is worth raiding.
   */
  readonly raidMinCookies: number;
  /** The most a raid can ever take, as a fraction of the CURRENT balance. Reached only when
   *  every mouse escapes. */
  readonly raidStealCeiling: number;
  /**
   * Forces every pool draw to one specific event. Developer-only and undefined in every shipped
   * config, exactly like the fast schedule it travels with.
   *
   * It exists for one reason: photographing a 1%-weight event honestly. The alternative — sitting
   * on a capture desktop for fifteen hours waiting for a Burnt Batch Frenzy — is not a capture
   * process, and faking the screenshot is not an option. What it does NOT do is relax any rule
   * the player is subject to: the event that fires is the real event, with the real duration,
   * the real arithmetic and the real one-active-slot behaviour. Only WHICH one is decided here.
   */
  readonly forcedPoolEventId?: RandomEventId;
  /**
   * Forces every spawn to draw a stack of exactly this many events. Developer-only and undefined
   * in every shipped config, exactly like `forcedPoolEventId` above.
   *
   * It exists for the same reason and under the same limits. A double event is 4% of spawns and a
   * triple is 0.8%; photographing one on the shipped schedule means sitting on a capture desktop
   * for hours hoping the shutter and the dice coincide, which is not a capture process, and
   * faking the screenshot is not an option.
   *
   * WHAT IT DOES NOT DO is relax a single rule the player is subject to. The compatibility matrix
   * still decides which events may share the stage, the rejection budget is still the budget, the
   * durations and the arithmetic are the real ones, and a forced stack that cannot be filled still
   * ships short. Only HOW MANY slots the draw tries to fill is decided here.
   */
  readonly forcedStackSize?: number;
  readonly payouts: RandomEventPayoutConfig;
}

export const DEFAULT_RANDOM_EVENT_CONFIG: RandomEventConfig = {
  // Four and a half to thirteen and a half minutes, widened again from four-to-twelve when the
  // pool grew from sixteen events to twenty-two AND spawns started arriving in stacks. See
  // POOL_WEIGHT_TOTAL's note for the full arithmetic: 6.00 spawns an hour carrying 6.34 events,
  // against wave one's 6.67 spawns carrying 6.67.
  minDelayMs: 4.5 * 60 * 1000,
  maxDelayMs: 13.5 * 60 * 1000,
  cooldownMs: 60 * 1000,
  raidMinDelayMs: 30 * 60 * 1000,
  raidMaxDelayMs: 60 * 60 * 1000,
  raidJitterMs: 90 * 1000,
  raidFreshGraceMs: 10 * 60 * 1000,
  poolFreshGraceMs: 3 * 60 * 1000,
  raidMinCookies: 1_000,
  raidStealCeiling: 0.8,
  payouts: DEFAULT_RANDOM_EVENT_PAYOUTS,
};

/**
 * The developer-only fast schedule.
 *
 * Photographing an event that fires once every three to ten minutes is not a thing a capture
 * run can wait for, so the spawn window is overridable. It is deliberately NOT a settings row
 * and NOT a button in the game: shipping a "spawn an event now" control would turn a random
 * event into a vending machine. Instead the renderer reads one localStorage key at startup —
 * `material-cookie-clicker:events:fast` — and passes the resulting config into the reducer
 * context. A player who never sets that key can never reach this schedule.
 */
export const FAST_RANDOM_EVENT_CONFIG: RandomEventConfig = {
  minDelayMs: 2_000,
  maxDelayMs: 6_000,
  cooldownMs: 1_000,
  // The raid keeps its hour under the fast flag. "Fast" is about the pool; a capture that wants
  // the raid asks for the raid explicitly, below.
  raidMinDelayMs: DEFAULT_RANDOM_EVENT_CONFIG.raidMinDelayMs,
  raidMaxDelayMs: DEFAULT_RANDOM_EVENT_CONFIG.raidMaxDelayMs,
  raidJitterMs: DEFAULT_RANDOM_EVENT_CONFIG.raidJitterMs,
  raidFreshGraceMs: DEFAULT_RANDOM_EVENT_CONFIG.raidFreshGraceMs,
  // The fast schedule exists so a test or a capture can see an event promptly; inheriting the
  // real fresh-save grace would defeat exactly that.
  poolFreshGraceMs: 0,
  raidMinCookies: DEFAULT_RANDOM_EVENT_CONFIG.raidMinCookies,
  raidStealCeiling: DEFAULT_RANDOM_EVENT_CONFIG.raidStealCeiling,
  payouts: DEFAULT_RANDOM_EVENT_PAYOUTS,
};

/**
 * The developer-only RAID schedule, and the honest reason it exists.
 *
 * A Mouse Raid fires about once an hour and lasts twenty seconds. Photographing one on the real
 * schedule means sitting on a running capture desktop for an hour hoping the shutter and the
 * mice coincide. So the same single localStorage key that already shortens the pool's window
 * accepts one more value — `raid` — which shortens the RAID's window instead and quiets the
 * pool, so a capture run sees mice and nothing else.
 *
 * It is the same deal as the fast flag and it comes with the same limits: no button, no
 * settings row, no in-game way to reach it. A raid the player can summon is not a raid, and a
 * pool event landing on top of the capture would only produce a misleading picture.
 *
 * The MIN-COOKIES and never-two-at-once rules are NOT relaxed here. A capture that had to
 * disable the game's fairness rails to get a picture would be a picture of something the player
 * cannot see.
 */
export const RAID_CAPTURE_EVENT_CONFIG: RandomEventConfig = {
  // Effectively never: the pool is quiet so the raid is what lands.
  minDelayMs: 1_000_000_000,
  maxDelayMs: 1_000_000_000,
  cooldownMs: 1_000,
  raidMinDelayMs: 3_000,
  raidMaxDelayMs: 6_000,
  raidJitterMs: 500,
  raidFreshGraceMs: 0,
  poolFreshGraceMs: 0,
  raidMinCookies: DEFAULT_RANDOM_EVENT_CONFIG.raidMinCookies,
  raidStealCeiling: DEFAULT_RANDOM_EVENT_CONFIG.raidStealCeiling,
  payouts: DEFAULT_RANDOM_EVENT_PAYOUTS,
};

/** The localStorage key (and env var name) that selects a developer schedule. */
export const FAST_RANDOM_EVENTS_FLAG = "material-cookie-clicker:events:fast";

/**
 * Pure resolver for that flag, so the decision is tested rather than trusted. Any value other
 * than the exact strings "1", "true" (fast pool) or "raid" (fast raid, quiet pool) leaves the
 * shipped schedule in place.
 */
export function resolveRandomEventConfig(flagValue: string | null | undefined): RandomEventConfig {
  if (flagValue === "raid") return RAID_CAPTURE_EVENT_CONFIG;
  if (flagValue === "1" || flagValue === "true") return FAST_RANDOM_EVENT_CONFIG;
  // `event:<id>` — the fast pool, pinned to one event. Anything that is not the id of a real
  // POOL event (the raid included, since it is not drawn from the pool) falls through to the
  // shipped schedule rather than to a broken one.
  if (typeof flagValue === "string" && flagValue.startsWith("event:")) {
    const id = flagValue.slice("event:".length);
    const def = RANDOM_EVENT_DEFINITIONS.find((d) => d.id === id);
    if (def) return { ...FAST_RANDOM_EVENT_CONFIG, forcedPoolEventId: def.id };
  }
  // `stack:<n>` — the fast pool, forced to draw n events per spawn. Anything outside 1..3 falls
  // through to the shipped schedule rather than to a stack the game could not draw anyway.
  if (typeof flagValue === "string" && flagValue.startsWith("stack:")) {
    const size = Number(flagValue.slice("stack:".length));
    if (Number.isInteger(size) && size >= 1 && size <= MAX_STACKED_EVENTS) {
      return { ...FAST_RANDOM_EVENT_CONFIG, forcedStackSize: size };
    }
  }
  return DEFAULT_RANDOM_EVENT_CONFIG;
}

/* ------------------------------------------------------------ mice, and what they carry */

/**
 * ONE MOUSE, with hit points.
 *
 * Ordinary mice die to a single whack, which is what makes the raid readable the first time you
 * meet it. The FAT MOUSE is the exception and it exists so that the two whack consumables have
 * something to be good against: it takes two or three hits, and it carries double an ordinary
 * mouse's share of the theft, so ignoring it is expensive and swinging at it once is not enough.
 *
 * `share` — not a count of mice — is what the theft is apportioned by. A raid of four ordinary
 * mice plus one fat one has six shares, so the fat one alone getting away costs two sixths of
 * the ceiling rather than one fifth of it. The number a player sees ("2 of 5 mice got away")
 * still counts heads, because that is what they watched happen; the arithmetic underneath is
 * stated on the site rather than hidden.
 */
export interface RaidMouse {
  readonly id: string;
  /** Hits still needed to see it off. Always at least one while it is on the stage. */
  readonly hp: number;
  /** What it started with, so the UI can draw two pips out of three rather than a bare number. */
  readonly maxHp: number;
  /** Weight in the theft split. Ordinary mice 1, the fat mouse 2. */
  readonly share: number;
  readonly fat: boolean;
}

/** Hit points a fat mouse can bring. Rolled per raid. */
const FAT_MOUSE_MIN_HP = 2;
const FAT_MOUSE_MAX_HP = 3;
/** The mouse count at which a raid is big enough to include a fat one. */
const FAT_MOUSE_MIN_RAID_SIZE = 4;

/** Builds the mice of one raid: ordinary ones, plus a fat one on the larger raids. */
export function rollRaidMice(count: number, rng: RngPort, halved: boolean): readonly RaidMouse[] {
  const fatIndex = count >= FAT_MOUSE_MIN_RAID_SIZE ? count - 1 : -1;
  const fatHp = FAT_MOUSE_MIN_HP + Math.min(
    FAT_MOUSE_MAX_HP - FAT_MOUSE_MIN_HP,
    Math.floor(rng.next() * (FAT_MOUSE_MAX_HP - FAT_MOUSE_MIN_HP + 1)),
  );
  return Array.from({ length: count }, (_, index) => {
    const fat = index === fatIndex;
    const maxHp = fat ? fatHp : 1;
    return {
      id: `mouse:${index}`,
      hp: halved ? halveHp(maxHp) : maxHp,
      maxHp,
      share: fat ? 2 : 1,
      fat,
    };
  });
}

/**
 * Half-HP, rounded UP. Rounding up is the honest reading of "halve it": a one-hit mouse still
 * takes one hit, because a mouse that died to no hits at all would not be a mouse.
 */
export function halveHp(hp: number): number {
  return Math.max(1, Math.ceil(hp / 2));
}

/** Total theft weight of a set of mice. */
export function totalShare(mice: readonly RaidMouse[]): number {
  return mice.reduce((sum, mouse) => sum + mouse.share, 0);
}

/* ------------------------------------------------------------------------- consumables */

/**
 * THE THREE RAID CONSUMABLES.
 *
 * All three are bought with cookies, by hand, one at a time, from a stock that is capped — they
 * are insurance, not immunity. Nothing here is a subscription, a timer or a reward for waiting;
 * a player who never buys one plays exactly the game that shipped before them.
 *
 * They differ in WHEN they are spent, and the difference is the whole design:
 *
 *   - `whack_pass` is spent only at the moment a raid would actually take cookies. A raid you
 *     defended by hand spends nothing, so a pass in the drawer is never wasted on a raid you
 *     were going to win anyway.
 *   - `bigger_whack` and `half_hp_whack` are ARMED when a raid starts and are spent by that
 *     raid whatever happens, because what they buy is that raid being easier to fight. Arming
 *     is automatic when the stock is there: an "arm now?" prompt in the middle of a
 *     twenty-second window would be a worse game and a worse accessibility story.
 *
 * Stock is a COUNT, not a list of individual items, so there is no such thing as the oldest
 * pass; "oldest first" has nothing to sort. Saying so plainly beats inventing per-item
 * timestamps that would never be looked at.
 */
export type RaidConsumableId = "whack_pass" | "bigger_whack" | "half_hp_whack";

export interface RaidConsumableDefinition {
  readonly id: RaidConsumableId;
  readonly nameEn: string;
  readonly nameYue: string;
  readonly blurbEn: string;
  readonly blurbYue: string;
  /** Cookies the first one costs. */
  readonly baseCost: number;
  /** What each one already bought multiplies the next one's price by. */
  readonly costRatio: number;
  /* There is deliberately no per-consumable `stockCap` here. How many of ANY kind a player may
     hold is one shared number that the Whack Storage ladder below owns — see its comment for
     why one shelf beats three. */
  /** True when the raid arms it at spawn rather than spending it on the theft. */
  readonly armedAtSpawn: boolean;
}

export const RAID_CONSUMABLE_DEFINITIONS: readonly RaidConsumableDefinition[] = [
  {
    id: "whack_pass",
    nameEn: "Whack Pass",
    nameYue: "打鼠券",
    blurbEn: "Spent automatically when a raid would take cookies. The mice flee empty-handed.",
    blurbYue: "老鼠真係要攞走曲奇嗰陣自動用一張，佢哋咪空手走囉。",
    baseCost: 1_000_000,
    costRatio: 4,
    armedAtSpawn: false,
  },
  {
    id: "bigger_whack",
    nameEn: "Bigger Whack",
    nameYue: "大力拍",
    blurbEn: "Armed at the next raid: one press swats every mouse it lands near.",
    blurbYue: "下次打劫自動用：一拍就掃到附近嘅老鼠。",
    baseCost: 2_500_000,
    costRatio: 4,
    armedAtSpawn: true,
  },
  {
    id: "half_hp_whack",
    nameEn: "Half-HP Whack",
    nameYue: "半血拍",
    blurbEn: "Armed at the next raid: every mouse needs half as many hits, rounded up.",
    blurbYue: "下次打劫自動用：每隻老鼠要嘅拍數減半，唔夠一下就當一下。",
    baseCost: 2_500_000,
    costRatio: 4,
    armedAtSpawn: true,
  },
];

const CONSUMABLES_BY_ID = new Map(RAID_CONSUMABLE_DEFINITIONS.map((d) => [d.id, d]));

export function getRaidConsumableDefinition(id: RaidConsumableId): RaidConsumableDefinition {
  const def = CONSUMABLES_BY_ID.get(id);
  if (!def) throw new Error(`Unknown raid consumable id: ${id}`);
  return def;
}

export interface RaidConsumableStock {
  /** How many are in hand right now. Never above the definition's cap. */
  readonly stock: number;
  /** How many have EVER been bought. This is what the price escalates on, so selling the idea
   *  of "buy three, spend them, buy three cheap ones again" is not on offer. */
  readonly purchased: number;
}

export type RaidConsumablesState = Readonly<Record<RaidConsumableId, RaidConsumableStock>>;

export function createInitialRaidConsumables(): RaidConsumablesState {
  return {
    whack_pass: { stock: 0, purchased: 0 },
    bigger_whack: { stock: 0, purchased: 0 },
    half_hp_whack: { stock: 0, purchased: 0 },
  };
}

/** The price of the NEXT one of a kind: base × ratio^(how many have ever been bought). */
export function raidConsumablePrice(id: RaidConsumableId, consumables: RaidConsumablesState): BigNum {
  const def = getRaidConsumableDefinition(id);
  return bnMulScalar(bnFromNumber(def.baseCost), Math.pow(def.costRatio, consumables[id].purchased));
}

/* ---------------------------------------------------------------- the storage ladder */

/**
 * WHACK STORAGE: one shared shelf, bought in rungs, that raises how many of EACH consumable a
 * player may hold at once.
 *
 * ONE LADDER, NOT THREE. Three separate storage tracks would be three prices, three progress
 * chips and three mental models for a mechanic whose whole content is a single number the
 * player is trying to raise. One ladder says the true thing in one place: "you can hold three
 * of anything; pay to hold five; pay again to hold eight." Every rung applies to all three
 * consumables at once, so there is never a state where a player has to remember which drawer
 * they upgraded.
 *
 * IT LIVES IN THE DOMAIN, not in control-unlocks.ts, and that is a deliberate reading of the
 * two registries this codebase already has. control-unlocks.ts buys INTERFACE — a rung there
 * reveals a control that was hidden, and the game underneath is unchanged. This ladder changes
 * the rules of a raid: how much insurance the player may carry into one. That is a game
 * mechanic in exactly the sense the consumable prices above are, so it is stored, priced and
 * enforced beside them, and it is bought with its own reducer action rather than by pretending
 * to be a piece of chrome.
 *
 * The level is an INDEX into this array, and the array's first rung is the free one every save
 * starts on. That is what makes the field safe to default to zero on read: a save written
 * before this ladder existed is a save at rung zero, which is the cap the game always had.
 */
export interface WhackStorageTier {
  /** How many of each consumable this rung lets the player hold. */
  readonly cap: number;
  /** Cookies this rung costs. Zero for the rung every save starts on. */
  readonly cost: number;
}

export const WHACK_STORAGE_TIERS: readonly WhackStorageTier[] = [
  { cap: 3, cost: 0 },
  { cap: 5, cost: 5_000_000 },
  { cap: 8, cost: 25_000_000 },
];

/** The highest rung index. A save at this level has nothing left to buy. */
export const MAX_WHACK_STORAGE_LEVEL = WHACK_STORAGE_TIERS.length - 1;

function clampStorageLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(MAX_WHACK_STORAGE_LEVEL, Math.max(0, Math.floor(level)));
}

/** How many of each consumable a save at this rung may hold. */
export function whackStorageCap(level: number): number {
  return WHACK_STORAGE_TIERS[clampStorageLevel(level)].cap;
}

/**
 * The price of the NEXT rung, or null at the top. Null is the honest answer for "there is no
 * next one" and it keeps the view from having to invent a sentinel price.
 */
export function nextWhackStoragePrice(level: number): BigNum | null {
  const next = clampStorageLevel(level) + 1;
  if (next > MAX_WHACK_STORAGE_LEVEL) return null;
  return bnFromNumber(WHACK_STORAGE_TIERS[next].cost);
}

/**
 * Buys the next rung. Pure, and refuses in the same shape as every other purchase here: at the
 * top of the ladder, or short of the price, the level comes back unchanged.
 */
export function buyWhackStorage(
  level: number,
  cookies: BigNum,
): { readonly level: number; readonly price: BigNum | null; readonly bought: boolean } {
  const current = clampStorageLevel(level);
  const price = nextWhackStoragePrice(current);
  if (price === null || bnCompare(cookies, price) < 0) return { level: current, price, bought: false };
  return { level: current + 1, price, bought: true };
}

/** True when the stock is full. A capped consumable is insurance; an uncapped one is immunity. */
export function isRaidConsumableAtCap(
  id: RaidConsumableId,
  consumables: RaidConsumablesState,
  storageLevel = 0,
): boolean {
  return consumables[id].stock >= whackStorageCap(storageLevel);
}

/**
 * Buys one. Pure, and refuses silently in exactly the same shape as every other purchase in
 * this game: at the cap, or short of the price, the state comes back unchanged.
 */
export function buyRaidConsumable(
  consumables: RaidConsumablesState,
  id: RaidConsumableId,
  cookies: BigNum,
  storageLevel = 0,
): { readonly consumables: RaidConsumablesState; readonly price: BigNum; readonly bought: boolean } {
  const price = raidConsumablePrice(id, consumables);
  if (isRaidConsumableAtCap(id, consumables, storageLevel) || bnCompare(cookies, price) < 0) {
    return { consumables, price, bought: false };
  }
  const current = consumables[id];
  return {
    consumables: { ...consumables, [id]: { stock: current.stock + 1, purchased: current.purchased + 1 } },
    price,
    bought: true,
  };
}

function spendOne(consumables: RaidConsumablesState, id: RaidConsumableId): RaidConsumablesState {
  const current = consumables[id];
  if (current.stock <= 0) return consumables;
  return { ...consumables, [id]: { ...current, stock: current.stock - 1 } };
}

/* --------------------------------------------------------- the bigger whack's geometry */

/** How far a Bigger Whack reaches from where the press landed, in CSS pixels. */
export const BIGGER_WHACK_RADIUS_PX = 120;

/** One mouse's position on screen, as measured from its own button. */
export interface MousePoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Which mice a single press catches.
 *
 * The geometry lives here, in the domain, rather than in the click handler, because "did that
 * swing reach the second mouse" is arithmetic and arithmetic belongs where it can be tested.
 * The POSITIONS come from the view — the mice are animated by the browser, so their real
 * coordinates are whatever the layout says they are, and measuring the actual buttons is the
 * only honest source for that. Overlapping mice are caught together, which is the point.
 *
 * The origin is always included, even if the radius is zero, so an ordinary whack is just this
 * function with a radius of nothing.
 */
export function miceWithinWhackRadius(
  points: readonly MousePoint[],
  originId: string,
  radiusPx: number,
): readonly string[] {
  const origin = points.find((point) => point.id === originId);
  if (!origin) return [];
  const caught = points.filter((point) => {
    if (point.id === originId) return true;
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    return Math.sqrt(dx * dx + dy * dy) <= radiusPx;
  });
  return caught.map((point) => point.id);
}

/* ------------------------------------------------------------------------- the state */

export interface ActiveRandomEvent {
  readonly id: RandomEventId;
  readonly startedAtEpochMs: number;
  readonly endsAtEpochMs: number;
  /** Clickable targets not yet taken, by id (`rain:0`… / `oven:fix`). Empty for timed events. */
  readonly pendingTargetIds: readonly string[];
  /** How many targets the player has taken so far. */
  readonly claimedCount: number;
  /**
   * The mice of an active Mouse Raid, with their hit points. Raid-only and absent for every
   * other event. `pendingTargetIds` stays the authoritative list of what is still on the stage
   * and these are kept in step with it: same ids, same order, always.
   */
  readonly mice?: readonly RaidMouse[];
  /** Total theft weight the raid started with, kept so the split still divides by what was
   *  there rather than by what is left. */
  readonly startingShare?: number;
  /** Consumables this raid armed at spawn. Already deducted from stock; spent either way. */
  readonly armed?: readonly RaidConsumableId[];
  /**
   * Which way a CHOICE event was answered. Absent while the question is still on screen, and
   * absent forever on every event that never asked one.
   *
   * A choice event does not end when it is answered: answering "send it back" turns the same
   * active slot into the buff it bought, and this field is what the multiplier lookup reads to
   * know that. Keeping it on the active event rather than in a second state field means the buff
   * cannot outlive the slot, cannot stack with itself, and is saved and restored for free.
   */
  readonly choiceTaken?: RandomEventChoiceId;
  /**
   * The largest GOLDEN-COOKIE production multiplier seen while this event has been on screen.
   *
   * Written only for the Flour Shortage, and it is what makes that event's stated guarantee —
   * "sitting through it leaves you ahead" — true rather than nearly true. The dip is a
   * multiplier on live production, so a shortage that overlaps a golden frenzy costs the player
   * frenzy-scaled seconds; a rebound paid at the standing rate would then be a net LOSS,
   * precisely when a player is most likely to be watching the counter. Paying the rebound at
   * the same peak the dip was suffering keeps the loss and the compensation on the same scale.
   *
   * Absent on every other event and on any shortage saved by a build before this field existed;
   * both read as "no frenzy seen", which is the ordinary case and pays exactly as before.
   */
  readonly peakLiveCpsMultiplier?: number;
}

export interface ResolvedRandomEvent {
  readonly id: RandomEventId;
  readonly resolvedAtEpochMs: number;
  readonly claimedCount: number;
  /** True when the player ended it themselves rather than letting the clock run out. */
  readonly endedEarly: boolean;
}

/**
 * What one finished Mouse Raid did, kept so the aftermath toast can state it exactly.
 *
 * `stolen` is the cookies that actually left the balance, computed at the instant the raid
 * ended, so the toast prints the real figure rather than re-deriving a percentage of a number
 * that has since moved.
 */
export interface MouseRaidOutcome {
  readonly resolvedAtEpochMs: number;
  readonly miceTotal: number;
  readonly miceWhacked: number;
  readonly miceEscaped: number;
  readonly stolen: BigNum;
  /** The defended bonus, paid only when `defended` is true. Zero otherwise. */
  readonly reward: BigNum;
  /** True when every mouse was whacked: nothing was taken and the bonus was paid. */
  readonly defended: boolean;
  /**
   * True when a Whack Pass was spent to stop the theft. Deliberately its own flag rather than
   * being folded into `defended`: the aftermath card has to say a pass was spent, because
   * telling a player they whacked mice they did not whack would be a lie in the one place they
   * are looking for a straight answer.
   */
  readonly passSpent: boolean;
  /** Every consumable this raid spent, armed ones included. */
  readonly consumablesSpent: readonly RaidConsumableId[];
}

export interface RandomEventsState {
  /**
   * EVERY EVENT RUNNING RIGHT NOW, in the order they were drawn. Empty when the pool is quiet.
   *
   * This was a single `active: ActiveRandomEvent | null` slot until doubles and triples arrived,
   * and the change from "a slot" to "a list of at most `MAX_STACKED_EVENTS`" is the structural
   * heart of this lane. What did NOT change is the rule the slot was really enforcing: two events
   * that would fight each other still never run together. That rule simply moved from the shape
   * of the field (one slot, so one event) into a stated, tested predicate (`canStackWith`), where
   * it can say something more precise than "one".
   *
   * INVARIANTS, all of them checked by tests:
   *   - length is at most `MAX_STACKED_EVENTS`;
   *   - every ordered pair in it satisfies `canStackWith`;
   *   - a Mouse Raid, when present, is the ONLY member;
   *   - members expire independently, and the pool's next-eligible instant is set when the LAST
   *     one goes, so a stack is one interruption rather than two or three.
   *
   * `primaryActive` is the first member and is what every single-event reader wants.
   */
  readonly actives: readonly ActiveRandomEvent[];
  /** Wall-clock instant the scheduler may next roll a spawn. */
  readonly nextEligibleAtEpochMs: number;
  /** PRNG stream position, persisted so the schedule survives save/load unchanged. */
  readonly rngStreamIndex: number;
  /** The most recently finished event, kept only so the UI can name it in a toast. */
  readonly lastResolved: ResolvedRandomEvent | null;
  /** Lifetime count of events that have spawned. A statistic, and nothing depends on it. */
  readonly spawnCount: number;
  /**
   * The Mouse Raid's own next-eligible instant, separate from the pool's because the raid is on
   * its own hourly clock. Zero means "never scheduled" — the first tick of a save seeds it, and
   * that seeding is what enforces the fresh-save grace period.
   */
  readonly raidNextEligibleAtEpochMs: number;
  /** The most recent raid's result, kept only so the aftermath toast can state what happened. */
  readonly lastRaid: MouseRaidOutcome | null;
  /** Lifetime count of raids that have fired. A statistic; nothing depends on it. */
  readonly raidCount: number;
  /** What the player has bought to fight raids with, and how much they have ever bought. */
  readonly consumables: RaidConsumablesState;
  /** Which rung of WHACK_STORAGE_TIERS is owned. Zero is the free rung every save starts on. */
  readonly whackStorageLevel: number;
}

/** The first (and on 95% of spawns, only) event running. Null when the pool is quiet. */
export function primaryActive(state: RandomEventsState): ActiveRandomEvent | null {
  return state.actives[0] ?? null;
}

/** The running event with this id, or null. Ids are unique within a stack by rule 5. */
export function activeWithId(state: RandomEventsState, id: RandomEventId): ActiveRandomEvent | null {
  return state.actives.find((event) => event.id === id) ?? null;
}

/** How many events are on screen: 1 for an ordinary spawn, 2 for a double, 3 for a triple. */
export function activeStackSize(state: RandomEventsState): number {
  return state.actives.length;
}

export function createInitialRandomEventsState(): RandomEventsState {
  return {
    actives: [],
    nextEligibleAtEpochMs: 0,
    rngStreamIndex: 0,
    lastResolved: null,
    spawnCount: 0,
    raidNextEligibleAtEpochMs: 0,
    lastRaid: null,
    raidCount: 0,
    consumables: createInitialRaidConsumables(),
    whackStorageLevel: 0,
  };
}

/* ------------------------------------------------------------------ persistence seam */

/**
 * This module carries its OWN save schema rather than adding a field to save-schema.ts.
 *
 * That is not squeamishness about touching a shared file: it is what keeps the format
 * backward-compatible without a version bump. Random-event state is entirely derivable from
 * "nothing has happened yet" — an older save simply had no events, and
 * `createInitialRandomEventsState()` is the honest reading of it. So the field is optional on
 * disk, defaulted on read, and a save written by this build still loads in a build without it
 * (the unknown key is ignored). save-codec.ts calls the two functions below and nothing else
 * knows this state is stored at all.
 *
 * WHAT THAT TOLERANCE USED TO COST, AND WHY THERE IS A VERSION NOW. The id list below is a
 * CLOSED enum, and this design explicitly invites a later build to add a seventeenth event
 * without touching the save's schema version. The first save written by such a build and then
 * opened by this one carries an id this enum rejects, the whole block fails to parse — and the
 * old all-or-nothing decode threw the entire sidecar away. Losing a schedule and a
 * half-finished event is genuinely fine; they were going to expire anyway. Losing the
 * CONSUMABLES is not: Whack Passes are bought with cookies and are the only durable, paid thing
 * stored here. So the sidecar now carries its own version number, and the decode salvages in
 * layers rather than all-or-nothing (see `decodeRandomEvents`).
 */

/**
 * The sidecar's own version, independent of the save's `schemaVersion`.
 *
 * It is written on every save and defaulted to 1 when absent, so a save from before this field
 * existed reads as version 1 and needs no migration. Its job is not to gate parsing — the
 * salvage below does that — it is so a build reading a sidecar from the FUTURE can say so
 * precisely instead of guessing from a parse failure.
 */
/**
 * VERSION 2 — the one-slot-to-list migration.
 *
 * Version 1 wrote `active: ActiveRandomEvent | null`. Version 2 writes
 * `actives: ActiveRandomEvent[]`, because a spawn can now put up to three events on screen. The
 * migration is the obvious one and it is LOSSLESS in both directions that matter:
 *
 *   reading v1 → `active` becomes `actives: active ? [active] : []`. A save from before doubles
 *   existed had exactly one event running or none, which is exactly a list of length one or zero.
 *   Nothing is invented and nothing is discarded.
 *
 *   a v2 save read by a v1 build → the v1 schema does not know `actives`, fails to parse, and
 *   falls through that build's salvage layers to "consumables kept, schedule regenerated". That
 *   is the outcome the salvage design was written for and it is the right one: a half-finished
 *   double event was going to expire anyway; the Whack Passes were paid for.
 *
 * The version number is what lets a future build say "this sidecar is from version 3" precisely
 * instead of inferring it from a parse failure, which is the job the field was added to do.
 */
export const RANDOM_EVENTS_SIDECAR_VERSION = 2;
const RandomEventIdSchema = z.enum([
  "cookie_rain",
  "grandmas_batch",
  "oven_hiccup",
  "sugar_rush",
  "lucky_crumb",
  "market_day",
  "production_frenzy",
  "click_frenzy",
  "burnt_batch_frenzy",
  "clot",
  "combo_window",
  "delivery_rush",
  "taste_test",
  "flour_shortage",
  "night_shift",
  "sprinkle_storm",
  "cookie_eclipse",
  "crumb_comet",
  "bakers_dozen",
  "static_cling",
  "grandma_convention",
  "overtime_crew",
  "mouse_raid",
]);

const RaidBigNumSchema = z.object({ mantissa: z.number(), exponent: z.number() });

const RaidConsumableIdSchema = z.enum(["whack_pass", "bigger_whack", "half_hp_whack"]);

const RaidMouseSchema = z.object({
  id: z.string(),
  hp: z.number().int().positive(),
  maxHp: z.number().int().positive(),
  share: z.number().positive(),
  fat: z.boolean(),
});

const RaidConsumableStockSchema = z.object({
  stock: z.number().int().nonnegative(),
  purchased: z.number().int().nonnegative(),
});

const RaidConsumablesSchema = z
  .object({
    whack_pass: RaidConsumableStockSchema,
    bigger_whack: RaidConsumableStockSchema,
    half_hp_whack: RaidConsumableStockSchema,
  })
  .default(createInitialRaidConsumables);

const WhackStorageLevelSchema = z.number().int().nonnegative().max(MAX_WHACK_STORAGE_LEVEL);

const ActiveRandomEventSchema = z.object({
  id: RandomEventIdSchema,
  startedAtEpochMs: z.number(),
  endsAtEpochMs: z.number(),
  pendingTargetIds: z.array(z.string()),
  claimedCount: z.number().int().nonnegative(),
  // Raid-only, and optional so a raid saved by an older build reloads as a raid of ordinary
  // one-hit mice — which is exactly what it was.
  mice: z.array(RaidMouseSchema).optional(),
  startingShare: z.number().optional(),
  armed: z.array(RaidConsumableIdSchema).optional(),
  choiceTaken: z.enum(["serve", "send_back"]).optional(),
  peakLiveCpsMultiplier: z.number().positive().optional(),
});

export const RandomEventsStateSchema = z.object({
  /* Absent in every sidecar written before this field existed, which is exactly version 1. */
  sidecarVersion: z.number().int().positive().default(RANDOM_EVENTS_SIDECAR_VERSION),
  /* Capped at MAX_STACKED_EVENTS on the way in as well as on the way out: a sidecar claiming
     five simultaneous events is not a save this build can honour, and truncating is better than
     rendering a stack the compatibility matrix says is impossible. */
  actives: z.array(ActiveRandomEventSchema).max(MAX_STACKED_EVENTS),
  nextEligibleAtEpochMs: z.number(),
  rngStreamIndex: z.number().int().nonnegative(),
  lastResolved: z
    .object({
      id: ActiveRandomEventSchema.shape.id,
      resolvedAtEpochMs: z.number(),
      claimedCount: z.number().int().nonnegative(),
      endedEarly: z.boolean(),
    })
    .nullable(),
  spawnCount: z.number().int().nonnegative(),
  /* The three raid fields are OPTIONAL with defaults, for the same reason this whole block is
     optional in the save: a save written before the raid existed is not corrupt, it is a save
     from a game where no raid had ever happened, and that reads exactly as "unscheduled, none
     yet, zero". Making them required would throw away a perfectly good pool schedule on the
     first load after an update. */
  raidNextEligibleAtEpochMs: z.number().default(0),
  lastRaid: z
    .object({
      resolvedAtEpochMs: z.number(),
      miceTotal: z.number().int().nonnegative(),
      miceWhacked: z.number().int().nonnegative(),
      miceEscaped: z.number().int().nonnegative(),
      stolen: RaidBigNumSchema,
      reward: RaidBigNumSchema,
      defended: z.boolean(),
      passSpent: z.boolean().default(false),
      consumablesSpent: z.array(RaidConsumableIdSchema).default([]),
    })
    .nullable()
    .default(null),
  raidCount: z.number().int().nonnegative().default(0),
  consumables: RaidConsumablesSchema,
  /* Same optional-with-a-default treatment as the raid fields above, and for the same reason: a
     save written before the storage ladder existed is not corrupt, it is a save that never
     bought a rung — which reads exactly as level zero, the cap the game always had. No schema
     version bump is needed for a field whose absence has one honest reading. */
  whackStorageLevel: WhackStorageLevelSchema.default(0),
});

/** JSON-safe form of the state. Structurally identical; typed separately so it can diverge. */
export type RandomEventsSaveData = z.infer<typeof RandomEventsStateSchema>;

export function encodeRandomEvents(state: RandomEventsState): RandomEventsSaveData {
  return {
    sidecarVersion: RANDOM_EVENTS_SIDECAR_VERSION,
    actives: state.actives.slice(0, MAX_STACKED_EVENTS).map((active) => ({
      ...active,
      pendingTargetIds: [...active.pendingTargetIds],
      mice: active.mice ? active.mice.map((mouse) => ({ ...mouse })) : undefined,
      armed: active.armed ? [...active.armed] : undefined,
      choiceTaken: active.choiceTaken,
      peakLiveCpsMultiplier: active.peakLiveCpsMultiplier,
    })),
    nextEligibleAtEpochMs: state.nextEligibleAtEpochMs,
    rngStreamIndex: state.rngStreamIndex,
    lastResolved: state.lastResolved ? { ...state.lastResolved } : null,
    spawnCount: state.spawnCount,
    raidNextEligibleAtEpochMs: state.raidNextEligibleAtEpochMs,
    lastRaid: state.lastRaid
      ? {
          ...state.lastRaid,
          stolen: { ...state.lastRaid.stolen },
          reward: { ...state.lastRaid.reward },
          consumablesSpent: [...state.lastRaid.consumablesSpent],
        }
      : null,
    raidCount: state.raidCount,
    consumables: {
      whack_pass: { ...state.consumables.whack_pass },
      bigger_whack: { ...state.consumables.bigger_whack },
      half_hp_whack: { ...state.consumables.half_hp_whack },
    },
    whackStorageLevel: state.whackStorageLevel,
  };
}

/**
 * Reads the field back off raw save data. Anything unreadable — absent, wrong shape, written by
 * a build that stored something else here — becomes a fresh scheduler rather than an error,
 * because a save is never worth refusing over an event that was going to expire anyway.
 *
 * IT SALVAGES IN THREE LAYERS, cheapest first, and the order is the point:
 *
 *   1. The whole block parses. Nothing to salvage; this is every ordinary load.
 *   2. It does not, but it becomes parseable once an UNRECOGNISED EVENT ID is dropped. That is
 *      the expected shape of a sidecar written by a later build that added an event without
 *      bumping anything — the id it names is a real event, just not one this build knows. The
 *      event and the "last resolved" note are dropped (this build cannot render an event it
 *      has no definition for) and everything else survives intact: consumables, both schedules,
 *      the raid history, the counters.
 *   3. It still does not parse. Then the schedule is genuinely lost — but the CONSUMABLES are
 *      pulled out on their own if they can be read at all, because those were bought with
 *      cookies. A schedule regenerates on the next tick; a Whack Pass does not.
 *
 * The rule behind all three: this function may throw away state the game can rebuild, and may
 * never silently throw away something the player paid for.
 */
/**
 * Drops the wire-only version field. It is a fact about the FILE, not about the scheduler, and
 * keeping it out of the runtime state means nothing downstream can start branching on it.
 */
function withoutSidecarVersion(data: RandomEventsSaveData): RandomEventsState {
  const { sidecarVersion: _version, ...state } = data;
  return state;
}

/**
 * VERSION 1 → VERSION 2: the one slot becomes a list of at most three.
 *
 * Applied before parsing rather than after, because the v1 shape does not satisfy the v2 schema
 * at all (`actives` is required and `active` is not a key it knows). It is a pure rename with a
 * wrap, it only fires when the record actually carries a v1 `active` key and no v2 `actives` key,
 * and it leaves every other field alone for the salvage layers below to deal with.
 */
function migrateSidecarV1(record: Record<string, unknown>): Record<string, unknown> {
  if ("actives" in record) return record;
  if (!("active" in record)) return record;
  const { active, ...rest } = record;
  return { ...rest, actives: active === null || active === undefined ? [] : [active] };
}

export function decodeRandomEvents(raw: unknown): RandomEventsState {
  if (raw === undefined || raw === null) return createInitialRandomEventsState();

  const parsed = RandomEventsStateSchema.safeParse(raw);
  if (parsed.success) return withoutSidecarVersion(parsed.data);

  if (typeof raw === "object") {
    const record = migrateSidecarV1(raw as Record<string, unknown>);

    // Layer 0 — the migrated v1 sidecar. Every field survives; only the shape moved.
    const migrated = RandomEventsStateSchema.safeParse(record);
    if (migrated.success) return withoutSidecarVersion(migrated.data);

    const withoutUnknownIds = { ...record };
    let droppedAnId = false;
    const knownId = (value: unknown): boolean => {
      if (!value || typeof value !== "object") return true;
      const id = (value as { id?: unknown }).id;
      if (typeof id !== "string") return true;
      return RandomEventIdSchema.safeParse(id).success;
    };
    // The running events are now a LIST, so an unrecognised id costs one member rather than the
    // whole stack: a future build's double event, half of which this build knows, reloads as the
    // half it knows. The alternative — dropping both — would throw away an event this build can
    // render perfectly well.
    if (Array.isArray(record.actives)) {
      const kept = record.actives.filter(knownId);
      if (kept.length !== record.actives.length) {
        withoutUnknownIds.actives = kept;
        droppedAnId = true;
      }
    }
    if (!knownId(record.lastResolved)) {
      withoutUnknownIds.lastResolved = null;
      droppedAnId = true;
    }
    if (droppedAnId) {
      const retried = RandomEventsStateSchema.safeParse(withoutUnknownIds);
      if (retried.success) return withoutSidecarVersion(retried.data);
    }

    // The last-ditch salvage pulls out everything the player PAID for: the stock, and the
    // storage rungs that raised its cap. Both cost cookies; a schedule does not.
    const consumables = RaidConsumablesSchema.safeParse(record.consumables);
    const storage = WhackStorageLevelSchema.safeParse(record.whackStorageLevel);
    if (consumables.success) {
      return {
        ...createInitialRandomEventsState(),
        consumables: consumables.data,
        whackStorageLevel: storage.success ? storage.data : 0,
      };
    }
  }

  return createInitialRandomEventsState();
}

/* --------------------------------------------------------------------- the scheduler */

function rollDelayMs(rng: RngPort, config: RandomEventConfig): number {
  const span = Math.max(0, config.maxDelayMs - config.minDelayMs);
  return config.minDelayMs + Math.floor(rng.next() * span);
}

/** Weighted draw over the pool. Weights are small integers; the walk is exact, not float-fuzzy. */
export function pickRandomEventId(rng: RngPort): RandomEventId {
  const totalWeight = RANDOM_EVENT_DEFINITIONS.reduce((sum, d) => sum + d.weight, 0);
  let roll = rng.next() * totalWeight;
  for (const def of RANDOM_EVENT_DEFINITIONS) {
    roll -= def.weight;
    if (roll < 0) return def.id;
  }
  return RANDOM_EVENT_DEFINITIONS[RANDOM_EVENT_DEFINITIONS.length - 1].id;
}

function targetIdsFor(def: RandomEventDefinition): readonly string[] {
  if (def.id === "cookie_rain") {
    return Array.from({ length: def.targetCount }, (_, index) => `rain:${index}`);
  }
  // Every clickable event owns its own id PREFIX, and that is what lets a click be routed to the
  // right member of a stack without the view telling anyone which event it meant.
  if (def.id === "cookie_eclipse") {
    return Array.from({ length: def.targetCount }, (_, index) => `crumb:${index}`);
  }
  if (def.id === "crumb_comet") {
    return Array.from({ length: def.targetCount }, (_, index) => `comet:${index}`);
  }
  if (def.id === "sprinkle_storm") {
    return Array.from({ length: def.targetCount }, (_, index) => `sprinkle:${index}`);
  }
  // The parcels are in the array in the order they must be sent, and `clickRandomEventTarget`
  // only ever accepts the head of it, which is what makes the chain a chain.
  if (def.id === "delivery_rush") {
    return Array.from({ length: def.targetCount }, (_, index) => `parcel:${index}`);
  }
  if (def.id === "oven_hiccup") return ["oven:fix"];
  return [];
}

/** Schedules the next eligible instant: the flat cooldown plus a rolled delay on top. */
function scheduleNext(nowEpochMs: number, rng: RngPort, config: RandomEventConfig): number {
  return nowEpochMs + config.cooldownMs + rollDelayMs(rng, config);
}

/**
 * The delay to the next raid: a uniform draw across the whole thirty-to-sixty-minute band, plus
 * a small independent jitter, clamped back inside the band so the advertised bounds are the
 * real bounds. Exported because a distribution nobody can test is a claim rather than a
 * property.
 */
export function rollRaidDelayMs(rng: RngPort, config: RandomEventConfig): number {
  const span = Math.max(0, config.raidMaxDelayMs - config.raidMinDelayMs);
  const base = config.raidMinDelayMs + rng.next() * span;
  const jitter = (rng.next() * 2 - 1) * config.raidJitterMs;
  const clamped = Math.min(config.raidMaxDelayMs, Math.max(config.raidMinDelayMs, base + jitter));
  return Math.round(clamped);
}

/**
 * When the NEXT raid becomes eligible: one rolled delay, floored by the fresh-save grace. The
 * floor is why the first raid of a save can never land in the opening ten minutes, whatever the
 * window is set to.
 */
function scheduleNextRaid(nowEpochMs: number, rng: RngPort, config: RandomEventConfig): number {
  return nowEpochMs + Math.max(config.raidFreshGraceMs, rollRaidDelayMs(rng, config));
}

/** How many mice this raid brings: three to five, rolled when it fires. */
export function rollMouseCount(rng: RngPort): number {
  const span = MOUSE_RAID_MAX_MICE - MOUSE_RAID_MIN_MICE + 1;
  return MOUSE_RAID_MIN_MICE + Math.min(span - 1, Math.floor(rng.next() * span));
}

/** The mice of one raid, as target ids. */
export function mouseTargetIds(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `mouse:${index}`);
}

/**
 * WHAT A RAID TAKES.
 *
 *   stolen = cookies × ceiling × escaped / total
 *
 * so one mouse of five getting away costs sixteen per cent and all five cost the full eighty.
 * It is scaled by escapes rather than being all-or-nothing on purpose: a raid you nearly
 * stopped should cost nearly nothing, and a player who whacked four of five has visibly bought
 * themselves four fifths of their balance back.
 *
 * The multiplier is on the CURRENT balance, which is what the owner asked for ("80% of
 * cookies") and is also the only reading that stays fair as a save grows — a flat number would
 * be a catastrophe early and a rounding error late.
 */
export function mouseRaidTheft(
  cookies: BigNum,
  escaped: number,
  total: number,
  ceiling: number = DEFAULT_RANDOM_EVENT_CONFIG.raidStealCeiling,
): BigNum {
  if (total <= 0 || escaped <= 0) return bnFromNumber(0);
  const fraction = ceiling * (Math.min(escaped, total) / total);
  return bnMulScalar(cookies, fraction);
}

/** What chasing off every mouse pays. */
export function mouseRaidDefenceReward(
  gameState: GameState,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
): BigNum {
  return bnAdd(
    bnMulScalar(totalCps(gameState), payouts.raidDefendedCpsSeconds),
    bnFromNumber(payouts.raidDefendedFlatCookies),
  );
}

/**
 * The golden cookie's production multiplier at this instant, 1 when no frenzy is live.
 *
 * Read here rather than through `effective-cps.ts` because that module composes the golden
 * effect WITH this one's, and what the Flour Shortage needs is the other factor on its own: the
 * rate the dip was applied on top of. `isEffectActive` is imported so the moment an effect stops
 * counting is decided in exactly one place.
 */
function liveGoldenCpsMultiplier(gameState: GameState, nowEpochMs: number): number {
  const effect = gameState.goldenCookie.activeEffect;
  if (!effect || effect.kind !== "frenzy" || effect.multiplier === undefined) return 1;
  return isEffectActive(effect, nowEpochMs) ? effect.multiplier : 1;
}

/**
 * Records the biggest golden multiplier the active Flour Shortage has seen, returning the SAME
 * state object whenever there is nothing new to record — which is every tick of every other
 * event, and most ticks of this one.
 */
function withPeakMultiplier(
  state: RandomEventsState,
  gameState: GameState,
  nowEpochMs: number,
): RandomEventsState {
  const index = state.actives.findIndex((active) => active.id === "flour_shortage");
  if (index < 0) return state;
  const active = state.actives[index];
  const live = liveGoldenCpsMultiplier(gameState, nowEpochMs);
  const peak = active.peakLiveCpsMultiplier ?? 1;
  if (live <= peak) return state;
  const actives = state.actives.map((event, at) =>
    at === index ? { ...event, peakLiveCpsMultiplier: live } : event,
  );
  return { ...state, actives };
}

export interface RandomEventTickResult {
  readonly randomEvents: RandomEventsState;
  /** Cookies an instant event paid out during this tick. Zero when nothing spawned. */
  readonly instantBonus: BigNum;
  /**
   * Set on the tick a Mouse Raid expires with mice still loose. The reducer takes
   * `raidTheft.stolen` off the BALANCE and nothing else — see the note on `handleTick`.
   */
  readonly raidTheft: MouseRaidOutcome | null;
}

/**
 * ONE tick of the scheduler. Called from the reducer's tick handler with the same clock and the
 * same RngPort instance the golden cookie uses, so both systems advance one shared stream.
 *
 * The rules, in the order they are applied:
 *
 *   1. An active event past its end time resolves. Nothing else can happen on the same tick as
 *      a resolution — the cooldown starts at that instant, so the earliest the next event can
 *      appear is `cooldownMs + minDelayMs` later.
 *   2. While an event is active, no roll happens at all. Two events are never on screen
 *      together, ever; this is the property the tests pin down.
 *   3. While a golden cookie is on screen (`blocked`), no roll happens either. The two random
 *      systems are separate, but the STAGE is not, and a golden cookie plus a cookie rain is
 *      two overlays fighting for the same click.
 *   4. Otherwise, if the clock has reached `nextEligibleAtEpochMs`, one event is drawn.
 *      An instant event pays out and immediately re-schedules; a timed or clickable one takes
 *      the active slot.
 */
export function tickRandomEvents(
  state: RandomEventsState,
  gameState: GameState,
  nowEpochMs: number,
  rng: RngPort,
  options: {
    readonly blocked: boolean;
    readonly config?: RandomEventConfig;
    /**
     * True when the game window is hidden or minimised.
     *
     * THE CLOCK IS NOT PAUSED BY THIS, and that is deliberate. Every timestamp in this game is
     * wall-clock epoch milliseconds, and offline-progress.ts credits a player for time the app
     * was not even running; inventing a second, visibility-aware clock just for the raid would
     * make two parts of the same save disagree about what "an hour" is. So an active raid keeps
     * running out on the ordinary clock.
     *
     * What this flag DOES do is stop a raid from STARTING against a window nobody is looking
     * at. Eligibility is deferred, not re-rolled: the raid fires on the first tick after the
     * window comes back, so the twenty seconds the player gets to whack are twenty seconds they
     * could actually see. That is a spawn rule, not a clock rule.
     */
    readonly hidden?: boolean;
  },
): RandomEventTickResult {
  const config = options.config ?? DEFAULT_RANDOM_EVENT_CONFIG;
  const zero = bnFromNumber(0);
  const quiet = { randomEvents: state, instantBonus: zero, raidTheft: null } as const;

  // 1 — expiry. MEMBERS EXPIRE INDEPENDENTLY. A double of a six-second Burnt Batch Frenzy and a
  // ninety-second Baker's Dozen is not one event with two durations: the frenzy goes when it is
  // done and the rebate carries on. The pool's next-eligible instant is only set when the LAST
  // member goes, which is what keeps a stack one interruption rather than two or three.
  const expiring = state.actives.filter((active) => nowEpochMs >= active.endsAtEpochMs);
  if (expiring.length > 0) {
    const survivors = state.actives.filter((active) => nowEpochMs < active.endsAtEpochMs);
    // The raid is never in a stack (rule 4), so if it is expiring it is the only member and the
    // theft path below is reached with `survivors` empty. That is asserted by a test rather than
    // assumed here: the branch reads `expiring` for the raid and clears the list either way.
    const expired = expiring.find((active) => active.id === "mouse_raid") ?? expiring[expiring.length - 1];
    const resolved = {
      id: expired.id,
      resolvedAtEpochMs: nowEpochMs,
      claimedCount: expired.claimedCount,
      endedEarly: false,
    };

    // A raid that runs out with mice still loose is the only expiry in the game that COSTS
    // something. Its own clock restarts; the pool gets a plain cooldown so the player is not
    // robbed and then immediately interrupted again.
    if (expired.id === "mouse_raid") {
      const miceEscaped = expired.pendingTargetIds.length;
      const miceTotal = miceEscaped + expired.claimedCount;
      // The split is by SHARE, not by head: a fat mouse getting away costs what a fat mouse
      // was carrying. Older saves (and any raid without a mouse list) fall back to heads, which
      // is the same number when every mouse weighs one.
      const escapedShare = expired.mice ? totalShare(expired.mice) : miceEscaped;
      const startingShare = expired.startingShare ?? miceTotal;

      // THE WHACK PASS. Spent only here, at the one moment cookies would actually leave, so a
      // raid the player fought off by hand never costs them a pass.
      const hasPass = state.consumables.whack_pass.stock > 0;
      const consumables = hasPass ? spendOne(state.consumables, "whack_pass") : state.consumables;
      const spent = [...(expired.armed ?? []), ...(hasPass ? (["whack_pass"] as const) : [])];

      const outcome: MouseRaidOutcome = {
        resolvedAtEpochMs: nowEpochMs,
        miceTotal,
        miceWhacked: expired.claimedCount,
        miceEscaped,
        stolen: hasPass
          ? zero
          : mouseRaidTheft(gameState.cookies, escapedShare, startingShare, config.raidStealCeiling),
        reward: zero,
        defended: false,
        passSpent: hasPass,
        consumablesSpent: spent,
      };
      return {
        randomEvents: {
          ...state,
          actives: [],
          consumables,
          nextEligibleAtEpochMs: Math.max(state.nextEligibleAtEpochMs, nowEpochMs + config.cooldownMs),
          rngStreamIndex: rng.getStreamIndex(),
          lastResolved: resolved,
          raidNextEligibleAtEpochMs: scheduleNextRaid(nowEpochMs, rng, config),
          lastRaid: outcome,
        },
        instantBonus: zero,
        raidTheft: outcome,
      };
    }

    // The Flour Shortage is the one event that PAYS on expiry: the late lorry arrives the moment
    // the window closes. Everything else expires paying nothing, and `expiryPayout` returns zero
    // for them — so summing over the whole expiring set is the same number as the old single
    // lookup on every spawn that was not a stack, and the right one when it was.
    const golden = liveGoldenCpsMultiplier(gameState, nowEpochMs);
    const instantBonus = expiring.reduce<BigNum>(
      (sum, event) =>
        bnAdd(
          sum,
          expiryPayout(
            event.id,
            gameState,
            config.payouts,
            Math.max(event.peakLiveCpsMultiplier ?? 1, golden),
          ),
        ),
      zero,
    );

    return {
      randomEvents: {
        ...state,
        actives: survivors,
        // The window to the next spawn opens only once the stage is CLEAR. A member expiring out
        // of a triple does not start the clock while its two companions are still running.
        ...(survivors.length === 0
          ? { nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config), rngStreamIndex: rng.getStreamIndex() }
          : {}),
        lastResolved: resolved,
      },
      instantBonus,
      raidTheft: null,
    };
  }

  // 2 and 3 — no new spawn while anything is running, and not over a golden cookie. Both rules
  // used to live on the ACTIVE SLOT and now live on the list being non-empty: a stack is drawn
  // whole, at one instant, so nothing is ever ADDED to a stack that is already on screen. That is
  // deliberate — an event appearing next to one the player is already working is indistinguishable
  // from a bug, and it would let a stack outgrow the compatibility rules by accretion.
  if (state.actives.length > 0) {
    // The one thing a tick does to an event still running: remember the biggest golden frenzy
    // the Flour Shortage has had to live through, so its rebound can be paid at that rate. Any
    // other event, and any tick that sees nothing new, returns the state object untouched.
    const tracked = withPeakMultiplier(state, gameState, nowEpochMs);
    return tracked === state ? quiet : { randomEvents: tracked, instantBonus: zero, raidTheft: null };
  }
  if (options.blocked) return quiet;

  // 4 — the raid's own clock, checked before the pool's so that on the rare tick where both are
  // due, the once-an-hour event wins over the once-every-few-minutes one.
  if (state.raidNextEligibleAtEpochMs === 0) {
    // First sight of this save: seed the raid clock and spawn nothing. The seed carries the
    // fresh-save grace, which is why a brand new save cannot be raided in its opening minutes.
    return {
      randomEvents: {
        ...state,
        raidNextEligibleAtEpochMs: scheduleNextRaid(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
      },
      instantBonus: zero,
      raidTheft: null,
    };
  }

  if (nowEpochMs >= state.raidNextEligibleAtEpochMs) {
    const richEnough =
      areMouseRaidsUnlocked(gameState) &&
      bnCompare(gameState.cookies, bnFromNumber(config.raidMinCookies)) >= 0;
    // Both guards DEFER rather than re-roll: the raid stays due and lands on the first tick
    // where the window is visible and the counter is worth raiding.
    if (!options.hidden && richEnough) {
      const count = rollMouseCount(rng);
      // Arm what the player has stocked. Both armed consumables are spent HERE, by this raid,
      // whatever the raid then does — what they bought is a raid that is easier to fight, and
      // they got one.
      let consumables = state.consumables;
      const armed: RaidConsumableId[] = [];
      for (const def of RAID_CONSUMABLE_DEFINITIONS) {
        if (!def.armedAtSpawn) continue;
        if (consumables[def.id].stock <= 0) continue;
        consumables = spendOne(consumables, def.id);
        armed.push(def.id);
      }
      const mice = rollRaidMice(count, rng, armed.includes("half_hp_whack"));
      return {
        randomEvents: {
          ...state,
          // A raid is ALWAYS a list of exactly one. It is not drawn from the pool, it never joins
          // a stack, and nothing can be drawn while it is running.
          actives: [
            {
              id: "mouse_raid",
              startedAtEpochMs: nowEpochMs,
              endsAtEpochMs: nowEpochMs + MOUSE_RAID_DEFINITION.durationMs,
              pendingTargetIds: mice.map((mouse) => mouse.id),
              claimedCount: 0,
              mice,
              startingShare: totalShare(mice),
              armed,
            },
          ],
          consumables,
          rngStreamIndex: rng.getStreamIndex(),
          spawnCount: state.spawnCount + 1,
          raidCount: state.raidCount + 1,
        },
        instantBonus: zero,
        raidTheft: null,
      };
    }
  }

  // 5 — the pool's window.
  if (state.nextEligibleAtEpochMs === 0) {
    // First sight of this save: seed the pool clock, exactly as the raid does a few branches
    // above. Without this a zero read as "already due" and a brand-new game was interrupted
    // within seconds of the first click — measured at 2 seconds over a simulated hour.
    const seeded = nowEpochMs + config.poolFreshGraceMs + rollDelayMs(rng, config);
    if (seeded > nowEpochMs) {
      return {
        randomEvents: { ...state, nextEligibleAtEpochMs: seeded, rngStreamIndex: rng.getStreamIndex() },
        instantBonus: zero,
        raidTheft: null,
      };
    }
    // A configuration with no grace and no delay — the fast schedule the tests drive — is asking
    // for a spawn on this very tick, so seeding must not eat it. Fall through to the due check
    // rather than returning quiet, which would make the first tick of such a run do nothing.
    state = { ...state, nextEligibleAtEpochMs: seeded, rngStreamIndex: rng.getStreamIndex() };
  }

  if (nowEpochMs < state.nextEligibleAtEpochMs) return quiet;

  // ONE SPAWN, one to three events. The stack size and every member come off the injected port,
  // so a seeded run replays the same doubles and triples in the same places. A forced id (the
  // developer capture flag only) still goes through the same draw, so the stream advances
  // identically whether or not the flag is set and a forced run is not a differently-shaped run.
  const stack = drawRandomEventStack(rng, config);

  // A single instant event is the one draw that occupies nothing: it pays and is over inside this
  // tick. Rule 6 of the matrix means it can never be part of a stack, so a stack of length one is
  // the only place this can happen.
  const soleDef = stack.length === 1 ? getRandomEventDefinition(stack[0]) : null;
  if (soleDef?.shape === "instant") {
    return {
      randomEvents: {
        ...state,
        actives: [],
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: { id: soleDef.id, resolvedAtEpochMs: nowEpochMs, claimedCount: 0, endedEarly: false },
        spawnCount: state.spawnCount + 1,
      },
      instantBonus: instantPayout(soleDef.id, gameState, config.payouts),
      raidTheft: null,
    };
  }

  return {
    randomEvents: {
      ...state,
      actives: stack.map((id) => {
        const def = getRandomEventDefinition(id);
        return {
          id,
          startedAtEpochMs: nowEpochMs,
          endsAtEpochMs: nowEpochMs + def.durationMs,
          pendingTargetIds: targetIdsFor(def),
          claimedCount: 0,
        };
      }),
      rngStreamIndex: rng.getStreamIndex(),
      // Counts EVENTS, not spawns, which is what the statistic has always meant — a triple is
      // three things that happened to you.
      spawnCount: state.spawnCount + stack.length,
    },
    instantBonus: zero,
    raidTheft: null,
  };
}

/* ------------------------------------------------------------------------ arithmetic */

/** What a single click of the cookie is worth right now, before any event multiplier. */
function baseClickValue(gameState: GameState): BigNum {
  return bnMulScalar(gameState.baseClickValue, computeMultipliers(gameState).clickMultiplier);
}

/** The payout of an instant event, in cookies. Zero for anything that is not instant. */
export function instantPayout(
  id: RandomEventId,
  gameState: GameState,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
): BigNum {
  const cps = totalCps(gameState);
  switch (id) {
    case "grandmas_batch":
      return bnMulScalar(cps, payouts.grandmasBatchCpsSeconds);
    case "lucky_crumb":
      return bnAdd(bnMulScalar(cps, payouts.luckyCrumbCpsSeconds), bnFromNumber(payouts.luckyCrumbFlatCookies));
    default:
      return bnFromNumber(0);
  }
}

/**
 * What an event pays when its window CLOSES, rather than when it opens.
 *
 * Only the Flour Shortage has one. It is a separate function from `instantPayout` because the
 * two are asked at opposite ends of an event's life and folding them together would make it
 * possible for one event to accidentally get both.
 */
export function expiryPayout(
  id: RandomEventId,
  gameState: GameState,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
  /**
   * The highest live production multiplier the event ran under, 1 for an ordinary window. The
   * Flour Shortage's rebound is scaled by it so the compensation is measured at the same rate
   * the dip was measured at; see `flourShortageReboundCpsSeconds`.
   */
  peakLiveCpsMultiplier = 1,
): BigNum {
  if (id !== "flour_shortage") return bnFromNumber(0);
  const scale = Number.isFinite(peakLiveCpsMultiplier) ? Math.max(1, peakLiveCpsMultiplier) : 1;
  return bnMulScalar(totalCps(gameState), payouts.flourShortageReboundCpsSeconds * scale);
}

/** What the Taste Test's "serve it now" answer pays, at the instant it is pressed. */
export function tasteTestServePayout(
  gameState: GameState,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
): BigNum {
  return bnMulScalar(totalCps(gameState), payouts.tasteTestServeCpsSeconds);
}

/**
 * What one Delivery Rush parcel is worth. `completion` is true for the last one of the three,
 * which also carries the bonus for finishing the chain inside the window.
 */
export function deliveryParcelPayout(
  gameState: GameState,
  completion: boolean,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
): BigNum {
  const cps = totalCps(gameState);
  const parcel = bnMulScalar(cps, payouts.deliveryParcelCpsSeconds);
  if (!completion) return parcel;
  return bnAdd(parcel, bnMulScalar(cps, payouts.deliveryCompletionCpsSeconds));
}

/**
 * What the NEXT sprinkle is worth, given how many have already been caught.
 *
 *   value = (base production slice + base clicks) × (1 + escalation × alreadyCaught)
 *
 * so with the shipped 0.3, the tenth sprinkle of a storm is worth 3.7 times the first, and
 * clearing all ten pays 23.5 times one sprinkle rather than ten times it. That multiplier is the
 * event: catching a few is a footnote, clearing the stage is the reward.
 */
export function sprinklePayout(
  gameState: GameState,
  alreadyCaught: number,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
): BigNum {
  const base = bnAdd(
    bnMulScalar(totalCps(gameState), payouts.sprinkleBaseCpsSeconds),
    bnMulScalar(baseClickValue(gameState), payouts.sprinkleBaseClicks),
  );
  return bnMulScalar(base, 1 + payouts.sprinkleEscalation * Math.max(0, alreadyCaught));
}

/**
 * What one Cookie Eclipse crumb is worth: a fixed slice of production plus a fixed number of
 * clicks, exactly like a rain drop and for exactly the same reason — the click half is what makes
 * the event mean something on a save with no generators. Flat rather than escalating: the Sprinkle
 * Storm already owns "clear the stage for the multiplier", and an eclipse where the fifth crumb
 * was the only one that mattered would punish a player for finding four in the dark.
 */
export function eclipseCrumbPayout(
  gameState: GameState,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
): BigNum {
  return bnAdd(
    bnMulScalar(totalCps(gameState), payouts.eclipseCrumbCpsSeconds),
    bnMulScalar(baseClickValue(gameState), payouts.eclipseCrumbClicks),
  );
}

/** What catching the Crumb Comet is worth. One press, one payment, nothing on a miss. */
export function crumbCometPayout(
  gameState: GameState,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
): BigNum {
  return bnAdd(
    bnMulScalar(totalCps(gameState), payouts.cometCpsSeconds),
    bnMulScalar(baseClickValue(gameState), payouts.cometClicks),
  );
}

/* ---------------------------------------------------------------------- STACKING RULES */

/**
 * THE STACKING RULES, decided once and enforced in one function.
 *
 * There are exactly two SOURCES of a live multiplier in this game and they are independent:
 *
 *   1. THE GOLDEN COOKIE (golden-cookie.ts) — frenzy ×7 for 77s, click frenzy ×3 for 13s.
 *   2. THE RANDOM-EVENT POOL (this file) — up to THREE at a time, since doubles and triples.
 *
 * THE WORST CASE GREW AND THE CAPS DID NOT, and that is a decision rather than an oversight. It
 * used to be "one golden effect times one pool effect"; it is now "one golden effect times up to
 * three pool effects". The ceilings below were always written as ceilings on the COMBINED figure
 * rather than on any one contributor, and they were always set far above what one event can
 * reach — so they already described this situation before it existed, and raising them because
 * more things can now multiply would be quietly loosening the only stated limit in the system.
 *
 * The arithmetic that makes that safe: the biggest legal production stack is a Burnt Batch Frenzy
 * (×666) with a Grandma Convention and a Baker's Dozen — the frenzy is the only large factor, and
 * neither companion multiplies global production at all — inside a golden frenzy (×7), which is
 * ×4662 and is capped to ×1000. The cap bites, as it did before, in exactly the case it was
 * written for: two rare things coinciding. Nothing a player meets in an ordinary hour goes near it.
 *
 * The rules themselves are unchanged:
 *
 *   MULTIPLICATIVE, NOT MAXIMUM. Two effects that arrived independently both apply. Taking one
 *   away because the other landed would punish the player for good luck, and "which of my two
 *   buffs is silently doing nothing" is not a question a counter can answer.
 *
 *   NEGATIVE MULTIPLIERS MULTIPLY TOO, and they are never capped. A Clot during a golden frenzy
 *   is ×7 × 0.5 = ×3.5 — still a good minute, and visibly a worse one than it would have been.
 *   Anything below 1 is left exactly as the arithmetic gives it: capping a penalty would be
 *   capping it in the player's favour and would make the setbacks unreadable.
 *
 *   THE UPSIDE IS CAPPED, and the caps are stated. `EVENT_CPS_STACK_CAP` (×1000) and
 *   `EVENT_CLICK_STACK_CAP` (×10000) are the ceilings on the COMBINED figure. They exist for one
 *   case each and both are real: a Burnt Batch Frenzy (×666) inside a golden frenzy (×7) would
 *   otherwise be ×4662, and a Click Frenzy (×777) inside Sugar Rush is impossible (one slot) but
 *   a Click Frenzy (×777) inside a golden click frenzy (×3) is ×2331 and the same event stacked
 *   with a future third source would not be. The caps are far above anything a single event can
 *   reach on its own, so a capped moment is always a moment two rare things coincided — the cap
 *   never quietly eats an ordinary buff.
 *
 * Sugar Rush is not special-cased anywhere: it is a pool event like the others and goes through
 * this same function, which is what the owner's "vs Sugar Rush" question resolves to.
 */
export const EVENT_CPS_STACK_CAP = 1000;
export const EVENT_CLICK_STACK_CAP = 10_000;

/**
 * THE STACK, for any number of contributors, under one cap applied ONCE at the end.
 *
 * "Once at the end" is the whole substance of this function and it is why the two-argument form
 * below is now written in terms of it rather than the other way round. Capping pairwise as you
 * fold gives a different — and wrong — answer the moment a factor below 1 is involved: a ×2000
 * pair clipped to ×1000 and then multiplied by a ×0.5 Clot yields ×500, when the honest product
 * ×1000 is under the ceiling and should stand. One product, one comparison, no order dependence.
 */
export function stackManyEventMultipliers(values: readonly number[], cap: number): number {
  const product = values.reduce((acc, value) => acc * value, 1);
  if (!Number.isFinite(product) || product < 0) return 0;
  return Math.min(product, cap);
}

export function stackEventMultipliers(a: number, b: number, cap: number): number {
  return stackManyEventMultipliers([a, b], cap);
}

/**
 * What one caught rain drop is worth: a fixed slice of production PLUS a fixed number of
 * clicks. The click half is what makes the event mean something on a save with no generators
 * yet, where a share of production would be a share of zero.
 */
export function rainDropPayout(
  gameState: GameState,
  payouts: RandomEventPayoutConfig = DEFAULT_RANDOM_EVENT_PAYOUTS,
): BigNum {
  return bnAdd(
    bnMulScalar(totalCps(gameState), payouts.rainDropCpsSeconds),
    bnMulScalar(baseClickValue(gameState), payouts.rainDropClicks),
  );
}

/* ------------------------------------------------------- live modifiers (read by the reducer) */

/**
 * The events that are genuinely LIVE at this instant: on the list, and not past their end.
 *
 * The end-time check is the same one the single-slot version did and it matters more now, because
 * a stack's members end at different moments and the list is only pruned on a tick. Between the
 * frenzy's last millisecond and the next tick, the frenzy must already be worth ×1.
 */
function liveActives(
  state: RandomEventsState,
  nowEpochMs: number,
): readonly { active: ActiveRandomEvent; def: RandomEventDefinition }[] {
  return state.actives
    .filter((active) => nowEpochMs < active.endsAtEpochMs)
    .map((active) => ({ active, def: getRandomEventDefinition(active.id) }));
}

/**
 * Production multiplier from the active event: 1 when nothing is running.
 *
 * The one thing this is not a plain table lookup for is the Taste Test, which multiplies nothing
 * while the question is on screen and ×`TASTE_TEST_BUFF_MULTIPLIER` once "send it back" has been
 * pressed. Reading that off the active event rather than off a second state field is what keeps
 * the buff unable to outlive its own slot.
 */
export function randomEventCpsMultiplier(state: RandomEventsState, nowEpochMs: number): number {
  const live = liveActives(state, nowEpochMs);
  if (live.length === 0) return 1;
  return live.reduce((product, { active, def }) => {
    if (def.id === "taste_test") {
      return product * (active.choiceTaken === "send_back" ? TASTE_TEST_BUFF_MULTIPLIER : 1);
    }
    return product * def.cpsMultiplier;
  }, 1);
}

/**
 * Click-value multiplier from every running event: 1 when nothing is running.
 *
 * DELIBERATELY UNCAPPED HERE, and it always was. This function reports what the events are worth;
 * `stackManyEventMultipliers` at the composition seams (effective-cps.ts for production, the
 * reducer's click handler for clicks) is the one place a ceiling is applied, and applying one
 * here as well would cap the same product twice at two different points in the arithmetic.
 */
export function randomEventClickMultiplier(state: RandomEventsState, nowEpochMs: number): number {
  return liveActives(state, nowEpochMs).reduce((product, { def }) => product * def.clickMultiplier, 1);
}

/**
 * Which generators are being surged right now, and by how much, keyed by GENERATOR ID STRING.
 *
 * The Grandma Convention's hook, and the only thing this module says about generators. It returns
 * a plain record so `effective-cps.ts` can look up an id it already has and get 1 for every id
 * nothing is surging — including ids this file has never heard of. Two events surging the same
 * generator would multiply, which is the same rule everything else here follows; the compatibility
 * matrix does not currently allow it (there is one such event) and the arithmetic does not care.
 */
export function randomEventGeneratorSurge(
  state: RandomEventsState,
  nowEpochMs: number,
): Readonly<Record<string, number>> {
  const surge: Record<string, number> = {};
  for (const { def } of liveActives(state, nowEpochMs)) {
    if (!def.surgeGeneratorIds || def.surgeMultiplier === undefined) continue;
    for (const id of def.surgeGeneratorIds) {
      surge[id] = (surge[id] ?? 1) * def.surgeMultiplier;
    }
  }
  return surge;
}

/**
 * How fast the named SUBGAME's clock is running: 1 when nothing is speeding it up.
 *
 * The Overtime Crew's hook. `subgameId` is a bare string — `"home"` today — and an id nothing
 * recognises gets 1, which is the honest answer to "how much is this event speeding up a thing
 * that does not exist".
 */
export function randomEventSubgameSpeed(
  state: RandomEventsState,
  nowEpochMs: number,
  subgameId: string,
): number {
  return liveActives(state, nowEpochMs).reduce(
    (speed, { def }) =>
      def.subgameSpeedId === subgameId && def.subgameSpeedMultiplier !== undefined
        ? speed * def.subgameSpeedMultiplier
        : speed,
    1,
  );
}

/**
 * Market Day's rebate, as a fraction of what a purchase actually cost.
 *
 * A REBATE, not a discount, and the distinction is deliberate. Every price the shop prints
 * comes from one place (generators.ts / upgrades.ts / tool-shop.ts) and the Tools tech tree
 * already applies a discount at that seam. Threading a second, timed discount through the same
 * arithmetic would mean the price on the card and the price at the till disagree for sixty
 * seconds. So Market Day does not touch pricing at all: the player pays the printed price, and
 * the reducer hands a slice of it straight back afterwards. The shop stays honest and the
 * effect stays real.
 */
/**
 * ...and rebates ADD rather than multiply, which is the one place a stack does not compose the
 * way multipliers do. Two rebates of 15% and 7.69% hand back 22.69% of a purchase, not 21.85%
 * (which is what multiplying the remainders would give): each event independently promises a
 * slice of what you paid, and the player gets both slices. Capped once at `EVENT_REBATE_CAP` so
 * no future combination can make a purchase free.
 */
export function randomEventRebateFraction(state: RandomEventsState, nowEpochMs: number): number {
  const total = liveActives(state, nowEpochMs).reduce((sum, { def }) => sum + def.rebateFraction, 0);
  return Math.min(EVENT_REBATE_CAP, total);
}

/** Milliseconds left on ONE running event, floored at zero. */
export function remainingMsFor(active: ActiveRandomEvent, nowEpochMs: number): number {
  return Math.max(0, active.endsAtEpochMs - nowEpochMs);
}

/** Fraction of ONE running event's window still to run, in [0, 1]. Drives its plate's bar. */
export function remainingFractionFor(active: ActiveRandomEvent, nowEpochMs: number): number {
  const total = active.endsAtEpochMs - active.startedAtEpochMs;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, remainingMsFor(active, nowEpochMs) / total));
}

/**
 * Milliseconds until the STAGE IS CLEAR — the longest-running member's remaining time.
 *
 * The stack's members have different clocks, so "how long is left" has two possible readings and
 * this is the one every caller of the old single-slot function wanted: when will the pool be
 * quiet again. Each indicator plate draws its own member's clock with `remainingMsFor`.
 */
export function remainingMs(state: RandomEventsState, nowEpochMs: number): number {
  return state.actives.reduce((longest, active) => Math.max(longest, remainingMsFor(active, nowEpochMs)), 0);
}

/** Fraction of the FIRST-drawn event's duration still to run, in [0, 1]. */
export function remainingFraction(state: RandomEventsState, nowEpochMs: number): number {
  const active = primaryActive(state);
  if (!active) return 0;
  return remainingFractionFor(active, nowEpochMs);
}

/* ------------------------------------------------------------------------- clicking */

export interface RandomEventClickResult {
  readonly randomEvents: RandomEventsState;
  readonly bonus: BigNum;
  /** False when the click hit nothing real (stale target, expired event, wrong id). */
  readonly claimed: boolean;
}

/**
 * A click on one of the event's own targets.
 *
 * Refuses silently, in the same shape as every purchase in the reducer, when the target is not
 * actually there — a rain drop already taken, an event already over, an id from a stale render.
 * A refused click returns the state unchanged and `claimed: false`, and the reducer turns that
 * into a no-op, so a double-fired pointer event cannot pay twice.
 */
export function clickRandomEventTarget(
  state: RandomEventsState,
  gameState: GameState,
  targetId: string,
  nowEpochMs: number,
  rng: RngPort,
  config: RandomEventConfig = DEFAULT_RANDOM_EVENT_CONFIG,
): RandomEventClickResult {
  const zero = bnFromNumber(0);
  const refusal = { randomEvents: state, bonus: zero, claimed: false };
  // WHICH EVENT DID THAT CLICK BELONG TO? The view never says, and it should not have to: it
  // dispatches a target id and the domain finds the owner. Every clickable event owns its own id
  // prefix (`rain:`, `crumb:`, `comet:`, `parcel:`, `sprinkle:`, `oven:fix`, `mouse:`), so the id
  // alone identifies the event unambiguously. The compatibility matrix keeps at most one
  // clickable event on the stage at a time, so this search finds at most one owner anyway — but
  // searching rather than assuming means a stale render from a companion event cannot pay out
  // against whatever happens to be first in the list.
  const owner = state.actives.find(
    (event) => nowEpochMs < event.endsAtEpochMs && event.pendingTargetIds.includes(targetId),
  );
  // A mouse is not a rain drop: it has hit points, and a swing can catch several of them. That
  // lives in `whackMice`, and this function forwards rather than growing a second copy of it.
  const raid = activeWithId(state, "mouse_raid");
  if (raid && nowEpochMs < raid.endsAtEpochMs) {
    return whackMice(state, gameState, [targetId], nowEpochMs, rng, config);
  }
  if (!owner) return refusal;
  const active = owner;
  // THE CHAIN'S ONE RULE: a Delivery Rush parcel only counts if it is the NEXT one. An
  // out-of-order press is refused exactly like a stale one — nothing is taken, nothing is paid,
  // and the parcel is still there to press. The refusal is the whole lesson; a penalty on top of
  // it would turn a fourteen-second window into a punishment for reading slowly.
  if (active.id === "delivery_rush" && targetId !== active.pendingTargetIds[0]) {
    return { randomEvents: state, bonus: zero, claimed: false };
  }

  const pendingTargetIds = active.pendingTargetIds.filter((id) => id !== targetId);
  const claimedCount = active.claimedCount + 1;

  // Oven Hiccup's one button ENDS the event: that is the whole point of it being a risk the
  // player can answer rather than a penalty they sit through. It pays nothing — getting the
  // production penalty off early is the reward.
  if (active.id === "oven_hiccup") {
    return {
      randomEvents: endOneEvent(state, active, nowEpochMs, rng, config, {
        id: active.id,
        resolvedAtEpochMs: nowEpochMs,
        claimedCount,
        endedEarly: true,
      }),
      bonus: zero,
      claimed: true,
    };
  }

  // What this particular target was worth. Five clickable events, four different answers: a rain
  // drop is flat, an eclipse crumb is flat but much bigger, a sprinkle escalates with how many are
  // already caught, a parcel pays its own rate plus the completion bonus when it is the last of
  // the three, and the comet is one press for the whole event.
  const bonus =
    active.id === "sprinkle_storm"
      ? sprinklePayout(gameState, active.claimedCount, config.payouts)
      : active.id === "delivery_rush"
        ? deliveryParcelPayout(gameState, pendingTargetIds.length === 0, config.payouts)
        : active.id === "cookie_eclipse"
          ? eclipseCrumbPayout(gameState, config.payouts)
          : active.id === "crumb_comet"
            ? crumbCometPayout(gameState, config.payouts)
            : rainDropPayout(gameState, config.payouts);

  // Catching the last drop finishes THAT EVENT early rather than leaving an empty sky up for the
  // rest of its window. Inside a stack it finishes only that member; a Baker's Dozen running
  // beside a cleared Cookie Rain carries on for its own remaining minute.
  if (pendingTargetIds.length === 0) {
    return {
      randomEvents: endOneEvent(state, active, nowEpochMs, rng, config, {
        id: active.id,
        resolvedAtEpochMs: nowEpochMs,
        claimedCount,
        endedEarly: true,
      }),
      bonus,
      claimed: true,
    };
  }

  return {
    randomEvents: replaceActive(state, active, { ...active, pendingTargetIds, claimedCount }),
    bonus,
    claimed: true,
  };
}

/**
 * Swaps one member of the stack for an updated copy, leaving every other member's object
 * identity untouched so a React store's structural comparison only re-renders what moved.
 */
function replaceActive(
  state: RandomEventsState,
  target: ActiveRandomEvent,
  replacement: ActiveRandomEvent,
): RandomEventsState {
  return { ...state, actives: state.actives.map((event) => (event === target ? replacement : event)) };
}

/**
 * Takes ONE event off the stack, early, and starts the next spawn's clock only if that was the
 * last one standing.
 *
 * This is the single-slot `active: null, nextEligibleAtEpochMs: scheduleNext(...)` pair from
 * before doubles existed, generalised — and the generalisation is the whole reason it is a
 * function rather than three copies. Clearing a Cookie Rain must NOT start the cooldown while its
 * companion Baker's Dozen is still running, or a player who cleared the rain quickly would be
 * granting themselves an earlier next event by playing well, and the stated pacing would be a
 * figure that only held for people who ignored the clickable half of a double.
 */
function endOneEvent(
  state: RandomEventsState,
  target: ActiveRandomEvent,
  nowEpochMs: number,
  rng: RngPort,
  config: RandomEventConfig,
  resolved: ResolvedRandomEvent,
): RandomEventsState {
  const actives = state.actives.filter((event) => event !== target);
  return {
    ...state,
    actives,
    ...(actives.length === 0
      ? { nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config), rngStreamIndex: rng.getStreamIndex() }
      : {}),
    lastResolved: resolved,
  };
}


/**
 * ONE SWING, at one or more mice.
 *
 * Several ids at once is only legal when the raid armed a Bigger Whack — the domain enforces
 * that rather than trusting the caller, so a hand-built action cannot swat five mice with a
 * bare press. WHICH mice a Bigger Whack reaches is geometry the view measures (the mice are
 * animated, so their real positions are whatever the layout says) and `miceWithinWhackRadius`
 * decides; this function only asks whether the player was entitled to a wide swing at all.
 *
 * Each id in the swing costs its mouse ONE hit point. A mouse at zero leaves the stage and
 * counts as whacked; a fat mouse that is still standing stays, one pip down. Clearing the stage
 * ends the raid early, banks a defended outcome, and pays the defence bonus — and it does NOT
 * spend a Whack Pass, because there was no theft for a pass to stop.
 */
export function whackMice(
  state: RandomEventsState,
  gameState: GameState,
  mouseIds: readonly string[],
  nowEpochMs: number,
  rng: RngPort,
  config: RandomEventConfig = DEFAULT_RANDOM_EVENT_CONFIG,
): RandomEventClickResult {
  const zero = bnFromNumber(0);
  // The raid is always alone on the list (matrix rule 4), so looking it up by id is the same
  // answer as reading a slot would have been — and it stays correct if that ever changes.
  const active = activeWithId(state, "mouse_raid");
  const refused = { randomEvents: state, bonus: zero, claimed: false };
  if (!active) return refused;
  if (nowEpochMs >= active.endsAtEpochMs) return refused;

  const wide = (active.armed ?? []).includes("bigger_whack");
  const unique = [...new Set(mouseIds)];
  if (unique.length === 0) return refused;
  if (unique.length > 1 && !wide) return refused;

  const mice = active.mice ?? active.pendingTargetIds.map((id) => ({ id, hp: 1, maxHp: 1, share: 1, fat: false }));
  const hit = new Set(unique.filter((id) => mice.some((mouse) => mouse.id === id)));
  if (hit.size === 0) return refused;

  const survivors = mice
    .map((mouse) => (hit.has(mouse.id) ? { ...mouse, hp: mouse.hp - 1 } : mouse))
    .filter((mouse) => mouse.hp > 0);
  const seenOff = mice.length - survivors.length;
  const claimedCount = active.claimedCount + seenOff;

  if (survivors.length > 0) {
    return {
      randomEvents: replaceActive(state, active, {
        ...active,
        mice: survivors,
        pendingTargetIds: survivors.map((mouse) => mouse.id),
        claimedCount,
      }),
      bonus: zero,
      claimed: true,
    };
  }

  const reward = mouseRaidDefenceReward(gameState, config.payouts);
  return {
    randomEvents: {
      ...state,
      actives: state.actives.filter((event) => event !== active),
      nextEligibleAtEpochMs: Math.max(state.nextEligibleAtEpochMs, nowEpochMs + config.cooldownMs),
      rngStreamIndex: rng.getStreamIndex(),
      lastResolved: { id: "mouse_raid", resolvedAtEpochMs: nowEpochMs, claimedCount, endedEarly: true },
      raidNextEligibleAtEpochMs: scheduleNextRaid(nowEpochMs, rng, config),
      lastRaid: {
        resolvedAtEpochMs: nowEpochMs,
        miceTotal: claimedCount,
        miceWhacked: claimedCount,
        miceEscaped: 0,
        stolen: zero,
        reward,
        defended: true,
        // A Whack Pass is NOT spent here. The raid was beaten by hand.
        passSpent: false,
        consumablesSpent: [...(active.armed ?? [])],
      },
    },
    bonus: reward,
    claimed: true,
  };
}

/* ------------------------------------------------------------------- answering a choice */

/**
 * THE TASTE TEST, ANSWERED.
 *
 * Two legal answers and one slot, and the two do completely different things with it:
 *
 *   - `serve`     — pays `tasteTestServePayout` at once and CLOSES the slot. The pool's ordinary
 *                   cooldown-plus-delay starts from this instant, exactly as if the event had
 *                   run its course, so answering early never buys the player a faster next event.
 *   - `send_back` — pays nothing and KEEPS the slot, rewriting the window to
 *                   `TASTE_TEST_BUFF_MS` from now. The event is still `taste_test`; what changed
 *                   is `choiceTaken`, which is what the multiplier lookup reads.
 *
 * Refuses in the same shape as every other click in this file: a second press, a press after the
 * window closed, a press on something that is not a choice event, or an id that is not one of the
 * two returns the state unchanged and `claimed: false`. That is what stops a double-fired pointer
 * from serving the tray and then sending it back.
 */
export function chooseRandomEventOption(
  state: RandomEventsState,
  gameState: GameState,
  choiceId: RandomEventChoiceId,
  nowEpochMs: number,
  rng: RngPort,
  config: RandomEventConfig = DEFAULT_RANDOM_EVENT_CONFIG,
): RandomEventClickResult {
  const zero = bnFromNumber(0);
  const refused = { randomEvents: state, bonus: zero, claimed: false };
  // A choice event is always alone on the list (matrix rule 3), so "the choice event" is
  // unambiguous — but it is found rather than assumed, for the same reason clicks are routed.
  const active = state.actives.find((event) => getRandomEventDefinition(event.id).shape === "choice");
  if (!active) return refused;
  if (nowEpochMs >= active.endsAtEpochMs) return refused;
  if (active.choiceTaken !== undefined) return refused;
  if (!RANDOM_EVENT_CHOICE_IDS.includes(choiceId)) return refused;

  if (choiceId === "serve") {
    return {
      randomEvents: endOneEvent(state, active, nowEpochMs, rng, config, {
        id: active.id,
        resolvedAtEpochMs: nowEpochMs,
        claimedCount: 1,
        endedEarly: true,
      }),
      bonus: tasteTestServePayout(gameState, config.payouts),
      claimed: true,
    };
  }

  return {
    randomEvents: replaceActive(state, active, {
      ...active,
      // The buff's clock starts when the button was pressed, not when the tray came out, so
      // deliberating over the question never costs any of the minute it buys.
      startedAtEpochMs: nowEpochMs,
      endsAtEpochMs: nowEpochMs + TASTE_TEST_BUFF_MS,
      claimedCount: 1,
      choiceTaken: "send_back",
    }),
    bonus: zero,
    claimed: true,
  };
}

/* --------------------------------------------------------------------- the combo window */

/**
 * ONE CLICK'S WORTH OF COMBO WINDOW.
 *
 * Called from the reducer's click handler on every click, and a no-op on every click that is not
 * during a live Combo Window — which is almost all of them, so it returns the SAME state object
 * rather than a copy and the store's structural comparison sees nothing changed.
 *
 * The window is pushed out by `COMBO_EXTEND_MS` per click and clamped to
 * `COMBO_MAX_DURATION_MS` measured from the spawn instant, never from the last extension, so the
 * ceiling is a real ceiling: at the shipped numbers seventy-five well-placed clicks reach it and
 * the seventy-sixth buys nothing. Extending is deliberately not worth anything by itself — what
 * the player is buying is more seconds of ×5, which they then have to spend by clicking.
 */
export function extendComboWindow(state: RandomEventsState, nowEpochMs: number): RandomEventsState {
  const active = activeWithId(state, "combo_window");
  if (!active) return state;
  if (nowEpochMs >= active.endsAtEpochMs) return state;
  const ceiling = active.startedAtEpochMs + COMBO_MAX_DURATION_MS;
  const extended = Math.min(ceiling, active.endsAtEpochMs + COMBO_EXTEND_MS);
  if (extended === active.endsAtEpochMs) return state;
  return replaceActive(state, active, {
    ...active,
    endsAtEpochMs: extended,
    claimedCount: active.claimedCount + 1,
  });
}

/** Clears the finished-raid record, so the aftermath toast can be dismissed.
 *
 * Separate from `clearLastResolved` because the two toasts are separate: the marquee names an
 * event as it lands, and the aftermath states what a raid cost or saved. Dismissing one should
 * not silently swallow the other.
 */
export function clearLastRaid(state: RandomEventsState): RandomEventsState {
  if (state.lastRaid === null) return state;
  return { ...state, lastRaid: null };
}

/** Mice still loose in the active raid, for the HUD's remaining count. Zero when none is on. */
export function miceRemaining(state: RandomEventsState): number {
  return activeWithId(state, "mouse_raid")?.pendingTargetIds.length ?? 0;
}

/** Clears the finished-event record, so the toast naming it can be dismissed. */
export function clearLastResolved(state: RandomEventsState): RandomEventsState {
  if (state.lastResolved === null) return state;
  return { ...state, lastResolved: null };
}

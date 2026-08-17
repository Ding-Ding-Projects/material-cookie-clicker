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
}

/**
 * THE WEIGHTS, AND THE PACING THEY BUY.
 *
 * Every weight in the pool below is out of a total of exactly one hundred (`POOL_WEIGHT_TOTAL`,
 * pinned by a test), so a weight reads as a percentage of draws without any arithmetic. That is
 * the only reason the numbers are what they are — nothing in the draw needs them to sum to
 * anything in particular.
 *
 * WHAT THE PACING WAS, AND WHAT IT IS NOW. The gap between two pool events is
 * `cooldownMs + uniform(minDelayMs, maxDelayMs)`, so the mean gap is the cooldown plus the
 * midpoint of the band:
 *
 *   before this lane — 60s + mean(180s, 600s) = 450s  →  8.0 pool events an hour, from 6 kinds
 *   after  this lane — 60s + mean(240s, 720s) = 540s  →  6.7 pool events an hour, from 16 kinds
 *
 * The pool got nearly three times as many faces and FEWER interruptions an hour, which is the
 * whole point: variety is supposed to make each event rarer, not the session busier. The Mouse
 * Raid's own hourly clock is untouched by all of this, and so is the one-active-slot rule — a
 * bigger bag does not mean two events on screen.
 *
 * What the rarest things now cost in real time, at 6.7 draws an hour:
 *
 *   Burnt Batch Frenzy   1%  →  about one every 15 hours of play
 *   Production Frenzy    4%  →  about one every 3.7 hours
 *   Click Frenzy         3%  →  about one every 5 hours
 *   anything that costs you something (Oven Hiccup, Flour Shortage, Clot) 13% → 0.87 an hour
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
    weight: 10,
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
    weight: 10,
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
    weight: 6,
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
    weight: 8,
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
    weight: 12,
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
    weight: 10,
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
    weight: 6,
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
    weight: 5,
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
    weight: 4,
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
    weight: 7,
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
    weight: 8,
    targetCount: 10,
    cpsMultiplier: 1,
    clickMultiplier: 1,
    rebateFraction: 0,
    isSetback: false,
    eventClass: "boon",
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
  readonly payouts: RandomEventPayoutConfig;
}

export const DEFAULT_RANDOM_EVENT_CONFIG: RandomEventConfig = {
  // Four to twelve minutes, widened from three-to-ten when the pool grew from six events to
  // sixteen. See POOL_WEIGHT_TOTAL's note: more faces, fewer interruptions.
  minDelayMs: 4 * 60 * 1000,
  maxDelayMs: 12 * 60 * 1000,
  cooldownMs: 60 * 1000,
  raidMinDelayMs: 30 * 60 * 1000,
  raidMaxDelayMs: 60 * 60 * 1000,
  raidJitterMs: 90 * 1000,
  raidFreshGraceMs: 10 * 60 * 1000,
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
  /** The most a player may hold at once. */
  readonly stockCap: number;
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
    stockCap: 3,
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
    stockCap: 3,
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
    stockCap: 3,
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

/** True when the stock is full. A capped consumable is insurance; an uncapped one is immunity. */
export function isRaidConsumableAtCap(id: RaidConsumableId, consumables: RaidConsumablesState): boolean {
  return consumables[id].stock >= getRaidConsumableDefinition(id).stockCap;
}

/**
 * Buys one. Pure, and refuses silently in exactly the same shape as every other purchase in
 * this game: at the cap, or short of the price, the state comes back unchanged.
 */
export function buyRaidConsumable(
  consumables: RaidConsumablesState,
  id: RaidConsumableId,
  cookies: BigNum,
): { readonly consumables: RaidConsumablesState; readonly price: BigNum; readonly bought: boolean } {
  const price = raidConsumablePrice(id, consumables);
  if (isRaidConsumableAtCap(id, consumables) || bnCompare(cookies, price) < 0) {
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
  readonly active: ActiveRandomEvent | null;
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
}

export function createInitialRandomEventsState(): RandomEventsState {
  return {
    active: null,
    nextEligibleAtEpochMs: 0,
    rngStreamIndex: 0,
    lastResolved: null,
    spawnCount: 0,
    raidNextEligibleAtEpochMs: 0,
    lastRaid: null,
    raidCount: 0,
    consumables: createInitialRaidConsumables(),
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
export const RANDOM_EVENTS_SIDECAR_VERSION = 1;
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
  active: ActiveRandomEventSchema.nullable(),
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
});

/** JSON-safe form of the state. Structurally identical; typed separately so it can diverge. */
export type RandomEventsSaveData = z.infer<typeof RandomEventsStateSchema>;

export function encodeRandomEvents(state: RandomEventsState): RandomEventsSaveData {
  return {
    sidecarVersion: RANDOM_EVENTS_SIDECAR_VERSION,
    active: state.active
      ? {
          ...state.active,
          pendingTargetIds: [...state.active.pendingTargetIds],
          mice: state.active.mice ? state.active.mice.map((mouse) => ({ ...mouse })) : undefined,
          armed: state.active.armed ? [...state.active.armed] : undefined,
          choiceTaken: state.active.choiceTaken,
          peakLiveCpsMultiplier: state.active.peakLiveCpsMultiplier,
        }
      : null,
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

export function decodeRandomEvents(raw: unknown): RandomEventsState {
  if (raw === undefined || raw === null) return createInitialRandomEventsState();

  const parsed = RandomEventsStateSchema.safeParse(raw);
  if (parsed.success) return withoutSidecarVersion(parsed.data);

  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;

    const withoutUnknownIds = { ...record };
    let droppedAnId = false;
    for (const key of ["active", "lastResolved"] as const) {
      const value = record[key];
      if (value && typeof value === "object") {
        const id = (value as { id?: unknown }).id;
        if (typeof id === "string" && !RandomEventIdSchema.safeParse(id).success) {
          withoutUnknownIds[key] = null;
          droppedAnId = true;
        }
      }
    }
    if (droppedAnId) {
      const retried = RandomEventsStateSchema.safeParse(withoutUnknownIds);
      if (retried.success) return withoutSidecarVersion(retried.data);
    }

    const consumables = RaidConsumablesSchema.safeParse(record.consumables);
    if (consumables.success) {
      return { ...createInitialRandomEventsState(), consumables: consumables.data };
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
  const active = state.active;
  if (!active || active.id !== "flour_shortage") return state;
  const live = liveGoldenCpsMultiplier(gameState, nowEpochMs);
  const peak = active.peakLiveCpsMultiplier ?? 1;
  if (live <= peak) return state;
  return { ...state, active: { ...active, peakLiveCpsMultiplier: live } };
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

  // 1 — expiry.
  if (state.active !== null && nowEpochMs >= state.active.endsAtEpochMs) {
    const expired = state.active;
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
          active: null,
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

    return {
      randomEvents: {
        ...state,
        active: null,
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: resolved,
      },
      // The Flour Shortage is the one event that PAYS on expiry: the late lorry arrives the
      // moment the window closes. Everything else expires paying nothing, and `expiryPayout`
      // returns zero for them.
      instantBonus: expiryPayout(
        expired.id,
        gameState,
        config.payouts,
        Math.max(expired.peakLiveCpsMultiplier ?? 1, liveGoldenCpsMultiplier(gameState, nowEpochMs)),
      ),
      raidTheft: null,
    };
  }

  // 2 and 3 — no overlap, and not over a golden cookie. Both rules live on the ACTIVE SLOT, so
  // the raid inherits them for free by taking that same slot.
  if (state.active !== null) {
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
    const richEnough = bnCompare(gameState.cookies, bnFromNumber(config.raidMinCookies)) >= 0;
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
          active: {
            id: "mouse_raid",
            startedAtEpochMs: nowEpochMs,
            endsAtEpochMs: nowEpochMs + MOUSE_RAID_DEFINITION.durationMs,
            pendingTargetIds: mice.map((mouse) => mouse.id),
            claimedCount: 0,
            mice,
            startingShare: totalShare(mice),
            armed,
          },
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
  if (nowEpochMs < state.nextEligibleAtEpochMs) return quiet;

  // A forced id (developer capture flag only) still draws, so the stream advances identically
  // whether or not the flag is set and a forced run is not a differently-shaped run.
  const drawn = pickRandomEventId(rng);
  const id = config.forcedPoolEventId ?? drawn;
  const def = getRandomEventDefinition(id);

  if (def.shape === "instant") {
    return {
      randomEvents: {
        ...state,
        active: null,
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: { id, resolvedAtEpochMs: nowEpochMs, claimedCount: 0, endedEarly: false },
        spawnCount: state.spawnCount + 1,
      },
      instantBonus: instantPayout(id, gameState, config.payouts),
      raidTheft: null,
    };
  }

  return {
    randomEvents: {
      ...state,
      active: {
        id,
        startedAtEpochMs: nowEpochMs,
        endsAtEpochMs: nowEpochMs + def.durationMs,
        pendingTargetIds: targetIdsFor(def),
        claimedCount: 0,
      },
      rngStreamIndex: rng.getStreamIndex(),
      spawnCount: state.spawnCount + 1,
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

/* ---------------------------------------------------------------------- STACKING RULES */

/**
 * THE STACKING RULES, decided once and enforced in one function.
 *
 * There are exactly two sources of a live multiplier in this game and they are independent:
 *
 *   1. THE GOLDEN COOKIE (golden-cookie.ts) — frenzy ×7 for 77s, click frenzy ×3 for 13s.
 *   2. THE RANDOM-EVENT POOL (this file) — at most ONE at a time, because of the active slot.
 *
 * There is no third, and two pool events can never overlap, so the worst case is always exactly
 * one golden effect times one pool effect. The rules:
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

export function stackEventMultipliers(a: number, b: number, cap: number): number {
  const product = a * b;
  if (!Number.isFinite(product) || product < 0) return 0;
  return Math.min(product, cap);
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

function activeDefinition(state: RandomEventsState, nowEpochMs: number): RandomEventDefinition | null {
  if (!state.active) return null;
  if (nowEpochMs >= state.active.endsAtEpochMs) return null;
  return getRandomEventDefinition(state.active.id);
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
  const def = activeDefinition(state, nowEpochMs);
  if (!def) return 1;
  if (def.id === "taste_test") {
    return state.active?.choiceTaken === "send_back" ? TASTE_TEST_BUFF_MULTIPLIER : 1;
  }
  return def.cpsMultiplier;
}

/** Click-value multiplier from the active event: 1 when nothing is running. */
export function randomEventClickMultiplier(state: RandomEventsState, nowEpochMs: number): number {
  return activeDefinition(state, nowEpochMs)?.clickMultiplier ?? 1;
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
export function randomEventRebateFraction(state: RandomEventsState, nowEpochMs: number): number {
  return activeDefinition(state, nowEpochMs)?.rebateFraction ?? 0;
}

/** Milliseconds left on the active event, floored at zero. Drives the HUD's remaining-time bar. */
export function remainingMs(state: RandomEventsState, nowEpochMs: number): number {
  if (!state.active) return 0;
  return Math.max(0, state.active.endsAtEpochMs - nowEpochMs);
}

/** Fraction of the active event's duration still to run, in [0, 1]. */
export function remainingFraction(state: RandomEventsState, nowEpochMs: number): number {
  if (!state.active) return 0;
  const total = state.active.endsAtEpochMs - state.active.startedAtEpochMs;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, remainingMs(state, nowEpochMs) / total));
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
  const active = state.active;
  if (!active) return { randomEvents: state, bonus: zero, claimed: false };
  if (nowEpochMs >= active.endsAtEpochMs) return { randomEvents: state, bonus: zero, claimed: false };
  // A mouse is not a rain drop: it has hit points, and a swing can catch several of them. That
  // lives in `whackMice`, and this function forwards rather than growing a second copy of it.
  if (active.id === "mouse_raid") {
    return whackMice(state, gameState, [targetId], nowEpochMs, rng, config);
  }
  if (!active.pendingTargetIds.includes(targetId)) return { randomEvents: state, bonus: zero, claimed: false };
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
      randomEvents: {
        ...state,
        active: null,
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: { id: active.id, resolvedAtEpochMs: nowEpochMs, claimedCount, endedEarly: true },
        spawnCount: state.spawnCount,
      },
      bonus: zero,
      claimed: true,
    };
  }

  // What this particular target was worth. Three clickable events, three different answers:
  // a rain drop is flat, a sprinkle escalates with how many are already caught, and a parcel
  // pays its own rate plus the completion bonus when it is the last of the three.
  const bonus =
    active.id === "sprinkle_storm"
      ? sprinklePayout(gameState, active.claimedCount, config.payouts)
      : active.id === "delivery_rush"
        ? deliveryParcelPayout(gameState, pendingTargetIds.length === 0, config.payouts)
        : rainDropPayout(gameState, config.payouts);

  // Catching the last drop finishes the rain early rather than leaving an empty sky up for the
  // rest of the window.
  if (pendingTargetIds.length === 0) {
    return {
      randomEvents: {
        ...state,
        active: null,
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: { id: active.id, resolvedAtEpochMs: nowEpochMs, claimedCount, endedEarly: true },
        spawnCount: state.spawnCount,
      },
      bonus,
      claimed: true,
    };
  }

  return {
    randomEvents: {
      ...state,
      active: { ...active, pendingTargetIds, claimedCount },
    },
    bonus,
    claimed: true,
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
  const active = state.active;
  const refused = { randomEvents: state, bonus: zero, claimed: false };
  if (!active || active.id !== "mouse_raid") return refused;
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
      randomEvents: {
        ...state,
        active: {
          ...active,
          mice: survivors,
          pendingTargetIds: survivors.map((mouse) => mouse.id),
          claimedCount,
        },
      },
      bonus: zero,
      claimed: true,
    };
  }

  const reward = mouseRaidDefenceReward(gameState, config.payouts);
  return {
    randomEvents: {
      ...state,
      active: null,
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
  const active = state.active;
  const refused = { randomEvents: state, bonus: zero, claimed: false };
  if (!active) return refused;
  if (nowEpochMs >= active.endsAtEpochMs) return refused;
  if (getRandomEventDefinition(active.id).shape !== "choice") return refused;
  if (active.choiceTaken !== undefined) return refused;
  if (!RANDOM_EVENT_CHOICE_IDS.includes(choiceId)) return refused;

  if (choiceId === "serve") {
    return {
      randomEvents: {
        ...state,
        active: null,
        nextEligibleAtEpochMs: scheduleNext(nowEpochMs, rng, config),
        rngStreamIndex: rng.getStreamIndex(),
        lastResolved: { id: active.id, resolvedAtEpochMs: nowEpochMs, claimedCount: 1, endedEarly: true },
      },
      bonus: tasteTestServePayout(gameState, config.payouts),
      claimed: true,
    };
  }

  return {
    randomEvents: {
      ...state,
      active: {
        ...active,
        // The buff's clock starts when the button was pressed, not when the tray came out, so
        // deliberating over the question never costs any of the minute it buys.
        startedAtEpochMs: nowEpochMs,
        endsAtEpochMs: nowEpochMs + TASTE_TEST_BUFF_MS,
        claimedCount: 1,
        choiceTaken: "send_back",
      },
    },
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
  const active = state.active;
  if (!active || active.id !== "combo_window") return state;
  if (nowEpochMs >= active.endsAtEpochMs) return state;
  const ceiling = active.startedAtEpochMs + COMBO_MAX_DURATION_MS;
  const extended = Math.min(ceiling, active.endsAtEpochMs + COMBO_EXTEND_MS);
  if (extended === active.endsAtEpochMs) return state;
  return { ...state, active: { ...active, endsAtEpochMs: extended, claimedCount: active.claimedCount + 1 } };
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
  if (!state.active || state.active.id !== "mouse_raid") return 0;
  return state.active.pendingTargetIds.length;
}

/** Clears the finished-event record, so the toast naming it can be dismissed. */
export function clearLastResolved(state: RandomEventsState): RandomEventsState {
  if (state.lastResolved === null) return state;
  return { ...state, lastResolved: null };
}
